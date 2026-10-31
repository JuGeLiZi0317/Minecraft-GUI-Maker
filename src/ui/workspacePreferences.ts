export type SidebarMode = 'pinned' | 'collapsed' | 'auto';
export type WorkspacePreferences = { version: 1; left: { mode: SidebarMode; width: number }; right: { mode: SidebarMode; width: number }; treeRatio: number; smartGuides: boolean; smartSnap: boolean };
export const WORKSPACE_KEY = 'minecraft-gui-maker.workspace-preferences.v1';
export const defaultWorkspace = (): WorkspacePreferences => ({ version: 1, left: { mode: 'pinned', width: 232 }, right: { mode: 'pinned', width: 320 }, treeRatio: 0.34, smartGuides: true, smartSnap: true });
export function parseWorkspace(value: unknown): WorkspacePreferences {
  const d = defaultWorkspace(); if (!value || typeof value !== 'object') return d;
  const v = value as Partial<WorkspacePreferences>; if (v.version !== 1) return d;
  const side = (s: WorkspacePreferences['left'] | undefined, fallback: WorkspacePreferences['left']) => ({ mode: s && ['pinned','collapsed','auto'].includes(s.mode) ? s.mode : fallback.mode, width: s && Number.isFinite(s.width) ? Math.min(640, Math.max(160, Math.round(s.width))) : fallback.width });
  return { version: 1, left: side(v.left, d.left), right: side(v.right, d.right), treeRatio: typeof v.treeRatio === 'number' && Number.isFinite(v.treeRatio) ? Math.max(0.2, Math.min(0.8, v.treeRatio)) : d.treeRatio,
    smartGuides: typeof v.smartGuides === 'boolean' ? v.smartGuides : d.smartGuides, smartSnap: typeof v.smartSnap === 'boolean' ? v.smartSnap : d.smartSnap };
}
export function loadWorkspace(): WorkspacePreferences { try { const text = localStorage.getItem(WORKSPACE_KEY); return text ? parseWorkspace(JSON.parse(text)) : defaultWorkspace(); } catch { return defaultWorkspace(); } }
export function saveWorkspace(prefs: WorkspacePreferences) { try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(parseWorkspace(prefs))); } catch { /* preferences never block editing */ } }
