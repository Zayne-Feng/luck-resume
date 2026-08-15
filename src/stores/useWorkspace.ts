import { create } from 'zustand';
import { planEntryTransfer, type EntryTransferRequest } from '../resume/entryTransfer.ts';
import { saveDocumentBatch } from '../storage/documentBatch.ts';
import {
  cloneDocument,
  createDocument,
  type ResumeDocument,
  type TemplateId,
} from '../resume/model.ts';
import {
  newHistory,
  recordChange,
  travelHistory,
  type DocumentHistory,
} from '../resume/history.ts';
import {
  loadDocuments,
  removeDocument,
  saveDocument,
  StorageConflict,
  type RecoveryDraft,
} from '../storage/database.ts';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

interface Workspace {
  documents: Record<string, ResumeDocument>;
  activeId: string | null;
  revisions: Record<string, number>;
  statuses: Record<string, SaveState>;
  histories: Record<string, DocumentHistory>;
  ready: boolean;
  loadError: string | null;
  recoveryDrafts: RecoveryDraft[];
  operationError: string | null;
  initialize: () => Promise<void>;
  select: (id: string) => void;
  add: (document: ResumeDocument) => string;
  adoptImported: (documents: ResumeDocument[]) => void;
  create: (template?: TemplateId, sample?: boolean) => string;
  duplicate: (id: string) => string;
  recover: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  update: (change: (document: ResumeDocument) => void, group?: string, documentId?: string) => void;
  transferEntry: (request: EntryTransferRequest) => Promise<string>;
  travel: (direction: 'undo' | 'redo') => Promise<void>;
  flush: (id?: string) => Promise<void>;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const writes = new Map<string, Promise<void>>();
let initialization: Promise<void> | undefined;
const lockedDocuments = new Set<string>();
const deferredUpdates = new Map<
  string,
  { change: (document: ResumeDocument) => void; group: string }[]
>();
interface LinkedStep {
  direction: 'undo' | 'redo';
  snapshots: Record<string, ResumeDocument>;
}
const linkedSteps = new WeakMap<ResumeDocument, LinkedStep>();

function releaseDocuments(ids: string[]) {
  ids.forEach((id) => lockedDocuments.delete(id));
  for (const id of ids) {
    const updates = deferredUpdates.get(id) ?? [];
    deferredUpdates.delete(id);
    for (const { change, group } of updates) useWorkspace.getState().update(change, group, id);
  }
}

function linkSnapshots(
  snapshots: Record<string, ResumeDocument>,
  direction: LinkedStep['direction'],
) {
  const step = { snapshots, direction };
  for (const snapshot of Object.values(snapshots)) linkedSteps.set(snapshot, step);
}

async function persistChanges(
  documents: Record<string, ResumeDocument>,
  histories: Record<string, DocumentHistory>,
) {
  const ids = Object.keys(documents);
  const statuses = useWorkspace.getState().statuses;
  useWorkspace.setState((state) => ({
    operationError: null,
    statuses: {
      ...state.statuses,
      ...Object.fromEntries(ids.map((id) => [id, 'saving' as const])),
    },
  }));
  try {
    const revisions = await saveDocumentBatch(documents, useWorkspace.getState().revisions);
    useWorkspace.setState((state) => ({
      documents: { ...state.documents, ...documents },
      revisions: { ...state.revisions, ...revisions },
      histories: { ...state.histories, ...histories },
      statuses: {
        ...state.statuses,
        ...Object.fromEntries(ids.map((id) => [id, 'saved' as const])),
      },
    }));
  } catch (error) {
    useWorkspace.setState((state) => ({
      operationError: error instanceof Error ? error.message : '本地草稿保存失败。',
      statuses: {
        ...state.statuses,
        ...Object.fromEntries(
          ids.map((id) => [
            id,
            error instanceof StorageConflict && error.documentId === id ? 'conflict' : statuses[id],
          ]),
        ),
      },
    }));
    throw error;
  }
}

async function flushDocuments(ids: string[]) {
  await Promise.all(ids.map((id) => useWorkspace.getState().flush(id)));
  if (ids.some((id) => useWorkspace.getState().statuses[id] !== 'saved'))
    throw new Error('请先保存源简历与目标简历，再重试。');
}

function rememberActive(id: string | null) {
  try {
    if (id) localStorage.setItem('luck-active', id);
    else localStorage.removeItem('luck-active');
  } catch {
    /* Active selection is optional. */
  }
}

function queueSave(id: string, delay = 450) {
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void useWorkspace.getState().flush(id);
    }, delay),
  );
}

