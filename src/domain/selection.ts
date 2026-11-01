import type { GuiNode } from './schema';

export type SelectionNode = Extract<GuiNode, { type: 'minecraft:radio-group' | 'minecraft:dropdown' }>;
export const isSelectionNode = (node: GuiNode): node is SelectionNode => node.type === 'minecraft:radio-group' || node.type === 'minecraft:dropdown';
export function selectionMinimum(node: SelectionNode) {
  return { w: node.type === 'minecraft:radio-group' && node.props.orientation === 'horizontal' ? node.props.options.length * 20 : 20, h: node.type === 'minecraft:radio-group' && node.props.orientation === 'vertical' ? node.props.options.length * 20 : 20 };
}
export type SelectionEvent = { type: 'selection-change'; screenId: string; nodeId: string; optionId: string; phase: 'confirm'; source: 'pointer' | 'keyboard' };
export function selectionError(props: { options: { id: string; disabled: boolean }[]; initialSelectedOptionId: string }): string | null {
  if (new Set(props.options.map(o => o.id)).size !== props.options.length) return '选项 ID 必须在控件内唯一';
  if (!props.options.some(o => !o.disabled)) return '至少需要一个可选选项';
  if (!props.options.some(o => o.id === props.initialSelectedOptionId && !o.disabled)) return '初始选择必须引用启用的选项；删除或禁用前请明确指定替代初值';
  return null;
}
export function moveOption(options: { id: string; disabled: boolean }[], active: string, direction: -1 | 1): string {
  const enabled = options.filter(o => !o.disabled), index = enabled.findIndex(o => o.id === active);
  return enabled[(index + direction + enabled.length) % enabled.length]?.id ?? active;
}
export function dropdownPlacement(b: { x: number; y: number; w: number; h: number }, screen: { width: number; height: number }, count: number, visibleRows: number) {
  const rowHeight = 20, desired = Math.min(count, visibleRows) * rowHeight;
  const below = Math.max(0, screen.height - b.y - b.h), above = b.y;
  const up = below < desired && above > below, height = Math.min(desired, up ? above : below);
  return { x: Math.max(0, Math.min(b.x, screen.width - b.w)), y: up ? b.y - height : b.y + b.h, w: Math.min(b.w, screen.width), h: height, rowHeight, up };
}
export const SELECTION_RUNTIME_CONTRACT = {
  version: '1.0.0', identity: 'option IDs unique within owner node; labels never identify options; reorder preserves IDs',
  authority: 'nonempty options, at least one enabled, initialSelectedOptionId references enabled option; reject invalid JSON atomically; deletion/disable requires explicit replacement',
  runtime: 'selectedOptionId, activeOptionId, focus, hover, scroll and open are transient; every open_screen including self restores initial selection; removal/restart clears all',
  event: { type: 'selection-change', fields: ['screenId', 'nodeId', 'optionId', 'phase', 'source'], phase: 'confirm', binding: 'unbound implementer responsibility; no F2 dataflow or implicit navigation', suppress: ['disabled', 'unchanged', 'focus-only', 'cancel'] },
  radio: 'Composite node. Custom AbstractButton children and owner coordinator, never independent Checkboxes. Equal cells in vertical/horizontal bounds; min cell 20 GUI px; clip labels per cell. Arrows wrap enabled options and confirm once, Home/End confirm first/last enabled. Narrate group, option, selected state and position.',
  dropdown: 'Button/AbstractWidget trigger with one Screen-owned overlay controller, custom candidate list. Active differs from selected. Arrows/Home/End move active only; Enter/Space confirm; Escape cancels before Screen default close; Tab closes and moves to next outer focusable control (Shift reverses). Disabled candidates skipped. Scroll viewport; ensure active visible.',
  overlay: 'Input checked before Screen super handlers and children regardless of z. Draw after ordinary controls with all local scissor scopes exited, before tooltips. Choose below unless insufficient and above has more space; clamp viewport to Screen, 20px rows, internal scroll. Outside press closes and consumes press plus matching release; capture drag/scroll/keys, no click-through. Release ownership survives close until release/cancel. Restore trigger focus except Tab. Clear on resize/relayout, removed, owner hidden/deleted/disabled, navigation/restart; release captures/listeners.',
  rendering: 'Custom API composite indicator/trigger visuals; no native Radio/Dropdown class or sprite promised. PNG closed design initial state only; full options in JSON/spec. Browser font/visual approximation requires independent game verification.',
  evidence: ['AbstractButton.java:23-65', 'events/ContainerEventHandler.java:24-62,75-115', 'screens/Screen.java', 'components/CommandSuggestions.java', 'GuiGraphics.java'],
} as const;
