import { useEffect, useReducer, useRef, useState } from 'react';
import type { ResumeDocument } from '../resume/model.ts';
import { serializeResume } from '../resume/files.ts';
import {
  DirectoryBackupSession,
  readBackupDirectory,
  rememberBackupDirectory,
  type DirectoryBackupState,
} from './directoryBackup.ts';

export interface DirectoryBackupController {
  state: DirectoryBackupState;
  ready: boolean;
  documents: Record<string, ResumeDocument>;
  choose(): Promise<void>;
  reconnect(): Promise<void>;
  rescan(): Promise<void>;
  disconnect(): Promise<void>;
  restore(file: string): void;
  reconcile(file: string): Promise<boolean>;
  autoRead: boolean;
  setAutoRead(value: boolean): void;
  setPolicy(value: 'retain' | 'mirror'): void;
}

export function useDirectoryBackup(
  documents: Record<string, ResumeDocument>,
  ready: boolean,
  onImport: (document: ResumeDocument) => void,
  onReconcile?: (document: ResumeDocument, expected: string | null) => boolean,
): DirectoryBackupController {
  const [session] = useState(() => new DirectoryBackupSession());
  const [, refresh] = useReducer((version: number) => version + 1, 0);
  const [persistenceError, setPersistenceError] = useState('');
  const [autoRead, setRead] = useState(() => {
    try {
      return localStorage.getItem('luck-backup-readback') === '1';
    } catch {
      return false;
    }
  });
  const current = useRef({ documents, ready, onImport, onReconcile });
  const actionVersion = useRef(0);
  current.current = { documents, ready, onImport, onReconcile };
  useEffect(() => session.subscribe(refresh), [session]);

  useEffect(() => {
    if (!ready || !session.state().supported) return;
    let active = true;
    const version = actionVersion.current;
    void readBackupDirectory()
      .then(async (handle) => {
        if (active && version === actionVersion.current && handle)
          await session.connect(handle, current.current.documents);
      })
      .catch(() => {
        if (active && version === actionVersion.current)
          setPersistenceError('无法读取已保存的备份目录，请重新选择目录。');
      });
    return () => {
      active = false;
    };
  }, [ready, session]);

  const state = session.state();
  useEffect(() => {
    if (!autoRead || !ready || state.permission !== 'granted') return;
    let active = true;
    void (async () => {
      for (const entry of state.preview) {
        if (!active || !current.current.onReconcile) return;
        const local = current.current.documents[entry.document.id];
        if (!local || entry.document.updatedAt <= local.updatedAt) continue;
        const expected = local ? serializeResume(local) : null;
        await session.reconcile(
          entry.file,
          local ?? null,
          (next) => current.current.onReconcile?.(next, expected) ?? false,
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [autoRead, ready, session, state.preview]);
  useEffect(() => {
    if (!autoRead || !ready || !state.name || state.permission !== 'granted') return;
    const scan = () => {
      if (document.visibilityState === 'visible') void session.scan(current.current.documents);
    };
    const timer = window.setInterval(scan, 15000);
    window.addEventListener('focus', scan);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', scan);
    };
  }, [autoRead, ready, session, state.name, state.permission]);
  useEffect(() => {
    if (!ready || !state.name || state.permission !== 'granted') return;
    const timer = window.setTimeout(() => {
      void session.sync(current.current.documents);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [documents, ready, session, state.name, state.permission]);

  const remember = async (handle: Parameters<typeof rememberBackupDirectory>[0]) => {
    try {
      await rememberBackupDirectory(handle);
      setPersistenceError('');
    } catch {
      setPersistenceError('无法保存目录设置；本次连接仍然有效，重新打开页面后需再次选择目录。');
    }
  };

  return {
    state: persistenceError
      ? { ...state, error: [state.error, persistenceError].filter(Boolean).join(' ') }
      : state,
    ready,
    documents,
    autoRead,
    setAutoRead(value) {
      setRead(value);
      try {
        localStorage.setItem('luck-backup-readback', value ? '1' : '0');
      } catch {
        /* Session preference remains usable. */
      }
      if (value) void session.scan(current.current.documents);
    },
    setPolicy(value) {
      session.setPolicy(value);
      void session.sync(current.current.documents);
    },
    async reconcile(file) {
      const entry = session.state().preview.find((item) => item.file === file);
      const local = entry && current.current.documents[entry.document.id];
      if (!entry || !current.current.onReconcile) return false;
      const expected = local ? serializeResume(local) : null;
      return session.reconcile(
        file,
        local ?? null,
        (next) => current.current.onReconcile?.(next, expected) ?? false,
      );
    },
    async choose() {
      if (!current.current.ready) return;
      actionVersion.current++;
      const handle = await session.choose(current.current.documents);
      if (handle) {
        await remember(handle);
        await session.sync(current.current.documents);
      }
    },
    async reconnect() {
      actionVersion.current++;
      await session.reconnect(current.current.documents);
      await session.sync(current.current.documents);
    },
    async rescan() {
      actionVersion.current++;
      await session.reconnect(current.current.documents);
    },
    async disconnect() {
      actionVersion.current++;
      session.disconnect();
      await remember(null);
    },
    restore(file) {
      const document = session.restore(file);
      if (document && current.current.ready) current.current.onImport(document);
    },
  };
}
