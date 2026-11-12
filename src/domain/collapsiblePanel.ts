import type { Bounds, GuiNode } from './schema';
import { containerScrollOffset, contentSize, intersectBounds, isScrollablePanelNode, type ScrollOffsets } from './scrollablePanel';
import { isRepeatableListNode, repeatableContentSize, repeatableViewport } from './repeatableList';

export type CollapsiblePanelNode = Extract<GuiNode, { type: 'minecraft:collapsible-panel' }>;
export type ContainerNode = Extract<GuiNode, { type: 'minecraft:scrollable-panel' | 'minecraft:collapsible-panel' | 'minecraft:repeatable-list' }>;
export const isCollapsiblePanelNode = (node: GuiNode): node is CollapsiblePanelNode => node.type === 'minecraft:collapsible-panel';
export const isContainerNode = (node: GuiNode): node is ContainerNode => isScrollablePanelNode(node) || isCollapsiblePanelNode(node) || isRepeatableListNode(node);

export const COLLAPSIBLE_PANEL_RUNTIME_CONTRACT = {
  version: '1.1.0',
  resize: 'Screen resize cancels pointer capture and rebuilds the Screen-instance subtree from authoritative initial state. Reset expansion, child input/value drafts, focus, overlays and scroll; do not serialize transient state.',
  collapsedFocus: 'When collapse hides the focused descendant, transfer keyboard focus to the Collapsible Panel header toggle. Keep the header focused until the user navigates elsewhere.',
  headerLayout: { textInsetLeftGuiPx: 6, indicatorCenterInsetRightGuiPx: 9, expandedIndicator: '⌄', collapsedIndicator: '›', verticalAlignment: 'center', textShadow: false, gameFont: 'Minecraft default GUI Font; no external font resource' },
  nestedScrollableWheel: { defaultStepGuiPxPerNotch: 9, scope: 'game implementation default for a Scrollable Panel nested in a Collapsible Panel; editor Canvas wheel and browser-native scrolling are separate' },
} as const;

/** Editor expansion has its own defaults; runtime initialExpanded is never consulted. */
export function designPanelExpansion(nodes: readonly GuiNode[], saved: Readonly<Record<string, boolean>> = {}): Record<string, boolean> {
  return Object.fromEntries(nodes.filter(isCollapsiblePanelNode).map(node => [node.id, saved[node.id] ?? true]));
}

/** Expanded editor panels cover their sibling drawings and hit regions together. */
export function designSiblingOrder(nodes: readonly GuiNode[], expanded: Readonly<Record<string, boolean>>): GuiNode[] {
  const foreground = (node: GuiNode) => isCollapsiblePanelNode(node) && expanded[node.id] === true;
  return [...nodes.filter(node => !foreground(node)), ...nodes.filter(foreground)];
}

export function containerLocalViewport(container: ContainerNode, expanded = true): Bounds {
  if (isRepeatableListNode(container)) return { ...repeatableViewport(container), x: container.props.padding, y: container.props.padding };
  if (isScrollablePanelNode(container)) return { x: container.props.padding, y: container.props.padding, w: container.bounds.w - container.props.padding * 2 - 8, h: container.bounds.h - container.props.padding * 2 };
  return { x: 0, y: container.props.headerHeight, w: container.bounds.w, h: Math.max(0, (expanded ? container.bounds.h : container.props.headerHeight) - container.props.headerHeight) };
}

export function containerScreenViewport(container: ContainerNode, nodes: readonly GuiNode[], scrollOffsets: ScrollOffsets = {}, expanded: Readonly<Record<string, boolean>> = {}): Bounds {
  const origin = nodeAbsoluteBounds(container, nodes, scrollOffsets, expanded);
  const open = isCollapsiblePanelNode(container) ? (expanded[container.id] ?? container.props.initialExpanded) : true;
  const local = containerLocalViewport(container, open);
  return { ...local, x: origin.x + local.x, y: origin.y + local.y };
}

export function containerContentSize(container: ContainerNode, expanded: Readonly<Record<string, boolean>> = {}) {
  if (isRepeatableListNode(container)) return repeatableContentSize(container, 0);
  if (isScrollablePanelNode(container)) return contentSize(container);
  const open = expanded[container.id] ?? container.props.initialExpanded;
  const viewport = containerLocalViewport(container, open);
  return { width: viewport.w, height: viewport.h, viewportHeight: viewport.h, maxScroll: 0 };
}

