import { playerInventorySlots } from '../domain/nativeRegion';

/** Approximation with exact geometry; no Minecraft resource bytes are embedded. */
export function drawPlayerInventory(ctx: CanvasRenderingContext2D) {
  ctx.save();
  for (const slot of playerInventorySlots()) {
    const { x, y } = slot.background;
    ctx.fillStyle = '#373737'; ctx.fillRect(x, y, 18, 18);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 1, y + 1, 17, 17);
    ctx.fillStyle = '#8b8b8b'; ctx.fillRect(x + 1, y + 1, 16, 16);
  }
  ctx.restore();
}

/** Approximate 18×18 single-slot background; placeholder is design-only, never an ItemStack. */
export function drawSingleSlot(ctx: CanvasRenderingContext2D, _usage: 'inventory' | 'ghost_selection' | 'visual_only', placeholderItemId?: string) {
  ctx.save();
  ctx.fillStyle = '#373737'; ctx.fillRect(0, 0, 18, 18);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(1, 1, 17, 17);
  ctx.fillStyle = '#8b8b8b'; ctx.fillRect(1, 1, 16, 16);
  if (placeholderItemId) {
    const name = placeholderItemId.split(':').at(-1) ?? placeholderItemId;
    let hash = 0; for (const char of placeholderItemId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    ctx.fillStyle = ['#B05A5A', '#5A8BB0', '#5AB07A', '#B09A5A', '#8B5AB0', '#5AB0A8'][hash % 6];
    ctx.fillRect(4, 4, 10, 10);
    ctx.strokeStyle = '#FFFFFFFF'; ctx.lineWidth = 1; ctx.strokeRect(4.5, 4.5, 9, 9);
    ctx.fillStyle = '#FFFFFFFF'; ctx.font = '6px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 2).toUpperCase(), 9, 9.5);
  }
  ctx.restore();
}
