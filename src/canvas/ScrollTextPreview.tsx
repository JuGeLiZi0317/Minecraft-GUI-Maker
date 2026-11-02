import { useLayoutEffect, useMemo } from 'react';
import type { GuiNode } from '../domain/schema';
import { displayText } from '../domain/model';
import { scrollTextLayout } from '../render/scrollText';

export function ScrollTextPreview({ nodes, origin, zoom, family, resetKey }: { nodes: Extract<GuiNode, { type: 'minecraft:fitting-multi-line-text-widget' }>[]; origin: { x: number; y: number }; zoom: number; family: string; resetKey: number }) {
  const measure = useMemo(() => { const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'); if (!ctx) return (_text: string) => 0; ctx.font = `9px ${family}`; return (text: string) => ctx.measureText(text).width; }, [family]);
  useLayoutEffect(() => {
    const reset = () => document.querySelectorAll<HTMLElement>('.scroll-text-preview').forEach(element => { element.scrollTop = 0; if (document.activeElement === element) element.blur(); });
    reset(); return reset;
  }, [resetKey]);
  return <div className="scroll-text-preview-layer" aria-label="只读滚动文本预览">
    {nodes.map(node => {
      const layout = scrollTextLayout(node, measure), { x, y, w, h } = node.bounds;
      return <div key={`${resetKey}:${node.id}`} className={`scroll-text-preview ${layout.overflow ? 'is-overflowing' : ''}`} data-node-id={node.id}
        role="region" aria-label={`${node.id} 只读滚动文本区域`} tabIndex={0}
        ref={element => { if (element) element.scrollTop = 0; }}
        onWheelCapture={event => { event.stopPropagation(); }}
        style={{ left: origin.x + x * zoom, top: origin.y + y * zoom, width: w * zoom, height: h * zoom, fontFamily: family, fontSize: 9 * zoom,
          lineHeight: `${9 * zoom}px`, color: `rgba(${parseInt(node.props.color.slice(3, 5), 16)},${parseInt(node.props.color.slice(5, 7), 16)},${parseInt(node.props.color.slice(7, 9), 16)},${parseInt(node.props.color.slice(1, 3), 16) / 255})`,
          padding: layout.overflow ? 4 * zoom : 0, textShadow: (node.props.textShadow ?? true) ? `${zoom}px ${zoom}px #383838` : 'none' }}>
        {displayText(node.props.text)}
      </div>;
    })}
  </div>;
}
