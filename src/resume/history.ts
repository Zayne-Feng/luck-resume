import type { ResumeDocument } from './model.ts';

export interface DocumentHistory {
  past: ResumeDocument[];
  future: ResumeDocument[];
  group: string;
  time: number;
}

export const newHistory = (): DocumentHistory => ({ past: [], future: [], group: '', time: 0 });

export function recordChange(
  history: DocumentHistory,
  before: ResumeDocument,
  group: string,
  now = Date.now(),
): DocumentHistory {
  const merge = group !== '' && history.group === group && now - history.time < 700;
  return {
    past: merge ? history.past : [...history.past, before].slice(-40),
    future: [],
    group,
    time: now,
  };
}

export function travelHistory(
  history: DocumentHistory,
  current: ResumeDocument,
  direction: 'undo' | 'redo',
): { history: DocumentHistory; document: ResumeDocument } | null {
  const source = direction === 'undo' ? history.past : history.future;
  if (!source.length) return null;
  const document = { ...source[source.length - 1], updatedAt: new Date().toISOString() };
  return {
    document,
    history:
      direction === 'undo'
        ? {
            past: history.past.slice(0, -1),
            future: [...history.future, current],
            group: '',
            time: 0,
          }
        : {
            past: [...history.past, current],
            future: history.future.slice(0, -1),
            group: '',
            time: 0,
          },
  };
}
