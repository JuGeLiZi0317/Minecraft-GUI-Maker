import type { GuiNode } from './schema';

/** Frozen runtime contract shared by Preview, ZIP manifest and Agent Specification. */
export const EXCLUSIVE_VISIBILITY_CONTRACT = {
  version: '1.0.0',
  schema: 'action set-exclusive-visible, Schema 0.46.0; explicit save only, legacy rules are never migrated on load',
  action: 'one action owns one OptionId value input, one ordered Option→Target table (1–32 entries) and one declared fallback',
  value: {
    'event-value': 'optionId of the current confirmed selection-change event',
    'read-control-value': 'same-Screen Radio Group/Dropdown session value at event time; reading never subscribes to that control',
    constant: 'explicit OptionId identity; never inferred from a label',
  },
  execution: 'evaluate the value once, validate every mapped target, then write visibility: the matched target true and every other table member false; nodes outside the table are never touched',
  unmapped: { 'hide-all': 'hide every mapped target', 'keep-current': 'leave every mapped target unchanged' },
  validation: 'unique optionId per table, unique target per table, existing same-Screen targets, Native Region and CreativeTab targets rejected, ancestor/descendant target pairs rejected, at most 32 entries',
  gating: 'the runtime override is AND-ed with active Page membership and ancestor visibility; a mapping never bypasses Page Group gating or reveals inactive Page content',
  editorIsolation: 'editor layer visibility, Solo and design-time hiding are editor view state and never part of a runtime mapping',
  runtime: 'PreviewSession-only; authority JSON, design initial visibility and the values inside hidden containers are unchanged; no cascaded user events, navigation or Screen switch',
  gameResponsibility: 'the implementer applies the same table in declaration order to Screen-instance visibility, then redraws; Blockly is a browser editor only',
  executableByGuiMaker: false,
} as const;

export type ExclusiveFallback = 'hide-all' | 'keep-current';
export type ExclusiveMappingEntry = { optionId: string; targetId: string };
export type ExclusiveVisibilityWrite = { targetId: string; visible: boolean };
export type ExclusiveResolution =
  | { kind: 'matched'; optionId: string; writes: ExclusiveVisibilityWrite[] }
  | { kind: 'hide-all'; writes: ExclusiveVisibilityWrite[] }
  | { kind: 'keep-current' }
  | { kind: 'invalid'; reason: string };

/**
 * Pure planner. Every target is validated before the caller performs any write, so an invalid table
 * can never leave a partially updated Screen.
 */
export function planExclusiveVisibility(mapping: readonly ExclusiveMappingEntry[], value: string | undefined, fallback: ExclusiveFallback, nodes: readonly GuiNode[]): ExclusiveResolution {
  if (value === undefined) return { kind: 'invalid', reason: '读取值不是有效 optionId' };
  const resolved = mapping.map(entry => ({ ...entry, node: nodes.find(node => node.id === entry.targetId) }));
  const unusable = resolved.filter(entry => !entry.node || entry.node.type === 'native_region' || entry.node.type === 'minecraft:creative-tab');
  if (unusable.length) return { kind: 'invalid', reason: `映射目标不可用 ${unusable.map(entry => entry.targetId).join('、')}` };
  if (new Set(resolved.map(entry => entry.targetId)).size !== resolved.length) return { kind: 'invalid', reason: '映射目标重复，无法保证互斥' };
  const matched = resolved.find(entry => entry.optionId === value);
  if (matched) return { kind: 'matched', optionId: matched.optionId, writes: resolved.map(entry => ({ targetId: entry.targetId, visible: entry === matched })) };
  if (fallback === 'hide-all') return { kind: 'hide-all', writes: resolved.map(entry => ({ targetId: entry.targetId, visible: false })) };
  return { kind: 'keep-current' };
}