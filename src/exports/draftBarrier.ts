export type ExportDraft = { validate: () => void; commit: () => void };
const pending = new Map<symbol, () => ExportDraft>();
export function registerExportDraft(read: () => ExportDraft) {
  const key = Symbol(); pending.set(key, read); return () => { pending.delete(key); };
}
export function commitExportDrafts() {
  const drafts = [...pending.values()].map(read => read());
  // Do not commit earlier valid fields when another field is already known to be invalid.
  for (const draft of drafts) draft.validate();
  for (const draft of drafts) draft.commit();
}
