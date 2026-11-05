import { createStore } from 'zustand/vanilla';
import { CATALOG, type NodeType } from '../domain/catalog';
import { isSelectionNode, selectionMinimum } from '../domain/selection';
import { upgradeTextStyleEdit, constrainBounds, createNode, editNode, emptyProject, repairInvalidPanelBounds } from '../domain/model';
import { MAX_EDITABLE_DESIGN_SIZE } from '../domain/guiScale';
import { actionsOf, behaviorLeafActions, conditionLeaves, sourcesOf, PROJECT_SCHEMA_VERSIONS, parseProject, type Behavior, type BehaviorMap, type Bounds, type GuiNode, type GuiProject, type ScreenTabGroup, type ScreenTarget } from '../domain/schema';
import { PANEL_STYLE, NATIVE_PANEL_16, type PanelStyle } from '../domain/panel';
import { containerScrollOffset, isScrollableChildType, isScrollablePanelNode, type ContainerDrop, type ScrollOffsets } from '../domain/scrollablePanel';
import { allDescendants, containerDepth, containerLocalViewport, isContainerNode, nodeAbsoluteBounds as nodeContainerAbsoluteBounds } from '../domain/collapsiblePanel';
import { planDeletion } from '../domain/deletion';

type Snapshot = { doc: GuiProject; selected: string | null };
/** Session selection is separate from the authoritative document and history. */
export function screenById(doc: GuiProject, id: string) {
  const screen = doc.screens.find(item => item.id === id);
  if (!screen) throw new Error(`Screen 不存在：${id}`);
  return screen;
}
export function currentScreen(state: Pick<EditorState, 'doc' | 'currentScreenId'>) {
  return screenById(state.doc, state.currentScreenId);
}
type Gesture = { id: string; before: Bounds; draft: Bounds };
export type EditorState = Snapshot & {
  currentScreenId: string;
  blocked: string | null; operation: 'edit' | 'import' | 'restore' | 'delete';
  setBlocked: (reason: string | null) => void;
  restoreLocal: (doc: GuiProject) => void;
  repairPanelBounds: () => boolean;
  past: Snapshot[]; future: Snapshot[]; gesture: Gesture | null;
  switchScreen: (id: string) => void;
  addScreen: () => void;
  setEntryScreen: (id: string) => void;
  renameScreen: (id: string, name: string) => void;
  deleteScreen: (id: string, confirmed?: boolean) => void;
  select: (id: string | null) => void;
  add: (type: NodeType, position?: { x: number; y: number }, containerDrop?: ContainerDrop) => void;
  configureTab: (id: string, groupId: string | undefined, contentIds: string[], selected: boolean) => void;
  createScreenTabGroup: (nodeId: string) => string;
  configureCreativeTabNavigation: (nodeId: string, groupId: string, tabId: string) => void;
  saveScreenTabGroup: (group: ScreenTabGroup) => void;
  setRuntimePolicy: (enabled: boolean) => void;
  syncNavigationTabLayout: (id: string) => void;
  updateNode: (id: string, change: (node: GuiNode) => GuiNode) => void;
  setNodeContainer: (id: string, parentContainerId: string | undefined, scrollOffsets?: ScrollOffsets) => void;
  saveBehavior: (rule: Behavior) => void;
  deleteBehavior: (id: string) => void;
  saveBehaviorMap: (map: BehaviorMap) => void;
  deleteBehaviorMap: (id: string) => void;
  saveScreenTarget: (target: ScreenTarget) => void;
  deleteScreenTarget: (id: string) => void;
  renameProject: (name: string) => void;
  deleteSelected: (confirmed?: boolean) => void;
  resizeScreen: (width: number, height: number) => void;
  setPanel: (enabled: boolean, style?: PanelStyle) => void;
  setPanelBounds: (bounds: Bounds) => void;
  beginGesture: (id: string) => void;
  previewBounds: (bounds: Bounds) => void;
  commitGesture: (containerDrop?: ContainerDrop) => void;
  cancelGesture: () => void;
  importJson: (json: string) => void;
  undo: () => void; redo: () => void;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const snap = (s: EditorState): Snapshot => ({ doc: s.doc, selected: s.selected });
function transferToContainer(node: GuiNode, target: ContainerDrop, nodes: GuiNode[]) {
  const parent = nodes.find(item => item.id === target.parentContainerId);
  if (!parent || !isContainerNode(parent)) throw new Error('目标容器不存在');
  if (node.id === parent.id) throw new Error('不能将容器设为自身父级');
  if (isContainerNode(node) && node.type === parent.type) throw new Error('首版只支持 Scrollable Panel 与 Collapsible Panel 交叉嵌套');
  if (allDescendants(node.id, nodes).some(child => child.id === parent.id)) throw new Error('不能将容器放入自己的后代');
  if (!isContainerNode(node) && !isScrollableChildType(node.type)) throw new Error('此组件类型不能放入容器');
  const parentBounds = nodeContainerAbsoluteBounds(parent, nodes, target.scrollOffsets), viewport = containerLocalViewport(parent), scroll = isScrollablePanelNode(parent) ? containerScrollOffset(parent, target.scrollOffsets[parent.id] ?? 0) : 0;
  const absolute = nodeContainerAbsoluteBounds(node, nodes, target.scrollOffsets);
  const contentHeight = isScrollablePanelNode(parent) ? parent.props.contentHeight : Math.max(0, parent.bounds.h - parent.props.headerHeight);
  const appendY = target.appendAtEnd ? Math.max(0, ...nodes.filter(child => child.id !== node.id && child.parentContainerId === parent.id).map(child => child.bounds.y + child.bounds.h + 4)) : undefined;
  const local = { ...absolute, x: absolute.x - parentBounds.x - viewport.x, y: appendY ?? (absolute.y - parentBounds.y - viewport.y + scroll) };
  if (local.x < 0 || local.y < 0 || local.x + local.w > viewport.w || local.y + local.h > contentHeight) throw new Error('组件无法完整放入目标容器内容区；本次转移未修改');
  if (isContainerNode(node) && containerDepth(parent, nodes) >= 1) throw new Error('首版每个容器分支最多包含两个容器节点');
  node.bounds = local; node.parentContainerId = parent.id;
}
export function createEditorStore(initial = emptyProject()) {
  // All mutation paths pass the same domain validator, including supplied initial fixtures.
  const doc = parseProject(JSON.stringify(initial));
  return createStore<EditorState>((set, get) => {
    const commit = (next: GuiProject, selected: string | null, imported = false, deleting = false) => {
      const state = get();
      if (state.blocked) throw new Error(state.blocked);
      if (state.gesture || (!imported && same(next, state.doc))) return;
      if (!imported) upgradeTextStyleEdit(next);
      const valid = parseProject(JSON.stringify(next));
      if (!imported) valid.project.revision = state.doc.project.revision + 1;
      // Revalidate revision overflow too. Failed operations have no observable partial state.
      parseProject(JSON.stringify(valid));
      set({ doc: valid, currentScreenId: valid.screens.some(screen => screen.id === state.currentScreenId) ? state.currentScreenId : valid.screens[0].id, selected, past: [...state.past.slice(-99), snap(state)], future: [], gesture: null, operation: imported ? 'import' : deleting ? 'delete' : 'edit' });
    };
    return {
      doc, currentScreenId: doc.screens[0].id, selected: null, past: [], future: [], gesture: null, blocked: null, operation: 'edit',
      setBlocked: blocked => set({ blocked, ...(blocked ? { gesture: null } : {}) }),
      restoreLocal: restored => {
        const valid = parseProject(JSON.stringify(restored));
        set({ doc: valid, currentScreenId: valid.screens[0].id, selected: null, past: [], future: [], gesture: null, operation: 'restore' });
      },
      repairPanelBounds: () => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        const repaired = repairInvalidPanelBounds(s.doc); if (repaired === s.doc) return false;
        const valid = parseProject(JSON.stringify(repaired));
        const repairSnapshot = (snapshot: Snapshot): Snapshot => ({ ...snapshot, doc: repairInvalidPanelBounds(snapshot.doc) });
        set({ doc: valid, past: s.past.map(repairSnapshot), future: s.future.map(repairSnapshot), gesture: null, operation: 'restore' });
        return true;
      },
      addScreen: () => {
        const before = get(); if (before.blocked) throw new Error(before.blocked); if (before.gesture) throw new Error('请先完成当前拖动');
        before.repairPanelBounds();
        const s = get();
        if (s.doc.screens.length >= 100) throw new Error('最多 100 个 Screen');
        const next = structuredClone(s.doc), used = new Set([next.project.id, ...next.screens.flatMap(screen => [screen.id, ...screen.nodes.map(n => n.id), ...screen.behaviors.map(r => r.id), ...(screen.screenTargets ?? []).map(t => t.id)])]);
        let n = 1; while (used.has(`screen_${n}`)) n++;
        const screen = structuredClone(emptyProject().screens[0]); screen.id = `screen_${n}`; screen.title = { kind: 'literal', value: `Screen ${n}` }; next.screens.push(screen); if (!['0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.12.0';
        commit(next, null); set({ currentScreenId: screen.id, selected: null });
      },
      setEntryScreen: id => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        screenById(s.doc, id); const next = structuredClone(s.doc); next.schemaVersion = ['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion) ? next.schemaVersion : '0.13.0'; if (['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.screenTabGroups ??= []; next.entryScreenId = id; commit(next, s.selected);
      },
      renameScreen: (id, name) => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        const title = name.trim(); if (!title || title.length > 128) throw new Error('Screen 名称须为 1～128 个字符');
        const next = structuredClone(s.doc), screen = screenById(next, id); screen.title = screen.title.kind === 'translate' ? { ...screen.title, fallback: title } : { kind: 'literal', value: title }; commit(next, s.selected);
      },
      deleteScreen: (id, confirmed = false) => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        if (s.doc.screens.length <= 1) throw new Error('必须保留至少一个 Screen');
        if (!confirmed && s.doc.entryScreenId === id) throw new Error('请先选择替代入口 Screen，再删除当前入口');
        screenById(s.doc, id);
        if (!confirmed && s.doc.screens.some(screen => screen.screenTargets?.some(target => target.boundScreenId === id))) throw new Error('Screen 仍被导航目标绑定，请先解除绑定');
        if (!confirmed && s.doc.screenTabGroups?.some(group => group.tabs.some(tab => tab.targetScreenId === id))) throw new Error('Screen 仍是 CreativeTab 导航目标，请先更改导航组目标');
        const next = planDeletion(s.doc, { kind: 'screen', screenId: id }).document;
        const selected = id !== s.currentScreenId && next.screens.find(screen => screen.id === s.currentScreenId)?.nodes.some(node => node.id === s.selected) ? s.selected : null;
        commit(next, selected, false, true);
        if (id === s.currentScreenId) set({ currentScreenId: next.screens[next.screens.length - 1].id, selected: null });
      },
      switchScreen: id => { const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动'); screenById(s.doc, id); if (id !== s.currentScreenId) set({ currentScreenId: id, selected: null }); },
      select: selected => { if (!get().gesture && (selected === null || currentScreen(get()).nodes.some(n => n.id === selected))) set({ selected }); },
      add: (type, position, containerDrop) => {
        const s = get();
        if (s.blocked || s.gesture || currentScreen(s).nodes.length >= 1000) return;
        const next = structuredClone(s.doc);
        if ((type === 'minecraft:checkbox' || type === 'minecraft:cycle-button') && !['0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.4.0';
        if (type === 'minecraft:creative-tab' && !['0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.10.0';
        const ids = new Set([next.project.id, ...next.screens.flatMap(screen => [screen.id, ...screen.nodes.map(n => n.id), ...screen.behaviors.map(r => r.id), ...(screen.screenTargets ?? []).map(t => t.id)]), ...(next.screenTabGroups ?? []).flatMap(group => [group.id, ...group.tabs.map(tab => tab.id)])]);
        let index = screenById(next, get().currentScreenId).nodes.length + 1;
        while (ids.has(`node_${index}`)) index++;
        const node = createNode(type, `node_${index}`, position ?? { x: 16 + (index - 1) % 6 * 16, y: 16 + (index - 1) % 6 * 20 });
        let selectedAfterAdd = node.id;
        if (type === 'minecraft:radio-group' || type === 'minecraft:dropdown') { if (!['0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.18.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; }
        if (type === 'minecraft:numeric-input' || type === 'minecraft:slider') { if (!['0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.16.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; }
        if (type === 'minecraft:progress-bar' && !['0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) { next.schemaVersion = '0.19.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; }
        if (type === 'minecraft:status-indicator') { if (!['0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.21.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; }
        if (type === 'minecraft:image') { if (!['0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.22.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; }
        if (type === 'minecraft:fitting-multi-line-text-widget') { if (!['0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.24.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; }
        if (type === 'minecraft:scrollable-panel') { if (!['0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.26.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; }
        if (type === 'minecraft:collapsible-panel') { if (!['0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.27.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; }
        if (type === 'minecraft:tree-view') { if (!['0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.28.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; }
        // Tiny imported screens must not create invalid nodes.
        if (screenById(next, get().currentScreenId).designSize.width < CATALOG[type].min.w || screenById(next, get().currentScreenId).designSize.height < CATALOG[type].min.h) {
          if (type === 'minecraft:scrollable-panel') throw new Error('Scrollable Panel 至少需要 40×32 GUI px 的设计区');
          if (type === 'minecraft:collapsible-panel') throw new Error('Collapsible Panel 至少需要 40×24 GUI px 的设计区');
          if (type === 'minecraft:tree-view') throw new Error('Tree View 至少需要 60×40 GUI px 的设计区');
          return;
        }
        if (isSelectionNode(node)) { const min = selectionMinimum(node), size = currentScreen(s).designSize; if (size.width < min.w || size.height < min.h) return; }
        node.bounds = constrainBounds(node.bounds, type, screenById(next, get().currentScreenId).designSize);
        if (node.type === 'minecraft:multi-line-text-widget') {
          node.props.maxWidth = node.bounds.w; node.props.maxRows = node.bounds.h / 9;
          if (!['0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.15.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id;
        }
        if (containerDrop) {
          const nodes = screenById(next, get().currentScreenId).nodes;
          const parent = nodes.find(item => item.id === containerDrop.parentContainerId);
          if (!parent || !isContainerNode(parent)) throw new Error('目标容器不存在');
          if (!isContainerNode(node) && !isScrollableChildType(node.type)) throw new Error('此组件类型不能放入容器');
          if (isContainerNode(node) && node.type === parent.type) throw new Error('首版只允许 Scrollable Panel 与 Collapsible Panel 交叉嵌套');
          const viewport = containerLocalViewport(parent), contentHeight = isScrollablePanelNode(parent) ? parent.props.contentHeight : parent.bounds.h - parent.props.headerHeight;
          if (node.bounds.w > viewport.w || node.bounds.h > contentHeight) throw new Error('组件尺寸超出容器内容区，无法放入');
          const dropX = position?.x ?? node.bounds.x, dropY = position?.y ?? node.bounds.y;
          const parentBounds = nodeContainerAbsoluteBounds(parent, nodes, containerDrop.scrollOffsets), offset = isScrollablePanelNode(parent) ? containerScrollOffset(parent, containerDrop.scrollOffsets[parent.id] ?? 0) : 0;
          const appendY = containerDrop.appendAtEnd ? Math.max(0, ...nodes.filter(child => child.parentContainerId === parent.id).map(child => child.bounds.y + child.bounds.h + 4)) : undefined;
          node.bounds = { ...node.bounds,
            x: Math.max(0, Math.min(viewport.w - node.bounds.w, Math.round(dropX - node.bounds.w / 2 - parentBounds.x - viewport.x))),
            y: appendY ?? Math.max(0, Math.min(contentHeight - node.bounds.h, Math.round(dropY - node.bounds.h / 2 - parentBounds.y - viewport.y + offset))) };
          if (node.bounds.y + node.bounds.h > contentHeight) throw new Error('折叠面板内容区空间不足；请展开面板并调整尺寸后再添加');
          node.parentContainerId = parent.id;
          if (containerDrop.appendAtEnd) selectedAfterAdd = parent.id;
        }
        screenById(next, get().currentScreenId).nodes.push(node);
        commit(next, selectedAfterAdd);
      },
      configureTab: (id, groupId, contentIds, selected) => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成拖动');
        const next = structuredClone(s.doc), nodes = screenById(next, get().currentScreenId).nodes, tab = nodes.find(n => n.id === id);
        if (!tab || tab.type !== 'minecraft:creative-tab') throw new Error('标签不存在');
        const previous = tab.props.groupId;
        delete tab.props.tabMode; delete tab.props.navigationGroupId; delete tab.props.navigationTabId;
        if (groupId) { tab.props.groupId = groupId; tab.props.contentIds = contentIds; }
        else { delete tab.props.groupId; delete tab.props.contentIds; }
        const peers = nodes.filter(n => n.type === 'minecraft:creative-tab' && n.id !== id && n.props.groupId === groupId);
        tab.props.selected = groupId && !peers.some(n => n.type === 'minecraft:creative-tab' && n.props.selected) ? true : selected;
        if (groupId && tab.props.selected) for (const n of peers) if (n.type === 'minecraft:creative-tab') n.props.selected = false;
        if (previous && previous !== groupId) { const remaining = nodes.filter(n => n.type === 'minecraft:creative-tab' && n.props.groupId === previous); if (remaining.length && !remaining.some(n => n.type === 'minecraft:creative-tab' && n.props.selected)) { const first = remaining[0]; if (first.type === 'minecraft:creative-tab') first.props.selected = true; } }
        if (!['0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.11.0'; commit(next, id);
      },
      createScreenTabGroup: nodeId => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        const next = structuredClone(s.doc), screen = screenById(next, s.currentScreenId), node = screen.nodes.find(item => item.id === nodeId);
        if (!node || node.type !== 'minecraft:creative-tab') throw new Error('CreativeTab 不存在');
        const used = new Set([next.project.id, ...next.screens.flatMap(item => [item.id, ...item.nodes.map(n => n.id), ...item.behaviors.map(r => r.id), ...(item.screenTargets ?? []).map(t => t.id)]), ...(next.screenTabGroups ?? []).flatMap(group => [group.id, ...group.tabs.map(tab => tab.id)])]);
        let groupIndex = 1; while (used.has(`tabgroup_${groupIndex}`)) groupIndex++;
        let tabIndex = 1; while (used.has(`navtab_${tabIndex}`)) tabIndex++;
        const groupId = `tabgroup_${groupIndex}`, tabId = `navtab_${tabIndex}`;
        if (!['0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.14.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id;
        next.screenTabGroups.push({ id: groupId, name: 'Screen 标签组', tabs: [{ id: tabId, name: node.props.name || '标签', targetScreenId: screen.id }] });
        if (node.props.groupId && node.props.selected) { const successor = screen.nodes.find(item => item.type === 'minecraft:creative-tab' && item.id !== nodeId && item.props.groupId === node.props.groupId); if (successor?.type === 'minecraft:creative-tab') successor.props.selected = true; }
        delete node.props.groupId; delete node.props.contentIds;
        node.props.tabMode = 'screen-navigation'; node.props.navigationGroupId = groupId; node.props.navigationTabId = tabId; node.props.selected = false;
        commit(next, nodeId); return groupId;
      },
      configureCreativeTabNavigation: (nodeId, groupId, tabId) => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        const next = structuredClone(s.doc), screen = screenById(next, s.currentScreenId), node = screen.nodes.find(item => item.id === nodeId);
        if (!node || node.type !== 'minecraft:creative-tab') throw new Error('CreativeTab 不存在');
        if (!next.screenTabGroups?.some(group => group.id === groupId && group.tabs.some(tab => tab.id === tabId))) throw new Error('请选择有效的项目级 Screen 标签');
        if (node.props.groupId && node.props.selected) { const successor = screen.nodes.find(item => item.type === 'minecraft:creative-tab' && item.id !== nodeId && item.props.groupId === node.props.groupId); if (successor?.type === 'minecraft:creative-tab') successor.props.selected = true; }
        delete node.props.groupId; delete node.props.contentIds;
        node.props.tabMode = 'screen-navigation'; node.props.navigationGroupId = groupId; node.props.navigationTabId = tabId; node.props.selected = false;
        if (!['0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.14.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; commit(next, nodeId);
      },
      saveScreenTabGroup: group => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        const next = structuredClone(s.doc); if (!['0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.14.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id;
        const index = next.screenTabGroups.findIndex(item => item.id === group.id); if (index < 0) next.screenTabGroups.push(group); else next.screenTabGroups[index] = group;
        commit(next, s.selected);
      },
      setRuntimePolicy: enabled => {
        const s = get(); const next = structuredClone(s.doc);
        if (enabled) next.runtimePolicy = { escapeAction: 'close', nativeBackground: 'default' }; else delete next.runtimePolicy;
        commit(next, s.selected);
      },
      syncNavigationTabLayout: id => {
        const s = get(), source = currentScreen(s).nodes.find(n => n.id === id);
        if (source?.type !== 'minecraft:creative-tab' || source.props.tabMode !== 'screen-navigation') throw new Error('请选择 Screen 导航标签');
        const next = structuredClone(s.doc);
        for (const screen of next.screens) for (const node of screen.nodes) if (node.type === 'minecraft:creative-tab' && node.props.tabMode === 'screen-navigation' && node.props.navigationGroupId === source.props.navigationGroupId && node.props.navigationTabId === source.props.navigationTabId) {
          node.bounds = { ...source.bounds }; node.props.column = source.props.column;
        }
        commit(next, s.selected);
      },
      updateNode: (id, change) => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) return;
        const next = structuredClone(s.doc);
        screenById(next, get().currentScreenId).nodes = screenById(next, get().currentScreenId).nodes.map(n => n.id === id ? editNode(n, change) : n);
        if (screenById(next, get().currentScreenId).nodes.some(n => n.type === 'minecraft:status-indicator' && n.props.statuses.some(status => status.text?.kind === 'translate'))) { if (!['0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.22.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; }
        if (screenById(next, get().currentScreenId).nodes.some(n => n.type === 'minecraft:fitting-multi-line-text-widget') && !['0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.23.0';
        if (screenById(next, get().currentScreenId).nodes.some(n => n.type === 'minecraft:fitting-multi-line-text-widget' && n.props.textShadow !== undefined) && !['0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.24.0';
        if (!['0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion) && screenById(next, get().currentScreenId).nodes.some(n => n.type !== 'minecraft:fill' && n.type !== 'minecraft:image' && n.type !== 'minecraft:creative-tab' && n.type !== 'minecraft:fitting-multi-line-text-widget' && n.type !== 'minecraft:scrollable-panel' && 'textShadow' in n.props && n.props.textShadow !== undefined)) next.schemaVersion = '0.5.0';
        commit(next, s.selected);
      },
      setNodeContainer: (id, parentContainerId, scrollOffsets = {}) => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        const next = structuredClone(s.doc), nodes = screenById(next, s.currentScreenId).nodes;
        const node = nodes.find(item => item.id === id); if (!node) throw new Error('组件不存在');
        if (node.type === 'minecraft:scrollable-panel' && parentContainerId !== undefined && nodes.find(item => item.id === parentContainerId)?.type === node.type) throw new Error('首版不支持同类型容器嵌套');
        if (parentContainerId !== undefined) {
          transferToContainer(node, { parentContainerId, scrollOffsets }, nodes);
        } else if (node.parentContainerId) {
          node.bounds = nodeContainerAbsoluteBounds(node, nodes, scrollOffsets); delete node.parentContainerId;
        }
        const parent = parentContainerId ? nodes.find(item => item.id === parentContainerId) : undefined;
        const needs027 = node.type === 'minecraft:collapsible-panel' || parent?.type === 'minecraft:collapsible-panel';
        if (needs027) { if (!['0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.27.0'; }
        else if (!['0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.26.0';
        next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id;
        commit(next, s.selected);
      },
      saveBehavior: rule => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成拖动');
        const next = structuredClone(s.doc), rules = screenById(next, get().currentScreenId).behaviors, index = rules.findIndex(r => r.id === rule.id);
        if (index < 0) rules.push(rule); else rules[index] = rule;
        if (rule.event.type === 'slider-change' || actionsOf(rule).some(action => action.type === 'set-progress-value') || rule.event.type === 'selection-change' || actionsOf(rule).some(action => action.type === 'set-status' || action.type === 'if')) {
          const leaves = actionsOf(rule).flatMap(behaviorLeafActions);
          const usesCondition = actionsOf(rule).some(action => action.type === 'if');
          const usesSharedMap = leaves.some(action => action.type === 'set-status' && 'mapRef' in action);
          const usesConstant = leaves.some(action => action.type === 'set-status' && 'statusId' in action);
          const usesTypedCondition = actionsOf(rule).some(action => action.type === 'if' && action.condition.type === 'compare');
          const usesBoolean = actionsOf(rule).some(action => action.type === 'if' && ['and', 'or', 'not'].includes(action.condition.type));
          const usesRead = actionsOf(rule).some(action => action.type === 'if' && conditionLeaves(action.condition).some(c => c.type === 'compare' && [c.left,c.right].some(v => v.type === 'read-control-value'))) || (rule.event.type === 'slider-change' && leaves.some(a => a.type === 'set-status'));
          const minimum = rule.eventBindings ? '0.38.0' : usesRead ? '0.37.0' : usesBoolean ? '0.36.0' : usesTypedCondition ? '0.35.0' : usesConstant ? '0.34.0' : usesCondition ? '0.33.0' : usesSharedMap ? '0.32.0' : rule.event.type === 'selection-change' && rule.event.additionalSourceIds ? '0.31.0' : rule.event.type === 'selection-change' ? '0.30.0' : '0.29.0';
          if (PROJECT_SCHEMA_VERSIONS.indexOf(next.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf(minimum)) next.schemaVersion = minimum;
          next.screenTabGroups ??= [];
          next.entryScreenId ??= next.screens[0].id;
        }
        else {
          next.schemaVersion = ['0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion) ? next.schemaVersion : next.schemaVersion === '0.12.0' ? '0.12.0' : next.schemaVersion === '0.11.0' ? '0.11.0' : next.schemaVersion === '0.10.0' ? '0.10.0' : next.schemaVersion === '0.9.0' ? '0.9.0' : next.schemaVersion === '0.8.0' || 'actions' in rule ? '0.8.0' : next.schemaVersion === '0.7.0' || rule.event.type === 'rectangle-click' || actionsOf(rule).some(a => a.type === 'open_screen') ? '0.7.0' : '0.6.0';
          if (['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.screenTabGroups ??= [];
        }
        commit(next, s.selected);
      },
      saveBehaviorMap: map => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成拖动');
        const next = structuredClone(s.doc), screen = screenById(next, s.currentScreenId); screen.behaviorMaps ??= [];
        const index = screen.behaviorMaps.findIndex(item => item.id === map.id);
        if (index < 0) screen.behaviorMaps.push(map); else screen.behaviorMaps[index] = map;
        if (PROJECT_SCHEMA_VERSIONS.indexOf(next.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.32.0')) next.schemaVersion = '0.32.0';
        next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; commit(next, s.selected);
      },
      deleteBehaviorMap: id => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成拖动');
        const screen = screenById(s.doc, s.currentScreenId);
        if (screen.behaviors.some(rule => actionsOf(rule).flatMap(behaviorLeafActions).some(action => action.type === 'set-status' && 'mapRef' in action && action.mapRef === id))) throw new Error('共享映射仍被行为动作引用；请先解除所有引用');
        const next = structuredClone(s.doc), current = screenById(next, s.currentScreenId); current.behaviorMaps = (current.behaviorMaps ?? []).filter(map => map.id !== id); commit(next, s.selected);
      },
      deleteBehavior: id => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); const next = structuredClone(s.doc);
        screenById(next, get().currentScreenId).behaviors = screenById(next, get().currentScreenId).behaviors.filter(r => r.id !== id); commit(next, s.selected);
      },
      saveScreenTarget: target => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成拖动');
        const next = structuredClone(s.doc), screen = screenById(next, get().currentScreenId); screen.screenTargets ??= [];
        const index = screen.screenTargets.findIndex(t => t.id === target.id);
        if (index < 0) screen.screenTargets.push(target); else screen.screenTargets[index] = target;
        if (!['0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.7.0'; commit(next, s.selected);
      },
      deleteScreenTarget: id => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成拖动');
        if (currentScreen(s).behaviors.some(r => actionsOf(r).some(a => a.type === 'open_screen' && a.targetScreenId === id))) throw new Error('目标仍被规则引用，请先修改或删除规则');
        const next = structuredClone(s.doc); screenById(next, get().currentScreenId).screenTargets = (screenById(next, get().currentScreenId).screenTargets ?? []).filter(t => t.id !== id); commit(next, s.selected);
      },
      renameProject: name => { const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        if (!name.trim()) throw new Error('项目名称不能为空'); const next = structuredClone(s.doc); next.project.name = name.trim(); commit(next, s.selected); },
      deleteSelected: (confirmed = false) => {
        const s = get(); if (s.blocked || !s.selected || s.gesture) return;
        if (currentScreen(s).nodes.some(n => n.parentContainerId === s.selected)) throw new Error('容器仍包含子节点，请先将子节点移出容器');
        if (!confirmed && currentScreen(s).nodes.some(n => n.type === 'minecraft:creative-tab' && n.props.contentIds?.includes(s.selected!))) throw new Error('组件仍被标签内容引用，请先解除关联');
        if (!confirmed && currentScreen(s).behaviors.some(r => sourcesOf(r).includes(s.selected!) || actionsOf(r).flatMap(behaviorLeafActions).some(a => a.type !== 'open_screen' && a.type !== 'if' && a.targetId === s.selected))) throw new Error('组件仍被行为规则引用，请先修改或删除相关规则');
        const next = planDeletion(s.doc, { kind: 'node', screenId: s.currentScreenId, nodeId: s.selected }).document;
        commit(next, null, false, true);
      },
      resizeScreen: (width, height) => {
        const s = get();
        if (s.blocked) throw new Error(s.blocked);
        if (s.gesture) throw new Error('请先完成当前拖动');
        if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= MAX_EDITABLE_DESIGN_SIZE)) {
          throw new Error(`设计区宽高必须为1～${MAX_EDITABLE_DESIGN_SIZE}的整数（编辑器操作上限）`);
        }
        if (currentScreen(s).nodes.some(n => n.parentContainerId === undefined && (n.bounds.x + n.bounds.w > width || n.bounds.y + n.bounds.h > height))) {
          throw new Error('缩小后有组件超出设计区，请先移动或调整组件；本次未修改画布');
        }
        const next = structuredClone(s.doc);
        screenById(next, get().currentScreenId).designSize = { width, height, unit: 'gui-px' };
        commit(next, s.selected);
      },
      setPanel: (enabled, style = NATIVE_PANEL_16) => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        const next = structuredClone(s.doc);
        const previousBackground = screenById(next, s.currentScreenId).background;
        if (enabled) { if (style !== PANEL_STYLE && !['0.4.0', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.3.0'; else if (next.schemaVersion === '0.1.0') next.schemaVersion = '0.2.0'; screenById(next, get().currentScreenId).background = { kind: 'panel', style, ...(previousBackground.kind === 'panel' && previousBackground.bounds ? { bounds: previousBackground.bounds } : {}) }; }
        else screenById(next, get().currentScreenId).background = { kind: 'none' };
        commit(next, s.selected);
      },
      setPanelBounds: bounds => {
        const state = get(); if (state.blocked) throw new Error(state.blocked); if (state.gesture) throw new Error('请先完成当前拖动');
        const next = structuredClone(state.doc), background = screenById(next, get().currentScreenId).background;
        if (background.kind !== 'panel') throw new Error('请先启用 Panel');
        background.bounds = bounds; if (!['0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(next.schemaVersion)) next.schemaVersion = '0.9.0'; commit(next, state.selected);
      },
      beginGesture: id => {
        const s = get(), node = currentScreen(s).nodes.find(n => n.id === id);
        if (node && !s.blocked && !s.gesture) set({ selected: id, gesture: { id, before: { ...node.bounds }, draft: { ...node.bounds } } });
      },
      previewBounds: bounds => {
        const s = get(), g = s.gesture;
        if (s.blocked || !g || !Object.values(bounds).every(Number.isFinite)) return;
        const node = currentScreen(s).nodes.find(n => n.id === g.id)!;
        const parent = node.parentContainerId ? currentScreen(s).nodes.find(n => n.id === node.parentContainerId) : undefined;
        const parentSize = parent && isContainerNode(parent) ? { width: containerLocalViewport(parent).w, height: isScrollablePanelNode(parent) ? parent.props.contentHeight : parent.bounds.h - parent.props.headerHeight } : currentScreen(s).designSize;
        const draft = constrainBounds(bounds, node.type, parentSize);
        if (isScrollablePanelNode(node)) {
          const children = currentScreen(s).nodes.filter(child => child.parentContainerId === node.id);
          const requiredWidth = Math.max(CATALOG[node.type].min.w, ...children.map(child => child.bounds.x + child.bounds.w + node.props.padding * 2 + 8));
          if (draft.w < requiredWidth) { draft.w = requiredWidth; draft.x = Math.min(draft.x, currentScreen(s).designSize.width - draft.w); }
        }
        if (node.type === 'minecraft:collapsible-panel') {
          const children = currentScreen(s).nodes.filter(child => child.parentContainerId === node.id);
          const requiredWidth = Math.max(CATALOG[node.type].min.w, ...children.map(child => child.bounds.x + child.bounds.w));
          const requiredHeight = Math.max(CATALOG[node.type].min.h, node.props.headerHeight + 1, ...children.map(child => node.props.headerHeight + child.bounds.y + child.bounds.h));
          if (draft.w < requiredWidth) draft.w = requiredWidth;
          if (draft.h < requiredHeight) draft.h = requiredHeight;
          if (bounds.x !== g.before.x && bounds.w !== g.before.w) draft.x = Math.max(0, Math.round(bounds.x + bounds.w - draft.w));
          if (bounds.y !== g.before.y && bounds.h !== g.before.h) draft.y = Math.max(0, Math.round(bounds.y + bounds.h - draft.h));
          draft.x = Math.min(draft.x, parentSize.width - draft.w);
          draft.y = Math.min(draft.y, parentSize.height - draft.h);
        }
        if (isSelectionNode(node)) {
          const min = selectionMinimum(node); draft.w = Math.max(min.w, draft.w); draft.h = Math.max(min.h, draft.h);
          if (bounds.x !== g.before.x && bounds.w !== g.before.w) draft.x = Math.max(0, Math.round(bounds.x + bounds.w - draft.w));
          if (bounds.y !== g.before.y && bounds.h !== g.before.h) draft.y = Math.max(0, Math.round(bounds.y + bounds.h - draft.h));
          const size = parentSize;
          draft.x = Math.min(draft.x, size.width - draft.w); draft.y = Math.min(draft.y, size.height - draft.h);
        }
        if (node.type === 'minecraft:multi-line-text-widget' && bounds.y !== g.before.y && bounds.h !== g.before.h) draft.y = Math.max(0, Math.round(bounds.y + bounds.h - draft.h));
        set({ gesture: { ...g, draft } });
      },
      commitGesture: containerDrop => {
        const s = get(), g = s.gesture;
        if (!g) return;
        if (!containerDrop) {
          set({ gesture: null });
          if (!same(g.before, g.draft)) get().updateNode(g.id, n => ({ ...n, bounds: g.draft }));
          return;
        }
        if (same(g.before, g.draft)) { set({ gesture: null }); return; }
        try {
          const next = structuredClone(s.doc), screen = screenById(next, s.currentScreenId);
          screen.nodes = screen.nodes.map(n => n.id === g.id ? editNode(n, current => ({ ...current, bounds: g.draft })) : n);
          const node = screen.nodes.find(n => n.id === g.id);
          if (containerDrop && node) transferToContainer(node, containerDrop, screen.nodes);
          parseProject(JSON.stringify(next));
          set({ gesture: null }); commit(next, containerDrop?.appendAtEnd ? containerDrop.parentContainerId : g.id);
        } catch (error) { set({ gesture: null }); throw error; }
      },
      cancelGesture: () => { if (get().gesture) set({ gesture: null }); },
      importJson: json => {
        // Parse completely before touching selection, gesture or history.
        const next = parseProject(json);
        if (get().gesture) throw new Error('请先完成或取消当前操作');
        commit(next, null, true);
      },
      undo: () => {
        const s = get(); if (s.blocked) return; if (s.gesture) { s.cancelGesture(); return; }
        const previous = s.past.at(-1); if (!previous) return;
        const screenId = previous.doc.screens.some(screen => screen.id === s.currentScreenId) ? s.currentScreenId : previous.doc.screens[0].id;
        const selected = screenById(previous.doc, screenId).nodes.some(node => node.id === previous.selected) ? previous.selected : null;
        set({ ...previous, currentScreenId: screenId, selected, past: s.past.slice(0, -1), future: [...s.future, snap(s)], operation: 'edit' });
      },
      redo: () => {
        const s = get(); if (s.blocked || s.gesture) return;
        const next = s.future.at(-1); if (!next) return;
        const screenId = next.doc.screens.some(screen => screen.id === s.currentScreenId) ? s.currentScreenId : next.doc.screens[0].id;
        const selected = screenById(next.doc, screenId).nodes.some(node => node.id === next.selected) ? next.selected : null;
        set({ ...next, currentScreenId: screenId, selected, future: s.future.slice(0, -1), past: [...s.past, snap(s)], operation: 'edit' });
      },
    };
  });
}
export const editorStore = createEditorStore();
