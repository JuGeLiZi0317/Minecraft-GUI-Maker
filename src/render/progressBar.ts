import type { ProgressNode } from '../domain/progress';
import { progressFraction, progressGeometry } from '../domain/progress';

const cssColor = (argb: string) => `rgba(${parseInt(argb.slice(3, 5), 16)},${parseInt(argb.slice(5, 7), 16)},${parseInt(argb.slice(7, 9), 16)},${parseInt(argb.slice(1, 3), 16) / 255})`;
export function progressText(node: ProgressNode, currentValue = node.props.initialValue) {
  if (node.props.display === 'none') return '';
  if (node.props.display === 'value') return String(currentValue);
  return `${Math.round(progressFraction(node.props, currentValue) * 100)}%`;
}

/** Shared deterministic renderer for Canvas and every design PNG export. */
export function drawProgressBar(ctx: CanvasRenderingContext2D, node: ProgressNode, w: number, h: number, family: string, currentValue = node.props.initialValue) {
  const p = node.props, border = p.border ? Math.min(p.borderThickness, Math.floor(w / 2), Math.floor(h / 2)) : 0;
  const { ix, iy, iw, ih, fx, fy, fw, fh } = progressGeometry(w, h, progressFraction(p, currentValue), p.direction, border);
  ctx.save();
  ctx.fillStyle = cssColor(p.backgroundColor); ctx.fillRect(0, 0, w, h);
  if (p.border && p.borderThickness > 0) { ctx.fillStyle = cssColor(p.borderColor); ctx.fillRect(0, 0, w, h); ctx.fillStyle = cssColor(p.backgroundColor); ctx.fillRect(ix, iy, iw, ih); }
  ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip(); ctx.fillStyle = cssColor(p.foregroundColor); ctx.fillRect(fx, fy, fw, fh); ctx.restore();
  const text = progressText(node, currentValue);
  if (text) {
    ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip(); ctx.font = `9px ${family}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (p.textShadow) { ctx.fillStyle = '#383838'; ctx.fillText(text, w / 2 + 1, h / 2 + 1); }
    ctx.fillStyle = cssColor(p.color); ctx.fillText(text, w / 2, h / 2); ctx.restore();
  }
  ctx.restore();
}
