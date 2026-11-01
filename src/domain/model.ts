import { CATALOG, CATALOG_VERSION, TARGET, type NodeType } from './catalog';
import type { Bounds, GuiNode, GuiProject, TextSpec } from './schema';

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
export function createNode(type: NodeType, id: string, position = { x: 16, y: 16 }): GuiNode {
  const bounds = { ...position, ...CATALOG[type].size };
  const visible = { visible: true };
  switch (type) {
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
  if (doc.runtimePolicy || doc.screens.some(s => s.nodes.some(n => n.type !== 'minecraft:creative-tab' && n.type !== 'minecraft:fill' && ((n.type !== 'minecraft:string-widget' && n.type !== 'minecraft:multi-line-text-widget' && n.props.color !== undefined) || ((n.type === 'minecraft:multi-line-text-widget' || n.type === 'minecraft:slider') && !n.props.textShadow))))) {
    doc.schemaVersion = '0.17.0'; doc.entryScreenId ??= doc.screens[0].id; doc.screenTabGroups ??= [];
  }
}
