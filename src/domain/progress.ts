import type { GuiNode } from './schema';

export type ProgressNode = Extract<GuiNode, { type: 'minecraft:progress-bar' }>;
export const isProgressNode = (node: GuiNode): node is ProgressNode => node.type === 'minecraft:progress-bar';
export function progressError(value: Pick<ProgressNode['props'], 'min' | 'max' | 'initialValue'>) {
  if (![value.min, value.max, value.initialValue].every(Number.isFinite)) return '进度值必须是有限数';
  if (value.min > value.max) return '最小值不能大于最大值';
  if (value.initialValue < value.min || value.initialValue > value.max) return '初始值必须在有效范围内';
  return null;
}

/** A constant range represents its only valid value as fully complete. */
export function progressFraction(value: Pick<ProgressNode['props'], 'min' | 'max'>, current: number) {
  if (value.min === value.max) return 1;
  const clamped = Number.isFinite(current) ? Math.max(value.min, Math.min(value.max, current)) : value.min;
  const span = value.max - value.min;
  if (Number.isFinite(span)) return Math.max(0, Math.min(1, (clamped - value.min) / span));
  // Scaling first avoids overflow when finite endpoints have opposite large signs.
  const scale = Math.max(Math.abs(value.min), Math.abs(value.max), Math.abs(clamped));
  return Math.max(0, Math.min(1, (clamped / scale - value.min / scale) / (value.max / scale - value.min / scale)));
}

export function progressGeometry(w: number, h: number, fraction: number, direction: ProgressNode['props']['direction'], border: number) {
  const ix = border, iy = border, iw = Math.max(0, w - border * 2), ih = Math.max(0, h - border * 2);
  let fw = iw, fh = ih, fx = ix, fy = iy;
  if (direction === 'left-to-right' || direction === 'right-to-left') {
    fw = Math.floor(iw * fraction); if (direction === 'right-to-left') fx += iw - fw;
  } else {
    fh = Math.floor(ih * fraction); if (direction === 'bottom-to-top') fy += ih - fh;
  }
  return { ix, iy, iw, ih, fx, fy, fw, fh };
}
