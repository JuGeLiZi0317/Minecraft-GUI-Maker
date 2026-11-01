import { createStore } from 'zustand/vanilla';
import { CATALOG, type NodeType } from '../domain/catalog';
import { isSelectionNode, selectionMinimum } from '../domain/selection';
import { upgradeTextStyleEdit, constrainBounds, createNode, editNode, emptyProject } from '../domain/model';
import { MAX_EDITABLE_DESIGN_SIZE } from '../domain/guiScale';
import { actionsOf, parseProject, type Behavior, type Bounds, type GuiNode, type GuiProject, type ScreenTabGroup, type ScreenTarget } from '../domain/schema';
import { PANEL_STYLE, NATIVE_PANEL_16, type PanelStyle } from '../domain/panel';

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
  blocked: string | null; operation: 'edit' | 'import' | 'restore';
  setBlocked: (reason: string | null) => void;
  restoreLocal: (doc: GuiProject) => void;
  past: Snapshot[]; future: Snapshot[]; gesture: Gesture | null;
  switchScreen: (id: string) => void;
  addScreen: () => void;
  setEntryScreen: (id: string) => void;
  renameScreen: (id: string, name: string) => void;
  deleteScreen: (id: string) => void;
  select: (id: string | null) => void;
  add: (type: NodeType, position?: { x: number; y: number }) => void;
  configureTab: (id: string, groupId: string | undefined, contentIds: string[], selected: boolean) => void;
  createScreenTabGroup: (nodeId: string) => string;
  configureCreativeTabNavigation: (nodeId: string, groupId: string, tabId: string) => void;
  saveScreenTabGroup: (group: ScreenTabGroup) => void;
  setRuntimePolicy: (enabled: boolean) => void;
  syncNavigationTabLayout: (id: string) => void;
  updateNode: (id: string, change: (node: GuiNode) => GuiNode) => void;
  saveBehavior: (rule: Behavior) => void;
  deleteBehavior: (id: string) => void;
  saveScreenTarget: (target: ScreenTarget) => void;
  deleteScreenTarget: (id: string) => void;
  renameProject: (name: string) => void;
  deleteSelected: () => void;
  resizeScreen: (width: number, height: number) => void;
  setPanel: (enabled: boolean, style?: PanelStyle) => void;
  setPanelBounds: (bounds: Bounds) => void;
  beginGesture: (id: string) => void;
  previewBounds: (bounds: Bounds) => void;
  commitGesture: () => void;
  cancelGesture: () => void;
  importJson: (json: string) => void;
  undo: () => void; redo: () => void;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const snap = (s: EditorState): Snapshot => ({ doc: s.doc, selected: s.selected });
