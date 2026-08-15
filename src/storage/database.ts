import { validateDocument } from '../resume/files.ts';
import type { ResumeDocument } from '../resume/model.ts';

export interface StoredDocument {
  id: string;
  document: ResumeDocument;
  revision: number;
}

export interface RecoveryDraft {
  id: string;
  data: unknown;
  reason: string;
}

export interface LoadedDocuments {
  documents: StoredDocument[];
  recovery: RecoveryDraft[];
}

export class StorageConflict extends Error {
  readonly documentId?: string;

  constructor(documentId?: string) {
    super('此简历已在另一个标签页更新。请将当前修改另存为副本。');
    this.name = 'StorageConflict';
    this.documentId = documentId;
  }
}

let connection: Promise<IDBDatabase> | undefined;

export function openDatabase(): Promise<IDBDatabase> {
  if (!connection) {
    const attempt = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('luck-resume', 2);
      let blocked = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('documents'))
          db.createObjectStore('documents', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('stylePresets'))
          db.createObjectStore('stylePresets', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('resumeVersions')) {
          db.createObjectStore('resumeVersions', { keyPath: 'id' }).createIndex(
            'documentId',
            'documentId',
          );
        }
      };
      request.onerror = () => {
        connection = undefined;
        reject(request.error);
      };
      request.onblocked = () => {
        blocked = true;
        reject(new Error('请关闭其他幸运简历标签页后重新打开。'));
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
  }
  return connection;
}

export async function loadDocuments(): Promise<LoadedDocuments> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('documents', 'readonly');
    const request = transaction.objectStore('documents').getAll();
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => {
      const documents: StoredDocument[] = [];
      const recovery: RecoveryDraft[] = [];
      for (const value of request.result as unknown[]) {
        try {
          const row = value as StoredDocument;
          const document = validateDocument(row.document);
          if (row.id !== document.id || !Number.isSafeInteger(row.revision) || row.revision < 1)
            throw new Error('草稿索引需要恢复。');
          documents.push({ id: row.id, document, revision: row.revision });
        } catch (error) {
          recovery.push({
            id:
              typeof (value as StoredDocument)?.id === 'string'
                ? (value as StoredDocument).id
                : 'unknown',
            data: value,
            reason: error instanceof Error ? error.message : '草稿格式需要恢复。',
          });
        }
      }
      resolve({
        documents: documents.sort((a, b) =>
          b.document.updatedAt.localeCompare(a.document.updatedAt),
        ),
        recovery,
      });
    };
  });
}

export async function saveDocument(
  document: ResumeDocument,
  expectedRevision: number,
): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('documents', 'readwrite');
    const store = transaction.objectStore('documents');
    const request = store.get(document.id);
    let failure: Error | null = null;
    request.onsuccess = () => {
      const row = request.result as StoredDocument | undefined;
      if ((row?.revision ?? 0) !== expectedRevision) {
        failure = new StorageConflict();
        transaction.abort();
        return;
      }
      try {
        store.put({
          id: document.id,
          document,
          revision: expectedRevision + 1,
        } satisfies StoredDocument);
      } catch (error) {
        failure = error instanceof Error ? error : new Error('本地草稿保存失败。');
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(expectedRevision + 1);
    transaction.onabort = () =>
      reject(failure ?? transaction.error ?? new Error('本地草稿保存失败。'));
    transaction.onerror = () => {
      failure ??= transaction.error;
    };
  });
}

export async function removeDocument(id: string, expectedRevision: number): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('documents', 'readwrite');
    const store = transaction.objectStore('documents');
    const request = store.get(id);
    let conflict = false;
    request.onsuccess = () => {
      const row = request.result as StoredDocument | undefined;
      if (row && row.revision !== expectedRevision) {
        conflict = true;
        transaction.abort();
      } else store.delete(id);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(conflict ? new StorageConflict() : transaction.error);
  });
}
