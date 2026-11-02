import { statusLabel, type StatusNode } from '../domain/statusIndicator';
import { fitPreviewText } from './previewFont';

const cssColor = (argb: string) => `rgba(${parseInt(argb.slice(3, 5), 16)},${parseInt(argb.slice(5, 7), 16)},${parseInt(argb.slice(7, 9), 16)},${parseInt(argb.slice(1, 3), 16) / 255})`;
export function statusIndicatorGeometry(w: number, h: number) {
  const size = Math.max(1, Math.min(10, w, h));
  return { size, y: Math.floor((h - size) / 2), textX: Math.min(w, size + 4), textWidth: Math.max(0, w - size - 4) };
}
export function circleRowSpans(size: number) {
  const radius = size / 2, center = (size - 1) / 2;
  return Array.from({ length: size }, (_, y) => {
    const dy = y - center, extent = Math.sqrt(Math.max(0, radius * radius - dy * dy));
    const x = Math.max(0, Math.ceil(center - extent)), right = Math.min(size, Math.floor(center + extent) + 1);
    return { x, y, width: Math.max(0, right - x) };
  });
}
export function drawStatusIndicator(ctx: CanvasRenderingContext2D, node: StatusNode, w: number, h: number, family: string, statusId = node.props.initialStatusId) {
  const status = node.props.statuses.find(item => item.statusId === statusId) ?? node.props.statuses.find(item => item.statusId === node.props.initialStatusId)!;
  const { size, y, textX, textWidth } = statusIndicatorGeometry(w, h);
  ctx.save(); ctx.fillStyle = cssColor(status.color);
  if (node.props.shape === 'square') ctx.fillRect(0, y, size, size);
  else for (const span of circleRowSpans(size)) if (span.width) ctx.fillRect(span.x, y + span.y, span.width, 1);
  if (node.props.showLabel && textWidth > 0) {
    const label = statusLabel(status); ctx.save(); ctx.beginPath(); ctx.rect(textX, 0, textWidth, h); ctx.clip();
    ctx.font = `9px ${family}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const text = fitPreviewText(ctx, label, textWidth);
    if (node.props.textShadow) { ctx.fillStyle = '#383838'; ctx.fillText(text, textX + 1, Math.floor(h / 2) + 1); }
    ctx.fillStyle = cssColor(node.props.color); ctx.fillText(text, textX, Math.floor(h / 2)); ctx.restore();
  }
  ctx.restore();
}
