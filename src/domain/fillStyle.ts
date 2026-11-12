import type { GuiNode } from './schema';

export type FillStylePreset = 'plain' | 'framed' | 'bevel_raised' | 'bevel_inset';
export type FillPaintRect = { x: number; y: number; w: number; h: number; color: string };
type FillNode = Extract<GuiNode, { type: 'minecraft:fill' }>;

const DEFAULT_BORDER = '#FF202020';
const DEFAULT_HIGHLIGHT = '#FFFFFFFF';
const DEFAULT_SHADOW = '#FF555555';

export type FillEdgeSide = 'top' | 'right' | 'bottom' | 'left';
export type FillEdge = { color: string; width: number };
export type FillEdgeStyle = Record<FillEdgeSide, FillEdge>;

const EDGE_COLOR_KEYS = { top: 'edgeTopColor', right: 'edgeRightColor', bottom: 'edgeBottomColor', left: 'edgeLeftColor' } as const;
const EDGE_WIDTH_KEYS = { top: 'edgeTopWidth', right: 'edgeRightWidth', bottom: 'edgeBottomWidth', left: 'edgeLeftWidth' } as const;
const EDGE_KEYS = [...Object.values(EDGE_COLOR_KEYS), ...Object.values(EDGE_WIDTH_KEYS)];

export function fillStylePreset(node: FillNode): FillStylePreset {
  return node.props.stylePreset ?? 'plain';
}

/** True only when the user has explicitly saved at least one per-edge field. */
export function hasCustomFillEdges(node: FillNode): boolean {
  return EDGE_KEYS.some(key => key in node.props);
}

/** Missing colors/widths default to the fill color and 1 GUI px, without writing those defaults to JSON. */
export function fillEdgeStyle(node: FillNode): FillEdgeStyle {
  return {
    top: { color: node.props.edgeTopColor ?? node.props.color, width: node.props.edgeTopWidth ?? 1 },
    right: { color: node.props.edgeRightColor ?? node.props.color, width: node.props.edgeRightWidth ?? 1 },
    bottom: { color: node.props.edgeBottomColor ?? node.props.color, width: node.props.edgeBottomWidth ?? 1 },
    left: { color: node.props.edgeLeftColor ?? node.props.color, width: node.props.edgeLeftWidth ?? 1 },
  };
}

export function fillEdgeKey(side: FillEdgeSide, kind: 'color' | 'width'): string {
  return kind === 'color' ? EDGE_COLOR_KEYS[side] : EDGE_WIDTH_KEYS[side];
}

export function fillStyleSizeError(node: FillNode): string | null {
  const style = fillStylePreset(node), { w, h } = node.bounds;
  if (style === 'framed' && (w < 3 || h < 3)) return 'Framed Rectangle 至少需要 3×3 GUI px';
  if ((style === 'bevel_raised' || style === 'bevel_inset') && (w < 5 || h < 5)) return 'Minecraft Bevel 至少需要 5×5 GUI px';
  if (style === 'plain' && hasCustomFillEdges(node)) {
    const edges = fillEdgeStyle(node);
    if (edges.top.width + edges.bottom.width > h || edges.left.width + edges.right.width > w) return '纯色四边宽度之和不能超过矩形宽高；边框从外向内绘制';
  }
  return null;
}

export function fillStyleColors(node: FillNode) {
  return {
    borderColor: node.props.borderColor ?? DEFAULT_BORDER,
    highlightColor: node.props.highlightColor ?? DEFAULT_HIGHLIGHT,
    shadowColor: node.props.shadowColor ?? DEFAULT_SHADOW,
  };
}

