import { validateDocument, MAX_IMPORT_FILE_BYTES } from '../resume/files.ts';
import type { ResumeDocument } from '../resume/model.ts';
import { openDatabase } from './database.ts';

export interface ResumeVersion {
  id: string;
  documentId: string;
  createdAt: string;
  kind: 'automatic' | 'named' | 'safety' | 'imported';
  name: string;
  document: ResumeDocument;
  bytes: number;
}
export const VERSION_EVENT = 'luck-version-history-change';
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
export function versionContent(document: ResumeDocument): string {
  const { updatedAt: _updatedAt, ...content } = document;
  return JSON.stringify(content);
}
export function pruneAutomaticVersions(rows: ResumeVersion[]): string[] {
  let count = 0;
  let bytes = 0;
  const automatic = rows
    .filter((row) => row.kind === 'automatic')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if ((automatic[0]?.bytes ?? 0) > 48 * 1024 * 1024)
    throw new Error('自动版本超过 48 MB，请保存命名版本或下载 JSON。');
  return automatic
    .filter((row) => {
      count += 1;
      bytes += row.bytes;
      return count > 30 || bytes > 48 * 1024 * 1024;
    })
    .map((row) => row.id);
}
export function restoreVersionDocument(
  snapshot: ResumeDocument,
  current: ResumeDocument,
): ResumeDocument {
  return {
    ...structuredClone(snapshot),
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };
}
export async function listVersions(documentId?: string): Promise<ResumeVersion[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('resumeVersions', 'readonly');
    const store = transaction.objectStore('resumeVersions');
    const request =
      documentId === undefined ? store.getAll() : store.index('documentId').getAll(documentId);
    transaction.oncomplete = () => {
      try {
        resolve(
          (request.result as unknown[])
            .map(validateVersion)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      } catch (error) {
        reject(error);
      }
    };
    transaction.onabort = () => reject(transaction.error);
    request.onerror = () => reject(request.error);
  });
}
function announce() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(VERSION_EVENT));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('luck-version-history');
    channel.postMessage('changed');
    channel.close();
  }
}
export async function saveVersion(
  document: ResumeDocument,
  kind: ResumeVersion['kind'],
  name = '',
): Promise<ResumeVersion> {
  const validated = validateDocument(document);
  if (name.length > 120) throw new Error('版本名称不能超过 120 个字符。');
  const row: ResumeVersion = {
    id: crypto.randomUUID(),
    documentId: validated.id,
    createdAt: new Date().toISOString(),
    kind,
    name: name.trim(),
    document: validated,
    bytes: byteLength(validated),
  };
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('resumeVersions', 'readwrite');
    const store = transaction.objectStore('resumeVersions');
    const request = store.index('documentId').getAll(validated.id);
    let saved = row;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        const rows = (request.result as unknown[]).map(validateVersion);
        const latest = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (
          kind === 'automatic' &&
          latest &&
          versionContent(latest.document) === versionContent(validated)
        ) {
          saved = latest;
          return;
        }
        store.put(row);
        for (const id of pruneAutomaticVersions([...rows, row])) store.delete(id);
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => {
      announce();
      resolve(saved);
    };
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('版本保存失败。'));
  });
}
export async function deleteVersion(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('resumeVersions', 'readwrite');
    transaction.objectStore('resumeVersions').delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  announce();
}
export function serializeVersionHistory(versions: ResumeVersion[]): string {
  if (versions.length > 1000) throw new Error('版本数量超过 1000，请删除部分版本后重试。');
  const text = JSON.stringify(
    { format: 'luck-version-history', version: 1, versions: versions.map(validateVersion) },
    null,
    2,
  );
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_FILE_BYTES)
    throw new Error('版本文件过大。');
  return text;
}
export function validateVersion(input: unknown): ResumeVersion {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('版本文件格式无效。');
  const value = input as ResumeVersion;
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    value.id.length > 128 ||
    typeof value.documentId !== 'string' ||
    typeof value.name !== 'string' ||
    value.name.length > 120 ||
    !['automatic', 'named', 'safety', 'imported'].includes(value.kind) ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    throw new Error('版本文件格式无效。');
  const document = validateDocument(value.document);
  if (document.id !== value.documentId) throw new Error('版本文件格式无效。');
  return {
    id: value.id,
    documentId: value.documentId,
    createdAt: value.createdAt,
    name: value.name,
    kind: value.kind,
    document,
    bytes: byteLength(document),
  };
}
export function parseVersionHistory(text: string): ResumeVersion[] {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_FILE_BYTES)
    throw new Error('版本文件过大。');
  const archive = JSON.parse(text);
  if (
    archive?.format !== 'luck-version-history' ||
    archive.version !== 1 ||
    !Array.isArray(archive.versions) ||
    archive.versions.length > 1000
  )
    throw new Error('版本文件格式无效。');
  return archive.versions.map(validateVersion);
}
export async function importVersionSnapshots(
  versions: ResumeVersion[],
  target: ResumeDocument,
): Promise<void> {
  const validated = parseVersionHistory(serializeVersionHistory(versions));
  const rows = validated.map((row) => ({
    ...row,
    id: crypto.randomUUID(),
    documentId: target.id,
    kind: 'imported' as const,
    document: restoreVersionDocument(row.document, target),
  }));
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('resumeVersions', 'readwrite');
    for (const row of rows)
      transaction.objectStore('resumeVersions').put({ ...row, bytes: byteLength(row.document) });
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  announce();
}
