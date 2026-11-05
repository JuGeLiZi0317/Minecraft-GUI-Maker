import { CATALOG, CATALOG_VERSION, TARGET, type NodeType } from './catalog';
import type { Bounds, GuiNode, GuiProject, TextSpec } from './schema';
import { PANEL_MIN_SIZE } from './panel';

export const literal = (value: string): TextSpec => ({ kind: 'literal', value });
export const displayText = (text: TextSpec): string => text.kind === 'literal' ? text.value : text.fallback;
/** Edit transactions only; strict imports never normalize or repair user data. */
export function editNode(before: GuiNode, change: (node: GuiNode) => GuiNode): GuiNode {
  const previous = structuredClone(before), next = change(before);
  if (previous.type === 'minecraft:multi-line-text-widget' && next.type === previous.type) {
    if (next.props.maxWidth !== previous.props.maxWidth || next.props.maxRows !== previous.props.maxRows) {
      next.bounds = { ...next.bounds, w: next.props.maxWidth, h: next.props.maxRows * 9 };
    } else next.props = { ...next.props, maxWidth: next.bounds.w, maxRows: next.bounds.h / 9 };
  }
  return next;
}
export function emptyProject(): GuiProject {
  return {
    format: 'minecraft-gui-maker', schemaVersion: '0.1.0', catalogVersion: CATALOG_VERSION,
    target: structuredClone(TARGET), project: { id: 'project_main', name: 'Untitled interface', revision: 0 },
    screens: [{ id: 'screen_main', title: literal('Untitled screen'), base: 'screen',
      designSize: { width: 320, height: 180, unit: 'gui-px' }, placement: 'center', background: { kind: 'none' },
      nodes: [], variables: [], behaviors: [] }], assets: [],
  };
}
/** Repairs stale in-memory Panel geometry before a workspace-changing operation. Strict JSON parsing remains unchanged. */
export function repairInvalidPanelBounds(project: GuiProject): GuiProject {
  let repaired: GuiProject | undefined;
  for (let index = 0; index < project.screens.length; index++) {
    const screen = project.screens[index];
    if (screen.background.kind !== 'panel' || !screen.background.bounds) continue;
    const bounds = screen.background.bounds;
    if ([bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isInteger) && bounds.x >= 0 && bounds.y >= 0 && bounds.w >= PANEL_MIN_SIZE && bounds.h >= PANEL_MIN_SIZE && bounds.x + bounds.w <= screen.designSize.width && bounds.y + bounds.h <= screen.designSize.height) continue;
    repaired ??= structuredClone(project);
    const target = repaired.screens[index];
    if (target.background.kind === 'panel') target.background.bounds = { x: 0, y: 0, w: target.designSize.width, h: target.designSize.height };
  }
  return repaired ?? project;
}
export function createNode(type: NodeType, id: string, position = { x: 16, y: 16 }): GuiNode {
  const bounds = { ...position, ...CATALOG[type].size };
  const visible = { visible: true };
  switch (type) {
    case 'minecraft:scrollable-panel': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { padding: 4, contentHeight: 180, initialScroll: 'top', backgroundColor: '#B020252D', borderColor: '#FF8795A5' }, events: {} };
    case 'minecraft:collapsible-panel': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { title: literal('Collapsible Panel'), headerHeight: 20, initialExpanded: true, headerColor: '#FF303D4B', backgroundColor: '#B020252D', textColor: '#FFFFFFFF', border: true, borderColor: '#FF8795A5' }, events: {} };
    case 'minecraft:tree-view': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: {
      name: literal('Tree View'),
      items: [
        { id: 'item_root', label: literal('Root'), parentId: null, order: 0, selectable: false, disabled: false },
        { id: 'item_branch', label: literal('Branch'), parentId: 'item_root', order: 0, selectable: true, disabled: false },
        { id: 'item_leaf_a', label: literal('Leaf A'), parentId: 'item_branch', order: 0, selectable: true, disabled: false },
        { id: 'item_leaf_b', label: literal('Leaf B'), parentId: 'item_branch', order: 1, selectable: true, disabled: false },
        { id: 'item_other', label: literal('Other'), parentId: null, order: 1, selectable: true, disabled: false },
      ], initialExpandedIds: ['item_root', 'item_branch'], initialSelectedItemId: 'item_leaf_a',
    }, events: { change: 'tree-selection-change' } };
    case 'minecraft:status-indicator': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { name: literal('状态'), statuses: [{ statusId: 'status_running', label: literal('运行'), color: '#FF54B56A', text: literal('运行') }, { statusId: 'status_stopped', label: literal('停止'), color: '#FF808080', text: literal('停止') }, { statusId: 'status_warning', label: literal('警告'), color: '#FFFFB347', text: literal('警告') }], initialStatusId: 'status_stopped', shape: 'circle', showLabel: true, color: '#FFFFFFFF', textShadow: false }, events: { change: 'status-change' } };
    case 'minecraft:image': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { kind: 'texture', resourceId: 'minecraft:textures/gui/container/dispenser.png', textureWidth: 256, textureHeight: 256, uv: { x: 0, y: 0, width: 256, height: 256 } }, events: {} };
    case 'minecraft:fitting-multi-line-text-widget': return { id, type, bounds: { ...position, ...CATALOG[type].size }, source: { ...CATALOG[type].source }, state: visible, props: { text: literal('只读滚动文本区域\nRead only scrollable text'), color: '#FFE0E0E0', initialScroll: 'top', textShadow: true }, events: {} };
    case 'minecraft:progress-bar': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { min: 0, max: 100, initialValue: 50, direction: 'left-to-right', backgroundColor: '#FF202020', foregroundColor: '#FF55AA55', border: true, borderColor: '#FF404040', borderThickness: 1, display: 'percentage', color: '#FFFFFFFF', textShadow: false }, events: {} };
    case 'minecraft:radio-group':
    case 'minecraft:dropdown': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { name: literal('Choice'), color: '#FF404040', textShadow: false, options: [{ id: 'option_1', label: literal('One'), disabled: false }, { id: 'option_2', label: literal('Two'), disabled: false }, { id: 'option_3', label: literal('Three'), disabled: false }], initialSelectedOptionId: 'option_1', ...(type === 'minecraft:radio-group' ? { orientation: 'vertical' as const } : { visibleRows: 5 }) }, events: { change: 'selection-change' } } as GuiNode;
    case 'minecraft:numeric-input': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { color: '#FF404040', name: literal('Number'), min: 0, max: 100, step: 1, initialValue: 0, numericType: 'integer', format: { decimals: 0, unit: '' }, textShadow: false, bordered: true, editable: true, commitPolicy: 'enter-or-blur', errorMessage: '数值无效' }, events: { commit: 'numeric-commit' } };
    case 'minecraft:slider': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { color: '#FF404040', name: literal('Value'), min: 0, max: 100, step: 1, initialValue: 50, numericType: 'integer', format: { decimals: 0, unit: '' }, textShadow: false, showValue: true }, events: { change: 'slider-change' } };
    case 'minecraft:multi-line-text-widget': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { text: literal('Multi-line text\n说明文字'), color: '#FF404040', maxWidth: 150, maxRows: 4, align: 'center', textShadow: false }, events: {} };
    case 'minecraft:creative-tab': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { name: 'CreativeTab', column: 1, selected: false }, events: {} };
    case 'minecraft:button': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { color: '#FF404040', message: literal('Button') }, events: {} };
    case 'minecraft:edit-box': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { color: '#FF404040', narration: literal('Input'), value: '', hint: literal('Enter text…'), maxLength: 32, bordered: true, editable: true }, events: {} };
    case 'minecraft:string-widget': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { text: literal('Text label'), color: '#FF404040', align: 'center' }, events: {} };
    case 'minecraft:fill': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { color: '#FF48546B' }, events: {} };
    case 'minecraft:checkbox': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { color: '#FF404040', message: literal('Checkbox'), selected: false, maxWidth: 120 }, events: {} };
    case 'minecraft:cycle-button': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { color: '#FF404040', name: literal('Option'), options: [{ id: 'option_1', text: literal('One') }, { id: 'option_2', text: literal('Two') }], initialOptionId: 'option_1', displayFormat: 'name-and-value' }, events: {} };
  }
}
export function constrainBounds(bounds: Bounds, type: NodeType, screen: { width: number; height: number }): Bounds {
  const min = CATALOG[type].min;
  const w = type === 'minecraft:creative-tab' ? 26 : Math.max(min.w, Math.min(screen.width, type === 'minecraft:multi-line-text-widget' ? 8192 : Infinity, Math.round(bounds.w)));
  const rawHeight = Math.max(min.h, Math.min(screen.height, Math.round(bounds.h)));
  const h = type === 'minecraft:creative-tab' ? 32 : type === 'minecraft:multi-line-text-widget' ? Math.min(256, Math.max(1, Math.floor(rawHeight / 9))) * 9 : rawHeight;
  return { x: Math.max(0, Math.min(screen.width - w, Math.round(bounds.x))),
    y: Math.max(0, Math.min(screen.height - h, Math.round(bounds.y))), w, h };
}

export function upgradeTextStyleEdit(doc: GuiProject) {
  if (doc.runtimePolicy || doc.screens.some(s => s.nodes.some(n => n.type !== 'minecraft:creative-tab' && n.type !== 'minecraft:fill' && n.type !== 'minecraft:image' && n.type !== 'minecraft:scrollable-panel' && n.type !== 'minecraft:collapsible-panel' && ((n.type !== 'minecraft:string-widget' && n.type !== 'minecraft:multi-line-text-widget' && 'color' in n.props && n.props.color !== undefined) || ((n.type === 'minecraft:multi-line-text-widget' || n.type === 'minecraft:slider') && !n.props.textShadow))))) {
    if (!['0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) doc.schemaVersion = '0.17.0'; doc.entryScreenId ??= doc.screens[0].id; doc.screenTabGroups ??= [];
  }
}
