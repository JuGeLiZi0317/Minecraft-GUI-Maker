import type { TextSpec } from './schema';

/** Frozen contract shared by Preview, ZIP manifest and Agent Specification. */
export const TEXT_MAPPING_CONTRACT = {
  version: '1.0.0',
  schema: 'Screen-local textMappings[] plus the lookup value expression, Schema 0.47.0; explicit save only, legacy projects are never migrated on load',
  definition: 'stable mapping id, non-empty display name, declared inputType, declared outputType, ordered typed entries and one explicit fallback',
  types: { inputType: ['OptionId'], outputType: ['Text'], entryKey: 'entry key must be a valid OptionId', entryValue: 'literal or translatable text component' },
  entries: '1–32 ordered entries; duplicate keys rejected; every entry key is validated against the reading control or every event source',
  fallback: 'required and must match outputType; an unmatched input resolves to this value and never to an empty string',
  scope: 'definitions are Screen-local; a lookup may only reference a definition in its own Screen and never reads cross-Screen state',
  caching: 'mappings hold no runtime variables; every explicit event re-reads the current definition, so edits apply on the next evaluation',
  reference: 'any number of rules may reference one definition; renaming keeps the stable mapping id',
  evaluation: 'the lookup value is a deterministic pure function: evaluate the input once, check the runtime type, match one entry, return its typed value, otherwise the fallback',
  effects: 'no widget state change, no event emission, no navigation, no subscription; only the consuming action (set-text) writes Screen-session text',
  text: 'literal renders its value; translatable is resolved by the Minecraft localization system, never displayed as a raw key. Browser preview shows the fallback with a ⟦key⟧ annotation',
  runtime: 'PreviewSession-only; design default text in authority JSON is never rewritten',
  gameResponsibility: 'the implementer resolves the same table on the same event and assigns the resulting Component to the target StringWidget; Blockly is a browser editor only',
  executableByGuiMaker: false,
} as const;

export const MAX_TEXT_MAPPINGS = 32, MAX_TEXT_MAPPING_ENTRIES = 32, MAX_TEXT_MAPPING_NAME = 128;
export const TEXT_MAPPING_INPUT_TYPES = ['OptionId'] as const;
export const TEXT_MAPPING_OUTPUT_TYPES = ['Text'] as const;
export type TextMappingInputType = typeof TEXT_MAPPING_INPUT_TYPES[number];
export type TextMappingOutputType = typeof TEXT_MAPPING_OUTPUT_TYPES[number];

export type TextMappingEntry = { key: string; value: TextSpec };
export type NamedTextMapping = {
  id: string;
  name: string;
  inputType: TextMappingInputType;
  outputType: TextMappingOutputType;
  entries: TextMappingEntry[];
  fallback: TextSpec;
};
export type LookupExpression = { type: 'lookup'; mappingId: string; input: { type: 'event-value'; field: 'optionId' } | { type: 'constant'; value: string } | { type: 'read-control-value'; nodeId: string } };

/** Exact display string for the browser preview. Translatable text is never shown as a raw key. */
export function previewText(text: TextSpec): string {
  return text.kind === 'literal' ? text.value : `${text.fallback} ⟦${text.key}⟧`;
}

/** Human-readable annotation used by diagnostics and export prompts. */
export function describeText(text: TextSpec): string {
  return text.kind === 'literal' ? `literal ${JSON.stringify(text.value)}` : `translatable ${text.key}`;
}

export type LookupResolution = { kind: 'matched'; key: string; value: TextSpec } | { kind: 'fallback'; value: TextSpec } | { kind: 'invalid'; reason: string };

/**
 * Deterministic pure resolution. No widget state is read or written here; the caller decides what to do
 * with the result, and an unresolved mapping never silently becomes an empty string.
 */
export function resolveTextMapping(mapping: NamedTextMapping | undefined, input: string | undefined, sameScreen: boolean, available = true): LookupResolution {
  if (!available) return { kind: 'invalid', reason: '映射定义在当前 Screen 不存在' };
  if (!mapping) return { kind: 'invalid', reason: 'Lookup 找不到映射定义' };
  if (!sameScreen) return { kind: 'invalid', reason: '映射定义不属于当前 Screen' };
  if (mapping.inputType !== 'OptionId') return { kind: 'invalid', reason: `映射输入类型 ${mapping.inputType} 与 Lookup 不兼容` };
  if (mapping.outputType !== 'Text') return { kind: 'invalid', reason: `映射输出类型 ${mapping.outputType} 不受支持` };
  if (typeof input !== 'string' || !input) return { kind: 'invalid', reason: 'Lookup 输入不是有效 OptionId' };
  const entry = mapping.entries.find(item => item.key === input);
  return entry ? { kind: 'matched', key: input, value: entry.value } : { kind: 'fallback', value: mapping.fallback };
}

export function textMappingIdSet(mappings: readonly NamedTextMapping[] | undefined): Set<string> {
  return new Set((mappings ?? []).map(mapping => mapping.id));
}