export const useWorkspace = create<Workspace>((set, get) => ({
  documents: {},
  activeId: null,
  revisions: {},
  statuses: {},
  histories: {},
  ready: false,
  loadError: null,
  recoveryDrafts: [],
  operationError: null,
  initialize: () => {
    if (initialization) return initialization;
    initialization = (async () => {
      try {
        const { documents: rows, recovery } = await loadDocuments();
        const local = get();
        const documents = Object.fromEntries(rows.map((row) => [row.id, row.document]));
        const revisions = Object.fromEntries(rows.map((row) => [row.id, row.revision]));
        const statuses: Record<string, SaveState> = Object.fromEntries(
          rows.map((row) => [row.id, 'saved']),
        );
        for (const [id, document] of Object.entries(local.documents)) {
          if (local.statuses[id] === 'saved') continue;
          documents[id] = document;
          revisions[id] = local.revisions[id] ?? 0;
          statuses[id] = local.statuses[id] === 'conflict' ? 'conflict' : 'pending';
        }
        let activeId: string | null = null;
        try {
          activeId = localStorage.getItem('luck-active');
        } catch {
          /* Use the latest draft if selection is unavailable. */
        }
        activeId =
          local.activeId && documents[local.activeId]
            ? local.activeId
            : activeId && documents[activeId]
              ? activeId
              : (Object.keys(documents)[0] ?? null);
        set({
          documents,
          activeId,
          revisions,
          statuses,
          recoveryDrafts: recovery,
          ready: true,
          loadError: null,
        });
        if (!Object.keys(documents).length && !recovery.length) get().create('linen', true);
        for (const id of Object.keys(documents)) if (statuses[id] === 'pending') queueSave(id, 0);
      } catch {
        set({
          ready: true,
          loadError: '无法读取此浏览器的本地草稿。你仍可编辑并下载 JSON 备份，或重新尝试读取。',
        });
        if (!get().activeId) get().create('linen', true);
        initialization = undefined;
      }
    })();
    return initialization;
  },
  select: (id) => {
    if (!get().documents[id]) return;
    set({ activeId: id });
    rememberActive(id);
  },
  add: (document) => {
    set((state) => ({
      documents: { ...state.documents, [document.id]: document },
      activeId: document.id,
      revisions: { ...state.revisions, [document.id]: 0 },
      statuses: { ...state.statuses, [document.id]: 'pending' },
      histories: { ...state.histories, [document.id]: newHistory() },
    }));
    rememberActive(document.id);
    queueSave(document.id, 0);
    return document.id;
  },
  create: (template = 'linen', sample = false) => get().add(createDocument(template, sample)),
  adoptImported: (documents) => {
    set((state) => ({
      documents: {
        ...state.documents,
        ...Object.fromEntries(documents.map((doc) => [doc.id, doc])),
      },
      revisions: { ...state.revisions, ...Object.fromEntries(documents.map((doc) => [doc.id, 1])) },
      statuses: {
        ...state.statuses,
        ...Object.fromEntries(documents.map((doc) => [doc.id, 'saved' as const])),
      },
      histories: {
        ...state.histories,
        ...Object.fromEntries(documents.map((doc) => [doc.id, newHistory()])),
      },
      activeId: state.activeId ?? documents[0]?.id ?? null,
    }));
    rememberActive(get().activeId);
  },
  duplicate: (id) => get().add(cloneDocument(get().documents[id])),
  recover: async (id) => {
    const original = get().documents[id];
    get().add(cloneDocument(original));
    try {
      const row = (await loadDocuments()).documents.find((row) => row.id === id);
      if (row && get().documents[id] === original) {
        set((state) => ({
          documents: { ...state.documents, [id]: row.document },
          revisions: { ...state.revisions, [id]: row.revision },
          statuses: { ...state.statuses, [id]: 'saved' },
          histories: { ...state.histories, [id]: newHistory() },
        }));
      }
    } catch {
      /* The independent copy retains the unsaved content. */
    }
  },
  remove: async (id) => {
    if (lockedDocuments.has(id)) throw new Error('条目操作正在保存，请稍候。');
    clearTimeout(timers.get(id));
    timers.delete(id);
    try {
      await writes.get(id);
      await removeDocument(id, get().revisions[id] ?? 0);
    } catch (error) {
      if (error instanceof StorageConflict && get().documents[id]) {
        clearTimeout(timers.get(id));
        timers.delete(id);
        set((state) => ({ statuses: { ...state.statuses, [id]: 'conflict' } }));
      } else if (get().statuses[id] === 'pending') queueSave(id);
      throw error;
    }
    set((state) => {
      const documents = { ...state.documents };
      const statuses = { ...state.statuses };
      const histories = { ...state.histories };
      const revisions = { ...state.revisions };
      delete documents[id];
      delete statuses[id];
      delete histories[id];
      delete revisions[id];
      const activeId = state.activeId === id ? (Object.keys(documents)[0] ?? null) : state.activeId;
      rememberActive(activeId);
      return { documents, statuses, histories, revisions, activeId };
    });
  },
  update: (change, group = '', documentId) => {
    const { documents, histories } = get();
    const activeId = documentId ?? get().activeId;
    if (!activeId || !documents[activeId]) return;
    if (lockedDocuments.has(activeId)) {
      deferredUpdates.set(activeId, [...(deferredUpdates.get(activeId) ?? []), { change, group }]);
      return;
    }
    const before = documents[activeId];
    const next = structuredClone(before);
    change(next);
    if (JSON.stringify(before) === JSON.stringify(next)) return;
    next.updatedAt = new Date().toISOString();
    set((state) => ({
      documents: { ...state.documents, [activeId]: next },
      histories: {
        ...state.histories,
        [activeId]: recordChange(histories[activeId] ?? newHistory(), before, group),
      },
      statuses: {
        ...state.statuses,
        [activeId]: state.statuses[activeId] === 'conflict' ? 'conflict' : 'pending',
      },
    }));
    if (get().statuses[activeId] !== 'conflict') queueSave(activeId);
  },
  transferEntry: async (request) => {
    const ids = [...new Set([request.sourceDocumentId, request.destinationDocumentId])];
    planEntryTransfer(get().documents, request);
    if (ids.some((id) => lockedDocuments.has(id))) throw new Error('条目操作正在保存，请稍候。');
    ids.forEach((id) => lockedDocuments.add(id));
    try {
      await flushDocuments(ids);
      const { documents, histories } = get();
      const plan = planEntryTransfer(documents, request);
      if (!plan.documents[request.sourceDocumentId]) {
        plan.documents[request.sourceDocumentId] = {
          ...structuredClone(documents[request.sourceDocumentId]),
          updatedAt: new Date().toISOString(),
        };
      }
      const before = Object.fromEntries(
        Object.keys(plan.documents).map((id) => [id, documents[id]]),
      );
      const nextHistories = Object.fromEntries(
        Object.keys(plan.documents).map((id) => [
          id,
          recordChange(histories[id] ?? newHistory(), documents[id], ''),
        ]),
      );
      await persistChanges(plan.documents, nextHistories);
      linkSnapshots(before, 'undo');
      return plan.entryId;
    } finally {
      releaseDocuments(ids);
    }
  },
  travel: async (direction) => {
    const { activeId, documents, histories } = get();
    if (!activeId) return;
    if (lockedDocuments.has(activeId)) return;
    const history = histories[activeId] ?? newHistory();
    const snapshots = direction === 'undo' ? history.past : history.future;
    const linked = snapshots.length ? linkedSteps.get(snapshots[snapshots.length - 1]) : undefined;
    if (linked?.direction === direction) {
      // A discarded history cannot participate again; keep its surviving partners independent.
      const ids = Object.keys(linked.snapshots).filter((id) => {
        const current = get().histories[id];
        const snapshot = linked.snapshots[id];
        return (
          !!get().documents[id] &&
          !!current &&
          (current.past.includes(snapshot) || current.future.includes(snapshot))
        );
      });
      const available = ids.every((id) => {
        const current = get().histories[id];
        const stack = current && (direction === 'undo' ? current.past : current.future);
        return !lockedDocuments.has(id) && stack?.[stack.length - 1] === linked.snapshots[id];
      });
      if (!available) {
        set({ operationError: '请先撤销或重做另一份简历中的后续修改，再重试此条目操作。' });
        return;
      }
      ids.forEach((id) => lockedDocuments.add(id));
      try {
        await flushDocuments(ids);
        const state = get();
        const nextDocuments: Record<string, ResumeDocument> = {};
        const nextHistories: Record<string, DocumentHistory> = {};
        const reverse: Record<string, ResumeDocument> = {};
        for (const id of ids) {
          const result = travelHistory(state.histories[id], state.documents[id], direction)!;
          nextDocuments[id] = result.document;
          nextHistories[id] = result.history;
          reverse[id] = state.documents[id];
        }
        await persistChanges(nextDocuments, nextHistories);
        linkSnapshots(reverse, direction === 'undo' ? 'redo' : 'undo');
      } catch (error) {
        set({ operationError: error instanceof Error ? error.message : '本地草稿保存失败。' });
      } finally {
        releaseDocuments(ids);
      }
      return;
    }
    const result = travelHistory(
      histories[activeId] ?? newHistory(),
      documents[activeId],
      direction,
    );
    if (!result) return;
    set((state) => ({
      operationError: null,
      documents: { ...state.documents, [activeId]: result.document },
      histories: { ...state.histories, [activeId]: result.history },
      statuses: {
        ...state.statuses,
        [activeId]: state.statuses[activeId] === 'conflict' ? 'conflict' : 'pending',
      },
    }));
    if (get().statuses[activeId] !== 'conflict') queueSave(activeId);
  },
  flush: async (requestedId) => {
    const id = requestedId ?? get().activeId;
    if (!id || !get().documents[id] || get().statuses[id] === 'conflict') return;
    clearTimeout(timers.get(id));
    timers.delete(id);
    if (writes.has(id)) {
      await writes.get(id);
      if (get().statuses[id] === 'pending') return get().flush(id);
      return;
    }
    if (get().statuses[id] === 'saved') return;
    const document = get().documents[id];
    set((state) => ({ statuses: { ...state.statuses, [id]: 'saving' } }));
    const operation = (async () => {
      try {
        const revision = await saveDocument(document, get().revisions[id] ?? 0);
        set((state) => ({
          revisions: { ...state.revisions, [id]: revision },
          statuses: {
            ...state.statuses,
            [id]: state.documents[id] === document ? 'saved' : 'pending',
          },
        }));
      } catch (error) {
        set((state) => ({
          statuses: {
            ...state.statuses,
            [id]: error instanceof StorageConflict ? 'conflict' : 'error',
          },
        }));
      }
    })();
    writes.set(id, operation);
    await operation;
    writes.delete(id);
    if (get().statuses[id] === 'pending') queueSave(id, 0);
  },
}));
