import type { Bounds, GuiNode, TextSpec } from './schema';
import { intersectBounds } from './scrollablePanel';
import { isCollapsiblePanelNode, isContainerNode, nodeAbsoluteBounds, nodeVisibleBounds } from './collapsiblePanel';
import { isRepeatableListNode } from './repeatableList';

export const TOOLTIP_MAX_TEXT = 1024;
export const TOOLTIP_MAX_KEY = 256;
const TOOLTIP_KEY = /^[A-Za-z0-9_.-]+$/;

export type TooltipAccess = 'native-abstract-widget' | 'native-abstract-widget-or-custom-draw' | 'native-composite-children' | 'custom-trigger' | 'custom-draw' | 'custom-composite';
export type TooltipHitRegion = 'whole-bounds' | 'visible-bounds' | 'header-only' | 'trigger-bounds' | 'visible-viewport';

/** Audited support matrix: only nodes with a reliable hover hit target expose props.tooltip. */
export const TOOLTIP_SUPPORT = {
  'minecraft:button': { access: 'native-abstract-widget', hit: 'whole-bounds', source: 'AbstractWidget.setTooltip + WidgetTooltipHolder' },
  'minecraft:checkbox': { access: 'native-abstract-widget', hit: 'whole-bounds', source: 'Checkbox extends AbstractButton; builder tooltip' },
  'minecraft:cycle-button': { access: 'native-abstract-widget', hit: 'whole-bounds', source: 'CycleButton extends AbstractButton; builder tooltip supplier' },
  'minecraft:slider': { access: 'native-abstract-widget', hit: 'whole-bounds', source: 'AbstractSliderButton extends AbstractWidget' },
  'minecraft:edit-box': { access: 'native-abstract-widget', hit: 'whole-bounds', source: 'EditBox extends AbstractWidget' },
  'minecraft:numeric-input': { access: 'native-abstract-widget', hit: 'whole-bounds', source: 'EditBox subclass with numeric adapter; same setTooltip path' },
  'minecraft:image': { access: 'native-abstract-widget-or-custom-draw', hit: 'whole-bounds', source: 'ImageWidget extends AbstractWidget and retains WidgetTooltipHolder; texture()/sprite() share the native render tooltip path. Embedded PNG is a Screen custom draw, so the implementer must provide the same hit + GuiGraphics.renderTooltip behavior explicitly.' },
  'minecraft:radio-group': { access: 'native-composite-children', hit: 'whole-bounds', source: 'custom AbstractButton children; apply the same tooltip to each option child' },
  'minecraft:dropdown': { access: 'custom-trigger', hit: 'trigger-bounds', source: 'custom AbstractWidget trigger; suppress while the root-level overlay is open' },
  'minecraft:tree-view': { access: 'custom-draw', hit: 'visible-viewport', source: 'custom draw; call GuiGraphics.renderTooltip for the visible clipped viewport' },
  'minecraft:scrollable-panel': { access: 'custom-composite', hit: 'visible-bounds', source: 'custom Screen composite; render on the panel background, clipped child regions excluded from the tooltip hit separately' },
  'minecraft:collapsible-panel': { access: 'custom-composite', hit: 'header-only', source: 'custom Screen composite; only the header toggle is an explicit hit target' },
} as const;

export type TooltipNodeType = keyof typeof TOOLTIP_SUPPORT;
export type TooltipNode = Extract<GuiNode, { type: TooltipNodeType }>;

export const supportsTooltip = (node: GuiNode): node is TooltipNode => node.type in TOOLTIP_SUPPORT;
export type TooltipDelivery = 'native-abstract-widget' | 'native-image-widget' | 'custom-draw' | 'custom-trigger' | 'custom-composite' | 'native-composite-children';
/** Per-node delivery is deliberately explicit: embedded images must not be mistaken for ImageWidget. */
export function tooltipDelivery(node: GuiNode): TooltipDelivery {
  if (node.type === 'minecraft:image') return node.props.kind === 'embedded' ? 'custom-draw' : 'native-image-widget';
  const supported = node as TooltipNode;
  return TOOLTIP_SUPPORT[supported.type]?.access === 'native-abstract-widget-or-custom-draw' ? 'custom-draw' : TOOLTIP_SUPPORT[supported.type]?.access as TooltipDelivery;
}
export const tooltipOf = (node: GuiNode): TextSpec | undefined => supportsTooltip(node) ? node.props.tooltip : undefined;

/** Empty literal is legal legacy data but renders no tooltip. */
export function activeTooltip(node: GuiNode): TextSpec | null {
  const tooltip = tooltipOf(node);
  if (!tooltip) return null;
  return tooltip.kind === 'literal' && !tooltip.value.trim() ? null : tooltip;
}

export function tooltipError(text: TextSpec | undefined): string | null {
  if (!text) return null;
  if (text.kind === 'literal') return text.value.length > TOOLTIP_MAX_TEXT ? `Tooltip 文本最多 ${TOOLTIP_MAX_TEXT} 个字符` : null;
  if (text.key.length > TOOLTIP_MAX_KEY || !TOOLTIP_KEY.test(text.key)) return 'Tooltip 翻译键只能包含字母、数字、点、下划线或连字符（1–256 字符）';
  if (text.fallback.length > TOOLTIP_MAX_TEXT) return `Tooltip fallback 最多 ${TOOLTIP_MAX_TEXT} 个字符`;
  return null;
}

/** Browser preview approximation. The game resolves translate keys through language files. */
export function tooltipPreviewText(text: TextSpec): string {
  return text.kind === 'literal' ? text.value : (text.fallback || `⟦${text.key}⟧`);
}

export type TooltipHover = { nodeId: string; tooltip: TextSpec; hitBounds: Bounds; access: string; hit: TooltipHitRegion };

