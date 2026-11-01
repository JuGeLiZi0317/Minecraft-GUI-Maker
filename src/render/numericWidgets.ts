import type { GuiNode } from '../domain/schema';
import { displayText } from '../domain/model';
import { formatNumber, numericFraction, type NumericState } from '../domain/numeric';
import { GUI_SPRITES, SLIDER_SPRITES } from '../resources/layered';
import type { DecodedSprite, SpriteRasterCache } from './spritePreview';
import { fitPreviewText } from './previewFont';

export type NumericNode = Extract<GuiNode, { type: 'minecraft:numeric-input' | 'minecraft:slider' }>;
export const isNumericNode = (node: GuiNode): node is NumericNode => node.type === 'minecraft:numeric-input' || node.type === 'minecraft:slider';
export function numericSpriteIds(node: NumericNode, hovered = false, focused = false) {
  return node.type === 'minecraft:numeric-input' ? node.props.bordered ? [focused ? GUI_SPRITES[4] : GUI_SPRITES[3]] : []
    : [SLIDER_SPRITES[0], hovered || focused ? SLIDER_SPRITES[3] : SLIDER_SPRITES[2]];
}
export function drawNumericWidget(ctx: CanvasRenderingContext2D, node: NumericNode, w: number, h: number, family: string,
  assets: Record<string, { sprite?: DecodedSprite; error?: string }>, cache: SpriteRasterCache,
  options: { state?: NumericState; hovered?: boolean; focused?: boolean; overlay?: boolean; resourceActive?: boolean } = {}) {
  const value = options.state?.value ?? node.props.initialValue, focused = options.state?.focused ?? options.focused ?? false;
  const ids = numericSpriteIds(node, options.hovered, focused);
  let missing = false;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); ctx.imageSmoothingEnabled = false;
  const raster = (id: string, x: number, width: number, fallback: string) => {
    const entry = assets[id];
    try { if (entry?.sprite) { ctx.drawImage(cache.get(id, entry.sprite, width, h), x, 0); return; } } catch { /* bounded neutral fallback */ }
    if (options.resourceActive) missing = true;
    ctx.fillStyle = fallback; ctx.fillRect(x, 0, width, h); ctx.strokeStyle = focused ? '#e0e0e0' : '#657587'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, .5, Math.max(0, width - 1), Math.max(0, h - 1));
  };
  if (node.type === 'minecraft:slider') {
    raster(ids[0], 0, w, '#151e2b');
    raster(ids[1], Math.floor(numericFraction(node.props, value) * (w - 8)), 8, options.hovered || focused ? '#d7e2ed' : '#7d91a5');
  } else if (ids.length) raster(ids[0], 0, w, '#080c12');
  if (!(options.overlay && node.type === 'minecraft:numeric-input')) {
    const text = node.type === 'minecraft:slider' ? node.props.showValue ? `${displayText(node.props.name)}: ${formatNumber(node.props, value)}${node.props.format.unit ? ' ' + node.props.format.unit : ''}` : '' : options.state?.draft ?? formatNumber(node.props, value);
    ctx.font = `9px ${family}`; ctx.textBaseline = 'middle'; ctx.textAlign = node.type === 'minecraft:slider' ? 'center' : 'left';
    const x = node.type === 'minecraft:slider' ? w / 2 : node.props.bordered ? 4 : 0;
    const fit = fitPreviewText(ctx, text, Math.max(0, w - 8));
    if (node.props.textShadow) { ctx.fillStyle = '#383838'; ctx.fillText(fit, x + 1, h / 2 + 1); }
    ctx.fillStyle = !node.state.enabled ? '#a0a0a0' : options.state?.error ? '#ff746e' : node.props.color ? '#' + node.props.color.slice(3) + node.props.color.slice(1, 3) : '#e0e0e0'; ctx.fillText(fit, x, h / 2);
  }
  if (missing) { ctx.fillStyle = '#ff746e'; ctx.font = '7px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('纹理不可用', 0, 0); }
  ctx.restore();
}
