import { MAX_FILE_BYTES, parseResumeFile, serializeResume } from '../resume/files.ts';
import type { ResumeDocument } from '../resume/model.ts';

export interface LocalFileHandle {
  readonly name: string;
  getFile(): Promise<{ size: number; text(): Promise<string> }>;
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
  isSameEntry?: (other: LocalFileHandle) => Promise<boolean>;
  createWritable(): Promise<{
    write(content: string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}

interface PickerOptions {
  types: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption: boolean;
}

export interface LocalFilePickers {
  showOpenFilePicker?: (
    options: PickerOptions & { multiple: boolean },
  ) => Promise<LocalFileHandle[]>;
  showSaveFilePicker?: (
    options: PickerOptions & { suggestedName: string },
  ) => Promise<LocalFileHandle>;
}

interface FileBinding {
  handle: LocalFileHandle;
  fingerprint: string;
  savedContent: string;
}

export interface LocalFileState {
  canOpen: boolean;
  canSaveAs: boolean;
  name: string | null;
  dirty: boolean;
  busy: boolean;
  error: string;
}

const pickerOptions: PickerOptions = {
  types: [{ description: 'Luck resume JSON', accept: { 'application/json': ['.json'] } }],
  excludeAcceptAllOption: true,
};

function cancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function readContent(handle: LocalFileHandle): Promise<string> {
  const file = await handle.getFile();
  if (file.size > MAX_FILE_BYTES) throw new Error('文件超过 64 MB，请选择较小的 JSON 文件。');
  return file.text();
}

async function fingerprint(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameFile(first: LocalFileHandle, second: LocalFileHandle): boolean | Promise<boolean> {
  return first === second || (first.isSameEntry?.(second) ?? false);
}

export class LocalFileSession {
  private readonly pickers: LocalFilePickers;
  private readonly bindings = new Map<string, FileBinding>();
  private readonly operations = new Set<string>();
  private readonly writingHandles = new Set<LocalFileHandle>();
  private readonly errors = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private opening = false;
  private openError = '';

  constructor(
    pickers: LocalFilePickers = typeof window === 'undefined' ? {} : (window as LocalFilePickers),
  ) {
    this.pickers = pickers;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  state(document: ResumeDocument | null): LocalFileState {
    const binding = document ? this.bindings.get(document.id) : undefined;
    return {
      canOpen: Boolean(this.pickers.showOpenFilePicker),
      canSaveAs: Boolean(this.pickers.showSaveFilePicker),
      name: binding?.handle.name ?? null,
      dirty: Boolean(binding && document && binding.savedContent !== serializeResume(document)),
      busy: this.opening || Boolean(document && this.operations.has(document.id)),
      error: (document && this.errors.get(document.id)) || this.openError,
    };
  }

  async open(isCurrent: () => boolean = () => true): Promise<ResumeDocument | null> {
    if (!this.pickers.showOpenFilePicker || this.opening) return null;
    this.opening = true;
    this.openError = '';
    this.notify();
    try {
      const [handle] = await this.pickers.showOpenFilePicker({ ...pickerOptions, multiple: false });
      if (!handle) return null;
      const content = await readContent(handle);
      const document = parseResumeFile(content);
      const digest = await fingerprint(content);
      if (!isCurrent()) return null;
      this.bindings.set(document.id, {
        handle,
        fingerprint: digest,
        savedContent: serializeResume(document),
      });
      return document;
    } catch (error) {
      if (!cancelled(error))
        this.openError = error instanceof Error ? error.message : '无法打开本地 JSON 文件。';
      return null;
    } finally {
      this.opening = false;
      this.notify();
    }
  }

  async save(document: ResumeDocument): Promise<boolean> {
    const binding = this.bindings.get(document.id);
    if (!binding || this.operations.has(document.id)) return false;
    return this.write(document, () => Promise.resolve(binding));
  }

  async saveAs(document: ResumeDocument): Promise<boolean> {
    if (!this.pickers.showSaveFilePicker || this.operations.has(document.id)) return false;
    return this.write(document, async () => {
      const handle = await this.pickers.showSaveFilePicker!({
        ...pickerOptions,
        suggestedName: `${(document.title.trim() || 'resume').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')}.json`,
      });
      const existing = this.bindings.get(document.id);
      if (existing && (await sameFile(handle, existing.handle))) return existing;
      const content = await readContent(handle);
      return { handle, fingerprint: await fingerprint(content), savedContent: '' };
    });
  }

  private async write(
    document: ResumeDocument,
    select: () => Promise<FileBinding>,
  ): Promise<boolean> {
    const id = document.id;
    const content = serializeResume(document);
    this.operations.add(id);
    this.errors.delete(id);
    this.openError = '';
    this.notify();
    let writable: Awaited<ReturnType<LocalFileHandle['createWritable']>> | undefined;
    let lockedHandle: LocalFileHandle | undefined;
    try {
      if (new TextEncoder().encode(content).length > MAX_FILE_BYTES)
        throw new Error('当前原稿超过 64 MB，请压缩配图或将内容拆分为多份简历后保存。');
      const binding = await select();
      for (const handle of this.writingHandles) {
        if (await sameFile(binding.handle, handle))
          throw new Error('此文件正在保存，请完成后再重试。');
      }
      this.writingHandles.add(binding.handle);
      lockedHandle = binding.handle;
      if (
        binding.handle.requestPermission &&
        (await binding.handle.requestPermission({ mode: 'readwrite' })) !== 'granted'
      )
        throw new Error('未获得文件写入权限，请允许访问或另存为新文件。');
      const savedFingerprint = await fingerprint(content);
      const current = await fingerprint(await readContent(binding.handle));
      if (current !== binding.fingerprint)
        throw new Error('文件已被外部修改。请重新打开该文件，或将当前草稿另存为新文件。');
      writable = await binding.handle.createWritable();
      await writable.write(content);
      if ((await fingerprint(await readContent(binding.handle))) !== binding.fingerprint)
        throw new Error('文件已被外部修改。请重新打开该文件，或将当前草稿另存为新文件。');
      await writable.close();
      writable = undefined;
      this.bindings.set(id, {
        handle: binding.handle,
        fingerprint: savedFingerprint,
        savedContent: content,
      });
      return true;
    } catch (error) {
      if (writable) {
        try {
          await writable.abort();
        } catch {
          /* The stream may already be closed. */
        }
      }
      if (!cancelled(error))
        this.errors.set(id, error instanceof Error ? error.message : '无法保存本地 JSON 文件。');
      return false;
    } finally {
      if (lockedHandle) this.writingHandles.delete(lockedHandle);
      this.operations.delete(id);
      this.notify();
    }
  }

  disconnect(id: string): void {
    if (this.operations.has(id)) return;
    this.bindings.delete(id);
    this.errors.delete(id);
    this.notify();
  }
}