const DECORATIVE = new Set<GuiNode['type']>([
  'minecraft:fill', 'minecraft:string-widget', 'minecraft:status-indicator',
  'minecraft:progress-bar', 'minecraft:multi-line-text-widget', 'minecraft:fitting-multi-line-text-widget',
]);

/** Children paint after their container; reverse document order approximates topmost hit routing. */
function drawOrder(nodes: readonly GuiNode[], expanded: Readonly<Record<string, boolean>>): GuiNode[] {
  const result: GuiNode[] = [];
  const visit = (parentId: string | undefined) => {
    for (const node of nodes.filter(item => item.parentContainerId === parentId)) {
      result.push(node);
      if (isContainerNode(node)) {
        const open = isRepeatableListNode(node) ? false : node.type === 'minecraft:scrollable-panel' ? true : (expanded[node.id] ?? node.props.initialExpanded);
        if (open) visit(node.id);
      }
    }
  };
  visit(undefined);
  return result;
}

export function tooltipHitBounds(node: GuiNode, nodes: readonly GuiNode[], expanded: Readonly<Record<string, boolean>>, scroll: Readonly<Record<string, number>>): Bounds | null {
  const visible = nodeVisibleBounds(node, nodes, scroll, expanded);
  if (!visible) return null;
  if (isCollapsiblePanelNode(node)) return intersectBounds(visible, { ...nodeAbsoluteBounds(node, nodes, scroll, expanded), h: node.props.headerHeight });
  return visible;
}

/**
 * Resolve the topmost non-decorative node under a GUI-space point. Native Region and other
 * non-tooltip controls block a lower container tooltip instead of being treated as transparent.
 */
export function tooltipHoverAtPoint(
  nodes: readonly GuiNode[],
  point: { x: number; y: number },
  options: {
    expanded: Readonly<Record<string, boolean>>;
    scroll?: Readonly<Record<string, number>>;
    isVisible: (node: GuiNode) => boolean;
    overlayOpen?: boolean;
  },
): TooltipHover | null {
  if (options.overlayOpen) return null;
  const scroll = options.scroll ?? {};
  for (const node of drawOrder(nodes, options.expanded).reverse()) {
    if (DECORATIVE.has(node.type) || !options.isVisible(node)) continue;
    if ('enabled' in node.state && !node.state.enabled) continue;
    const bounds = tooltipHitBounds(node, nodes, options.expanded, scroll);
    if (!bounds || point.x < bounds.x || point.y < bounds.y || point.x >= bounds.x + bounds.w || point.y >= bounds.y + bounds.h) continue;
    // Native Region owns real Slot/ItemStack tooltips; a static design tooltip must never replace it.
    if (!supportsTooltip(node)) return null;
    const tooltip = activeTooltip(node);
    return tooltip ? { nodeId: node.id, tooltip, hitBounds: bounds, access: TOOLTIP_SUPPORT[node.type].access, hit: TOOLTIP_SUPPORT[node.type].hit } : null;
  }
  return null;
}

export const TOOLTIP_CONTRACT = {
  version: '1.1.0',
  field: 'optional props.tooltip TextSpec on the audited TooltipNodeType set; absent means no tooltip and preserves legacy behavior',
  text: {
    literal: 'Literal TextSpec value; empty or whitespace-only is legal legacy data but renders nothing; newlines are preserved',
    translate: 'Translate TextSpec key + fallback; key is stable and resolved by Minecraft language files; fallback is browser preview only',
    limits: { maxText: TOOLTIP_MAX_TEXT, maxKey: TOOLTIP_MAX_KEY, keyPattern: '^[A-Za-z0-9_.-]+$', newline: '\\n allowed; no HTML or style markup' },
  },
  target: 'nodeId is the stable control ID; v1 supports one control-level tooltip, not per-option or per-tree-row tooltips',
  visibility: 'show only while the node, its enabled ancestors and the active Page are visible; disabled or hidden nodes show none; the root-level Dropdown overlay suppresses control tooltips while open',
  hitRegions: Object.fromEntries(Object.entries(TOOLTIP_SUPPORT).map(([type, value]) => [type, { access: value.access, hit: value.hit, source: value.source }])),
  rendering: 'prefer the native AbstractWidget tooltip path; custom composites call the Minecraft Tooltip/GuiGraphics tooltip path. Do not implement a new tooltip style engine',
  clipping: 'compute hit regions from the clipped visible bounds; the tooltip box may overflow the source container clip but must stay inside the Screen design area',
  lifecycle: 'hover and overlay state are Screen-instance/session state; never serialized into authority JSON and never trigger F2',
  itemStack: 'Native Region and real Slot/ItemStack tooltips stay owned by Minecraft/Menu item mechanics; a static tooltip never overrides them',
  imageDelivery: {
    texture: { native: true, api: 'ImageWidget.setTooltip', source: 'ImageWidget.texture -> ImageWidget extends AbstractWidget' },
    sprite: { native: true, api: 'ImageWidget.setTooltip', source: 'ImageWidget.sprite -> ImageWidget extends AbstractWidget' },
    embedded: { native: false, delivery: 'custom-draw', api: 'register image bounds as a hover target; call GuiGraphics.renderTooltip / Screen tooltip path explicitly', reason: 'embedded PNG has no ResourceLocation and is not a vanilla ImageWidget' },
  },
  image: 'Texture and GUI Sprite reuse ImageWidget (extends AbstractWidget) and setTooltip; render() refreshes WidgetTooltipHolder even though ImageWidget.isActive() is false. Embedded PNG is a Screen custom draw, not a vanilla ImageWidget: the implementation must register the image bounds as a hit target and call the same GuiGraphics/Screen tooltip path explicitly.',
} as const;
