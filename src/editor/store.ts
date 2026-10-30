import { createStore } from 'zustand/vanilla';
import { CATALOG, type NodeType } from '../domain/catalog';
import { constrainBounds, createNode, emptyProject } from '../domain/model';
import { MAX_EDITABLE_DESIGN_SIZE } from '../domain/guiScale';
import { actionsOf, parseProject, type Behavior, type Bounds, type GuiNode, type GuiProject, type ScreenTarget } from '../domain/schema';
import { PANEL_STYLE, NATIVE_PANEL_16, type PanelStyle } from '../domain/panel';

type Snapshot = { doc: GuiProject; selected: string | null };
type Gesture = { id: string; before: Bounds; draft: Bounds };
export type EditorState = Snapshot & {
  blocked: string | null; operation: 'edit' | 'import' | 'restore';
  setBlocked: (reason: string | null) => void;
  restoreLocal: (doc: GuiProject) => void;
  past: Snapshot[]; future: Snapshot[]; gesture: Gesture | null;
  select: (id: string | null) => void;
  add: (type: NodeType, position?: { x: number; y: number }) => void;
  configureTab: (id: string, groupId: string | undefined, contentIds: string[], selected: boolean) => void;
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
      const valid = parseProject(JSON.stringify(next));
      if (!imported) valid.project.revision = state.doc.project.revision + 1;
      // Revalidate revision overflow too. Failed operations have no observable partial state.
      parseProject(JSON.stringify(valid));
      set({ doc: valid, selected, past: [...state.past.slice(-99), snap(state)], future: [], gesture: null, operation: imported ? 'import' : 'edit' });
    };
    return {
      doc, selected: null, past: [], future: [], gesture: null, blocked: null, operation: 'edit',
      setBlocked: blocked => set({ blocked, ...(blocked ? { gesture: null } : {}) }),
      restoreLocal: restored => {
        const valid = parseProject(JSON.stringify(restored));
        set({ doc: valid, selected: null, past: [], future: [], gesture: null, operation: 'restore' });
      },
      select: selected => { if (!get().gesture && (selected === null || get().doc.screens[0].nodes.some(n => n.id === selected))) set({ selected }); },
      add: (type, position) => {
        const s = get();
        if (s.blocked || s.gesture || s.doc.screens[0].nodes.length >= 1000) return;
        const next = structuredClone(s.doc);
        if ((type === 'minecraft:checkbox' || type === 'minecraft:cycle-button') && !['0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0'].includes(next.schemaVersion)) next.schemaVersion = '0.4.0';
        if (type === 'minecraft:creative-tab' && next.schemaVersion !== '0.11.0') next.schemaVersion = '0.10.0';
        const ids = new Set([next.project.id, next.screens[0].id, ...next.screens[0].nodes.map(n => n.id), ...next.screens[0].behaviors.map(r => r.id), ...(next.screens[0].screenTargets ?? []).map(t => t.id)]);
        let index = next.screens[0].nodes.length + 1;
        while (ids.has(`node_${index}`)) index++;
        const node = createNode(type, `node_${index}`, position ?? { x: 16 + (index - 1) % 6 * 16, y: 16 + (index - 1) % 6 * 20 });
        // Tiny imported screens must not create invalid nodes.
        if (next.screens[0].designSize.width < CATALOG[type].min.w || next.screens[0].designSize.height < CATALOG[type].min.h) return;
        node.bounds = constrainBounds(node.bounds, type, next.screens[0].designSize);
        next.screens[0].nodes.push(node);
        commit(next, node.id);
      },
      configureTab: (id, groupId, contentIds, selected) => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成拖动');
        const next = structuredClone(s.doc), nodes = next.screens[0].nodes, tab = nodes.find(n => n.id === id);
        if (!tab || tab.type !== 'minecraft:creative-tab') throw new Error('标签不存在');
        const previous = tab.props.groupId;
        if (groupId) { tab.props.groupId = groupId; tab.props.contentIds = contentIds; }
        else { delete tab.props.groupId; delete tab.props.contentIds; }
        const peers = nodes.filter(n => n.type === 'minecraft:creative-tab' && n.id !== id && n.props.groupId === groupId);
        tab.props.selected = groupId && !peers.some(n => n.type === 'minecraft:creative-tab' && n.props.selected) ? true : selected;
        if (groupId && tab.props.selected) for (const n of peers) if (n.type === 'minecraft:creative-tab') n.props.selected = false;
        if (previous && previous !== groupId) { const remaining = nodes.filter(n => n.type === 'minecraft:creative-tab' && n.props.groupId === previous); if (remaining.length && !remaining.some(n => n.type === 'minecraft:creative-tab' && n.props.selected)) { const first = remaining[0]; if (first.type === 'minecraft:creative-tab') first.props.selected = true; } }
        next.schemaVersion = '0.11.0'; commit(next, id);
      },
      updateNode: (id, change) => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) return;
        const next = structuredClone(s.doc);
        next.screens[0].nodes = next.screens[0].nodes.map(n => n.id === id ? change(n) : n);
        if (!['0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0'].includes(next.schemaVersion) && next.screens[0].nodes.some(n => n.type !== 'minecraft:fill' && n.type !== 'minecraft:creative-tab' && n.props.textShadow !== undefined)) next.schemaVersion = '0.5.0';
        commit(next, s.selected);
      },
      saveBehavior: rule => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成拖动');
        const next = structuredClone(s.doc), rules = next.screens[0].behaviors, index = rules.findIndex(r => r.id === rule.id);
        if (index < 0) rules.push(rule); else rules[index] = rule;
        next.schemaVersion = next.schemaVersion === '0.11.0' ? '0.11.0' : next.schemaVersion === '0.10.0' ? '0.10.0' : next.schemaVersion === '0.9.0' ? '0.9.0' : next.schemaVersion === '0.8.0' || 'actions' in rule ? '0.8.0' : next.schemaVersion === '0.7.0' || rule.event.type === 'rectangle-click' || actionsOf(rule).some(a => a.type === 'open_screen') ? '0.7.0' : '0.6.0'; commit(next, s.selected);
      },
      deleteBehavior: id => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); const next = structuredClone(s.doc);
        next.screens[0].behaviors = next.screens[0].behaviors.filter(r => r.id !== id); commit(next, s.selected);
      },
      saveScreenTarget: target => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成拖动');
        const next = structuredClone(s.doc), screen = next.screens[0]; screen.screenTargets ??= [];
        const index = screen.screenTargets.findIndex(t => t.id === target.id);
        if (index < 0) screen.screenTargets.push(target); else screen.screenTargets[index] = target;
        if (!['0.8.0', '0.9.0', '0.10.0', '0.11.0'].includes(next.schemaVersion)) next.schemaVersion = '0.7.0'; commit(next, s.selected);
      },
      deleteScreenTarget: id => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成拖动');
        if (s.doc.screens[0].behaviors.some(r => actionsOf(r).some(a => a.type === 'open_screen' && a.targetScreenId === id))) throw new Error('目标仍被规则引用，请先修改或删除规则');
        const next = structuredClone(s.doc); next.screens[0].screenTargets = (next.screens[0].screenTargets ?? []).filter(t => t.id !== id); commit(next, s.selected);
      },
      renameProject: name => { const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        if (!name.trim()) throw new Error('项目名称不能为空'); const next = structuredClone(s.doc); next.project.name = name.trim(); commit(next, s.selected); },
      deleteSelected: () => {
        const s = get(); if (s.blocked || !s.selected || s.gesture) return;
        if (s.doc.screens[0].nodes.some(n => n.type === 'minecraft:creative-tab' && n.props.contentIds?.includes(s.selected!))) throw new Error('组件仍被标签内容引用，请先解除关联');
        if (s.doc.screens[0].behaviors.some(r => r.event.sourceId === s.selected || actionsOf(r).some(a => a.type !== 'open_screen' && a.targetId === s.selected))) throw new Error('组件仍被行为规则引用，请先修改或删除相关规则');
        const next = structuredClone(s.doc);
        const removed = next.screens[0].nodes.find(n => n.id === s.selected); next.screens[0].nodes = next.screens[0].nodes.filter(n => n.id !== s.selected);
        if (removed?.type === 'minecraft:creative-tab' && removed.props.groupId && removed.props.selected) { const successor = next.screens[0].nodes.find(n => n.type === 'minecraft:creative-tab' && n.props.groupId === removed.props.groupId); if (successor?.type === 'minecraft:creative-tab') successor.props.selected = true; }
        commit(next, null);
      },
      resizeScreen: (width, height) => {
        const s = get();
        if (s.blocked) throw new Error(s.blocked);
        if (s.gesture) throw new Error('请先完成当前拖动');
        if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= MAX_EDITABLE_DESIGN_SIZE)) {
          throw new Error(`设计区宽高必须为1～${MAX_EDITABLE_DESIGN_SIZE}的整数（编辑器操作上限）`);
        }
        if (s.doc.screens[0].nodes.some(n => n.bounds.x + n.bounds.w > width || n.bounds.y + n.bounds.h > height)) {
          throw new Error('缩小后有组件超出设计区，请先移动或调整组件；本次未修改画布');
        }
        const next = structuredClone(s.doc);
        next.screens[0].designSize = { width, height, unit: 'gui-px' };
        commit(next, s.selected);
      },
      setPanel: (enabled, style = NATIVE_PANEL_16) => {
        const s = get(); if (s.blocked) throw new Error(s.blocked); if (s.gesture) throw new Error('请先完成当前拖动');
        const next = structuredClone(s.doc);
        if (enabled) { if (style !== PANEL_STYLE && !['0.4.0', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0'].includes(next.schemaVersion)) next.schemaVersion = '0.3.0'; else if (next.schemaVersion === '0.1.0') next.schemaVersion = '0.2.0'; next.screens[0].background = { kind: 'panel', style, ...(next.screens[0].background.kind === 'panel' && next.screens[0].background.bounds ? { bounds: next.screens[0].background.bounds } : {}) }; }
        else next.screens[0].background = { kind: 'none' };
        commit(next, s.selected);
      },
      setPanelBounds: bounds => {
        const state = get(); if (state.blocked) throw new Error(state.blocked); if (state.gesture) throw new Error('请先完成当前拖动');
        const next = structuredClone(state.doc), background = next.screens[0].background;
        if (background.kind !== 'panel') throw new Error('请先启用 Panel');
        background.bounds = bounds; if (!['0.10.0', '0.11.0'].includes(next.schemaVersion)) next.schemaVersion = '0.9.0'; commit(next, state.selected);
      },
      beginGesture: id => {
        const s = get(), node = s.doc.screens[0].nodes.find(n => n.id === id);
        if (node && !s.blocked && !s.gesture) set({ selected: id, gesture: { id, before: { ...node.bounds }, draft: { ...node.bounds } } });
      },
      previewBounds: bounds => {
        const s = get(), g = s.gesture;
        if (s.blocked || !g || !Object.values(bounds).every(Number.isFinite)) return;
        const node = s.doc.screens[0].nodes.find(n => n.id === g.id)!;
        set({ gesture: { ...g, draft: constrainBounds(bounds, node.type, s.doc.screens[0].designSize) } });
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
        set({ ...previous, past: s.past.slice(0, -1), future: [...s.future, snap(s)], operation: 'edit' });
      },
      redo: () => {
        const s = get(); if (s.blocked || s.gesture) return;
        const next = s.future.at(-1); if (!next) return;
        set({ ...next, future: s.future.slice(0, -1), past: [...s.past, snap(s)], operation: 'edit' });
      },
    };
  });
}
export const editorStore = createEditorStore();
