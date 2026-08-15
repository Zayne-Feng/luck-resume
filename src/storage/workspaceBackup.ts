import { MAX_IMPORT_FILE_BYTES, validateDocument } from '../resume/files.ts';
import type { ResumeDocument } from '../resume/model.ts';
import {
  MAX_APPEARANCE_PRESETS,
  validateAppearancePresets,
  type AppearancePreset,
} from './appearancePresets.ts';
import { validateVersion, type ResumeVersion } from './versionHistory.ts';
import { openDatabase, type StoredDocument } from './database.ts';

export function mergeWorkspaceBackupDocuments(
  stored: StoredDocument[],
  memory: ResumeDocument[],
  revisions: Record<string, number>,
  statuses: Record<string, string>,
  copyLabel: string,
): ResumeDocument[] {
  const merged = new Map(stored.map((row) => [row.id, row.document]));
  const rows = new Map(stored.map((row) => [row.id, row]));
  for (const document of memory) {
    const row = rows.get(document.id);
    const dirty = statuses[document.id] !== 'saved';
    if (!row) {
      if (dirty) merged.set(document.id, document);
      continue;
    }
    if ((revisions[document.id] ?? 0) > row.revision) {
      merged.set(document.id, document);
      continue;
    }
    if (!dirty || JSON.stringify(row.document) === JSON.stringify(document)) continue;
    if (row.revision === (revisions[document.id] ?? 0)) merged.set(document.id, document);
    else {
      const suffix = ` (${copyLabel.slice(0, 80)})`;
      const copy = {
        ...document,
        id: crypto.randomUUID(),
        title: `${document.title.slice(0, 200 - suffix.length)}${suffix}`,
      };
      merged.set(copy.id, copy);
    }
  }
  return [...merged.values()];
}

