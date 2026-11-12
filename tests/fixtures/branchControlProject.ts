import { structuresInspectorProject } from './structuresInspectorProject';
import type { Behavior, BranchLeafAction } from '../../src/domain/schema';

export function branchControlProject() {
  const doc = structuresInspectorProject();
  doc.schemaVersion = '0.45.0'; doc.project.name = 'StructuresInspectorSwitch';
  const choices = ['village', 'temple', 'end_city'];
  const visibility = (selected?: string): BranchLeafAction[] => choices.map(choice => ({ type: 'set-visible', targetId: `inspector_${choice}`, visible: selected === choice }));
  doc.screens[0].behaviors = [{
    id: 'inspect_structure', event: { type: 'selection-change', sourceId: 'structure_selector' },
    eventBindings: [{ type: 'selection-change', sourceId: 'structure_selector', payloadType: 'OptionId' }],
    actions: [{ type: 'switch', valueType: 'OptionId', value: { type: 'read-control-value', nodeId: 'structure_selector' },
      cases: choices.map(value => ({ value, actions: [...visibility(value), { type: 'set-text', targetId: 'selection_summary', text: `Selected ${value}` }] })),
      defaultActions: [...visibility(), { type: 'set-text', targetId: 'selection_summary', text: 'No inspector' }],
    }],
  } satisfies Behavior];
  return doc;
}

export function ifChainProject() {
  const doc = branchControlProject(); doc.project.name = 'StructuresInspectorIfChain';
  const rule = doc.screens[0].behaviors[0], action = 'actions' in rule ? rule.actions[0] : rule.action;
  if (action.type !== 'switch' || action.valueType !== 'OptionId') throw new Error('Expected switch');
  const condition = (value: string) => ({ type: 'compare' as const, valueType: 'OptionId' as const, operator: 'equals' as const, left: { type: 'read-control-value' as const, nodeId: 'structure_selector' }, right: { type: 'constant' as const, value } });
  doc.screens[0].behaviors = [{ ...rule, id: 'inspect_if_chain', actions: [{ type: 'if',
    condition: { type: 'or', conditions: [condition('village'), { type: 'and', conditions: [condition('village'), { type: 'not', condition: condition('temple') }] }] },
    thenActions: action.cases[0].actions,
    elseIf: action.cases.slice(1).map(entry => ({ condition: condition(entry.value), actions: entry.actions })),
    elseActions: action.defaultActions ?? [],
  }] }];
  return doc;
}
