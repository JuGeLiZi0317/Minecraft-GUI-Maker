import type { GuiNode, TextSpec } from './schema';

export type TreeViewNode = Extract<GuiNode, { type: 'minecraft:tree-view' }>;
export type TreeItem = TreeViewNode['props']['items'][number];
export type VisibleTreeItem = { item: TreeItem; depth: number; position: number; setSize: number; hasChildren: boolean };
export const TREE_VIEW_MAX_ITEMS = 256;
export const TREE_VIEW_MAX_DEPTH = 16;
export const TREE_VIEW_ROW_HEIGHT = 18;
export const TREE_VIEW_INDENT = 13;
export const TREE_VIEW_DISCLOSURE_WIDTH = 13;
export const TREE_VIEW_LABEL_INSET = 5;
export const TREE_VIEW_LABEL_FONT_SIZE = 9;
export const TREE_VIEW_WHEEL_STEP_GUI_PX = 9;
export const TREE_VIEW_COLORS = {
  background: '#171e28', border: '#657386', selected: '#334a63',
  label: '#e3e8ef', unselectable: '#aeb7c2', disabled: '#7b8490',
  disclosure: '#c4cbd3', disabledDisclosure: '#78818c',
  scrollbarTrack: '#111821', scrollbarThumb: '#8795a5',
} as const;
export const isTreeViewNode = (node: GuiNode): node is TreeViewNode => node.type === 'minecraft:tree-view';
export const treeItemText = (text: TextSpec) => text.kind === 'literal' ? text.value : (text.fallback ?? text.key);