export function containerChildScreenBounds(container: ContainerNode, child: GuiNode, nodes: readonly GuiNode[], scrollOffsets: ScrollOffsets = {}, expanded: Readonly<Record<string, boolean>> = {}): Bounds {
  const origin = nodeAbsoluteBounds(container, nodes, scrollOffsets, expanded);
  const open = isCollapsiblePanelNode(container) ? (expanded[container.id] ?? container.props.initialExpanded) : true;
  const viewport = containerLocalViewport(container, open);
  const scroll = isScrollablePanelNode(container) ? containerScrollOffset(container, scrollOffsets[container.id] ?? 0) : isRepeatableListNode(container) ? Math.max(0, Math.round(scrollOffsets[container.id] ?? 0)) : 0;
  return { x: origin.x + viewport.x + child.bounds.x, y: origin.y + viewport.y + child.bounds.y - scroll, w: child.bounds.w, h: child.bounds.h };
}

export function nodeAbsoluteBounds(node: GuiNode, nodes: readonly GuiNode[], scrollOffsets: ScrollOffsets = {}, expanded: Readonly<Record<string, boolean>> = {}): Bounds {
  return nodeAbsoluteBoundsSafe(node, nodes, scrollOffsets, expanded, new Set());
}

function nodeAbsoluteBoundsSafe(node: GuiNode, nodes: readonly GuiNode[], scrollOffsets: ScrollOffsets, expanded: Readonly<Record<string, boolean>>, seen: Set<string>): Bounds {
  if (seen.has(node.id)) return { ...node.bounds };
  seen.add(node.id);
  if (!node.parentContainerId) return { ...node.bounds };
  const parent = nodes.find(candidate => candidate.id === node.parentContainerId);
  if (!parent || !isContainerNode(parent)) return { ...node.bounds };
  const parentBounds = nodeAbsoluteBoundsSafe(parent, nodes, scrollOffsets, expanded, seen);
  const open = isCollapsiblePanelNode(parent) ? (expanded[parent.id] ?? parent.props.initialExpanded) : true;
  const viewport = containerLocalViewport(parent, open);
  const scroll = isScrollablePanelNode(parent) ? containerScrollOffset(parent, scrollOffsets[parent.id] ?? 0) : isRepeatableListNode(parent) ? Math.max(0, Math.round(scrollOffsets[parent.id] ?? 0)) : 0;
  return { x: parentBounds.x + viewport.x + node.bounds.x, y: parentBounds.y + viewport.y + node.bounds.y - scroll, w: node.bounds.w, h: node.bounds.h };
}

export function nodeVisibleBounds(node: GuiNode, nodes: readonly GuiNode[], scrollOffsets: ScrollOffsets = {}, expanded: Readonly<Record<string, boolean>> = {}): Bounds | null {
  const absolute = nodeAbsoluteBounds(node, nodes, scrollOffsets, expanded);
  if (!node.parentContainerId) return absolute;
  const parent = nodes.find(candidate => candidate.id === node.parentContainerId);
  if (!parent || !isContainerNode(parent) || !parent.state.visible || !nodeVisibleBounds(parent, nodes, scrollOffsets, expanded)) return null;
  if (isCollapsiblePanelNode(parent) && !(expanded[parent.id] ?? parent.props.initialExpanded)) return null;
  const outerClip = parent.parentContainerId ? nodeVisibleBounds(parent, nodes, scrollOffsets, expanded) : undefined;
  const origin = nodeAbsoluteBounds(parent, nodes, scrollOffsets, expanded);
  const parentExpanded = isCollapsiblePanelNode(parent) ? (expanded[parent.id] ?? parent.props.initialExpanded) : true;
  const viewport = containerLocalViewport(parent, parentExpanded);
  const clip = { ...viewport, x: origin.x + viewport.x, y: origin.y + viewport.y };
  const visible = intersectBounds(absolute, clip);
  return visible ? (outerClip ? intersectBounds(visible, outerClip) : visible) : null;
}

export function containerDepth(node: GuiNode, nodes: readonly GuiNode[]): number {
  let depth = 0, parentId = node.parentContainerId; const seen = new Set<string>([node.id]);
  while (parentId) { if (seen.has(parentId)) return Number.POSITIVE_INFINITY; seen.add(parentId); depth++; parentId = nodes.find(candidate => candidate.id === parentId)?.parentContainerId; }
  return depth;
}

export function allDescendants(containerId: string, nodes: readonly GuiNode[]): GuiNode[] {
  const result: GuiNode[] = [], queue = [containerId];
  while (queue.length) {
    const parent = queue.shift()!;
    for (const node of nodes) if (node.parentContainerId === parent) { result.push(node); if (isContainerNode(node)) queue.push(node.id); }
  }
  return result;
}

export function containerAncestorsEnabled(node: GuiNode, nodes: readonly GuiNode[]): boolean {
  let parentId = node.parentContainerId; const seen = new Set<string>();
  while (parentId) {
    if (seen.has(parentId)) return false; seen.add(parentId);
    const parent = nodes.find(candidate => candidate.id === parentId);
    if (!parent || !isContainerNode(parent) || !parent.state.visible || ('enabled' in parent.state && !parent.state.enabled)) return false;
    parentId = parent.parentContainerId;
  }
  return true;
}
