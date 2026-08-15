import { useEffect, useReducer, useRef, useState } from 'react';
import { serializeResume } from '../resume/files.ts';
import type { ResumeDocument } from '../resume/model.ts';
import { LocalFileSession, type LocalFileState } from './localFile.ts';

export interface LocalFilesController {
  state: LocalFileState;
  hasDocument: boolean;
  open(): Promise<void>;
  save(): Promise<boolean>;
  saveAs(): Promise<boolean>;
  disconnect(): void;
}

export function useLocalFiles(
  document: ResumeDocument | null,
  onImport: (document: ResumeDocument) => void,
): LocalFilesController {
  const [session] = useState(() => new LocalFileSession());
  const [, refresh] = useReducer((version: number) => version + 1, 0);
  const current = useRef({ document, onImport, content: '', generation: 0 });
  const content = document ? serializeResume(document) : '';
  if (current.current.content !== content) current.current.generation++;
  current.current = { document, onImport, content, generation: current.current.generation };
  useEffect(() => session.subscribe(refresh), [session]);

  return {
    state: session.state(document),
    hasDocument: Boolean(document),
    async open() {
      const generation = current.current.generation;
      const isCurrent = () => current.current.generation === generation;
      const opened = await session.open(isCurrent);
      if (opened && isCurrent()) current.current.onImport(opened);
    },
    save() {
      return current.current.document
        ? session.save(current.current.document)
        : Promise.resolve(false);
    },
    saveAs() {
      return current.current.document
        ? session.saveAs(current.current.document)
        : Promise.resolve(false);
    },
    disconnect() {
      if (current.current.document) session.disconnect(current.current.document.id);
    },
  };
}