export function treeViewError(props: { items: TreeItem[]; initialExpandedIds: string[]; initialSelectedItemId: string }): string | null {
  const { items, initialExpandedIds, initialSelectedItemId } = props;
  if (items.length < 1 || items.length > TREE_VIEW_MAX_ITEMS) return `Tree View 需要 1～${TREE_VIEW_MAX_ITEMS} 个树项`;
  const byId = new Map<string, TreeItem>();
  for (const item of items) {
    if (byId.has(item.id)) return `树项 ID 必须唯一：${item.id}`;
    if (treeItemText(item.label).length > 128) return `树项名称最多 128 个字符：${item.id}`;
    byId.set(item.id, item);
  }
  const siblingOrders = new Map<string, Set<number>>();
  for (const item of items) {
    if (!Number.isInteger(item.order) || item.order < 0 || item.order > 4095) return `树项排序号必须是 0～4095 的整数：${item.id}`;
    if (item.parentId !== null && !byId.has(item.parentId)) return `树项父级不存在：${item.id}`;
    const parentKey = item.parentId ?? '';
    const orders = siblingOrders.get(parentKey) ?? new Set<number>();
    if (orders.has(item.order)) return `同级树项排序号不能重复：${item.id}`;
    orders.add(item.order); siblingOrders.set(parentKey, orders);
  }
  for (const item of items) {
    const path = new Set<string>([item.id]); let parentId = item.parentId, depth = 0;
    while (parentId !== null) {
      if (path.has(parentId)) return `树结构不能成环：${item.id}`;
      path.add(parentId); depth++;
      if (depth >= TREE_VIEW_MAX_DEPTH) return `树层级不能超过 ${TREE_VIEW_MAX_DEPTH} 层：${item.id}`;
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
  const childIds = new Set(items.flatMap(item => item.parentId === null ? [] : [item.parentId]));
  const expanded = new Set<string>();
  for (const id of initialExpandedIds) {
    if (expanded.has(id)) return `初始展开项不能重复：${id}`;
    if (!byId.has(id) || !childIds.has(id)) return `初始展开项必须引用有子项的树项：${id}`;
    expanded.add(id);
  }
  if (!items.some(item => item.id === initialSelectedItemId && item.selectable && !item.disabled)) return '初始选中项必须引用可选择且启用的树项';
  if (initialExpandedIds.length > TREE_VIEW_MAX_ITEMS) return '初始展开项超过树项数量';
  return null;
}

export function treeChildren(items: readonly TreeItem[], parentId: string | null): TreeItem[] {
  return items.filter(item => item.parentId === parentId).slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function visibleTreeItems(items: readonly TreeItem[], expandedIds: readonly string[]): VisibleTreeItem[] {
  const expanded = new Set(expandedIds), result: VisibleTreeItem[] = [], stack: { item: TreeItem; depth: number; position: number; siblings: TreeItem[] }[] = [];
  const roots = treeChildren(items, null);
  for (let i = roots.length - 1; i >= 0; i--) stack.push({ item: roots[i], depth: 0, position: i + 1, siblings: roots });
  while (stack.length) {
    const entry = stack.pop()!, children = treeChildren(items, entry.item.id);
    result.push({ item: entry.item, depth: entry.depth, position: entry.position, setSize: entry.siblings.length, hasChildren: children.length > 0 });
    if (expanded.has(entry.item.id)) for (let i = children.length - 1; i >= 0; i--) stack.push({ item: children[i], depth: entry.depth + 1, position: i + 1, siblings: children });
  }
  return result;
}

export function treeDepth(itemId: string, items: readonly TreeItem[]): number {
  const byId = new Map(items.map(item => [item.id, item])); let depth = 0, parentId = byId.get(itemId)?.parentId ?? null; const seen = new Set([itemId]);
  while (parentId !== null) { if (seen.has(parentId)) return Number.POSITIVE_INFINITY; seen.add(parentId); depth++; parentId = byId.get(parentId)?.parentId ?? null; }
  return depth;
}

export function treeDescendantIds(itemId: string, items: readonly TreeItem[]): Set<string> {
  const result = new Set<string>(), queue = [itemId];
  while (queue.length) { const parent = queue.shift()!; for (const item of items) if (item.parentId === parent && !result.has(item.id)) { result.add(item.id); queue.push(item.id); } }
  return result;
}

export function eligibleTreeItem(item: TreeItem | undefined): boolean {
  return !!item && item.selectable && !item.disabled;
}

/** Keep initial references valid after an Inspector transaction edits a row or subtree. */
export function reconcileTreeViewProps<T extends { items: TreeItem[]; initialExpandedIds: string[]; initialSelectedItemId: string }>(props: T): T {
  const byId = new Map(props.items.map(item => [item.id, item]));
  const parentsWithChildren = new Set(props.items.flatMap(item => item.parentId === null ? [] : [item.parentId]));
  const initialExpandedIds = props.initialExpandedIds.filter(id => byId.has(id) && parentsWithChildren.has(id));
  let selected = byId.get(props.initialSelectedItemId);
  while (selected && !eligibleTreeItem(selected)) selected = selected.parentId ? byId.get(selected.parentId) : undefined;
  const initialSelectedItemId = selected?.id ?? props.items.find(eligibleTreeItem)?.id ?? '';
  return { ...props, initialExpandedIds, initialSelectedItemId };
}

export function treeFocusAfterCollapse(focusedId: string, collapsedId: string, items: readonly TreeItem[]): string {
  return focusedId === collapsedId || treeDescendantIds(collapsedId, items).has(focusedId) ? collapsedId : focusedId;
}

export function treeFocusAfterEdit(focusedId: string, items: readonly TreeItem[], expandedIds: readonly string[]): string {
  const byId = new Map(items.map(item => [item.id, item]));
  let item = byId.get(focusedId);
  if (item && eligibleTreeItem(item)) return focusedId;
  while (item?.parentId) {
    item = byId.get(item.parentId);
    if (item && eligibleTreeItem(item)) return item.id;
  }
  return visibleTreeItems(items, expandedIds).find(row => !row.item.disabled)?.item.id ?? visibleTreeItems(items, expandedIds)[0]?.item.id ?? '';
}

export function treeParentAllowed(itemId: string, parentId: string | null, items: readonly TreeItem[]): boolean {
  if (parentId === itemId || (parentId !== null && treeDescendantIds(itemId, items).has(parentId))) return false;
  if (parentId !== null && !items.some(item => item.id === parentId)) return false;
  const childDepth = treeDepth(itemId, items), parentDepth = parentId === null ? -1 : treeDepth(parentId, items);
  const subtreeDepth = Math.max(childDepth, ...[...treeDescendantIds(itemId, items)].map(id => treeDepth(id, items)));
  return parentDepth + 1 + (subtreeDepth - childDepth) < TREE_VIEW_MAX_DEPTH;
}

export function renumberTreeSiblings(items: TreeItem[], parentId: string | null): TreeItem[] {
  const siblings = treeChildren(items, parentId);
  const order = new Map(siblings.map((item, index) => [item.id, index]));
  return items.map(item => item.parentId === parentId ? { ...item, order: order.get(item.id)! } : item);
}

export const TREE_VIEW_RUNTIME_CONTRACT = {
  version: '1.1.0',
  authority: 'Each owner node contains stable item IDs, one parentId or null, unique sibling order, selectable/disabled flags, initialExpandedIds and one enabled selectable initialSelectedItemId. Reject duplicate IDs/orders, dangling parents, cycles and depth > 16 atomically. Deleting an item removes its full subtree and repairs initial selection to the nearest eligible ancestor, then first eligible item.',
  model: 'Tree items are internal data rows, not Screen nodes, Widgets or draggable editor layers. Child rows are derived from parentId and order; item ID is stable through rename, reorder and reparent.',
  runtime: 'expandedIds, selectedItemId, focusedItemId and scroll offset are PreviewSession/Screen-instance state; initialize from authority on every Screen open/restart and never write transient focus/scroll/selection into project JSON.',
  interaction: 'Visible rows are a depth-first flattening of currently expanded items. Pointer row activation moves focus and selects only selectable enabled items. Disclosure activation changes expansion only and does not change the confirmed selection or focused row while that row remains visible. If collapsing hides the focused row, focus moves to the collapsed ancestor. Hidden selection is retained and restored visually when its ancestors reopen. Up/Down moves focus among visible rows; Left collapses an expanded branch or moves to parent; Right expands a closed branch or moves to its first visible child; Enter/Space confirms only an enabled selectable item. Focus and selection are independent.',
  focus: 'Collapsing an ancestor of the focused row transfers focus to that ancestor; disclosure activation does not otherwise move focus. After a data edit, hidden/removed/disabled focus moves to nearest visible enabled ancestor, otherwise first visible row. Focus changes ensure the row is inside the viewport.',
  renderingDefaults: { rowHeightGuiPx: TREE_VIEW_ROW_HEIGHT, indentPerLevelGuiPx: TREE_VIEW_INDENT, labelInsetGuiPx: TREE_VIEW_LABEL_INSET, disclosureHitWidthGuiPx: TREE_VIEW_DISCLOSURE_WIDTH, labelFont: 'Minecraft default GUI Font; no external font resource', previewFont: 'selected browser preview family at 9 CSS px per GUI px', textShadow: false, colors: TREE_VIEW_COLORS, disclosure: { expanded: 'filled downward triangle', collapsed: 'filled right-pointing triangle', centerXInsetGuiPx: 9 }, scrollbar: { reservedWidthGuiPx: 8, trackWidthGuiPx: 4, thumbWidthGuiPx: 4, minThumbHeightGuiPx: 8 } },
  scroll: `Use an ObjectSelectionList-style fixed-height visible row list, clipped viewport, clamped vertical scroll and scrollbar. Minecraft wheel default is ${TREE_VIEW_WHEEL_STEP_GUI_PX} GUI px per notch; this is an implementation-contract default, not a JSON field. No virtualization; cap authority at 256 items and nesting depth at 16. Scroll consumes input inside the Tree View and does not zoom the Canvas.`,
  resize: 'On Screen resize, cancel pointer capture and rebuild Screen-instance state from authority: initial expansion, initial selection, focused initial selection and scroll offset zero. Do not preserve transient state across that rebuild.',
  narration: 'Expose tree/treeitem semantics including label, level, position/set size, selected, disabled and expanded state. Narrate state changes without treating focus movement as a selection event.',
  event: { type: 'tree-selection-change', fields: ['screenId', 'nodeId', 'itemId', 'phase', 'source'], phase: 'confirm', binding: 'unbound implementation intent; no F2 selection dataflow', suppress: ['disabled', 'unselectable', 'unchanged', 'focus-only', 'expand-only'] },
  minecraft: 'ObjectSelectionList supplies fixed-row scrolling, clipping, list hit routing, focus and narration entry points but is infrastructure, not a complete Tree View. Implement a custom subclass/controller for disclosure, indentation, parent navigation, stable item identity and separate active/focused/selected IDs. ContainerObjectSelectionList is for rows containing child widgets and is unnecessary for this static data tree.',
  evidence: ['docs/architecture/W0_WIDGET_CAPABILITY_AUDIT.md#E03-E06', 'AbstractSelectionList.java:48-130,165-231,252-375,524-553', 'ObjectSelectionList.java:15-72', 'ContainerObjectSelectionList.java:22-110,124-253'],
} as const;