export function createEditorStore(initial = emptyProject()) {
  // All mutation paths pass the same domain validator, including supplied initial fixtures.
  const doc = parseProject(JSON.stringify(initial));
  return createStore<EditorState>((set, get) => {
    const commit = (next: GuiProject, selected: string | null, imported = false) => {
      const state = get();
      if (state.blocked) throw new Error(state.blocked);
      if (state.gesture || (!imported && same(next, state.doc))) return;
      if (!imported) upgradeTextStyleEdit(next);
      const valid = parseProject(JSON.stringify(next));
      if (!imported) valid.project.revision = state.doc.project.revision + 1;
      // Revalidate revision overflow too. Failed operations have no observable partial state.
      parseProject(JSON.stringify(valid));
      set({ doc: valid, currentScreenId: valid.screens.some(screen => screen.id === state.currentScreenId) ? state.currentScreenId : valid.screens[0].id, selected, past: [...state.past.slice(-99), snap(state)], future: [], gesture: null, operation: imported ? 'import' : 'edit' });
    };
    return {
      doc, currentScreenId: doc.screens[0].id, selected: null, past: [], future: [], gesture: null, blocked: null, operation: 'edit',
      setBlocked: blocked => set({ blocked, ...(blocked ? { gesture: null } : {}) }),
      restoreLocal: restored => {
        const valid = parseProject(JSON.stringify(restored));
        set({ doc: valid, currentScreenId: valid.screens[0].id, selected: null, past: [], future: [], gesture: null, operation: 'restore' });
      },
      addScreen: () => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        if (s.doc.screens.length >= 100) throw new Error('最多 100 个 Screen');
        const next = structuredClone(s.doc), used = new Set([next.project.id, ...next.screens.flatMap(screen => [screen.id, ...screen.nodes.map(n => n.id), ...screen.behaviors.map(r => r.id), ...(screen.screenTargets ?? []).map(t => t.id)])]);
        let n = 1; while (used.has(`screen_${n}`)) n++;
        const screen = structuredClone(emptyProject().screens[0]); screen.id = `screen_${n}`; screen.title = { kind: 'literal', value: `Screen ${n}` }; next.screens.push(screen); if (!['0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.schemaVersion = '0.12.0';
        commit(next, null); set({ currentScreenId: screen.id, selected: null });
      },
      setEntryScreen: id => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        screenById(s.doc, id); const next = structuredClone(s.doc); next.schemaVersion = ['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion) ? next.schemaVersion : '0.13.0'; if (['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.screenTabGroups ??= []; next.entryScreenId = id; commit(next, s.selected);
      },
      renameScreen: (id, name) => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        const title = name.trim(); if (!title || title.length > 128) throw new Error('Screen 名称须为 1～128 个字符');
        const next = structuredClone(s.doc), screen = screenById(next, id); screen.title = screen.title.kind === 'translate' ? { ...screen.title, fallback: title } : { kind: 'literal', value: title }; commit(next, s.selected);
      },
      deleteScreen: id => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        if (s.doc.screens.length <= 1) throw new Error('必须保留至少一个 Screen');
        if (s.doc.entryScreenId === id) throw new Error('请先选择替代入口 Screen，再删除当前入口');
        screenById(s.doc, id);
        if (s.doc.screens.some(screen => screen.screenTargets?.some(target => target.boundScreenId === id))) throw new Error('Screen 仍被导航目标绑定，请先解除绑定');
        if (s.doc.screenTabGroups?.some(group => group.tabs.some(tab => tab.targetScreenId === id))) throw new Error('Screen 仍是 CreativeTab 导航目标，请先更改导航组目标');
        const next = structuredClone(s.doc); next.screens = next.screens.filter(screen => screen.id !== id); commit(next, id === s.currentScreenId ? null : s.selected);
        if (id === s.currentScreenId) set({ currentScreenId: next.screens[next.screens.length - 1].id, selected: null });
      },
      switchScreen: id => { const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动'); screenById(s.doc, id); if (id !== s.currentScreenId) set({ currentScreenId: id, selected: null }); },
      select: selected => { if (!get().gesture && (selected === null || currentScreen(get()).nodes.some(n => n.id === selected))) set({ selected }); },
      add: (type, position) => {
        const s = get();
        if (s.blocked || s.gesture || currentScreen(s).nodes.length >= 1000) return;
        const next = structuredClone(s.doc);
        if ((type === 'minecraft:checkbox' || type === 'minecraft:cycle-button') && !['0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.schemaVersion = '0.4.0';
        if (type === 'minecraft:creative-tab' && !['0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.schemaVersion = '0.10.0';
        const ids = new Set([next.project.id, ...next.screens.flatMap(screen => [screen.id, ...screen.nodes.map(n => n.id), ...screen.behaviors.map(r => r.id), ...(screen.screenTargets ?? []).map(t => t.id)]), ...(next.screenTabGroups ?? []).flatMap(group => [group.id, ...group.tabs.map(tab => tab.id)])]);
        let index = screenById(next, get().currentScreenId).nodes.length + 1;
        while (ids.has(`node_${index}`)) index++;
        const node = createNode(type, `node_${index}`, position ?? { x: 16 + (index - 1) % 6 * 16, y: 16 + (index - 1) % 6 * 20 });
        if (type === 'minecraft:radio-group' || type === 'minecraft:dropdown') { next.schemaVersion = '0.18.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; }
        if (type === 'minecraft:numeric-input' || type === 'minecraft:slider') { if (!['0.17.0', '0.18.0'].includes(next.schemaVersion)) next.schemaVersion = '0.16.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; }
        // Tiny imported screens must not create invalid nodes.
        if (screenById(next, get().currentScreenId).designSize.width < CATALOG[type].min.w || screenById(next, get().currentScreenId).designSize.height < CATALOG[type].min.h) return;
        if (isSelectionNode(node)) { const min = selectionMinimum(node), size = currentScreen(s).designSize; if (size.width < min.w || size.height < min.h) return; }
        node.bounds = constrainBounds(node.bounds, type, screenById(next, get().currentScreenId).designSize);
        if (node.type === 'minecraft:multi-line-text-widget') {
          node.props.maxWidth = node.bounds.w; node.props.maxRows = node.bounds.h / 9;
          if (!['0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.schemaVersion = '0.15.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id;
        }
        screenById(next, get().currentScreenId).nodes.push(node);
        commit(next, node.id);
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
        if (!['0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.schemaVersion = '0.11.0'; commit(next, id);
      },
      createScreenTabGroup: nodeId => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        const next = structuredClone(s.doc), screen = screenById(next, s.currentScreenId), node = screen.nodes.find(item => item.id === nodeId);
        if (!node || node.type !== 'minecraft:creative-tab') throw new Error('CreativeTab 不存在');
        const used = new Set([next.project.id, ...next.screens.flatMap(item => [item.id, ...item.nodes.map(n => n.id), ...item.behaviors.map(r => r.id), ...(item.screenTargets ?? []).map(t => t.id)]), ...(next.screenTabGroups ?? []).flatMap(group => [group.id, ...group.tabs.map(tab => tab.id)])]);
        let groupIndex = 1; while (used.has(`tabgroup_${groupIndex}`)) groupIndex++;
        let tabIndex = 1; while (used.has(`navtab_${tabIndex}`)) tabIndex++;
        const groupId = `tabgroup_${groupIndex}`, tabId = `navtab_${tabIndex}`;
        if (!['0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.schemaVersion = '0.14.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id;
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
        if (!['0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.schemaVersion = '0.14.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id; commit(next, nodeId);
      },
      saveScreenTabGroup: group => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        const next = structuredClone(s.doc); if (!['0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.schemaVersion = '0.14.0'; next.screenTabGroups ??= []; next.entryScreenId ??= next.screens[0].id;
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
        if (!['0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion) && screenById(next, get().currentScreenId).nodes.some(n => n.type !== 'minecraft:fill' && n.type !== 'minecraft:creative-tab' && n.props.textShadow !== undefined)) next.schemaVersion = '0.5.0';
        commit(next, s.selected);
      },
      saveBehavior: rule => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成拖动');
        const next = structuredClone(s.doc), rules = screenById(next, get().currentScreenId).behaviors, index = rules.findIndex(r => r.id === rule.id);
        if (index < 0) rules.push(rule); else rules[index] = rule;
        next.schemaVersion = ['0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion) ? next.schemaVersion : next.schemaVersion === '0.12.0' ? '0.12.0' : next.schemaVersion === '0.11.0' ? '0.11.0' : next.schemaVersion === '0.10.0' ? '0.10.0' : next.schemaVersion === '0.9.0' ? '0.9.0' : next.schemaVersion === '0.8.0' || 'actions' in rule ? '0.8.0' : next.schemaVersion === '0.7.0' || rule.event.type === 'rectangle-click' || actionsOf(rule).some(a => a.type === 'open_screen') ? '0.7.0' : '0.6.0'; if (['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.screenTabGroups ??= []; commit(next, s.selected);
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
        if (!['0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.schemaVersion = '0.7.0'; commit(next, s.selected);
      },
      deleteScreenTarget: id => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成拖动');
        if (currentScreen(s).behaviors.some(r => actionsOf(r).some(a => a.type === 'open_screen' && a.targetScreenId === id))) throw new Error('目标仍被规则引用，请先修改或删除规则');
        const next = structuredClone(s.doc); screenById(next, get().currentScreenId).screenTargets = (screenById(next, get().currentScreenId).screenTargets ?? []).filter(t => t.id !== id); commit(next, s.selected);
      },
      renameProject: name => { const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        if (!name.trim()) throw new Error('项目名称不能为空'); const next = structuredClone(s.doc); next.project.name = name.trim(); commit(next, s.selected); },
      deleteSelected: () => {
        const s = get(); if (s.blocked || !s.selected || s.gesture) return;
        if (currentScreen(s).nodes.some(n => n.type === 'minecraft:creative-tab' && n.props.contentIds?.includes(s.selected!))) throw new Error('组件仍被标签内容引用，请先解除关联');
        if (currentScreen(s).behaviors.some(r => r.event.sourceId === s.selected || actionsOf(r).some(a => a.type !== 'open_screen' && a.targetId === s.selected))) throw new Error('组件仍被行为规则引用，请先修改或删除相关规则');
        const next = structuredClone(s.doc);
        const removed = screenById(next, get().currentScreenId).nodes.find(n => n.id === s.selected); screenById(next, get().currentScreenId).nodes = screenById(next, get().currentScreenId).nodes.filter(n => n.id !== s.selected);
        if (removed?.type === 'minecraft:creative-tab' && removed.props.groupId && removed.props.selected) { const successor = screenById(next, get().currentScreenId).nodes.find(n => n.type === 'minecraft:creative-tab' && n.props.groupId === removed.props.groupId); if (successor?.type === 'minecraft:creative-tab') successor.props.selected = true; }
        commit(next, null);
      },
      resizeScreen: (width, height) => {
        const s = get();
        if (s.blocked) throw new Error(s.blocked);
        if (s.gesture) throw new Error('请先完成当前拖动');
        if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= MAX_EDITABLE_DESIGN_SIZE)) {
          throw new Error(`设计区宽高必须为1～${MAX_EDITABLE_DESIGN_SIZE}的整数（编辑器操作上限）`);
        }
        if (currentScreen(s).nodes.some(n => n.bounds.x + n.bounds.w > width || n.bounds.y + n.bounds.h > height)) {
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
        if (enabled) { if (style !== PANEL_STYLE && !['0.4.0', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.schemaVersion = '0.3.0'; else if (next.schemaVersion === '0.1.0') next.schemaVersion = '0.2.0'; screenById(next, get().currentScreenId).background = { kind: 'panel', style, ...(previousBackground.kind === 'panel' && previousBackground.bounds ? { bounds: previousBackground.bounds } : {}) }; }
        else screenById(next, get().currentScreenId).background = { kind: 'none' };
        commit(next, s.selected);
      },
      setPanelBounds: bounds => {
        const state = get(); if (state.blocked) throw new Error(state.blocked); if (state.gesture) throw new Error('请先完成当前拖动');
        const next = structuredClone(state.doc), background = screenById(next, get().currentScreenId).background;
        if (background.kind !== 'panel') throw new Error('请先启用 Panel');
        background.bounds = bounds; if (!['0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(next.schemaVersion)) next.schemaVersion = '0.9.0'; commit(next, state.selected);
      },
      beginGesture: id => {
        const s = get(), node = currentScreen(s).nodes.find(n => n.id === id);
        if (node && !s.blocked && !s.gesture) set({ selected: id, gesture: { id, before: { ...node.bounds }, draft: { ...node.bounds } } });
      },
      previewBounds: bounds => {
        const s = get(), g = s.gesture;
        if (s.blocked || !g || !Object.values(bounds).every(Number.isFinite)) return;
        const node = currentScreen(s).nodes.find(n => n.id === g.id)!;
        const draft = constrainBounds(bounds, node.type, currentScreen(s).designSize);
        if (isSelectionNode(node)) {
          const min = selectionMinimum(node); draft.w = Math.max(min.w, draft.w); draft.h = Math.max(min.h, draft.h);
          if (bounds.x !== g.before.x && bounds.w !== g.before.w) draft.x = Math.max(0, Math.round(bounds.x + bounds.w - draft.w));
          if (bounds.y !== g.before.y && bounds.h !== g.before.h) draft.y = Math.max(0, Math.round(bounds.y + bounds.h - draft.h));
          draft.x = Math.min(draft.x, currentScreen(s).designSize.width - draft.w); draft.y = Math.min(draft.y, currentScreen(s).designSize.height - draft.h);
        }
        if (node.type === 'minecraft:multi-line-text-widget' && bounds.y !== g.before.y && bounds.h !== g.before.h) draft.y = Math.max(0, Math.round(bounds.y + bounds.h - draft.h));
        set({ gesture: { ...g, draft } });
      },
      commitGesture: () => {
        const s = get(), g = s.gesture;
        if (!g) return;
        set({ gesture: null });
        if (same(g.before, g.draft)) return;
        get().updateNode(g.id, n => ({ ...n, bounds: g.draft }));
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
