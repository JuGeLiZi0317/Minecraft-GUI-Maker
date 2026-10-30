import { parseProject, type GuiProject } from '../domain/schema';

export const DB_NAME = 'minecraft-gui-maker';
export const DB_VERSION = 2;
export type Workspace = { key: 'active'; localId: string | null; revision: number };
export type LocalRecord = { localId: string; storageRevision: number; updatedAt: number; document: GuiProject };
export type LocalSummary = { localId: string; name: string; updatedAt: number };
export type WriteJob = { localId: string; document: GuiProject; expectedProjectRevision: number | null; expectedWorkspaceRevision: number; activate: boolean };
export interface Repository {
  open: (onVersionChange: () => void) => Promise<void>;
  active: () => Promise<{ workspace: Workspace; record: unknown }>;
  read: (localId: string) => Promise<unknown>;
  list: () => Promise<LocalSummary[]>;
  write: (job: WriteJob) => Promise<{ projectRevision: number; workspaceRevision: number }>;
  close: () => void;
}
export class PersistenceConflict extends Error {}
export class RecoveryError extends Error {
  constructor(message: string, public raw: string) { super(message); }
}
const rawOf = (value: unknown) => { try { return JSON.stringify(value, null, 2) ?? 'null'; } catch { return '记录不是可序列化JSON；原数据库记录已保留。'; } };
const counter = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function workspaceOf(raw: unknown): Workspace {
  if (raw === undefined) return { key: 'active', localId: null, revision: 0 };
  const value = raw as Workspace;
  if (!value || value.key !== 'active' || !(value.localId === null || (typeof value.localId === 'string' && value.localId.length > 0)) || !counter(value.revision)) {
    throw new RecoveryError('本地工作区索引损坏，未覆盖原数据', rawOf(raw));
  }
  return value;
}
export function decodeRecord(raw: unknown, localId: string): LocalRecord {
  try {
    const row = raw as LocalRecord;
    if (!row || row.localId !== localId || !counter(row.storageRevision) || row.storageRevision < 1 || !counter(row.updatedAt)) throw new Error('本地记录元数据不完整');
    return { ...row, document: parseProject(JSON.stringify(row.document)) };
  } catch (error) { throw new RecoveryError(`本地副本无法恢复，原记录已保留：${(error as Error).message}`, rawOf(raw)); }
}

export class IndexedDbRepository implements Repository {
  private db: IDBDatabase | null = null;
  open(onVersionChange: () => void): Promise<void> {
    if (this.db) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error('此浏览器无法使用IndexedDB')); return; }
      let settled = false;
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const projects = db.objectStoreNames.contains('projects') ? request.transaction!.objectStore('projects') : db.createObjectStore('projects', { keyPath: 'localId' });
        if (!projects.indexNames.contains('updatedAt')) projects.createIndex('updatedAt', 'updatedAt');
        if (!db.objectStoreNames.contains('workspace')) db.createObjectStore('workspace', { keyPath: 'key' });
      };
      request.onerror = () => { if (!settled) { settled = true; reject(request.error); } };
      request.onblocked = () => { if (!settled) { settled = true; reject(new Error('数据库升级被其他页面阻塞，请关闭旧页面后重试')); } };
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true; this.db = request.result;
        this.db.onversionchange = () => { this.close(); onVersionChange(); };
        resolve();
      };
    });
  }
  close() { this.db?.close(); this.db = null; }
  private transaction(stores: string[], mode: IDBTransactionMode) {
    if (!this.db) throw new Error('本地数据库连接已关闭，请重试连接');
    return this.db.transaction(stores, mode);
  }
  active(): Promise<{ workspace: Workspace; record: unknown }> {
    return new Promise((resolve, reject) => {
      const tx = this.transaction(['workspace', 'projects'], 'readonly');
      let workspace: Workspace, record: unknown, failure: unknown;
      const request = tx.objectStore('workspace').get('active');
      request.onsuccess = () => {
        try {
          workspace = workspaceOf(request.result);
          if (workspace.localId) {
            const project = tx.objectStore('projects').get(workspace.localId);
            project.onsuccess = () => { record = project.result; };
          }
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve({ workspace, record });
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('读取本地副本事务中止'));
    });
  }
  read(localId: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const tx = this.transaction(['projects'], 'readonly'); const request = tx.objectStore('projects').get(localId);
      tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error ?? new Error('本地副本读取失败'));
    });
  }
  list(): Promise<LocalSummary[]> {
    return new Promise((resolve, reject) => {
      const tx = this.transaction(['projects'], 'readonly'), rows: LocalSummary[] = [];
      const cursor = tx.objectStore('projects').index('updatedAt').openCursor(null, 'prev');
      cursor.onsuccess = () => {
        const c = cursor.result; if (!c || rows.length >= 50) return;
        const row = c.value as LocalRecord;
        rows.push({ localId: String(c.primaryKey), name: typeof row.document?.project?.name === 'string' ? row.document.project.name : '不可用副本（原记录保留）', updatedAt: row.updatedAt }); c.continue();
      };
      tx.oncomplete = () => resolve(rows); tx.onabort = () => reject(tx.error ?? new Error('本地副本列表读取失败'));
    });
  }
  write(job: WriteJob): Promise<{ projectRevision: number; workspaceRevision: number }> {
    const document = parseProject(JSON.stringify(job.document));
    return new Promise((resolve, reject) => {
      const tx = this.transaction(['projects', 'workspace'], 'readwrite');
      const projects = tx.objectStore('projects'), workspaces = tx.objectStore('workspace');
      const p = projects.get(job.localId), w = workspaces.get('active');
      let completed = 0, failure: unknown, result: { projectRevision: number; workspaceRevision: number };
      const apply = () => {
        if (++completed !== 2) return;
        try {
          const workspace = workspaceOf(w.result), old = p.result as LocalRecord | undefined;
          if (workspace.revision !== job.expectedWorkspaceRevision || (old?.storageRevision ?? null) !== job.expectedProjectRevision) {
            throw new PersistenceConflict('其他页面已保存更新，已停止覆盖；请先导出当前JSON，再重新连接');
          }
          const projectRevision = (old?.storageRevision ?? 0) + 1, workspaceRevision = workspace.revision + 1;
          if (!Number.isSafeInteger(projectRevision) || !Number.isSafeInteger(workspaceRevision)) throw new Error('本地保存序号超出范围');
          projects.put({ localId: job.localId, storageRevision: projectRevision, updatedAt: Date.now(), document } satisfies LocalRecord);
          workspaces.put({ key: 'active', localId: job.activate ? job.localId : workspace.localId, revision: workspaceRevision } satisfies Workspace);
          result = { projectRevision, workspaceRevision };
        } catch (error) { failure = error; tx.abort(); }
      };
      p.onsuccess = apply; w.onsuccess = apply;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? new DOMException('本地保存事务中止', 'AbortError'));
    });
  }
}
