import { actionsOf, behaviorConditions, conditionLeaves, isLookupExpression, sourcesOf, statusMappingsOf, type BehaviorCondition, type GuiScreen } from './schema';

export type OptionReferenceKind = 'condition' | 'status-map' | 'shared-status-map' | 'exclusive-visibility' | 'text-mapping';
export type OptionReference = { optionId: string; ruleId: string; path: string; kind: OptionReferenceKind };

function optionConstants(condition: BehaviorCondition): string[] {
  return conditionLeaves(condition).flatMap(leaf => {
    if (leaf.type === 'event-option') return [leaf.optionId];
    if (leaf.valueType !== 'OptionId') return [];
    return [leaf.left, leaf.right].flatMap(operand => operand.type === 'constant' ? [operand.value] : []);
  });
}

/**
 * Collect option IDs that a control's own rules use. Only rules bound to this control (event source or a
 * same-Screen read) are scanned; that is what makes renaming or deleting an option block instead of silently
 * orphaning a rule. Screen-wide shared maps and named mappings are reported only through such bound rules.
 */
export function collectOptionReferences(screen: GuiScreen, controlId: string): Map<string, OptionReference[]> {
  const result = new Map<string, OptionReference[]>();
  const add = (optionId: string, reference: OptionReference) => {
    const bucket = result.get(optionId) ?? [];
    if (!bucket.some(item => item.ruleId === reference.ruleId && item.path === reference.path && item.kind === reference.kind)) bucket.push(reference);
    result.set(optionId, bucket);
  };
  const readsControl = (condition: BehaviorCondition) => conditionLeaves(condition).some(leaf => leaf.type === 'compare' && [leaf.left, leaf.right].some(operand => operand.type === 'read-control-value' && operand.nodeId === controlId));
  for (const rule of screen.behaviors) {
    let bound = sourcesOf(rule).includes(controlId);
    for (const action of actionsOf(rule)) {
      for (const entry of behaviorConditions(action)) if (readsControl(entry.condition)) bound = true;
      if (action.type === 'set-exclusive-visible' && action.value.type === 'read-control-value' && action.value.nodeId === controlId) bound = true;
      if (action.type === 'set-text' && 'value' in action && isLookupExpression(action.value) && action.value.input.type === 'read-control-value' && action.value.input.nodeId === controlId) bound = true;
    }
    if (!bound) continue;
    actionsOf(rule).forEach((action, index) => {
      const path = `actions[${index}]`;
      for (const entry of behaviorConditions(action)) for (const optionId of optionConstants(entry.condition)) add(optionId, { optionId, ruleId: rule.id, path: `${path}.condition`, kind: 'condition' });
      if (action.type === 'set-exclusive-visible') for (const mapping of action.mapping) add(mapping.optionId, { optionId: mapping.optionId, ruleId: rule.id, path: `${path}.mapping`, kind: 'exclusive-visibility' });
      if (action.type === 'set-status') for (const mapping of statusMappingsOf(screen, action)) add(mapping.optionId, { optionId: mapping.optionId, ruleId: rule.id, path, kind: 'mapRef' in action ? 'shared-status-map' : 'status-map' });
      if (action.type === 'set-text' && 'value' in action && isLookupExpression(action.value)) {
        const mappingId = action.value.mappingId;
        const mapping = screen.textMappings?.find(item => item.id === mappingId);
        for (const entry of mapping?.entries ?? []) add(entry.key, { optionId: entry.key, ruleId: rule.id, path: `${path}.value`, kind: 'text-mapping' });
      }
    });
  }
  return result;
}

export function optionReferencesFor(references: Map<string, OptionReference[]>, optionId: string): OptionReference[] {
  return references.get(optionId) ?? [];
}

export function formatOptionReference(reference: OptionReference): string {
  return `${reference.ruleId} · ${reference.kind} · ${reference.path}`;
}