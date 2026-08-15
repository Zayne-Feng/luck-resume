import {
  MAX_FILE_BYTES,
  parseResumeFile,
  serializeResume,
  validateDocument,
} from '../resume/files.ts';
import type { ResumeDocument } from '../resume/model.ts';

export const MANIFEST_NAME = 'luck-backup-manifest.json';
const MAX_SCAN_FILES = 1000;
type Documents = Record<string, ResumeDocument>;
type Writable = {
  write(content: string): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
};

export interface BackupFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<{ size: number; text(): Promise<string> }>;
  createWritable(): Promise<Writable>;
}

export interface BackupDirectoryHandle {
  readonly name: string;
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  getFileHandle(name: string, options?: { create: boolean }): Promise<BackupFileHandle>;
  values(): AsyncIterable<BackupFileHandle | { kind: 'directory'; name: string }>;
  removeEntry?(name: string): Promise<void>;
}

export interface DirectoryPickers {
  showDirectoryPicker?: (options: {
    mode: 'readwrite';
    id: string;
  }) => Promise<BackupDirectoryHandle>;
}

interface ManifestEntry {
  file: string;
  fingerprint: string;
  revision: number;
}
interface Manifest {
  format: 'luck-directory-backup';
  version: 1;
  entries: Record<string, ManifestEntry>;
}
export interface BackupPreview {
  file: string;
  document: ResumeDocument;
  fingerprint: string;
}
export interface DirectoryBackupState {
  policy: 'retain' | 'mirror';
  supported: boolean;
  name: string | null;
  permission: PermissionState;
  busy: boolean;
  error: string;
  preview: BackupPreview[];
  scanErrors: { file: string; error: string }[];
  lastSaved: string | null;
}

