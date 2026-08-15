import { useEffect, useState } from 'react';
import type { ResumeDocument } from '../resume/model.ts';
import { saveVersion } from './versionHistory.ts';

export function useVersionCheckpoints(document: ResumeDocument | null) {
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    setError(null);
  }, [document?.id]);
  useEffect(() => {
    if (!document) return;
    let active = true;
    const timer = setTimeout(() => {
      void saveVersion(document, 'automatic')
        .then(() => {
          if (active) setError(null);
        })
        .catch((reason) => {
          if (active) setError(reason);
        });
    }, 1600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [document]);
  return { error };
}
