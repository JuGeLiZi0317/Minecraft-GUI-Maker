import { exportProject, parseProject, type GuiProject } from '../domain/schema';

export const EXPORT_CONTRACT = 'minecraft-gui-maker-export/0.7.0' as const;
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
export function beginExport(document: GuiProject, identity = { exportId: crypto.randomUUID(), createdAt: new Date().toISOString() }, selectedScreenId = document.screens[0].id) {
  const copy = parseProject(JSON.stringify(structuredClone(document)));
  if (!copy.screens.some(screen => screen.id === selectedScreenId)) throw new Error(`导出 Screen 不存在：${selectedScreenId}`);
  const projectJson = exportProject(copy) + '\n';
  parseProject(projectJson);
  return deepFreeze({ contract: EXPORT_CONTRACT, ...identity, selectedScreenId, document: copy, projectJson });
}
export type ExportSnapshot = ReturnType<typeof beginExport>;
export async function sha256(bytes: Uint8Array): Promise<string> {
  if (!crypto.subtle) throw new Error('当前浏览器无法计算导出摘要，请使用localhost或HTTPS');
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
export async function referenceFor(snapshot: ExportSnapshot) {
  return deepFreeze({ contract: snapshot.contract, exportId: snapshot.exportId, createdAt: snapshot.createdAt,
    projectId: snapshot.document.project.id, revision: snapshot.document.project.revision,
    schemaVersion: snapshot.document.schemaVersion, catalogVersion: snapshot.document.catalogVersion,
    documentSha256: await sha256(new TextEncoder().encode(snapshot.projectJson)), target: snapshot.document.target });
}
export type ExportReference = Awaited<ReturnType<typeof referenceFor>>;
