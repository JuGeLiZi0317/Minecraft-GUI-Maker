export type SidebarMode = 'pinned' | 'collapsed' | 'auto';
export const MODULE_IDS = ['screens', 'structure', 'components', 'behavior'] as const;
export type ModuleId = typeof MODULE_IDS[number];
export type WorkspacePreferences = { version: 2; left: { mode: SidebarMode; width: number }; right: { mode: SidebarMode; width: number }; treeRatio: number; smartGuides: boolean; smartSnap: boolean; openedModules: ModuleId[]; collapsedModules: Record<ModuleId, boolean>; panelHeights: Record<ModuleId, number> };
export const LEGACY_WORKSPACE_KEY = 'minecraft-gui-maker.workspace-preferences.v1';
export const WORKSPACE_KEY = 'minecraft-gui-maker.workspace-preferences.v2';
export const defaultWorkspace = (): WorkspacePreferences => ({ version: 2, left: { mode: 'pinned', width: 232 }, right: { mode: 'pinned', width: 320 }, treeRatio: 0.34, smartGuides: true, smartSnap: true, openedModules: ['structure', 'components'], collapsedModules: { screens: false, structure: false, components: false, behavior: false }, panelHeights: { screens: 180, structure: 220, components: 300, behavior: 300 } });
export function parseWorkspace(value: unknown): WorkspacePreferences {
  const d = defaultWorkspace(); if (!value || typeof value !== 'object') return d;
  const v = value as Omit<Partial<WorkspacePreferences>, 'version'> & { version?: number }; if (v.version !== 1 && v.version !== 2) return d;
  const side = (s: WorkspacePreferences['left'] | undefined, fallback: WorkspacePreferences['left']) => ({ mode: s && ['pinned','collapsed','auto'].includes(s.mode) ? s.mode : fallback.mode, width: s && Number.isFinite(s.width) ? Math.min(640, Math.max(160, Math.round(s.width))) : fallback.width });
  const valid = (id: unknown): id is ModuleId => typeof id === 'string' && (MODULE_IDS as readonly string[]).includes(id);
  const opened = v.version === 2 && Array.isArray(v.openedModules) ? [...new Set(v.openedModules.filter(valid))] : d.openedModules;
  const treeRatio = typeof v.treeRatio === 'number' && Number.isFinite(v.treeRatio) ? Math.max(0.2, Math.min(0.8, v.treeRatio)) : d.treeRatio;
  const collapsed = { ...d.collapsedModules }, heights = { ...d.panelHeights };
  // The old two-pane ratio becomes the initial preferred allocation, without touching the project.
  if (v.version === 1) { const total = d.panelHeights.structure + d.panelHeights.components; heights.structure = Math.round(total * treeRatio); heights.components = total - heights.structure; }
  for (const id of MODULE_IDS) { const c = v.collapsedModules?.[id], h = v.panelHeights?.[id]; if (typeof c === 'boolean') collapsed[id] = c; if (typeof h === 'number' && Number.isFinite(h)) heights[id] = Math.max(94, Math.min(2000, Math.round(h))); }
  return { version: 2, left: side(v.left, d.left), right: side(v.right, d.right), treeRatio, smartGuides: typeof v.smartGuides === 'boolean' ? v.smartGuides : d.smartGuides, smartSnap: typeof v.smartSnap === 'boolean' ? v.smartSnap : d.smartSnap, openedModules: opened, collapsedModules: collapsed, panelHeights: heights };
}
export function loadWorkspace(): WorkspacePreferences {
  for (const key of [WORKSPACE_KEY, LEGACY_WORKSPACE_KEY]) {
    try { const text = localStorage.getItem(key); if (!text) continue; const value: unknown = JSON.parse(text); if (value && typeof value === 'object' && ((value as {version?: unknown}).version === 1 || (value as {version?: unknown}).version === 2)) return parseWorkspace(value); } catch { /* try the older preference record */ }
  }
  return defaultWorkspace();
}
export function saveWorkspace(prefs: WorkspacePreferences) { try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(parseWorkspace(prefs))); } catch { /* preferences never block editing */ } }
