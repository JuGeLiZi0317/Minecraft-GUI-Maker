export type OptionStatusMapping = { optionId: string; statusId: string };

export const SELECTION_STATUS_BINDING_CONTRACT = {
  version: '1.3.0',
  sources: 'sourceId plus optional additionalSourceIds share this exact rule/action chain; all are same-Screen Radio Group/Dropdown; duplicate IDs rejected; mapped option IDs must exist in every source; no merged selection variable',
  order: 'process confirmed events in arrival order, match each rule once, then preserve rule/action array order; last valid update wins; unchanged/unmapped events preserve prior status',
  event: { type: 'selection-change', fields: ['screenId', 'nodeId', 'optionId', 'phase', 'source'], phase: 'confirm', suppress: ['active-candidate-only', 'disabled-option', 'unchanged-selection', 'focus-only', 'cancel'] },
  action: { type: 'set-status', target: 'same-Screen Status Indicator node ID', mapping: 'exactly one of constant statusId, inline optionMappings, or mapRef; labels are display-only', constant: 'statusId selects a valid status on the same-Screen target directly, without reading or mapping optionId; reject stale target/status IDs; no unmapped result exists for this mode', duplicateOptionId: 'reject', staleOptionOrStatusId: 'reject atomically', crossScreen: 'not representable' },
  sharedMaps: { scope: 'Screen-local behaviorMaps definitions with stable map ID and ordered mappings', reference: 'set-status.mapRef resolves only within the same Screen; map definitions are emitted once and actions retain their array order', edits: 'a saved map edit changes every referencing action in the same domain transaction; deletion is rejected while referenced; explicit copy creates a new independent map ID; equal contents are never auto-merged', legacy: 'inline optionMappings remain authoritative and unchanged until the user explicitly selects a shared map; reading legacy rules never extracts or upgrades them', gameResponsibility: 'resolve mapRef once from the current Screen authority, then apply its mappings exactly as inline pairs; no Blockly runtime is required' },
  unmapped: 'mapping modes only: leave target statusId unchanged and record an unmapped outcome; never infer by label',
  runtime: { currentStatusId: 'PreviewSession-local override; initialStatusId and authority JSON remain unchanged', initialize: 'each Screen open starts at initialStatusId; no event fires on initialization', reset: 'preview restart and document change clear overrides and event traces' },
  gameResponsibility: 'Minecraft implementer registers the same rule handler for sourceId and every additionalSourceId, preserving the actual event nodeId. Match each rule once per confirmed event, then apply actions in array order. Listen only to confirmed Radio Group selection or Dropdown Enter/Space/pointer confirmation; resolve the constant statusId directly or resolve optionId through the declared map, then update the target Status Indicator instance, and redraw. Dropdown activeOptionId movement is not an event. Blockly is a browser editor only; Minecraft has no Blockly dependency.',
  executableByGuiMaker: false,
} as const;

export function resolveOptionStatusMapping(optionId: string, mappings: readonly OptionStatusMapping[], validStatusIds: readonly string[]) {
  const mapping = mappings.find(item => item.optionId === optionId);
  if (!mapping) return { kind: 'unmapped' as const };
  if (!validStatusIds.includes(mapping.statusId)) return { kind: 'invalid' as const, statusId: mapping.statusId };
  return { kind: 'mapped' as const, statusId: mapping.statusId };
}
