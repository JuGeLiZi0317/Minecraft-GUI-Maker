import { displayText } from '../domain/model';
import type { GuiNode } from '../domain/schema';
import { checkboxLayout, cycleLabel } from './h1Layout';
import { multiLineLayout } from './multiLineText';

type Checkbox = Extract<GuiNode, { type: 'minecraft:checkbox' }>;
const layoutCache = new Map<string, ReturnType<typeof checkboxLayout>>();
const multiLineCache = new Map<string, ReturnType<typeof multiLineLayout>>();
export function previewCheckboxLayout(ctx: CanvasRenderingContext2D, node: Checkbox, family: string) {
  // Key uses only the portion used by the capped layout, plus overflow-relevant geometry.
  const text = displayText(node.props.message), prefix = text.slice(0, 1025);
  const key = JSON.stringify([family, prefix, text.length > 1024, node.props.maxWidth, node.bounds.w, node.bounds.h]);
  const prior = layoutCache.get(key);
  if (prior) return prior;
  ctx.save(); ctx.font = `9px ${family}`;
  const layout = checkboxLayout(node, value => ctx.measureText(value).width);
  ctx.restore();
  if (layoutCache.size >= 256) layoutCache.delete(layoutCache.keys().next().value!);
  layoutCache.set(key, layout);
  return layout;
}

// User-supplied fonts live only in this page session. Unique families prevent old
// asynchronous loads from changing an already captured export.
export type FontChoice = { family: string; generation: number; status: string; cached: { id: number; name: string }[] };
const fonts: { id: number; name: string; family: string; face: FontFace }[] = [];
let current: FontChoice = { family: 'monospace', generation: 0, status: '系统字体近似预览', cached: [] };
let pending: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());
export const fontSession = {
  get: () => current,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  async select(file: File) {
    const generation = current.generation + 1;
    current = { ...current, generation, status: '正在加载所选字体…' }; emit();
    pending = (async () => {
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error('字体文件超过 10 MiB');
        const bytes = await file.arrayBuffer();
        const family = `GuiMakerUserFont${generation}`;
        const face = new FontFace(family, bytes);
        await face.load();
        if (current.generation !== generation) return;
        document.fonts.add(face);
        if (fonts.length === 3) document.fonts.delete(fonts.shift()!.face);
        fonts.push({ id: generation, name: file.name, family: `"${family}", monospace, sans-serif`, face });
        current = { family: fonts[fonts.length - 1].family, generation, status: `用户字体：${file.name}；缺字使用系统回退`, cached: fonts.map(({ id, name }) => ({ id, name })) };
      } catch {
        if (current.generation !== generation) return;
        current = { ...current, family: 'monospace', generation, status: '字体加载失败，已回退系统字体' };
      }
      emit();
    })();
    await pending;
  },
  clear() {
    current = { ...current, family: 'monospace', generation: current.generation + 1, status: '系统字体近似预览' };
    pending = Promise.resolve(); emit();
  },
  useCached(id: number) {
    const font = fonts.find(item => item.id === id); if (!font) return;
    current = { ...current, family: font.family, generation: current.generation + 1, status: `用户字体：${font.name}；缺字使用系统回退` };
    pending = Promise.resolve(); emit();
  },
  async capture(): Promise<FontChoice> {
    const generation = current.generation;
    await pending;
    if (current.generation !== generation) throw new Error('字体选择已改变，请重新导出');
    return { ...current };
  },
};

