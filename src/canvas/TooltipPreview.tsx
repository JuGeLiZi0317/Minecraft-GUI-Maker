import { useEffect, useRef, useState } from 'react';
import type { GuiNode } from '../domain/schema';
import { tooltipHoverAtPoint, tooltipPreviewText, type TooltipHover } from '../domain/tooltip';

/**
 * Browser approximation of the native Minecraft tooltip. Hit regions come from the same clipped
 * geometry as the runtime preview; the tooltip box itself is not clipped by the source container.
 */
export function TooltipPreview({ enabled, nodes, expanded, scroll, isVisible, overlayOpen, origin, zoom, designSize, font }: {
  enabled: boolean; nodes: GuiNode[]; expanded: Readonly<Record<string, boolean>>; scroll: Readonly<Record<string, number>>;
  isVisible: (node: GuiNode) => boolean; overlayOpen: boolean; origin: { x: number; y: number }; zoom: number;
  designSize: { width: number; height: number }; font: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<TooltipHover | null>(null);
  const state = useRef({ nodes, expanded, scroll, isVisible, overlayOpen, origin, zoom });
  state.current = { nodes, expanded, scroll, isVisible, overlayOpen, origin, zoom };

  useEffect(() => { if (!enabled) setHover(null); }, [enabled]);
  useEffect(() => { setHover(null); }, [nodes, JSON.stringify(expanded), JSON.stringify(scroll), overlayOpen, origin.x, origin.y, zoom]);
  useEffect(() => {
    const host = root.current?.parentElement;
    if (!host || !enabled) return;
    const move = (event: PointerEvent) => {
      const current = state.current, rect = host.getBoundingClientRect();
      const point = { x: (event.clientX - rect.left - current.origin.x) / current.zoom, y: (event.clientY - rect.top - current.origin.y) / current.zoom };
      const next = tooltipHoverAtPoint(current.nodes, point, { expanded: current.expanded, scroll: current.scroll, isVisible: current.isVisible, overlayOpen: current.overlayOpen });
      setHover(previous => {
        if (!next) return previous ? null : previous;
        if (previous?.nodeId === next.nodeId && JSON.stringify(previous.tooltip) === JSON.stringify(next.tooltip)) return previous;
        return next;
      });
    };
    const leave = () => setHover(null);
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerleave', leave);
    host.addEventListener('pointercancel', leave);
    return () => { host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave); host.removeEventListener('pointercancel', leave); };
  }, [enabled]);

  if (!enabled || !hover) return <div ref={root} data-testid="runtime-tooltip" style={{ display: 'none' }}/>;
  const screenLeft = origin.x, screenTop = origin.y, screenRight = origin.x + designSize.width * zoom, screenBottom = origin.y + designSize.height * zoom;
  const maxWidth = Math.max(60, Math.min(220 * zoom, screenRight - screenLeft - 8));
  const left = Math.max(screenLeft + 4, Math.min(screenRight - maxWidth - 4, origin.x + (hover.hitBounds.x + hover.hitBounds.w) * zoom + 6));
  const below = origin.y + (hover.hitBounds.y + hover.hitBounds.h) * zoom + 4;
  const above = origin.y + hover.hitBounds.y * zoom - 4;
  const showAbove = below + 32 > screenBottom;
  const top = Math.max(screenTop + 4, Math.min(screenBottom - 8, showAbove ? above : below));
  return <div ref={root} className="runtime-tooltip" data-testid="runtime-tooltip" data-tooltip-node={hover.nodeId} role="tooltip"
    style={{ position: 'absolute', left, top, maxWidth, transform: showAbove ? 'translateY(-100%)' : undefined, zIndex: 60,
      padding: `${4 * zoom}px ${5 * zoom}px`, background: '#100010', border: `${Math.max(1, zoom)}px solid #2d0a63`, borderRadius: 0,
      color: '#ffffff', fontFamily: font, fontSize: Math.max(8, 9 * zoom), lineHeight: 1.4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', pointerEvents: 'none' }}>
    {tooltipPreviewText(hover.tooltip)}
    {hover.tooltip.kind === 'translate' && <small style={{ display: 'block', opacity: 0.65 }}>⟦{hover.tooltip.key}⟧</small>}
  </div>;
}
