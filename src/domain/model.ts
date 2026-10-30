import { CATALOG, CATALOG_VERSION, TARGET, type NodeType } from './catalog';
import type { Bounds, GuiNode, GuiProject, TextSpec } from './schema';

export const literal = (value: string): TextSpec => ({ kind: 'literal', value });
export const displayText = (text: TextSpec): string => text.kind === 'literal' ? text.value : text.fallback;
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
    case 'minecraft:creative-tab': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { name: 'CreativeTab', column: 1, selected: false }, events: {} };
    case 'minecraft:button': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { message: literal('Button') }, events: {} };
    case 'minecraft:edit-box': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { narration: literal('Input'), value: '', hint: literal('Enter text…'), maxLength: 32, bordered: true, editable: true }, events: {} };
    case 'minecraft:string-widget': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { text: literal('Text label'), color: '#FF404040', align: 'left' }, events: {} };
    case 'minecraft:fill': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { color: '#FF48546B' }, events: {} };
    case 'minecraft:checkbox': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { message: literal('Checkbox'), selected: false, maxWidth: 120 }, events: {} };
    case 'minecraft:cycle-button': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { name: literal('Option'), options: [{ id: 'option_1', text: literal('One') }, { id: 'option_2', text: literal('Two') }], initialOptionId: 'option_1', displayFormat: 'name-and-value' }, events: {} };
  }
}
export function constrainBounds(bounds: Bounds, type: NodeType, screen: { width: number; height: number }): Bounds {
  const min = CATALOG[type].min;
  const w = type === 'minecraft:creative-tab' ? 26 : Math.max(min.w, Math.min(screen.width, Math.round(bounds.w)));
  const h = type === 'minecraft:creative-tab' ? 32 : Math.max(min.h, Math.min(screen.height, Math.round(bounds.h)));
  return { x: Math.max(0, Math.min(screen.width - w, Math.round(bounds.x))),
    y: Math.max(0, Math.min(screen.height - h, Math.round(bounds.y))), w, h };
}
