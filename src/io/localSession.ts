import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { emptyProject } from '../domain/model';
import type { GuiProject } from '../domain/schema';
import { editorStore, type EditorState } from '../editor/store';
import { decodeRecord, IndexedDbRepository, PersistenceConflict, RecoveryError, type LocalSummary, type Repository } from './repository';

type Lease = { acquired: boolean; mode: 'web-lock' | 'cas'; release: () => void };
export type SaveState = {
  phase: 'loading' | 'saved' | 'dirty' | 'saving' | 'error' | 'readonly' | 'conflict' | 'recovery';
  message: string; dirty: boolean; localId: string | null; copies: LocalSummary[]; rawRecovery: string | null; lockMode: Lease['mode']; canWrite: boolean;
};
export async function browserLease(): Promise<Lease> {
  const cas: Lease = { acquired: true, mode: 'cas', release: () => {} };
  if (!navigator.locks?.request) return cas;
  return new Promise(resolve => {
    void navigator.locks.request('minecraft-gui-maker:writer:v1', { ifAvailable: true }, lock => {
      if (!lock) { resolve({ acquired: false, mode: 'web-lock', release: () => {} }); return; }
      return new Promise<void>(release => resolve({ acquired: true, mode: 'web-lock', release }));
    }).catch(() => resolve(cas));
  });
}
const errorMessage = (error: unknown): string => {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return '本机存储空间不足，内容尚未保存；请导出JSON备份后重试';
  if (error instanceof DOMException && error.name === 'VersionError') return '本地数据库来自较新应用版本，未降级或清除；当前修改请导出JSON';
  return `本地保存不可用：${(error as Error).message}。内容尚未保存，可导出JSON并重试`;
};

