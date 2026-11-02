import { displayText } from '../domain/model';
import type { GuiNode } from '../domain/schema';

export type ReadOnlyScrollTextNode = Extract<GuiNode, { type: 'minecraft:fitting-multi-line-text-widget' }>;
export const SCROLL_TEXT_LINE_HEIGHT = 9;
export const SCROLL_TEXT_INNER_WIDTH = 8;
export function wrapScrollText(text: string, width: number, measure: (text: string) => number) {
  const lines: string[] = [];
  if (!text) return lines;
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    let rest = Array.from(paragraph);
    while (rest.length) {
      let end = 0, lastSpace = -1;
      while (end < rest.length && (end === 0 || measure(rest.slice(0, end + 1).join('')) <= width)) {
        if (rest[end] === ' ') lastSpace = end;
        end++;
      }
      if (end === 0) end = 1;
      const wrapped = end < rest.length, cut = wrapped && lastSpace >= 0 ? lastSpace : end;
      lines.push(rest.slice(0, cut).join(''));
      rest = rest.slice(wrapped && lastSpace >= 0 ? cut + 1 : cut);
    }
  }
  return lines;
}
export function scrollTextLayout(node: ReadOnlyScrollTextNode, measure: (text: string) => number) {
  const lines = wrapScrollText(displayText(node.props.text), Math.max(1, node.bounds.w - SCROLL_TEXT_INNER_WIDTH), measure);
  const contentHeight = lines.length * SCROLL_TEXT_LINE_HEIGHT;
  const overflow = contentHeight > node.bounds.h;
  return { lines, contentHeight, overflow, maxScroll: overflow ? Math.max(0, contentHeight + 8 - node.bounds.h) : 0, lineHeight: SCROLL_TEXT_LINE_HEIGHT };
}
export const READ_ONLY_SCROLL_TEXT_CONTRACT = { version: '1.1.0', source: 'net.minecraft.client.gui.components.FittingMultiLineTextWidget extends AbstractScrollWidget', construction: 'new FittingMultiLineTextWidget(x,y,width,height,component,font).setColor(color); register as renderable widget for focus/narration/input', geometry: 'bounds are viewport width/height; bounds.w is NOT content max width. Internal MultiLineTextWidget max width is width-8. Fixed line height 9. Content remains untruncated.', scroll: { initial: 'top on new Screen instance', rate: '9 GUI px per wheel/key step', maximum: 'max(0, contentHeight + 8 - viewportHeight), clamped by native setScrollAmount', directions: 'wheel over widget and focused Up/Down scroll; scrollbar drag is supported by AbstractScrollWidget when events are routed to it', noOverflow: 'no scrollbar; content renders without internal scissor; Screen wrapper must apply viewport scissor for short heights' }, rendering: { overflow: 'text-field background, scissor [x+1,y+1,x+w-1,y+h-1], content translated by -scrollAmount, inner text origin x+4,y+4, scrollbar at x+w with 8px gutter', noOverflow: 'transparent background except focus border; text at x,y; content width remains viewport width-8', cleanup: 'GuiGraphics scissor is stack-paired; outer Screen wrapper scissor must include 8px scrollbar gutter and use try/finally', color: 'ARGB via setColor', textShadow: 'props.textShadow controls design intent; absent in legacy 0.23.0 JSON and defaults to true. Native widget always draws shadow and has no setter. For false, preserve native scrolling/viewport behavior but custom-draw each line without shadow; browser and PNG renderers approximate game font shadow.', focus: 'click inside viewport focuses; title narration is the message; Screen owns keyboard focus/navigation' }, input: { design: 'editor owns select/move/resize; no browser scrolling', preview: 'wheel/scrollbar and focused keyboard scrolling only; do not propagate wheel to canvas zoom', routingCaveat: 'mouseScrolled itself only checks visible and changes scroll regardless pointer coordinates; Screen child hit routing must gate wheel to widget bounds. Scrollbar hit region extends x+w..x+w+8 outside inherited widget bounds; Screen must explicitly route this gutter or use a wrapper.', textSelection: false }, lifecycle: 'construct a fresh widget on each Screen init/reposition; do not retain widget or scroll offset across Screen opens; resize rebuilds from design props and resets to top', limitations: 'browser font metrics and wrapping differ from Minecraft Font.split; empty text has zero content lines; viewport below 9px needs outer clip; focus border may extend 4px when no overflow; built-in narration is TITLE only' } as const;
export function clampScrollOffset(offset: number, maxScroll: number) {
  return Number.isFinite(offset) ? Math.max(0, Math.min(maxScroll, offset)) : 0;
}
const rgba = (c: string) => `rgba(${parseInt(c.slice(3,5),16)},${parseInt(c.slice(5,7),16)},${parseInt(c.slice(7,9),16)},${parseInt(c.slice(1,3),16)/255})`;
export function drawScrollText(ctx: CanvasRenderingContext2D, node: ReadOnlyScrollTextNode, family: string) {
  const { w, h } = node.bounds;
  ctx.save(); ctx.font = `9px ${family}`;
  const layout = scrollTextLayout(node, value => ctx.measureText(value).width);
  if (layout.overflow) { ctx.fillStyle = '#151e2b'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#5a7185'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, Math.max(0, w - 1), Math.max(0, h - 1)); }
  ctx.beginPath(); ctx.rect(1, 1, Math.max(0, w - 2), Math.max(0, h - 2)); ctx.clip();
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = rgba(node.props.color);
  const x = layout.overflow ? 4 : 0, y = layout.overflow ? 4 : 0;
  layout.lines.forEach((line, index) => { const lineY = y + index * layout.lineHeight; if (node.props.textShadow ?? true) { ctx.fillStyle = '#383838'; ctx.fillText(line, x + 1, lineY + 1); } ctx.fillStyle = rgba(node.props.color); ctx.fillText(line, x, lineY); });
  if (layout.overflow) { const thumbH = Math.min(h, Math.max(1, Math.max(32, Math.floor(h * h / (layout.contentHeight + 4))))); ctx.fillStyle = '#60666d'; ctx.fillRect(w, 0, 8, h); ctx.fillStyle = '#a0a7af'; ctx.fillRect(w, 0, 8, thumbH); }
  ctx.restore();
}
