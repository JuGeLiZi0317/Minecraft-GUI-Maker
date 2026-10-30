import { useEffect, useRef } from 'react';
import { registerExportDraft, type ExportDraft } from './draftBarrier';

export function useExportDraft(draft: ExportDraft) {
  const latest = useRef(draft); latest.current = draft;
  useEffect(() => registerExportDraft(() => latest.current), []);
}
