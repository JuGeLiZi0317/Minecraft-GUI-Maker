import { displayText } from '../domain/model';
import type { GuiNode } from '../domain/schema';

type Checkbox = Extract<GuiNode, { type: 'minecraft:checkbox' }>;
type CycleButton = Extract<GuiNode, { type: 'minecraft:cycle-button' }>;
export const CHECKBOX_PREVIEW_LIMIT = 1024;

/** Approximation only: browser font metrics are not Minecraft font metrics. */
export function checkboxLayout(node: Checkbox, measure: (text: string) => number) {
  const raw = displayText(node.props.message);
  // Limit UTF-16 units before iterating or measuring, avoiding work proportional to a large imported string.
  const truncated = raw.length > CHECKBOX_PREVIEW_LIMIT;
  let text = raw.slice(0, CHECKBOX_PREVIEW_LIMIT);
  if (truncated && /[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  if (truncated) text += '…';
  const width = Math.min(21 + Math.ceil(measure(text)), node.props.maxWidth);
  const lines: string[] = [];
  // The fixed preview cap also bounds repeated browser text measurements.
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const character of Array.from(paragraph)) {
      const next = line + character;
      if (line && measure(next) > width) { lines.push(line); line = character; }
      else line = next;
    }
    lines.push(line);
  }
  const lineHeight = 9, textHeight = lines.length * lineHeight;
  const textY = Math.floor(17 / 2) - Math.floor(textHeight / 2);
  const textWidth = Math.max(0, ...lines.map(line => measure(line)));
  return { boxSize: 17, naturalWidth: width, naturalHeight: Math.max(17, textHeight), lines, textX: 21, textY, textWidth, textHeight, lineHeight, truncated,
    overflow: 21 + textWidth > node.bounds.w || textY < 0 || textY + textHeight > node.bounds.h };
}

export function cycleLabel(node: CycleButton, optionId = node.props.initialOptionId) {
  const option = node.props.options.find(item => item.id === optionId);
  if (!option) throw new Error('循环按钮选项不存在');
  const value = displayText(option.text);
  return node.props.displayFormat === 'value-only' ? value : `${displayText(node.props.name)}: ${value}`;
}
