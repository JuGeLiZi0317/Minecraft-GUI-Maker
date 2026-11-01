import { displayText } from '../domain/model';
import type { GuiNode } from '../domain/schema';

export type MultiLineTextNode = Extract<GuiNode, { type: 'minecraft:multi-line-text-widget' }>;
/** Browser approximation of Font.split; bounded input, no ellipsis, preserves explicit blank lines.
 * Break at spaces when possible, otherwise at Unicode code points (never split surrogate pairs).
 * Minecraft language shaping, bidi, formatting and font metrics remain game-owned.
 */
export function multiLineLayout(node: MultiLineTextNode, measure: (text: string) => number) {
  const lines: string[] = [];
  const text = displayText(node.props.text).replace(/\r\n?/g, '\n');
  if (!text) return result(false);
  for (const paragraph of text.split('\n')) {
    let rest = Array.from(paragraph);
    do {
      if (lines.length >= node.props.maxRows) return result(true);
      let end = 0, space = -1;
      while (end < rest.length) {
        if (rest[end] === ' ') space = end;
        if (end > 0 && measure(rest.slice(0, end + 1).join('')) > node.props.maxWidth) break;
        end++;
      }
      const wraps = end < rest.length;
      const cut = wraps && space >= 0 ? space : end;
      lines.push(rest.slice(0, cut).join(''));
      rest = rest.slice(wraps && space >= 0 ? cut + 1 : cut);
    } while (rest.length);
  }
  return result(false);
  function result(truncated: boolean) {
    const widths = lines.map(measure);
    return { lines, widths, width: Math.min(node.props.maxWidth, Math.ceil(Math.max(0, ...widths))), height: lines.length * 9, lineHeight: 9, truncated };
  }
}

export const MULTI_LINE_RUNTIME_CONTRACT = {
  constructor: 'new MultiLineTextWidget(offsetX + bounds.x, offsetY + bounds.y, component, font).setMaxWidth(props.maxWidth).setMaxRows(props.maxRows).setCentered(props.align == center).setColor(ARGB)',
  geometry: 'bounds.w = maxWidth; bounds.h = maxRows * 9: editor reservation ONLY. NEVER call setSize/setWidth/setHeight to impose it on the native widget. getWidth = min(maxWidth, widest retained line); getHeight = retained line count * 9.',
  alignment: 'left or center only; native center is x + floor(getWidth()/2), NOT x + maxWidth/2',
  wrapping: 'native Font.split resolves component/locale/font; keep first maxRows lines, no ellipsis and no scrolling; browser uses approximate font measurements',
  shadow: 'props.textShadow is explicit; native MultiLineTextWidget always shadows. For false, use a source-verified subclass/custom renderer using the same Font.split/maxRows/9px line layout and GuiGraphics.drawString(..., color, false); no presumed native shadow setter',
  lifecycle: 'display-only; active=false; addRenderableOnly; rebuild/recompute from authoritative props in init/resize; no callback, input, automatic narration or transient state',
  limits: 'product limits: maxWidth 1..8192, maxRows 1..256, literal/fallback <=4096 UTF-16 units; reservation must fit owning Screen; long glyphs and shadow can exceed reservation; no extra clipping in game',
  verification: 'PENDING: actual exported ZIP to Minecraft validation required',
} as const;
