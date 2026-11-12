import type { Bounds, GuiNode } from './schema';

export const CONTAINER_PADDING_MAX = 16;
export const CONTAINER_SCROLLBAR_WIDTH = 6;
export const CONTAINER_SCROLLBAR_GAP = 2;
export const CONTAINER_SCROLLBAR_GUTTER = CONTAINER_SCROLLBAR_WIDTH + CONTAINER_SCROLLBAR_GAP;
export const SCROLLABLE_CHILD_TYPES = [
  'minecraft:button', 'minecraft:edit-box', 'minecraft:numeric-input', 'minecraft:slider',
  'minecraft:checkbox', 'minecraft:radio-group', 'minecraft:dropdown', 'minecraft:string-widget', 'minecraft:multi-line-text-widget',
  'minecraft:image', 'minecraft:fill', 'minecraft:status-indicator', 'minecraft:progress-bar', 'minecraft:cycle-button',
] as const;

export type ScrollablePanelNode = Extract<GuiNode, { type: 'minecraft:scrollable-panel' }>;
export type ScrollableChildNode = Extract<GuiNode, { type: typeof SCROLLABLE_CHILD_TYPES[number] }>;
export type ScrollOffsets = Readonly<Record<string, number>>;
export type ContainerDrop = { parentContainerId: string; scrollOffsets: ScrollOffsets; appendAtEnd?: boolean };

export function isScrollablePanelNode(node: GuiNode): node is ScrollablePanelNode {
  return node.type === 'minecraft:scrollable-panel';
}

/** Human-readable reason for a rejected Scrollable/Collapsible child. */
export function scrollableChildRejection(type: GuiNode['type']): string | null {
  if (isScrollableChildType(type)) return null;
  if (type === 'native_region') return '36 格 Native Region 需要稳定的真实 Menu Slot 集合，不能放入可滚动/可折叠内容';
  if (type === 'minecraft:single_slot') return 'Single Slot 当前仅支持 Screen 根级或 Row Template（仅 visual_only）；可滚动/折叠容器暂不支持';
  if (type === 'minecraft:creative-tab') return 'CreativeTab/Page Group 是页面结构，不能放入普通容器';
  if (type === 'minecraft:tree-view') return 'Tree View 拥有独立滚动与焦点，不能嵌套进当前容器';
  if (type === 'minecraft:repeatable-list') return 'Repeatable List 首版仅支持 Screen 根级';
  if (type === 'minecraft:scrollable-panel' || type === 'minecraft:collapsible-panel') return '嵌套容器只允许 Scrollable Panel 与 Collapsible Panel 交叉一层';
  return `${type} 暂不支持作为容器内容`;
}
export function isScrollableChildType(type: GuiNode['type']): type is ScrollableChildNode['type'] {
  return (SCROLLABLE_CHILD_TYPES as readonly string[]).includes(type);
}

export function contentViewport(container: ScrollablePanelNode) {
  const { x, y, w, h } = container.bounds, padding = container.props.padding;
  return { x: x + padding, y: y + padding, w: w - padding * 2 - CONTAINER_SCROLLBAR_GUTTER, h: h - padding * 2 };
}

export function contentSize(container: ScrollablePanelNode) {
  const viewport = contentViewport(container);
  return { width: viewport.w, height: container.props.contentHeight, viewportHeight: viewport.h,
    maxScroll: Math.max(0, container.props.contentHeight - viewport.h) };
}

export function containerChildRect(container: ScrollablePanelNode, child: GuiNode, scrollOffset = 0): Bounds {
  const viewport = contentViewport(container);
  return { x: viewport.x + child.bounds.x, y: viewport.y + child.bounds.y - scrollOffset, w: child.bounds.w, h: child.bounds.h };
}

export function containerScrollOffset(container: ScrollablePanelNode, value: number): number {
  const { maxScroll } = contentSize(container);
  return Math.max(0, Math.min(maxScroll, Math.round(Number.isFinite(value) ? value : 0)));
}

export function intersectBounds(a: Bounds, b: Bounds): Bounds | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), right = Math.min(a.x + a.w, b.x + b.w), bottom = Math.min(a.y + a.h, b.y + b.h);
  return right <= x || bottom <= y ? null : { x, y, w: right - x, h: bottom - y };
}

export function nodeAbsoluteBounds(node: GuiNode, nodes: readonly GuiNode[], scrollOffsets: ScrollOffsets = {}): Bounds {
  if (!node.parentContainerId) return { ...node.bounds };
  const container = nodes.find(candidate => candidate.id === node.parentContainerId);
  if (!container || !isScrollablePanelNode(container)) return { ...node.bounds };
  const viewport = contentViewport(container);
  return { x: viewport.x + node.bounds.x, y: viewport.y + node.bounds.y - containerScrollOffset(container, scrollOffsets[container.id] ?? 0), w: node.bounds.w, h: node.bounds.h };
}

export function nodeVisibleBounds(node: GuiNode, nodes: readonly GuiNode[], scrollOffsets: Readonly<Record<string, number>> = {}): Bounds | null {
  if (!node.parentContainerId) return { ...node.bounds };
  const container = nodes.find(candidate => candidate.id === node.parentContainerId);
  if (!container || !isScrollablePanelNode(container) || !container.state.visible) return null;
  const viewport = contentViewport(container), offset = containerScrollOffset(container, scrollOffsets[container.id] ?? 0);
  return intersectBounds({ ...node.bounds, x: viewport.x + node.bounds.x, y: viewport.y + node.bounds.y - offset }, viewport);
}

export function nodeToContainerBounds(node: GuiNode, container: ScrollablePanelNode, nodes: readonly GuiNode[], scrollOffsets: ScrollOffsets = {}): Bounds {
  const absolute = nodeAbsoluteBounds(node, nodes, scrollOffsets), viewport = contentViewport(container);
  return { ...absolute, x: absolute.x - viewport.x, y: absolute.y - viewport.y + containerScrollOffset(container, scrollOffsets[container.id] ?? 0) };
}

export function nodeToScreenBounds(node: GuiNode, nodes: readonly GuiNode[]): Bounds {
  return nodeAbsoluteBounds(node, nodes);
}
