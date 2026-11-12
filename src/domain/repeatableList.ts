import type { Bounds, GuiNode } from './schema';

/** First release: fixed row height, single column, one viewport, vertical scrolling only. */
export const REPEATABLE_LIST_MIN_ROWS = 0;
export const REPEATABLE_LIST_MAX_PREVIEW_ROWS = 1000;
export const REPEATABLE_LIST_DESIGN_PREVIEW_ROWS = 3;
export const REPEATABLE_LIST_SCROLLBAR_WIDTH = 6;
export const REPEATABLE_LIST_SCROLLBAR_GAP = 2;
export const REPEATABLE_LIST_SCROLLBAR_GUTTER = REPEATABLE_LIST_SCROLLBAR_WIDTH + REPEATABLE_LIST_SCROLLBAR_GAP;
export const REPEATABLE_LIST_PREVIEW_COUNTS = [0, 1, 3, 5, 10, 100] as const;

/**
 * A row template may only contain ordinary leaf layout nodes. Containers,
 * Native Regions and CreativeTabs are deliberately excluded.
 */
export const REPEATABLE_LIST_CHILD_TYPES = [
  'minecraft:button', 'minecraft:edit-box', 'minecraft:numeric-input', 'minecraft:slider',
  'minecraft:checkbox', 'minecraft:radio-group', 'minecraft:dropdown', 'minecraft:string-widget',
  'minecraft:multi-line-text-widget', 'minecraft:status-indicator', 'minecraft:progress-bar',
  'minecraft:image', 'minecraft:fill', 'minecraft:cycle-button', 'minecraft:single_slot',
] as const;

export type RepeatableListNode = Extract<GuiNode, { type: 'minecraft:repeatable-list' }>;
export type RepeatableChildNode = Extract<GuiNode, { type: typeof REPEATABLE_LIST_CHILD_TYPES[number] }>;

export function isRepeatableListNode(node: GuiNode): node is RepeatableListNode {
  return node.type === 'minecraft:repeatable-list';
}

/** Human-readable reason for a rejected Row Template child, not a generic whitelist message. */
export function repeatableChildRejection(type: GuiNode['type'], usage?: 'inventory' | 'ghost_selection' | 'visual_only'): string | null {
  const detail = (message: string) => `Row Template 首版只接受普通叶子控件：${message}`;
  if (type === 'minecraft:single_slot') {
    if (usage === 'visual_only') return null;
    return detail('真实 Inventory Slot 需要稳定的 Menu Slot 身份；Ghost Selection 需要每行实例身份与外部目标绑定；当前只能放入 visual_only Single Slot');
  }
  if (isRepeatableChildType(type)) return null;
  if (type === 'native_region') return detail('36 格 Native Region 需要稳定的 36 个真实 Menu Slot 集合，不能作为动态行模板子节点');
  if (type === 'minecraft:creative-tab') return detail('CreativeTab/Page Group 是页面结构，不能放入 Row Template');
  if (type === 'minecraft:tree-view') return detail('Tree View 有自己的焦点、滚动和树项身份，不能放入 Row Template');
  if (type === 'minecraft:repeatable-list' || isContainerNodeType(type)) return detail('容器或另一个 Repeatable List 不能放入 Row Template');
  return detail(`${type} 不是首版认可的 Row Template 叶子控件`);
}
const isContainerNodeType = (type: GuiNode['type']) => type === 'minecraft:scrollable-panel' || type === 'minecraft:collapsible-panel';
export function isRepeatableChildType(type: GuiNode['type']): type is RepeatableChildNode['type'] {
  return (REPEATABLE_LIST_CHILD_TYPES as readonly string[]).includes(type);
}

/** Template children use row-local coordinates: x/y are relative to the row's top-left. */
export function repeatableViewport(node: RepeatableListNode): Bounds {
  const { x, y, w, h } = node.bounds, padding = node.props.padding;
  return {
    x: x + padding,
    y: y + padding,
    w: Math.max(0, w - padding * 2 - REPEATABLE_LIST_SCROLLBAR_GUTTER),
    h: Math.max(0, h - padding * 2),
  };
}

export function repeatableStride(node: RepeatableListNode): number {
  return node.props.rowHeight + node.props.rowGap;
}

export function repeatableContentHeight(node: RepeatableListNode, rows: number): number {
  const count = Math.max(0, Math.floor(Number.isFinite(rows) ? rows : 0));
  return count === 0 ? 0 : count * node.props.rowHeight + (count - 1) * node.props.rowGap;
}

export function repeatableContentSize(node: RepeatableListNode, rows: number) {
  const viewport = repeatableViewport(node), height = repeatableContentHeight(node, rows);
  return { width: viewport.w, height, viewportHeight: viewport.h, maxScroll: Math.max(0, height - viewport.h) };
}

export function repeatableScrollOffset(node: RepeatableListNode, value: number, rows: number): number {
  const { maxScroll } = repeatableContentSize(node, rows);
  return Math.max(0, Math.min(maxScroll, Math.round(Number.isFinite(value) ? value : 0)));
}

/** Screen-space bounds for one instance of a template child. rowIndex is preview-only. */
export function repeatableChildBounds(node: RepeatableListNode, child: GuiNode, scrollOffset = 0, rowIndex = 0): Bounds {
  const viewport = repeatableViewport(node);
  return {
    x: viewport.x + child.bounds.x,
    y: viewport.y + rowIndex * repeatableStride(node) + child.bounds.y - scrollOffset,
    w: child.bounds.w,
    h: child.bounds.h,
  };
}

