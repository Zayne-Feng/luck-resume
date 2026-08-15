export interface LogoAsset {
  id: string;
  name: string;
  image: string;
  updatedAt: string;
}

export function validateLogoAsset(value: unknown): LogoAsset {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('标识素材格式无效。');
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    !row.id.trim() ||
    row.id.length > 100 ||
    typeof row.name !== 'string' ||
    !row.name.trim() ||
    row.name.length > 100 ||
    typeof row.image !== 'string' ||
    row.image.length > 4 * 1024 * 1024 ||
    !/^data:image\/(png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      row.image,
    ) ||
    row.image.endsWith(',') ||
    typeof row.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(row.updatedAt))
  ) {
    throw new Error('标识素材格式无效。');
  }
  if (new Date(row.updatedAt).toISOString() !== row.updatedAt)
    throw new Error('标识素材日期无效。');
  return { id: row.id, name: row.name.trim(), image: row.image, updatedAt: row.updatedAt };
}

let connection: Promise<IDBDatabase> | undefined;

function openAssets(): Promise<IDBDatabase> {
  if (connection) return connection;
  const attempt = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('luck-assets', 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore('logos', { keyPath: 'id' });
    request.onerror = () => reject(request.error ?? new Error('无法打开本地标识素材库。'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('请关闭其他简历标签页后重试标识素材库。'));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };
  });
  connection = attempt;
  void attempt.catch(() => {
    if (connection === attempt) connection = undefined;
  });
  return attempt;
}

export async function listLogoAssets(): Promise<LogoAsset[]> {
  const db = await openAssets();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('logos', 'readonly');
    const request = transaction.objectStore('logos').getAll();
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => {
      try {
        const assets = (request.result as unknown[]).map(validateLogoAsset);
        resolve(assets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      } catch (error) {
        reject(error);
      }
    };
  });
}

export async function saveLogoAsset(name: string, image: string): Promise<LogoAsset> {
  const asset = validateLogoAsset({
    id: crypto.randomUUID(),
    name,
    image,
    updatedAt: new Date().toISOString(),
  });
  const db = await openAssets();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('logos', 'readwrite');
    transaction.objectStore('logos').put(asset);
    transaction.oncomplete = () => resolve(asset);
    transaction.onabort = () => reject(transaction.error ?? new Error('标识素材保存失败。'));
    transaction.onerror = () => reject(transaction.error ?? new Error('标识素材保存失败。'));
  });
}

export async function removeLogoAsset(id: string): Promise<void> {
  const db = await openAssets();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('logos', 'readwrite');
    transaction.objectStore('logos').delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('标识素材删除失败。'));
    transaction.onerror = () => reject(transaction.error ?? new Error('标识素材删除失败。'));
  });
}
