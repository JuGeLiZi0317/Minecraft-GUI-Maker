import { blocklyProject } from './blocklyProject';
import { literal } from '../../src/domain/model';
import type { Behavior } from '../../src/domain/schema';
export function simpleStatusRule(): Behavior {
  return { id: 'rule_simple', event: { type: 'selection-change', sourceId: 'node_22' }, actions: [{ type: 'if', condition: { type: 'event-option', operator: 'equals', optionId: 'option_1' }, thenActions: [{ type: 'set-status', targetId: 'node_26', statusId: 'status_running' }], elseActions: [{ type: 'set-status', targetId: 'node_26', statusId: 'status_warning' }] }] };
}
export function usabilityProject() {
  const doc = blocklyProject();
  for (const node of doc.screens[0].nodes) if (node.type === 'minecraft:radio-group' || node.type === 'minecraft:dropdown') {
    node.props.options[0].label = literal('启动'); node.props.options[1].label = literal('其他'); node.props.initialSelectedOptionId = 'option_2';
  }
  return doc;
}