export class LocalSession {
  readonly status = createStore<SaveState>(() => ({ phase: 'loading', message: '正在读取本地副本…', dirty: false, localId: null, copies: [], rawRecovery: null, lockMode: 'cas', canWrite: false }));
  private lease: Lease | null = null;
  private workspaceRevision = 0;
  private revisions = new Map<string, number>();
  private pending = new Map<string, GuiProject>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private worker: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  private stopped = false;
  private started = false;
  private paused = false;
  private suppress = false;
  private retrying = false;
  constructor(private store: StoreApi<EditorState>, private repo: Repository, private acquire: () => Promise<Lease> = browserLease, private debounceMs = 350) {}
  async start() {
    if (this.started) return; this.started = true;
    this.store.getState().setBlocked('正在读取本地副本');
    try {
      this.lease = await this.acquire(); if (this.stopped) { this.lease.release(); return; }
      this.status.setState({ lockMode: this.lease.mode, canWrite: this.lease.acquired });
      await this.repo.open(() => this.versionChanged());
      if (this.stopped) { this.repo.close(); return; }
      const { workspace, record } = await this.repo.active(); this.workspaceRevision = workspace.revision;
      if (this.stopped) { this.repo.close(); return; }
      if (workspace.localId) {
        const row = decodeRecord(record, workspace.localId);
        this.revisions.set(row.localId, row.storageRevision); this.status.setState({ localId: row.localId });
        this.store.getState().restoreLocal(row.document);
      } else this.status.setState({ localId: crypto.randomUUID() });
      await this.refreshCopies();
      this.watch();
      if (!this.lease.acquired) {
        this.store.getState().setBlocked('另一个标签页正在编辑，此页只读');
        this.status.setState({ phase: 'readonly', message: '另一标签页正在编辑 · 此页只读，可导出JSON；关闭写入页后重新连接', dirty: false });
      } else {
        this.store.getState().setBlocked(null);
        if (workspace.localId) this.status.setState({ phase: 'saved', dirty: false, message: '已从本地恢复 · 本地已保存' });
        else this.enqueue(this.status.getState().localId!, this.store.getState().doc);
      }
    } catch (error) {
      if (this.stopped) return;
      if (error instanceof RecoveryError) {
        this.paused = true; this.watch();
        this.status.setState({ phase: 'recovery', message: error.message, rawRecovery: error.raw });
        this.store.getState().setBlocked('本地记录无法恢复，已保留原数据');
      } else {
        if (this.lease && !this.lease.acquired) {
          this.status.setState({ phase: 'readonly', message: '另一标签页正在编辑，且本地读取失败；此页只读' });
        } else {
          this.status.setState({ localId: crypto.randomUUID() }); this.store.getState().setBlocked(null); this.watch();
          this.pending.set(this.status.getState().localId!, this.store.getState().doc); this.fail(error);
        }
      }
    }
  }
  private watch() {
    this.unsubscribe?.();
    this.unsubscribe = this.store.subscribe((state, before) => {
      if (this.suppress || this.stopped || state.doc === before.doc) return;
      let id = this.status.getState().localId;
      if (!id) return;
      if (state.operation === 'import') {
        this.pending.set(id, before.doc);
        id = crypto.randomUUID(); this.status.setState({ localId: id });
      }
      this.enqueue(id, state.doc);
    });
  }
  private enqueue(id: string, doc: GuiProject) {
    this.pending.set(id, doc);
    if (!this.paused) this.status.setState({ phase: 'dirty', message: '有未保存修改…', dirty: true });
    else this.status.setState({ dirty: true });
    if (this.timer) clearTimeout(this.timer);
    if (!this.paused) this.timer = setTimeout(() => { void this.flush(); }, this.debounceMs);
  }
  async flush() {
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    if (this.stopped || this.paused || !this.lease?.acquired) return;
    if (this.worker) { await this.worker; return; }
    this.worker = this.drain();
    try { await this.worker; } finally {
      this.worker = null;
      if (this.pending.size && !this.paused && !this.stopped) void this.flush();
    }
  }
  private async drain() {
    while (this.pending.size && !this.stopped && !this.paused) {
      const [localId, document] = this.pending.entries().next().value!; this.pending.delete(localId);
      this.status.setState({ phase: 'saving', message: '正在保存到本机…', dirty: true });
      try {
        const ack = await this.repo.write({ localId, document, expectedProjectRevision: this.revisions.get(localId) ?? null,
          expectedWorkspaceRevision: this.workspaceRevision, activate: localId === this.status.getState().localId });
        if (this.stopped) return;
        this.workspaceRevision = ack.workspaceRevision; this.revisions.set(localId, ack.projectRevision);
        if (!this.paused && !this.pending.size && localId === this.status.getState().localId && document === this.store.getState().doc) {
          this.status.setState({ phase: 'saved', message: '本地已保存', dirty: false });
        }
      } catch (error) {
        if (!this.pending.has(localId)) this.pending.set(localId, document);
        this.fail(error); return;
      }
    }
    if (!this.stopped) await this.refreshCopies();
  }
  private fail(error: unknown) {
    if (this.stopped) return;
    this.paused = true;
    if (error instanceof PersistenceConflict) {
      this.store.getState().setBlocked('保存冲突：请先导出JSON，再重新连接');
      this.status.setState({ phase: 'conflict', dirty: true, message: error.message, canWrite: false });
    } else this.status.setState({ phase: 'error', dirty: true, message: errorMessage(error) });
  }
  private versionChanged() {
    if (this.stopped) return;
    this.paused = true; this.store.getState().setBlocked('数据库版本已改变，请先备份JSON并重新连接');
    this.status.setState({ phase: 'conflict', message: '数据库版本已改变，连接已关闭；请导出JSON后重新连接', dirty: this.pending.size > 0 || this.status.getState().dirty, canWrite: false });
  }
  async retry() {
    if (this.stopped || this.retrying || ['readonly', 'conflict', 'recovery'].includes(this.status.getState().phase)) return;
    this.retrying = true;
    try { await this.repo.open(() => this.versionChanged()); this.paused = false; await this.flush(); }
    catch (error) { this.fail(error); } finally { this.retrying = false; }
  }
  async openCopy(localId: string) {
    if (this.store.getState().blocked) throw new Error(this.store.getState().blocked!);
    this.store.getState().setBlocked('正在打开本地副本');
    try {
      await this.flush();
      if (this.status.getState().dirty) throw new Error('当前修改未能保存，请先导出JSON备份并重试');
      const row = decodeRecord(await this.repo.read(localId), localId);
      this.revisions.set(localId, row.storageRevision); this.status.setState({ localId });
      this.suppress = true; this.store.getState().restoreLocal(row.document); this.suppress = false;
      this.store.getState().setBlocked(null); this.enqueue(localId, this.store.getState().doc);
    } finally {
      this.suppress = false;
      if (this.status.getState().phase !== 'conflict') this.store.getState().setBlocked(null);
    }
  }
  async createProject() {
    if (this.store.getState().blocked || !this.lease?.acquired || this.paused) throw new Error('当前本地会话不可写，请先保存或恢复');
    this.store.getState().setBlocked('正在新建项目');
    try {
      await this.flush();
      if (this.status.getState().dirty) throw new Error('当前设计尚未保存，请先导出备份并重试');
      this.status.setState({ localId: crypto.randomUUID() });
      this.suppress = true; this.store.getState().restoreLocal(emptyProject()); this.suppress = false;
      this.enqueue(this.status.getState().localId!, this.store.getState().doc);
    } finally { this.suppress = false; this.store.getState().setBlocked(null); }
  }
  createNewCopy() {
    if (this.status.getState().phase !== 'recovery' || !this.lease?.acquired) return;
    this.pending.clear(); this.status.setState({ localId: crypto.randomUUID(), rawRecovery: null });
    this.suppress = true; this.store.getState().restoreLocal(emptyProject()); this.suppress = false;
    this.paused = false; this.store.getState().setBlocked(null); this.enqueue(this.status.getState().localId!, this.store.getState().doc);
  }
  private async refreshCopies() { try { const copies = await this.repo.list(); if (!this.stopped) this.status.setState({ copies }); } catch { /* Saving is judged by its transaction, not an optional listing. */ } }
  stop() {
    this.stopped = true; if (this.timer) clearTimeout(this.timer); this.unsubscribe?.(); this.repo.close(); this.lease?.release();
  }
}
export const localSession = new LocalSession(editorStore, new IndexedDbRepository());
