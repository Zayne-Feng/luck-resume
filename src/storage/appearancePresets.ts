import { createDocument, type Appearance, type ResumeDocument } from '../resume/model.ts';
import { validateDocument } from '../resume/files.ts';
import { openDatabase } from './database.ts';

export const MAX_APPEARANCE_PRESETS = 50;
export const MAX_PRESET_FILE_BYTES = 1024 * 1024;
export interface AppearancePreset {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  appearance: Appearance;
}

function invalid(): never {
  throw new Error('样式文件格式不正确。');
}
function nameValue(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) invalid();
  return value.trim();
}
export function validateAppearancePreset(value: unknown): AppearancePreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id || row.id.length > 200) invalid();
  for (const key of ['createdAt', 'updatedAt']) {
    if (
      typeof row[key] !== 'string' ||
      row[key].length > 40 ||
      !Number.isFinite(Date.parse(row[key]))
    )
      invalid();
  }
  return {
    id: row.id,
    name: nameValue(row.name),
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    appearance: validateDocument({ ...createDocument(), appearance: row.appearance }).appearance,
  };
}
export function validateAppearancePresets(value: unknown): AppearancePreset[] {
  if (!Array.isArray(value) || value.length > MAX_APPEARANCE_PRESETS) invalid();
  return value.map(validateAppearancePreset);
}
export function parseAppearancePresets(text: string): AppearancePreset[] {
  if (new TextEncoder().encode(text).byteLength > MAX_PRESET_FILE_BYTES)
    throw new Error('样式文件不能超过 1 MB。');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    invalid();
  }
  if (!value || typeof value !== 'object') invalid();
  const archive = value as Record<string, unknown>;
  if (archive.format !== 'luck-appearance-presets' || archive.version !== 1) invalid();
  return validateAppearancePresets(archive.presets);
}
export function serializeAppearancePresets(values: unknown): string {
  const text = JSON.stringify(
    { format: 'luck-appearance-presets', version: 1, presets: validateAppearancePresets(values) },
    null,
    2,
  );
  if (new TextEncoder().encode(text).byteLength > MAX_PRESET_FILE_BYTES)
    throw new Error('样式文件不能超过 1 MB。');
  return text;
}
export function applyAppearancePreset(
  document: ResumeDocument,
  preset: AppearancePreset,
): ResumeDocument {
  return { ...document, appearance: validateAppearancePreset(preset).appearance };
}
export async function listAppearancePresets(): Promise<AppearancePreset[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('stylePresets', 'readonly');
    const request = tx.objectStore('stylePresets').getAll();
    tx.onabort = () => reject(tx.error ?? new Error('本地样式读取失败。'));
    tx.oncomplete = () => {
      try {
        resolve(
          validateAppearancePresets(request.result).sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt),
          ),
        );
      } catch (error) {
        reject(error);
      }
    };
  });
}
export async function importAppearancePresets(values: unknown): Promise<AppearancePreset[]> {
  const rows = validateAppearancePresets(values).map((row) => ({
    ...row,
    id: crypto.randomUUID(),
  }));
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('stylePresets', 'readwrite');
    const store = tx.objectStore('stylePresets');
    let failure: unknown;
    const count = store.count();
    count.onsuccess = () => {
      if (count.result + rows.length > MAX_APPEARANCE_PRESETS) {
        failure = new Error('最多保存 50 个样式，请先删除不需要的样式。');
        tx.abort();
        return;
      }
      for (const row of rows) store.add(row);
    };
    tx.oncomplete = () => resolve(rows);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('本地样式保存失败。'));
  });
}
export async function createAppearancePreset(
  name: string,
  appearance: Appearance,
): Promise<AppearancePreset> {
  const now = new Date().toISOString();
  const [row] = await importAppearancePresets([
    { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now, appearance },
  ]);
  return row;
}
async function mutatePreset(id: string, name?: string): Promise<void> {
  const checkedName = name === undefined ? undefined : nameValue(name);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('stylePresets', 'readwrite');
    const store = tx.objectStore('stylePresets');
    let failure: unknown;
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error('样式已删除，请刷新列表。');
        if (checkedName === undefined) store.delete(id);
        else
          store.put({
            ...validateAppearancePreset(request.result),
            name: checkedName,
            updatedAt: new Date().toISOString(),
          });
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('本地样式保存失败。'));
  });
}
export const renameAppearancePreset = (id: string, name: string) => mutatePreset(id, name);
export const deleteAppearancePreset = (id: string) => mutatePreset(id);
