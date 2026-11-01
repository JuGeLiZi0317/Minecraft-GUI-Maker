import { displayText } from '../domain/model';
import type { SelectionNode } from '../domain/selection';

export function selectionCell(node: SelectionNode, index: number, w = node.bounds.w, h = node.bounds.h) {
  const horizontal = node.type === 'minecraft:radio-group' && node.props.orientation === 'horizontal';
  const count = node.props.options.length;
  return horizontal ? { x: Math.floor(index * w / count), y: 0, w: Math.floor((index + 1) * w / count) - Math.floor(index * w / count), h } : { x: 0, y: Math.floor(index * h / count), w, h: Math.floor((index + 1) * h / count) - Math.floor(index * h / count) };
}
/** Same deterministic closed/initial drawing in editor, live preview and PNG. Custom API composite visuals. */
export function drawSelectionWidget(ctx: CanvasRenderingContext2D, node: SelectionNode, w: number, h: number, family: string, selected = node.props.initialSelectedOptionId) {
  ctx.save(); ctx.font = `9px ${family}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const label = (text: string, x: number, y: number, width: number, disabled: boolean) => {
    ctx.save(); ctx.beginPath(); ctx.rect(x, 0, Math.max(0, width), h); ctx.clip();
    ctx.fillStyle = disabled ? '#888888' : '#' + node.props.color.slice(3) + node.props.color.slice(1, 3);
    if (node.props.textShadow) { ctx.shadowColor = '#383838'; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1; }
    ctx.fillText(text, x, y); ctx.restore();
  };
  if (node.type === 'minecraft:dropdown') {
    ctx.fillStyle = '#b0b0b0'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#555555'; ctx.strokeRect(.5, .5, w - 1, h - 1);
    label(displayText(node.props.options.find(o => o.id === selected)!.label), 4, h / 2, w - 20, !node.state.enabled);
    ctx.fillStyle = '#404040'; ctx.beginPath(); ctx.moveTo(w - 12, h / 2 - 2); ctx.lineTo(w - 4, h / 2 - 2); ctx.lineTo(w - 8, h / 2 + 2); ctx.fill();
  } else node.props.options.forEach((option, index) => {
    const cell = selectionCell(node, index, w, h), disabled = !node.state.enabled || option.disabled;
    ctx.save(); ctx.beginPath(); ctx.rect(cell.x, cell.y, cell.w, cell.h); ctx.clip();
    ctx.fillStyle = '#b0b0b0'; ctx.strokeStyle = disabled ? '#777777' : '#404040'; ctx.beginPath(); ctx.arc(cell.x + 8, cell.y + cell.h / 2, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (option.id === selected) { ctx.fillStyle = disabled ? '#777777' : '#303030'; ctx.beginPath(); ctx.arc(cell.x + 8, cell.y + cell.h / 2, 2.5, 0, Math.PI * 2); ctx.fill(); }
    label(displayText(option.label), cell.x + 18, cell.y + cell.h / 2, cell.w - 20, disabled); ctx.restore();
  });
  ctx.restore();
}
