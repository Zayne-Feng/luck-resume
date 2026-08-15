import { openDatabase, StorageConflict, type StoredDocument } from './database.ts';
import type { ResumeDocument } from '../resume/model.ts';

export async function saveDocumentBatch(
  documents: Record<string, ResumeDocument>,
  revisions: Record<string, number>,
): Promise<Record<string, number>> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('documents', 'readwrite');
    const store = transaction.objectStore('documents');
    const nextRevisions: Record<string, number> = {};
    let failure: Error | null = null;
    for (const document of Object.values(documents)) {
      const request = store.get(document.id);
      request.onsuccess = () => {
        const expected = revisions[document.id] ?? 0;
        const row = request.result as StoredDocument | undefined;
        if ((row?.revision ?? 0) !== expected) {
          failure = new StorageConflict(document.id);
          transaction.abort();
          return;
        }
        try {
          const revision = expected + 1;
          store.put({ id: document.id, document, revision } satisfies StoredDocument);
          nextRevisions[document.id] = revision;
        } catch (error) {
          failure = error instanceof Error ? error : new Error('本地草稿保存失败。');
          transaction.abort();
        }
      };
    }
    transaction.oncomplete = () => resolve(nextRevisions);
    transaction.onabort = () =>
      reject(failure ?? transaction.error ?? new Error('本地草稿保存失败。'));
    transaction.onerror = () => {
      failure ??= transaction.error;
    };
  });
}
