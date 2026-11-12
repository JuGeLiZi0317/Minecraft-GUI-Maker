import { actionsOf, type BehaviorAction, type GuiScreen } from './schema';

export type StatusReferenceKind = 'set-status' | 'status-map' | 'shared-status-map';
export type StatusReference = { statusId: string; ruleId: string; path: string; kind: StatusReferenceKind };

/**
 * Collect status IDs that rules or shared maps expect to exist on this Status Indicator.
 *
 * Conservative by design: renaming or deleting any referenced status is blocked instead of rewriting
 * rule JSON. `initialStatusId` is not reported here because it is an internal reference that the
 * Inspector remaps in the same transaction.
 */
export function collectStatusReferences(screen: GuiScreen, controlId: string): Map<string, StatusReference[]> {
  const result = new Map<string, StatusReference[]>();
  const add = (statusId: string, reference: StatusReference) => {
    const bucket = result.get(statusId) ?? [];
    if (!bucket.some(item => item.ruleId === reference.ruleId && item.path === reference.path && item.kind === reference.kind)) bucket.push(reference);
    result.set(statusId, bucket);
  };
  const mapEntries = (mapId: string) => screen.behaviorMaps?.find(map => map.id === mapId)?.mappings ?? [];

  // Every shared map is validated against the Screen's status set, even when no rule references it yet.
  for (const map of screen.behaviorMaps ?? []) {
    map.mappings.forEach((mapping, index) => add(mapping.statusId, {
      statusId: mapping.statusId, ruleId: `behaviorMaps:${map.id}`, path: `behaviorMaps[${map.id}].mappings[${index}]`, kind: 'shared-status-map',
    }));
  }

  for (const rule of screen.behaviors) {
    const walkLeaf = (action: Exclude<BehaviorAction, { type: 'if' | 'switch' }>, path: string) => {
      if (action.type !== 'set-status' || action.targetId !== controlId) return;
      if ('statusId' in action) {
        add(action.statusId, { statusId: action.statusId, ruleId: rule.id, path, kind: 'set-status' });
        return;
      }
      if ('optionMappings' in action) {
        action.optionMappings.forEach((mapping, index) => add(mapping.statusId, {
          statusId: mapping.statusId, ruleId: rule.id, path: `${path}.optionMappings[${index}]`, kind: 'status-map',
        }));
        return;
      }
      for (const mapping of mapEntries(action.mapRef)) add(mapping.statusId, {
        statusId: mapping.statusId, ruleId: rule.id, path: `${path}.mapRef→${action.mapRef}`, kind: 'shared-status-map',
      });
    };
    const walkActions = (list: readonly BehaviorAction[], prefix: string) => list.forEach((item, index) => walk(item, `${prefix}[${index}]`));
    const walk = (action: BehaviorAction, path: string) => {
      if (action.type === 'if') {
        walkActions(action.thenActions, `${path}.thenActions`);
        (action.elseIf ?? []).forEach((branch, index) => walkActions(branch.actions, `${path}.elseIf[${index}].actions`));
        walkActions(action.elseActions, `${path}.elseActions`);
        return;
      }
      if (action.type === 'switch') {
        action.cases.forEach((branch, index) => walkActions(branch.actions, `${path}.cases[${index}].actions`));
        walkActions(action.defaultActions ?? [], `${path}.defaultActions`);
        return;
      }
      walkLeaf(action, path);
    };
    actionsOf(rule).forEach((action, index) => walk(action, `actions[${index}]`));
  }
  return result;
}

export function statusReferencesFor(references: Map<string, StatusReference[]>, statusId: string): StatusReference[] {
  return references.get(statusId) ?? [];
}

export function formatStatusReference(reference: StatusReference): string {
  return `${reference.ruleId} · ${reference.kind} · ${reference.path}`;
}