/** Clamp the transient editor preview count. This value is never written to project JSON. */
export function repeatablePreviewRows(rows: Readonly<Record<string, number>> | undefined, nodeId: string): number {
  const raw = rows?.[nodeId] ?? REPEATABLE_LIST_DESIGN_PREVIEW_ROWS;
  if (!Number.isFinite(raw)) return REPEATABLE_LIST_DESIGN_PREVIEW_ROWS;
  return Math.max(REPEATABLE_LIST_MIN_ROWS, Math.min(REPEATABLE_LIST_MAX_PREVIEW_ROWS, Math.floor(raw)));
}

export function repeatableTemplateChildren(node: RepeatableListNode, nodes: readonly GuiNode[]): GuiNode[] {
  return nodes.filter(child => child.parentContainerId === node.id);
}

/** Structural validation shared by strict import and editor commits. */
export function repeatableListError(node: RepeatableListNode, nodes: readonly GuiNode[]): string | null {
  const viewport = repeatableViewport(node);
  if (viewport.w < 1 || viewport.h < 1) return '内边距与滚动条占位后必须留下正数视口';
  const children = repeatableTemplateChildren(node, nodes);
  if (children.length > 64) return '单个 Row Template 最多 64 个模板子节点';
  for (const child of children) {
    if (child.type === 'minecraft:single_slot' && child.props.usage !== 'visual_only') return '真实 Inventory Slot 需要稳定的 Menu Slot 身份；Ghost Selection 需要每行实例身份与外部目标绑定；当前只能放入 visual_only Single Slot';
    if (!isRepeatableChildType(child.type)) return `${child.type} 不能作为 Row Template 子节点`;
    if (child.bounds.x + child.bounds.w > viewport.w) return `${child.id} 超出 Row Template 视口宽度`;
    if (child.bounds.y + child.bounds.h > node.props.rowHeight) return `${child.id} 超出固定行高`;
  }
  return null;
}

export const REPEATABLE_LIST_RUNTIME_CONTRACT = {
  version: '1.0.0',
  source: 'custom Screen-level list viewport built from GuiGraphics.fill + enableScissor/disableScissor; no native generic Row Template widget',
  scope: {
    rows: 'external business data decides the row count; the project JSON stores no concrete row count',
    geometry: 'fixed rowHeight, fixed rowGap, single column, single viewport, vertical scrolling only',
    excluded: ['grid lists', 'tree/virtual lists', 'variable row height', 'cross-Screen data binding', 'generic business object editor'],
  },
  design: {
    template: 'exactly one Row Template per Repeatable List in this release; template children are ordinary design nodes with persisted node IDs and row-local coordinates',
    templateEditing: 'editor-only view; not persisted and not part of F2/runtime state',
    expandedInstances: 'the project stores one template, never a fixed number of expanded row instances; row count and business items belong to the Java data source',
    previewRows: 'simulated rows are design preview only and must never be exported as business data or permanent controls',
  },
  identity: {
    templateId: 'persisted stable template identity on the repeatable-list node',
    templateNodeId: 'persisted stable node ID of a template child; it is a layout slot, not a record identity',
    businessItemKey: 'stable key supplied by external Java data; never use the visible row index as this key',
    runtimeInstanceId: 'derived at runtime from bindingKey + businessItemKey + templateId + templateNodeId; never serialized and never reused as the template node ID',
    consequence: 'multiple runtime rows must not register the same global node ID; focus, event state and control instances are keyed per runtimeInstanceId',
  },
  viewport: {
    clipping: 'scissor to the viewport; the first and last visible rows may be partially clipped',
    hiddenRows: 'rows completely outside the viewport are not drawn, hit-tested, focus-traversed or narrated',
    scrollbar: '6 GUI px track + 2 GUI px gap only when content is taller than the viewport',
    initialScroll: 'top on every Screen open/resize; scroll offset is Screen-instance state, never authority JSON',
    wheel: 'the list consumes vertical wheel only while the pointer is inside the viewport; do not propagate to canvas zoom',
    keyboard: 'Up/Down move focus/scroll by one row within the list; do not leak focus to clipped rows',
  },
  data: {
    binding: 'dataSource.bindingKey is a Java integration point; GUI Maker does not generate a collection, network protocol, server transaction or dynamic binding framework',
    refresh: 'preserve scroll offset when possible and clamp it after the row count changes; if the focused business item disappears, move focus to a stable list-level control and do not focus by row index',
    reorder: 'preserve focus by businessItemKey; if the focused item still exists after add/remove/move, reveal and refocus its runtime instance',
    reuse: 'before a visible row is rebound or recycled to another item, commit the previous row draft to the business layer',
  },
  actions: {
    addRemoveMove: 'Add / remove / move-up / move-down buttons define UI entry points only; they never mutate a business collection automatically',
    rowContext: 'v1 has no F2 row-context or dynamic event payload. A button or field inside a row template is a Java integration point, not a static node-ID event.',
    staticIds: 'do not use a template child node ID as a runtime record ID or as an F2 target for a concrete row',
  },
  nativeSlots: 'Native Menu Slots and Native Regions must be created by Java; never repeat a native_region / creative-tab / tree-view, inventory/ghost Single Slot or a nested container as an ordinary template child. visual_only Single Slot is allowed as a non-interactive repeated decoration with row-local coordinates.',
} as const;
