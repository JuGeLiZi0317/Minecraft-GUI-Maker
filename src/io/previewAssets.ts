import type { ResourceInput } from '../resources/core';

const DB_NAME = 'minecraft-gui-maker-preview-assets';
const STORE = 'assets';
const VERSION = 1;

export type PersistedResource = { name: string; input: ResourceInput };
export type PersistedResourceSelection = { base: PersistedResource | null; overlay: PersistedResource | null };
export type PersistedFont = { name: string; bytes: ArrayBuffer };

let connection: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('此浏览器无法使用 IndexedDB')); return; }
    const request = indexedDB.open(DB_NAME, VERSION); let settled = false;
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' }); };
    request.onerror = () => { if (!settled) { settled = true; reject(request.error ?? new Error('打开本地资源缓存失败')); } };
    request.onblocked = () => { if (!settled) { settled = true; reject(new Error('本地资源缓存升级被其他标签页阻塞')); } };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
  }).catch(error => { connection = null; throw error; });
  return connection!;
}

function get<T>(key: string): Promise<T | null> {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result?.value as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('读取本地资源缓存失败'));
  }));
}

function put<T>(key: string, value: T): Promise<void> {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put({ key, value });
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('保存本地资源缓存失败'));
  }));
}

function remove(key: string): Promise<void> {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('清除本地资源缓存失败'));
  }));
}

export const previewAssets = {
  readResources: () => get<PersistedResourceSelection>('resources'),
  saveResources: (selection: PersistedResourceSelection) => put('resources', selection),
  clearResources: () => remove('resources'),
  readFont: () => get<PersistedFont>('font'),
  saveFont: (font: PersistedFont) => put('font', font),
  clearFont: () => remove('font'),
};
