import type { Behavior, BehaviorMap } from '../domain/schema';
import type { BehaviorWorkspaceState } from './blocklyModel';

/** Canonical JSON preserves array order while ignoring object key order. */
export function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function semanticFingerprint(rule: Behavior, maps: BehaviorMap[] = []): string {
  // Conservatively invalidate on any shared definition change in this Screen.
  return canonical({ rule, maps });
}
export type LayoutSnapshot = { version: 1; blocklyVersion: string; screenId: string; ruleId: string; fingerprint: string; state: BehaviorWorkspaceState };
const DB = 'minecraft-gui-maker-blockly-layouts', STORE = 'layouts';
let connection: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('IndexedDB 不可用')); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error ?? new Error('缓存不可用'));
    request.onblocked = () => reject(new Error('缓存被其他页面阻塞'));
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); connection = null; }; resolve(db); };
  }).catch(error => { connection = null; throw error; });
  return connection;
}
const key = (project: string, screen: string, rule: string) => JSON.stringify([project, screen, rule]);
export async function readLayout(project: string, screen: string, rule: string): Promise<unknown> {
  const db = await open(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readonly'), req = tx.objectStore(STORE).get(key(project, screen, rule)); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
export async function writeLayout(project: string, snapshot: LayoutSnapshot): Promise<void> {
  const db = await open(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(snapshot, key(project, snapshot.screenId, snapshot.ruleId)); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });
}
export function validSnapshot(value: unknown, screenId: string, rule: Behavior, maps: BehaviorMap[], blocklyVersion: string): value is LayoutSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<LayoutSnapshot>;
  return s.version === 1 && s.blocklyVersion === blocklyVersion && s.screenId === screenId && s.ruleId === rule.id && s.fingerprint === semanticFingerprint(rule, maps) && !!s.state && typeof s.state === 'object';
}