export function fitPreviewText(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text;
  const chars = Array.from(text), tail = '…';
  if (ctx.measureText(tail).width > width) return '';
  let low = 0, high = chars.length;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (ctx.measureText(chars.slice(0, mid).join('') + tail).width <= width) low = mid; else high = mid - 1; }
  return chars.slice(0, low).join('') + tail;
}
const rgba = (c: string) => `rgba(${parseInt(c.slice(3,5),16)},${parseInt(c.slice(5,7),16)},${parseInt(c.slice(7,9),16)},${parseInt(c.slice(1,3),16)/255})`;
export function drawCheckboxFallback(ctx: CanvasRenderingContext2D, selected: boolean) {
  ctx.save(); ctx.fillStyle = '#151e2b'; ctx.fillRect(0, 0, 17, 17); ctx.strokeStyle = '#5a7185'; ctx.lineWidth = 0.6; ctx.strokeRect(0, 0, 17, 17);
  if (selected) { ctx.font = '14px sans-serif'; ctx.textBaseline = 'top'; ctx.fillStyle = '#e0e0e0'; ctx.fillText('✓', 3, 1); } ctx.restore();
}
function shadowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, enabled: boolean, shadowColour: string) {
  if (enabled) {
    ctx.save();
    ctx.fillStyle = shadowColour;
    ctx.fillText(text, x + 1, y + 1);
    ctx.restore();
  }
  ctx.fillText(text, x, y);
}
export function drawPreviewText(ctx: CanvasRenderingContext2D, node: GuiNode, w: number, h: number, family: string, panel = false) {
  if (node.type === 'minecraft:numeric-input' || node.type === 'minecraft:slider') return; // Shared numeric renderer owns these nodes.
  if (node.type === 'minecraft:fill' || node.type === 'minecraft:creative-tab') return;
  if (node.type === 'minecraft:multi-line-text-widget') {
    const draft = { ...node, props: { ...node.props, maxWidth: w, maxRows: Math.max(1, Math.floor(h / 9)) } };
    ctx.save(); ctx.font = `9px ${family}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const key = JSON.stringify([family, displayText(node.props.text), w, draft.props.maxRows]);
    let layout = multiLineCache.get(key);
    if (!layout) {
      layout = multiLineLayout(draft, value => ctx.measureText(value).width);
      if (multiLineCache.size >= 128) multiLineCache.delete(multiLineCache.keys().next().value!);
      multiLineCache.set(key, layout);
    }
    ctx.fillStyle = rgba(node.props.color);
    const shadow = rgba('#' + node.props.color.slice(1, 3) + [3, 5, 7].map(i => Math.floor(parseInt(node.props.color.slice(i, i + 2), 16) / 4).toString(16).padStart(2, '0')).join(''));
    layout.lines.forEach((line, i) => shadowText(ctx, line, node.props.align === 'center' ? Math.floor(layout.width / 2) - Math.floor(layout.widths[i] / 2) : 0, i * 9, node.props.textShadow, shadow));
    ctx.restore(); return;
  }
  if (node.type === 'minecraft:checkbox') {
    const layout = previewCheckboxLayout(ctx, node, family);
    // Preview-only readability treatment: vanilla Checkbox hardcodes light text.
    ctx.save(); ctx.font = `9px ${family}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = rgba(node.props.color ?? '#FFE0E0E0');
    layout.lines.forEach((line, i) => shadowText(ctx, line, layout.textX, layout.textY + i * layout.lineHeight, node.props.textShadow ?? false, panel ? '#101010' : '#383838')); ctx.restore(); return;
  }
  const text = node.type === 'minecraft:button' ? displayText(node.props.message) : node.type === 'minecraft:string-widget' ? displayText(node.props.text) : node.type === 'minecraft:cycle-button' ? cycleLabel(node) : node.props.value || (node.props.hint ? displayText(node.props.hint) : '');
  const align = node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' ? 'center' : node.type === 'minecraft:string-widget' ? node.props.align : 'left';
  const padding = node.type === 'minecraft:edit-box' ? 4 : 0;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  ctx.font = `9px ${family}`; ctx.textBaseline = 'middle'; ctx.textAlign = align;
  ctx.fillStyle = rgba(node.props.color ?? '#FFE0E8F1');
  shadowText(ctx, fitPreviewText(ctx, text, Math.max(0, w - 2 * padding)), align === 'center' ? w / 2 : align === 'right' ? w : padding, h / 2, node.props.textShadow ?? false, node.type === 'minecraft:string-widget' ? rgba('#' + node.props.color.slice(1, 3) + [3, 5, 7].map(i => Math.floor(parseInt(node.props.color.slice(i, i + 2), 16) / 4).toString(16).padStart(2, '0')).join('')) : '#383a3c');
  ctx.restore();
}