async function digest(content: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function backupFileName(id: string): Promise<string> {
  return `luck-${await digest(id)}.json`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : '无法访问备份目录。';
}

function isError(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

async function read(handle: BackupFileHandle): Promise<string> {
  const file = await handle.getFile();
  if (file.size > MAX_FILE_BYTES) throw new Error('文件超过 64 MB。');
  const content = await file.text();
  if (new TextEncoder().encode(content).length > MAX_FILE_BYTES)
    throw new Error('文件超过 64 MB。');
  return content;
}

async function readOptional(
  directory: BackupDirectoryHandle,
  name: string,
): Promise<string | null> {
  try {
    return await read(await directory.getFileHandle(name));
  } catch (error) {
    if (isError(error, 'NotFoundError')) return null;
    throw error;
  }
}

async function parseManifest(content: string): Promise<Manifest> {
  const value = JSON.parse(content) as Manifest;
  if (
    value?.format !== 'luck-directory-backup' ||
    value.version !== 1 ||
    !value.entries ||
    typeof value.entries !== 'object' ||
    Array.isArray(value.entries) ||
    Object.keys(value.entries).length > MAX_SCAN_FILES
  )
    throw new Error('备份清单格式无效。');
  for (const [id, entry] of Object.entries(value.entries)) {
    if (
      !id ||
      id.length > 100 ||
      !entry ||
      entry.file !== (await backupFileName(id)) ||
      !/^[a-f0-9]{64}$/.test(entry.fingerprint) ||
      !Number.isSafeInteger(entry.revision) ||
      entry.revision < 1
    )
      throw new Error('备份清单条目无效。');
  }
  return value;
}

export class DirectoryBackupSession {
  private readonly pickers: DirectoryPickers;
  private readonly listeners = new Set<() => void>();
  private handle: BackupDirectoryHandle | null = null;
  private manifest: Manifest = { format: 'luck-directory-backup', version: 1, entries: {} };
  private manifestContent: string | null = null;
  private readonly blocked = new Set<string>();
  private frozen = false;
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private latest: Documents = {};
  private seenLocal = new Set<string>();
  private snapshot: DirectoryBackupState;

  constructor(
    pickers: DirectoryPickers = typeof window === 'undefined' ? {} : (window as DirectoryPickers),
  ) {
    this.pickers = pickers;
    this.snapshot = {
      policy: 'retain',
      supported: Boolean(pickers.showDirectoryPicker),
      name: null,
      permission: 'prompt',
      busy: false,
      error: '',
      preview: [],
      scanErrors: [],
      lastSaved: null,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  state(): DirectoryBackupState {
    return this.snapshot;
  }

  private update(value: Partial<DirectoryBackupState>): void {
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((listener) => listener());
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const run = () => {
      const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
      return locks ? locks.request('luck-directory-backup', operation) : operation();
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  async choose(documents: Documents): Promise<BackupDirectoryHandle | null> {
    if (!this.pickers.showDirectoryPicker || this.snapshot.busy) return null;
    const generation = this.generation;
    this.update({ busy: true, error: '' });
    try {
      const handle = await this.pickers.showDirectoryPicker({
        mode: 'readwrite',
        id: 'luck-backup',
      });
      if (generation !== this.generation) return null;
      await this.connect(handle, documents);
      return this.handle === handle && this.generation === generation + 1 ? handle : null;
    } catch (error) {
      if (generation === this.generation)
        this.update({
          busy: false,
          ...(!isError(error, 'AbortError') ? { error: message(error) } : {}),
        });
      return null;
    }
  }

  async connect(handle: BackupDirectoryHandle, documents: Documents): Promise<void> {
    const generation = ++this.generation;
    const previousIds = this.handle === handle ? this.seenLocal : [];
    this.handle = handle;
    this.latest = documents;
    this.seenLocal = new Set([...previousIds, ...Object.keys(documents)]);
    this.update({
      name: handle.name,
      busy: true,
      error: '',
      preview: [],
      scanErrors: [],
      lastSaved: null,
    });
    return this.enqueue(async () => {
      if (generation !== this.generation) return;
      this.blocked.clear();
      this.frozen = false;
      this.manifest = { format: 'luck-directory-backup', version: 1, entries: {} };
      this.manifestContent = null;
      try {
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (generation !== this.generation) return;
        this.update({ permission });
        if (permission !== 'granted') return;
        const preview: BackupPreview[] = [];
        const scanErrors: DirectoryBackupState['scanErrors'] = [];
        this.manifestContent = await readOptional(handle, MANIFEST_NAME);
        if (this.manifestContent !== null) {
          try {
            this.manifest = await parseManifest(this.manifestContent);
          } catch (error) {
            this.frozen = true;
            scanErrors.push({ file: MANIFEST_NAME, error: message(error) });
          }
        }
        let count = 0;
        for await (const entry of handle.values()) {
          if (generation !== this.generation) return;
          if (
            entry.kind !== 'file' ||
            !entry.name.toLowerCase().endsWith('.json') ||
            entry.name === MANIFEST_NAME
          )
            continue;
          if (++count > MAX_SCAN_FILES) {
            this.frozen = true;
            scanErrors.push({
              file: handle.name,
              error: '目录中的 JSON 超过 1000 个，请选择较小的备份目录。',
            });
            break;
          }
          try {
            const content = await read(entry);
            parseResumeFile(content);
            const document = validateDocument(JSON.parse(content).resume);
            preview.push({ file: entry.name, document, fingerprint: await digest(content) });
          } catch (error) {
            scanErrors.push({ file: entry.name, error: message(error) });
          }
        }
        for (const [id, entry] of Object.entries(this.manifest.entries)) {
          const saved = preview.find((candidate) => candidate.file === entry.file);
          if (
            !saved ||
            saved.document.id !== id ||
            saved.fingerprint !== entry.fingerprint ||
            (Object.hasOwn(documents, id) &&
              serializeResume(documents[id]) !== serializeResume(saved.document))
          )
            this.blocked.add(id);
        }
        if (generation !== this.generation) return;
        this.update({
          preview,
          scanErrors,
          error: this.frozen
            ? '备份清单需要检查，自动写入已暂停。'
            : this.blocked.size
              ? '部分备份与本地草稿不同。请先查看备份并恢复为新简历。'
              : '',
        });
      } catch (error) {
        this.frozen = true;
        if (generation === this.generation) this.update({ error: message(error) });
      } finally {
        if (generation === this.generation) this.update({ busy: false });
      }
    });
  }

  async reconnect(documents: Documents): Promise<void> {
    const handle = this.handle;
    if (!handle || this.snapshot.busy) return;
    const generation = this.generation;
    this.update({ busy: true });
    try {
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      if (generation !== this.generation) return;
      this.update({ permission, busy: false });
      if (permission === 'granted') await this.connect(handle, documents);
    } catch (error) {
      if (generation === this.generation) this.update({ error: message(error), busy: false });
    }
  }

  sync(documents: Documents): Promise<void> {
    this.latest = documents;
    Object.keys(documents).forEach((id) => this.seenLocal.add(id));
    const generation = this.generation;
    return this.enqueue(async () => {
      const handle = this.handle;
      if (!handle || this.frozen || generation !== this.generation) return;
      this.update({ busy: true });
      try {
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (generation !== this.generation) return;
        this.update({ permission });
        if (permission !== 'granted') {
          this.update({ error: '目录权限已失效，请点击重新连接。' });
          return;
        }
        for (const document of Object.values(this.latest)) {
          if (generation !== this.generation) return;
          if (this.blocked.has(document.id)) continue;
          try {
            await this.saveDocument(handle, document, generation);
          } catch (error) {
            if (generation !== this.generation) return;
            this.blocked.add(document.id);
            this.update({ error: `${document.title}: ${message(error)}` });
            if (this.frozen) return;
          }
        }
        if (this.snapshot.policy === 'mirror') await this.pruneDeleted(handle, generation);
      } catch (error) {
        if (generation === this.generation) this.update({ error: message(error) });
      } finally {
        if (generation === this.generation) this.update({ busy: false });
      }
    });
  }

  setPolicy(policy: 'retain' | 'mirror'): void {
    this.update({ policy });
  }

  scan(documents: Documents): Promise<void> {
    return this.handle && !this.snapshot.busy
      ? this.connect(this.handle, documents)
      : Promise.resolve();
  }

  async reconcile(
    file: string,
    expected: ResumeDocument | null,
    apply: (document: ResumeDocument) => boolean,
  ): Promise<boolean> {
    const selected = this.snapshot.preview.find((entry) => entry.file === file);
    const generation = this.generation;
    let applied = false;
    await this.enqueue(async () => {
      const handle = this.handle;
      if (!handle || this.frozen || !selected || generation !== this.generation) return;
      const id = selected.document.id;
      this.update({ busy: true, error: '' });
      try {
        if ((expected && id !== expected.id) || file !== (await backupFileName(id)))
          throw new Error('Only a matching document backup can update the original.');
        if (
          expected
            ? !Object.hasOwn(this.latest, id) ||
              serializeResume(this.latest[id]) !== serializeResume(expected)
            : Object.hasOwn(this.latest, id)
        )
          throw new Error('The local draft changed. Scan and compare again.');
        const content = await readOptional(handle, file);
        if (content === null || (await digest(content)) !== selected.fingerprint)
          throw new Error('The backup changed after preview. Scan again.');
        await this.verifyManifest(handle);
        const document = validateDocument(JSON.parse(content).resume);
        if (
          !Object.hasOwn(this.manifest.entries, id) &&
          Object.keys(this.manifest.entries).length >= MAX_SCAN_FILES
        )
          throw new Error(
            'The backup directory already contains 1000 documents. Choose another backup directory.',
          );
        const entries = {
          ...this.manifest.entries,
          [id]: {
            file,
            fingerprint: selected.fingerprint,
            revision: (this.manifest.entries[id]?.revision ?? 0) + 1,
          },
        };
        const next = { ...this.manifest, entries };
        const manifestContent = JSON.stringify(next, null, 2);
        await this.write(handle, MANIFEST_NAME, manifestContent, this.manifestContent, async () => {
          if (generation !== this.generation || (await readOptional(handle, file)) !== content)
            throw new Error('The backup changed during reconciliation.');
        });
        this.manifest = next;
        this.manifestContent = manifestContent;
        if (generation !== this.generation || !apply(structuredClone(document)))
          throw new Error('The local draft changed. Scan and compare again.');
        this.blocked.delete(id);
        applied = true;
        this.update({ error: '' });
      } catch (error) {
        this.blocked.add(id);
        if (generation === this.generation) this.update({ error: message(error) });
      } finally {
        if (generation === this.generation) this.update({ busy: false });
      }
    });
    return applied;
  }

  private async pruneDeleted(handle: BackupDirectoryHandle, generation: number): Promise<void> {
    if (!handle.removeEntry) throw new Error('This browser cannot mirror file deletions.');
    for (const id of this.seenLocal) {
      const entry = Object.hasOwn(this.manifest.entries, id)
        ? this.manifest.entries[id]
        : undefined;
      if (!entry || Object.hasOwn(this.latest, id) || this.blocked.has(id)) continue;
      if (generation !== this.generation) return;
      const content = await readOptional(handle, entry.file);
      if (content === null) continue;
      if ((await digest(content)) !== entry.fingerprint) {
        this.blocked.add(id);
        this.update({ error: 'A deleted document backup has external changes and was preserved.' });
        continue;
      }
      await this.verifyManifest(handle);
      const entries = { ...this.manifest.entries };
      delete entries[id];
      const next = { ...this.manifest, entries };
      const manifestContent = JSON.stringify(next, null, 2);
      await this.write(handle, MANIFEST_NAME, manifestContent, this.manifestContent, async () => {
        if (
          generation !== this.generation ||
          Object.hasOwn(this.latest, id) ||
          (await readOptional(handle, entry.file)) !== content
        )
          throw new Error('The backup changed during deletion review.');
      });
      this.manifest = next;
      this.manifestContent = manifestContent;
      if (
        generation !== this.generation ||
        Object.hasOwn(this.latest, id) ||
        (await readOptional(handle, entry.file)) !== content
      )
        throw new Error('The backup changed and was preserved.');
      await handle.removeEntry(entry.file);
      this.seenLocal.delete(id);
      this.update({ preview: this.snapshot.preview.filter((item) => item.file !== entry.file) });
    }
  }

  private async verifyManifest(handle: BackupDirectoryHandle): Promise<void> {
    if ((await readOptional(handle, MANIFEST_NAME)) !== this.manifestContent) {
      this.frozen = true;
      throw new Error('备份清单已被外部修改，请重新连接后检查。');
    }
  }

  private async saveDocument(
    handle: BackupDirectoryHandle,
    document: ResumeDocument,
    generation: number,
  ): Promise<void> {
    const content = serializeResume(document);
    if (new TextEncoder().encode(content).length > MAX_FILE_BYTES)
      throw new Error('备份文件超过 64 MB。');
    const fingerprint = await digest(content);
    const previous = Object.hasOwn(this.manifest.entries, document.id)
      ? this.manifest.entries[document.id]
      : undefined;
    if (!previous && Object.keys(this.manifest.entries).length >= MAX_SCAN_FILES)
      throw new Error(
        'The backup directory already contains 1000 documents. Choose another backup directory.',
      );
    const file = await backupFileName(document.id);
    await this.verifyManifest(handle);
    const existing = await readOptional(handle, file);
    if (
      previous
        ? existing === null || (await digest(existing)) !== previous.fingerprint
        : existing !== null
    )
      throw new Error('备份文件已被外部修改或不属于当前备份清单，已保留原文件。');
    if (previous?.fingerprint === fingerprint) return;
    if (
      generation !== this.generation ||
      !Object.hasOwn(this.latest, document.id) ||
      serializeResume(this.latest[document.id]) !== content
    )
      return;
    await this.write(handle, file, content, existing, async () => {
      await this.verifyManifest(handle);
      if (generation !== this.generation) throw new Error('备份连接已更改。');
    });
    const next: Manifest = {
      ...this.manifest,
      entries: {
        ...this.manifest.entries,
        [document.id]: { file, fingerprint, revision: (previous?.revision ?? 0) + 1 },
      },
    };
    const manifestContent = JSON.stringify(next, null, 2);
    try {
      await this.write(handle, MANIFEST_NAME, manifestContent, this.manifestContent, async () => {
        if (generation !== this.generation) throw new Error('备份连接已更改。');
        if ((await readOptional(handle, file)) !== content)
          throw new Error('备份文件已被外部修改。');
      });
    } catch (error) {
      this.frozen = true;
      throw error;
    }
    this.manifest = next;
    this.manifestContent = manifestContent;
    if (generation !== this.generation) return;
    const preview = this.snapshot.preview.filter((entry) => entry.file !== file);
    preview.push({ file, document, fingerprint });
    this.update({ preview, lastSaved: new Date().toISOString() });
  }

  private async write(
    handle: BackupDirectoryHandle,
    name: string,
    content: string,
    expected: string | null,
    check: () => Promise<void>,
  ): Promise<void> {
    if (new TextEncoder().encode(content).length > MAX_FILE_BYTES)
      throw new Error('备份文件超过 64 MB。');
    const target = await handle.getFileHandle(name, { create: true });
    const original = expected ?? '';
    if ((await read(target)) !== original) throw new Error('文件已被外部修改。');
    let writable: Writable | undefined;
    try {
      writable = await target.createWritable();
      await writable.write(content);
      await check();
      if ((await read(target)) !== original)
        throw new Error('文件在备份期间被外部修改，已保留外部内容。');
      await writable.close();
      writable = undefined;
    } finally {
      if (writable) {
        try {
          await writable.abort();
        } catch {
          /* The stream may already be closed. */
        }
      }
    }
  }

  restore(file: string): ResumeDocument | null {
    const entry = this.snapshot.preview.find((candidate) => candidate.file === file);
    return entry ? parseResumeFile(serializeResume(entry.document)) : null;
  }

  disconnect(): void {
    this.generation++;
    this.handle = null;
    this.update({
      name: null,
      permission: 'prompt',
      busy: false,
      error: '',
      preview: [],
      scanErrors: [],
      lastSaved: null,
    });
  }
}

async function settingsDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('luck-backup', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('备份设置数据库被占用。'));
  });
}

export async function readBackupDirectory(): Promise<BackupDirectoryHandle | null> {
  const database = await settingsDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction('settings').objectStore('settings').get('directory');
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function rememberBackupDirectory(handle: BackupDirectoryHandle | null): Promise<void> {
  const database = await settingsDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('settings', 'readwrite');
      const store = transaction.objectStore('settings');
      if (handle) store.put(handle, 'directory');
      else store.delete('directory');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