/** Deterministic non-overlapping integer GUI-pixel fills, shared by Canvas, PNG and Bake. */
export function fillPaintRects(node: FillNode): FillPaintRect[] {
  const sizeError = fillStyleSizeError(node);
  if (sizeError) throw new Error(sizeError);
  const { w, h } = node.bounds, style = fillStylePreset(node);
  const rects: FillPaintRect[] = [{ x: 0, y: 0, w, h, color: node.props.color }];
  if (style === 'plain') {
    // Legacy plain rectangles stay one full fill; explicit edge fields opt into the four-strip contract.
    if (!hasCustomFillEdges(node)) return rects;
    const edges = fillEdgeStyle(node);
    if (edges.top.width > 0) rects.push({ x: 0, y: 0, w, h: edges.top.width, color: edges.top.color });
    if (edges.bottom.width > 0) rects.push({ x: 0, y: h - edges.bottom.width, w, h: edges.bottom.width, color: edges.bottom.color });
    if (edges.left.width > 0) rects.push({ x: 0, y: edges.top.width, w: edges.left.width, h: Math.max(0, h - edges.top.width - edges.bottom.width), color: edges.left.color });
    if (edges.right.width > 0) rects.push({ x: w - edges.right.width, y: edges.top.width, w: edges.right.width, h: Math.max(0, h - edges.top.width - edges.bottom.width), color: edges.right.color });
    return rects;
  }

  const { borderColor: border } = fillStyleColors(node);
  rects.push(
    { x: 0, y: 0, w, h: 1, color: border },
    { x: 0, y: h - 1, w, h: 1, color: border },
    { x: 0, y: 1, w: 1, h: h - 2, color: border },
    { x: w - 1, y: 1, w: 1, h: h - 2, color: border },
  );
  if (style === 'framed') return rects;

  const raised = style === 'bevel_raised';
  const { highlightColor: light, shadowColor: dark } = fillStyleColors(node);
  const topLeft = raised ? light : dark, bottomRight = raised ? dark : light;
  rects.push(
    { x: 1, y: 1, w: w - 2, h: 1, color: topLeft },
    { x: 1, y: 2, w: 1, h: h - 4, color: topLeft },
    { x: 1, y: h - 2, w: w - 2, h: 1, color: bottomRight },
    { x: w - 2, y: 2, w: 1, h: h - 4, color: bottomRight },
  );
  return rects;
}

export function drawFillStyle(ctx: CanvasRenderingContext2D, node: FillNode): void {
  for (const rect of fillPaintRects(node)) {
    const color = rect.color;
    ctx.fillStyle = `rgba(${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${parseInt(color.slice(7, 9), 16)},${parseInt(color.slice(1, 3), 16) / 255})`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
}

/**
 * Native 1.21.1 GuiGraphics exposes fill(...) and renderOutline(x,y,w,h,color):
 * renderOutline is a single 1px color and has no per-edge color/width parameter.
 * Four differently colored/wide edges are therefore a custom four-fill composition.
 */
export const RECTANGLE_EDGE_BORDER_CONTRACT = {
  version: '1.0.0',
  nativeSupport: false,
  nativeEvidence: 'GuiGraphics.fill(int,int,int,int,int) and GuiGraphics.renderOutline(int,int,int,int,int); renderOutline is one color and one GUI px, with no per-edge parameters',
  implementation: 'four node-local GuiGraphics.fill calls: top, bottom, then left/right between top/bottom; widths grow inward from the node bounds',
  recommendation: 'For exact pixel parity, reuse or bake the four-strip composition into a Static Bake/PNG asset; do not assume a native per-edge border API.',
  geometry: {
    top: 'y=0, height=topWidth',
    bottom: 'y=h-bottomWidth, height=bottomWidth',
    left: 'x=0, y=topWidth, width=leftWidth, height=h-topWidth-bottomWidth',
    right: 'x=w-rightWidth, y=topWidth, width=rightWidth, height=h-topWidth-bottomWidth',
  },
  defaults: 'missing edge color = fill color; missing edge width = 1 GUI px; legacy plain without edge fields remains one full fill',
  authority: 'design intent; the Agent Specification must not claim native per-edge support',
} as const;
