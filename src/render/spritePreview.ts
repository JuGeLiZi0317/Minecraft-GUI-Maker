import type { Scaling } from '../resources/layered';
import { CHECKBOX_SPRITES, GUI_SPRITES } from '../resources/layered';
import type { GuiNode } from '../domain/schema';

export type DecodedSprite = { image: ImageBitmap; scaling: Scaling };
export function spriteForNode(node: GuiNode, hovered = false, focused = false): string | null {
  if (node.type === 'minecraft:numeric-input') return node.props.bordered ? focused ? GUI_SPRITES[4] : GUI_SPRITES[3] : null;
  if (node.type === 'minecraft:slider') return 'minecraft:widget/slider';
  if (node.type === 'minecraft:creative-tab') return `minecraft:container/creative_inventory/tab_top_${node.props.selected ? 'selected' : 'unselected'}_${node.props.column}`;
  if (node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button') return !node.state.enabled ? GUI_SPRITES[2] : hovered || focused ? GUI_SPRITES[1] : GUI_SPRITES[0];
  if (node.type === 'minecraft:checkbox') return CHECKBOX_SPRITES[(node.props.selected ? 2 : 0) + (focused ? 1 : 0)];
  if (node.type === 'minecraft:edit-box' && node.props.bordered) return focused ? GUI_SPRITES[4] : GUI_SPRITES[3];
  return null;
}
/** Logical-pixel rasterization keeps the transformed canvas from antialiasing each slice separately. */
export function rasterSprite(sprite: DecodedSprite, width: number, height: number): HTMLCanvasElement {
  if (width > 4096 || height > 4096 || width * height > 4_194_304) throw new Error('组件尺寸超过纹理预览预算');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('无法创建纹理预览画布');
  ctx.imageSmoothingEnabled = false;
  const image = sprite.image, s = sprite.scaling;
  if (s.type === 'stretch') { ctx.drawImage(image, 0, 0, width, height); return canvas; }
  const sw = s.width, sh = s.height, scaleX = image.width / sw, scaleY = image.height / sh;
  let operations = 0;
  const draw = (sx: number, sy: number, w: number, h: number, dx: number, dy: number) => {
    if (w <= 0 || h <= 0) return;
    if (++operations > 100_000) throw new Error('纹理平铺次数超过预览预算');
    ctx.drawImage(image, sx * scaleX, sy * scaleY, w * scaleX, h * scaleY, dx, dy, w, h);
  };
  const tile = (sx: number, sy: number, tw: number, th: number, dx: number, dy: number, dw: number, dh: number) => {
    if (dw <= 0 || dh <= 0) return;
    if (tw <= 0 || th <= 0) throw new Error('无效的平铺尺寸');
    for (let x = 0; x < dw; x += tw) for (let y = 0; y < dh; y += th) draw(sx, sy, Math.min(tw, dw - x), Math.min(th, dh - y), dx + x, dy + y);
  };
  if (s.type === 'tile') { tile(0, 0, sw, sh, 0, 0, width, height); return canvas; }
  const l = Math.min(s.border.left, Math.floor(width / 2)), r = Math.min(s.border.right, Math.floor(width / 2));
  const t = Math.min(s.border.top, Math.floor(height / 2)), b = Math.min(s.border.bottom, Math.floor(height / 2));
  if (width === sw && height === sh) { draw(0, 0, width, height, 0, 0); return canvas; }
  if (height === sh) { draw(0, 0, l, height, 0, 0); tile(l, 0, sw - r - l, sh, l, 0, width - r - l, height); draw(sw - r, 0, r, height, width - r, 0); return canvas; }
  if (width === sw) { draw(0, 0, width, t, 0, 0); tile(0, t, sw, sh - b - t, 0, t, width, height - b - t); draw(0, sh - b, width, b, 0, height - b); return canvas; }
  draw(0, 0, l, t, 0, 0); tile(l, 0, sw - r - l, t, l, 0, width - r - l, t); draw(sw - r, 0, r, t, width - r, 0);
  draw(0, sh - b, l, b, 0, height - b); tile(l, sh - b, sw - r - l, b, l, height - b, width - r - l, b); draw(sw - r, sh - b, r, b, width - r, height - b);
  tile(0, t, l, sh - b - t, 0, t, l, height - b - t); tile(l, t, sw - r - l, sh - b - t, l, t, width - r - l, height - b - t);
  // 1.21.1 GuiGraphics uses the left destination width for the right middle strip.
  tile(sw - r, t, r, sh - b - t, width - r, t, l, height - b - t);
  return canvas;
}

export class SpriteRasterCache {
  private entries = new Map<string, HTMLCanvasElement>(); private bytes = 0;
  get(id: string, sprite: DecodedSprite, w: number, h: number) {
    const key = `${id}/${w}/${h}`; const prior = this.entries.get(key);
    if (prior) { this.entries.delete(key); this.entries.set(key, prior); return prior; }
    const canvas = rasterSprite(sprite, w, h), bytes = w * h * 4;
    while (this.entries.size && (this.bytes + bytes > 32 * 1024 * 1024 || this.entries.size >= 128)) {
      const oldest = this.entries.keys().next().value!; const old = this.entries.get(oldest)!;
      this.bytes -= old.width * old.height * 4; this.entries.delete(oldest);
    }
    this.entries.set(key, canvas); this.bytes += bytes; return canvas;
  }
  clear() { this.entries.clear(); this.bytes = 0; }
}

/** Neutral placeholder, deliberately distinct from Minecraft artwork. */
export function drawCreativeTabFallback(ctx: CanvasRenderingContext2D, selected = false) { ctx.save(); ctx.fillStyle = selected ? '#68717b' : '#353c44'; ctx.fillRect(0, 0, 26, 32); ctx.strokeStyle = selected ? '#e1e8ed' : '#86909b'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, 25, 31); ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(24, 30); ctx.moveTo(24, 2); ctx.lineTo(2, 30); ctx.stroke(); ctx.restore(); }
export const beforePanel = (node: GuiNode) => node.type === 'minecraft:creative-tab' && !node.props.selected;
