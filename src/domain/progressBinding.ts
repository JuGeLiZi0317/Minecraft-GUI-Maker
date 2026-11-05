import { numericFraction, validValue, type NumericConfig } from './numeric';
import { progressError, type ProgressNode } from './progress';

export type ProgressMapping = 'direct' | 'normalize';
export type ProgressMappingResult = { value: number } | { error: string };

export const SLIDER_PROGRESS_BINDING_CONTRACT = {
  event: { type: 'slider-change', phase: 'change', payload: ['screenId', 'nodeId', 'value', 'phase'] },
  action: { type: 'set-progress-value', target: 'same-Screen minecraft:progress-bar node ID', mapping: ['direct', 'normalize'] },
  lifecycle: 'session-local; initialize Slider and Progress Bar independently; no event on initialization; reset both to design initialValue on Screen open/restart',
  deduplication: 'emit only on a valid effective Slider value change; focus, redraw and unchanged samples do not trigger',
  mapping: { direct: 'clamp Slider value to target min..max', normalize: 'linearly map source fraction to target range; constant source maps to target min; constant target maps to its only value' },
  precision: 'validate Slider value with W1-B fixed-point min-anchored grid and explicit max endpoint; do not apply Slider step to Progress Bar',
  execution: 'process matched rules in screen.behaviors order and actions in each actions order; invalid source/target produces no update',
  authority: 'runtime currentValue never mutates Progress Bar initialValue, project JSON or design PNG',
  implementation: 'ZIP declares behavior intent; implementer routes event and updates Screen-local target state; no Java runtime is generated',
} as const;

/** Map a legal fixed-point Slider value to a read-only Progress Bar value. */
export function mapSliderToProgress(source: NumericConfig, target: Pick<ProgressNode['props'], 'min' | 'max' | 'initialValue'>, value: number, mapping: ProgressMapping): ProgressMappingResult {
  if (!Number.isFinite(value) || !validValue(source, value)) return { error: 'Slider 事件值不是有效的有限步进值' };
  if (progressError(target)) return { error: 'Progress Bar 目标范围无效' };
  let mapped: number;
  if (mapping === 'direct') mapped = Math.max(target.min, Math.min(target.max, value));
  else {
    if (source.min === source.max || target.min === target.max) mapped = target.min;
    else {
      const fraction = numericFraction(source, value);
      // Convex interpolation avoids an overflowing (max - min) span for finite endpoints.
      mapped = target.min * (1 - fraction) + target.max * fraction;
    }
  }
  if (!Number.isFinite(mapped)) return { error: '映射结果不是有限数值' };
  return { value: Math.max(target.min, Math.min(target.max, mapped)) };
}