export interface WorkspaceBackupData {
  documents: ResumeDocument[];
  presets: AppearancePreset[];
  versions: ResumeVersion[];
}
export const MAX_WORKSPACE_BYTES = 256 * 1024 * 1024;
const MAX_RECORDS = 10000;
type BackupRecord = { kind: 'document' | 'preset' | 'version'; value: unknown };
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
const invalid = (): never => {
  throw new Error('工作区备份格式无效或分片不完整。');
};
function checked(data: WorkspaceBackupData): WorkspaceBackupData {
  if (
    !data ||
    !Array.isArray(data.documents) ||
    !Array.isArray(data.presets) ||
    !Array.isArray(data.versions)
  )
    invalid();
  if (data.documents.length + data.presets.length + data.versions.length > MAX_RECORDS) invalid();
  const result = {
    documents: data.documents.map(validateDocument),
    presets: validateAppearancePresets(data.presets),
    versions: data.versions.map(validateVersion),
  };
  for (const rows of [result.documents, result.presets, result.versions]) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length) invalid();
  }
  return result;
}
function records(data: WorkspaceBackupData): BackupRecord[] {
  return [
    ...data.documents.map((value) => ({ kind: 'document' as const, value })),
    ...data.presets.map((value) => ({ kind: 'preset' as const, value })),
    ...data.versions.map((value) => ({ kind: 'version' as const, value })),
  ];
}
export function createWorkspaceBackup(
  data: WorkspaceBackupData,
  maxPartBytes = 32 * 1024 * 1024,
): { name: string; blob: Blob }[] {
  if (
    !Number.isSafeInteger(maxPartBytes) ||
    maxPartBytes < 512 ||
    maxPartBytes > MAX_IMPORT_FILE_BYTES
  )
    invalid();
  const rows = records(checked(data));
  const backupId = crypto.randomUUID();
  const envelope = (group: BackupRecord[], index: number, total: number) =>
    JSON.stringify({
      format: 'luck-workspace-backup',
      version: 1,
      backupId,
      index,
      total,
      records: group,
    });
  const groups: BackupRecord[][] = [[]];
  for (const row of rows) {
    const group = groups[groups.length - 1];
    if (group.length && bytes(envelope([...group, row], MAX_RECORDS, MAX_RECORDS)) > maxPartBytes)
      groups.push([row]);
    else group.push(row);
    if (bytes(envelope([row], MAX_RECORDS, MAX_RECORDS)) > MAX_IMPORT_FILE_BYTES)
      throw new Error('备份单条记录超过 64 MB。');
  }
  const texts = groups.map((group, index) => envelope(group, index, groups.length));
  if (texts.reduce((total, text) => total + bytes(text), 0) > MAX_WORKSPACE_BYTES)
    throw new Error('工作区备份超过 256 MB。');
  return texts.map((text, index) => ({
    name: `luck-workspace-${backupId}-part-${index + 1}-of-${texts.length}.json`,
    blob: new Blob([text], { type: 'application/json;charset=utf-8' }),
  }));
}
export function parseWorkspaceBackup(texts: string[]): WorkspaceBackupData {
  if (!Array.isArray(texts) || !texts.length || texts.length > MAX_RECORDS) invalid();
  let totalBytes = 0;
  const parts = texts.map((text) => {
    if (typeof text !== 'string') invalid();
    const size = bytes(text);
    totalBytes += size;
    if (size > MAX_IMPORT_FILE_BYTES || totalBytes > MAX_WORKSPACE_BYTES)
      throw new Error('工作区备份超过大小限制。');
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return invalid();
    }
  });
  const first = parts[0];
  if (
    !first ||
    typeof first.backupId !== 'string' ||
    !first.backupId ||
    first.backupId.length > 128
  )
    invalid();
  const indices = new Set<number>();
  const result: WorkspaceBackupData = { documents: [], presets: [], versions: [] };
  let count = 0;
  for (const part of parts) {
    if (
      !part ||
      part.format !== 'luck-workspace-backup' ||
      part.version !== 1 ||
      part.backupId !== first.backupId ||
      part.total !== texts.length ||
      !Number.isSafeInteger(part.index) ||
      (part.index as number) < 0 ||
      (part.index as number) >= texts.length ||
      indices.has(part.index as number) ||
      !Array.isArray(part.records)
    )
      invalid();
    indices.add(part.index as number);
  }
  for (const part of parts.sort((a, b) => (a.index as number) - (b.index as number))) {
    for (const row of part.records as BackupRecord[]) {
      if (++count > MAX_RECORDS || !row || typeof row !== 'object') invalid();
      if (row.kind === 'document') result.documents.push(row.value as ResumeDocument);
      else if (row.kind === 'preset') result.presets.push(row.value as AppearancePreset);
      else if (row.kind === 'version') result.versions.push(row.value as ResumeVersion);
      else invalid();
    }
  }
  return checked(result);
}
export async function importWorkspaceBackup(data: WorkspaceBackupData): Promise<ResumeDocument[]> {
  const validated = checked(data);
  createWorkspaceBackup(validated);
  const sources = new Map(validated.documents.map((document) => [document.id, document]));
  for (const version of [...validated.versions].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )) {
    if (!sources.has(version.documentId)) sources.set(version.documentId, version.document);
  }
  const now = new Date().toISOString();
  const targets = new Map(
    [...sources].map(([id, document]) => [
      id,
      { ...document, id: crypto.randomUUID(), createdAt: now, updatedAt: now },
    ]),
  );
  const documents = [...targets.values()];
  const presets = validated.presets.map((row) => ({ ...row, id: crypto.randomUUID() }));
  const versions = validated.versions.map((row) => {
    const target = targets.get(row.documentId)!;
    return validateVersion({
      ...row,
      id: crypto.randomUUID(),
      documentId: target.id,
      document: { ...row.document, id: target.id, createdAt: target.createdAt },
    });
  });
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['documents', 'stylePresets', 'resumeVersions'], 'readwrite');
    let failure: unknown;
    const count = tx.objectStore('stylePresets').count();
    count.onsuccess = () => {
      try {
        if (count.result + presets.length > MAX_APPEARANCE_PRESETS)
          throw new Error('最多保存 50 个样式，请先删除不需要的样式。');
        for (const document of documents)
          tx.objectStore('documents').add({ id: document.id, document, revision: 1 });
        for (const row of presets) tx.objectStore('stylePresets').add(row);
        for (const row of versions) tx.objectStore('resumeVersions').add(row);
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('工作区备份导入失败。'));
  });
  return documents;
}
