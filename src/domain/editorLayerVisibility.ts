import type { GuiNode, GuiProject, GuiScreen } from './schema';
import { tabVisibility } from './tabGroups';
import { activePageIds } from './sameScreenPages';

export type OtherPageMode = 'current' | 'outline' | 'all';
export type EditorLayerView = { hiddenIds: string[]; soloId: string | null; otherPages: OtherPageMode; hideOtherPageNodes?: boolean; lockedIds: string[] };
export const DEFAULT_EDITOR_LAYER_VIEW: EditorLayerView = { hiddenIds: [], soloId: null, otherPages: 'current', hideOtherPageNodes: false, lockedIds: [] };
export type EditorLayerEntry = { screenId: string; pages: Record<string, string>; view: EditorLayerView };
export type EditorLayerViews = Record<string, EditorLayerEntry>;

export function editorPageSelection(nodes: GuiNode[], selections: Record<string, string>) {
  const groups = new Set(nodes.filter(node => node.type === 'minecraft:creative-tab' && node.props.groupId && selections[node.props.groupId] === node.id).map(node => node.type === 'minecraft:creative-tab' ? node.props.groupId! : ''));
  return Object.fromEntries(nodes.flatMap(node => node.type === 'minecraft:creative-tab' && node.props.groupId && groups.has(node.props.groupId)
    ? [[node.id, { tabSelected: selections[node.props.groupId] === node.id }]] : []));
}

export function editorLayerContext(screen: GuiScreen, selections: Record<string, string>) {
  const pages = activePageIds(screen.nodes, editorPageSelection(screen.nodes, selections));
  const sorted = Object.fromEntries(Object.entries(pages).sort(([a], [b]) => a.localeCompare(b)));
  return { key: JSON.stringify([screen.id, sorted]), screenId: screen.id, pages: sorted };
}

export function pruneEditorLayerViews(views: EditorLayerViews, doc: GuiProject): EditorLayerViews {
  const next: EditorLayerViews = {};
  let changed = false;
  for (const [key, entry] of Object.entries(views)) {
    const screen = doc.screens.find(item => item.id === entry.screenId);
    if (!screen || Object.entries(entry.pages).some(([group, id]) => !screen.nodes.some(node => node.id === id && node.type === 'minecraft:creative-tab' && node.props.groupId === group))) { changed = true; continue; }
    const ids = new Set(screen.nodes.map(node => node.id));
    const hiddenIds = entry.view.hiddenIds.filter(id => ids.has(id));
    const lockedIds = (entry.view.lockedIds ?? []).filter(id => ids.has(id));
    const soloId = entry.view.soloId && ids.has(entry.view.soloId) ? entry.view.soloId : null;
    if (hiddenIds.length !== entry.view.hiddenIds.length || lockedIds.length !== (entry.view.lockedIds ?? []).length || soloId !== entry.view.soloId) {
      changed = true; next[key] = { ...entry, view: { ...entry.view, hiddenIds, lockedIds, soloId } };
    } else next[key] = entry;
  }
  return changed ? next : views;
}

export type EditorNodeDisplay = { paint: 'content' | 'outline' | 'none'; hit: boolean; reason: 'shown' | 'hidden' | 'solo' | 'page' | 'locked' };

/** View-only masks. Document initial visibility is deliberately not an editor hit-test gate. */
export function editorLayerVisibility(screen: GuiScreen, selections: Record<string, string>, view: EditorLayerView) {
  const nodes = screen.nodes, byId = new Map(nodes.map(node => [node.id, node]));
  const active = tabVisibility(nodes, editorPageSelection(nodes, selections));
  const ancestry = (node: GuiNode) => {
    const result: GuiNode[] = [], seen = new Set<string>();
    let current: GuiNode | undefined = node;
    while (current && !seen.has(current.id)) { result.push(current); seen.add(current.id); current = current.parentContainerId ? byId.get(current.parentContainerId) : undefined; }
    return result;
  };
  const pageActive = (node: GuiNode) => ancestry(node).every(item => active(item.id));
  const scope = (node: GuiNode) => {
    const path = new Set(ancestry(node).map(item => item.id));
    const groups = new Set(nodes.flatMap(item => item.type === 'minecraft:creative-tab' && item.props.groupId && item.props.contentIds?.some(id => path.has(id)) ? [item.props.groupId] : []));
    return [...groups].sort().join('|');
  };
  const solo = view.soloId ? byId.get(view.soloId) : undefined;
  const retained = new Set(solo ? ancestry(solo).map(node => node.id) : []);
  const excluded = new Set<string>();
  if (solo && pageActive(solo)) {
    const soloScope = scope(solo);
    for (const node of nodes) {
      if (node.id === solo.id || !pageActive(node) || node.parentContainerId !== solo.parentContainerId || scope(node) !== soloScope) continue;
      // Root Persistent peers outside the target footprint remain layout references.
      if (!solo.parentContainerId && !soloScope && (node.bounds.x >= solo.bounds.x + solo.bounds.w || solo.bounds.x >= node.bounds.x + node.bounds.w || node.bounds.y >= solo.bounds.y + solo.bounds.h || solo.bounds.y >= node.bounds.y + node.bounds.h)) continue;
      excluded.add(node.id);
    }
  }
  const hidden = new Set(view.hiddenIds), locked = new Set(view.lockedIds ?? []);
  const display = (node: GuiNode): EditorNodeDisplay => {
    const path = ancestry(node);
    if (path.some(item => hidden.has(item.id) && !retained.has(item.id))) return { paint: 'none', hit: false, reason: 'hidden' };
    if (path.some(item => excluded.has(item.id))) return { paint: 'none', hit: false, reason: 'solo' };
    if (!pageActive(node)) return { paint: view.otherPages === 'current' ? 'none' : view.otherPages === 'outline' ? 'outline' : 'content', hit: false, reason: 'page' };
    if (path.some(item => locked.has(item.id))) return { paint: 'content', hit: false, reason: 'locked' };
    return { paint: 'content', hit: true, reason: 'shown' };
  };
  return { display, pageActive, canHit: (id: string) => { const node = byId.get(id); return !!node && display(node).hit; } };
}
