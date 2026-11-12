import { parsePersonalTemplate, type PersonalTemplate } from '../domain/template';

export const TEMPLATE_DB_NAME = 'minecraft-gui-maker-templates';
const STORE = 'templates';

export type TemplateSummary = Pick<PersonalTemplate, 'id' | 'name' | 'description' | 'updatedAt' | 'nodes' | 'resourceDependencies' | 'rootNodeIds'>;

export class TemplateRepository {
  private db: IDBDatabase | null = null;
  open(): Promise<void> {
    if (this.db) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error('此浏览器无法使用模板库的 IndexedDB')); return; }
      const request = indexedDB.open(TEMPLATE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(STORE) ? request.transaction!.objectStore(STORE) : db.createObjectStore(STORE, { keyPath: 'id' });
        if (!store.indexNames.contains('updatedAt')) store.createIndex('updatedAt', 'updatedAt');
      };
      request.onerror = () => reject(request.error ?? new Error('模板库打开失败'));
      request.onblocked = () => reject(new Error('模板库升级被其他页面阻塞，请关闭旧页面后重试'));
      request.onsuccess = () => { this.db = request.result; resolve(); };
    });
  }
  close() { this.db?.close(); this.db = null; }
  private store(mode: IDBTransactionMode) {
    if (!this.db) throw new Error('模板库尚未打开');
    return this.db.transaction(STORE, mode).objectStore(STORE);
  }
  list(): Promise<PersonalTemplate[]> {
    return new Promise((resolve, reject) => {
      const request = this.store('readonly').index('updatedAt').openCursor(null, 'prev'), rows: PersonalTemplate[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || rows.length >= 100) return;
        try { rows.push(parsePersonalTemplate(cursor.value)); } catch { /* keep valid rows visible; corrupt rows are skipped */ }
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error('模板库读取失败'));
      request.transaction!.oncomplete = () => resolve(rows);
    });
  }
  put(template: PersonalTemplate): Promise<void> {
    const valid = parsePersonalTemplate(template);
    return new Promise((resolve, reject) => {
      const request = this.store('readwrite').put(valid);
      request.onerror = () => reject(request.error ?? new Error('模板保存失败'));
      request.transaction!.oncomplete = () => resolve();
    });
  }
  remove(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = this.store('readwrite').delete(id);
      request.onerror = () => reject(request.error ?? new Error('模板删除失败'));
      request.transaction!.oncomplete = () => resolve();
    });
  }
}
