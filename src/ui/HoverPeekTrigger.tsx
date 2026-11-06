import { useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { HOVER_RADIUS } from './hoverIntent';

/** The circle touches the studio's outside edge, leaving its ruler unobscured. */
export function HoverPeekTrigger({ anchor, visible, expanded, onToggle }: {
  anchor: RefObject<HTMLButtonElement | null>; visible: boolean; expanded: boolean; onToggle: () => void;
}) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (!visible) { setPosition(null); return; }
    const studio = document.querySelector('.studio'), canvas = document.querySelector('[data-testid="canvas-host"]');
    if (!studio || !canvas) { setPosition(null); return; }
    const update = () => {
      const edge = studio.getBoundingClientRect(), rect = canvas.getBoundingClientRect();
      const railButtons = [...document.querySelectorAll('.hybrid-rail button')];
      const controlsBottom = Math.max(rect.top, ...railButtons.map(button => button.getBoundingClientRect().bottom));
      const next = {
        x: edge.left - HOVER_RADIUS,
        // Low windows put rail controls near the canvas midpoint. Keep the
        // complete marker below them rather than covering another button.
        y: Math.min(rect.bottom - HOVER_RADIUS, Math.max(rect.top + rect.height / 2, controlsBottom + HOVER_RADIUS + 6)),
      };
      setPosition(old => old?.x === next.x && old.y === next.y ? old : next);
    };
    const observer = new ResizeObserver(update);
    observer.observe(studio); observer.observe(canvas);
    const workspace = studio.closest('.workspace'); if (workspace) observer.observe(workspace);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true); update();
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [visible]);
  if (!visible || !position) return null;
  return createPortal(<div className="hover-peek-marker" style={{ left: position.x, top: position.y, width: HOVER_RADIUS * 2, height: HOVER_RADIUS * 2 }} data-testid="hover-peek-marker">
    <button ref={anchor} type="button" data-testid="hover-peek-trigger" aria-label={expanded ? '收起 Hover Peek' : '展开 Hover Peek'} aria-expanded={expanded} title="悬停查看模块 · 点击或 Enter/Space 展开与收起" onClick={onToggle}>{expanded ? '‹' : '›'}</button>
  </div>, document.body);
}
