import { expect, it } from 'vitest';
import { createEditorStore } from '../editor/store';
import { emptyProject } from '../domain/model';
import { LocalSession } from './localSession';
import { PersistenceConflict, type LocalRecord, type Repository, type Workspace, type WriteJob } from './repository';

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
class DelayedRepository implements Repository {
  workspace: Workspace = { key: 'active', localId: null, revision: 0 };
  rows = new Map<string, LocalRecord>(); calls: WriteJob[] = []; gate: ReturnType<typeof deferred> | null = null;
  failure: Error | null = null; versionChanged = () => {};
  async open(changed: () => void) { this.versionChanged = changed; }
  async active() { return { workspace: this.workspace, record: this.workspace.localId ? this.rows.get(this.workspace.localId) : undefined }; }
  async read(id: string) { return this.rows.get(id); }
  async list() { return [...this.rows.values()].map(r => ({ localId: r.localId, name: r.document.project.name, updatedAt: r.updatedAt })); }
  async write(job: WriteJob) {
    this.calls.push(job); const gate = this.gate; this.gate = null; if (gate) await gate.promise;
    if (this.failure) throw this.failure;
    if (job.expectedWorkspaceRevision !== this.workspace.revision) throw new PersistenceConflict('冲突');
    const projectRevision = (this.rows.get(job.localId)?.storageRevision ?? 0) + 1;
    this.rows.set(job.localId, { localId: job.localId, document: job.document, storageRevision: projectRevision, updatedAt: 1 });
    this.workspace = { key: 'active', localId: job.activate ? job.localId : this.workspace.localId, revision: this.workspace.revision + 1 };
    return { projectRevision, workspaceRevision: this.workspace.revision };
  }
  close() {}
}
async function setup() {
  const store = createEditorStore(), repo = new DelayedRepository();
  const session = new LocalSession(store, repo, async () => ({ acquired: true, mode: 'cas', release() {} }), 60_000);
  await session.start(); return { store, repo, session };
}
it('serializes late acknowledgements; a newer document stays dirty until its own transaction completes', async () => {
  const { store, repo, session } = await setup(); const first = deferred(); repo.gate = first;
  const flush = session.flush(); expect(repo.calls).toHaveLength(1);
  store.getState().add('minecraft:button'); const latest = store.getState().doc;
  const second = deferred(); repo.gate = second; first.resolve();
  await new Promise(r => setTimeout(r, 0));
  expect(repo.calls).toHaveLength(2); expect(session.status.getState().dirty).toBe(true);
  expect(repo.calls[1].expectedWorkspaceRevision).toBe(1);
  second.resolve(); await flush;
  expect(session.status.getState().phase).toBe('saved'); expect(repo.rows.get(repo.workspace.localId!)!.document).toEqual(latest); session.stop();
});
it('failed writes keep the latest in-memory design dirty; retry saves later edits and undo uses a new storage sequence', async () => {
  const { store, repo, session } = await setup(); await session.flush();
  repo.failure = new DOMException('full', 'QuotaExceededError'); store.getState().add('minecraft:button'); await session.flush();
  expect(session.status.getState()).toMatchObject({ phase: 'error', dirty: true });
  store.getState().add('minecraft:fill'); repo.failure = null; await session.retry();
  expect(repo.rows.get(repo.workspace.localId!)!.document.screens[0].nodes).toHaveLength(2);
  const rev = repo.workspace.revision; store.getState().undo(); await session.flush();
  expect(repo.workspace.revision).toBe(rev + 1); expect(repo.rows.get(repo.workspace.localId!)!.document.screens[0].nodes).toHaveLength(1); session.stop();
});
it('imports preserve the old pending snapshot under its own local identity even with duplicate project IDs', async () => {
  const { store, repo, session } = await setup(); store.getState().add('minecraft:button'); const old = store.getState().doc;
  store.getState().importJson(JSON.stringify(emptyProject())); await session.flush();
  expect(repo.rows.size).toBe(2); expect([...repo.rows.values()].some(r => JSON.stringify(r.document) === JSON.stringify(old))).toBe(true);
  expect(repo.rows.get(repo.workspace.localId!)!.document.screens[0].nodes).toHaveLength(0); session.stop();
});
it('an import arriving during an old write retains both identities and activates only the new copy', async () => {
  const { store, repo, session } = await setup(); const gate = deferred(); repo.gate = gate;
  const flush = session.flush(); store.getState().add('minecraft:button'); const before = store.getState().doc;
  const imported = emptyProject(); imported.project.name = 'New import'; store.getState().importJson(JSON.stringify(imported));
  gate.resolve(); await flush;
  expect(repo.rows.size).toBe(2); expect(repo.rows.get(repo.workspace.localId!)!.document).toEqual(imported);
  expect([...repo.rows.values()].some(r => JSON.stringify(r.document) === JSON.stringify(before))).toBe(true); session.stop();
});
it('conflicts freeze editing and are not retried as blind overwrites', async () => {
  const { store, repo, session } = await setup(); await session.flush(); repo.workspace.revision++;
  store.getState().add('minecraft:button'); await session.flush();
  expect(session.status.getState().phase).toBe('conflict'); expect(store.getState().blocked).toBeTruthy();
  const calls = repo.calls.length; await session.retry(); expect(repo.calls).toHaveLength(calls); session.stop();
});
it('a versionchange cannot be overwritten by an in-flight successful acknowledgement', async () => {
  const { store, repo, session } = await setup(); const gate = deferred(); repo.gate = gate;
  const flush = session.flush(); repo.versionChanged(); gate.resolve(); await flush;
  expect(session.status.getState().phase).toBe('conflict'); expect(store.getState().blocked).toBeTruthy(); session.stop();
});
