import { blocklyProject, sharedStatusRule } from './blocklyProject';
import { createNode, emptyProject } from '../../src/domain/model';

export function deletionProject() {
  const doc = blocklyProject(); doc.schemaVersion = '0.33.0';
  const main = doc.screens[0], other = emptyProject().screens[0]; other.id = 'screen_other';
  main.behaviorMaps = [{ id: 'shared_map', name: '保留的共享映射', mappings: [{ optionId: 'option_1', statusId: 'status_running' }] }];
  main.behaviors.push(sharedStatusRule(), { id: 'rule_condition', event: { type: 'selection-change', sourceId: 'node_22' }, actions: [{
    type: 'if', condition: { type: 'event-option', operator: 'equals', optionId: 'option_1' },
    thenActions: [{ type: 'set-status', targetId: 'node_26', mapRef: 'shared_map' }],
    elseActions: [{ type: 'set-status', targetId: 'node_26', optionMappings: [] }],
  }] });
  main.screenTargets = [{ id: 'to_other', name: 'Other', boundScreenId: other.id }];
  main.behaviors.push({ id: 'rule_to_other', event: { type: 'button-click', sourceId: 'legacy_button' }, action: { type: 'open_screen', targetScreenId: 'to_other' } });
  other.nodes = [createNode('minecraft:button', 'other_button')];
  other.screenTargets = [{ id: 'to_main', name: 'Main', boundScreenId: main.id }];
  other.behaviors = [
    { id: 'rule_to_main', event: { type: 'button-click', sourceId: 'other_button' }, action: { type: 'open_screen', targetScreenId: 'to_main' } },
    { id: 'rule_other', event: { type: 'button-click', sourceId: 'other_button' }, action: { type: 'set-visible', targetId: 'other_button', visible: false } },
  ];
  doc.screens.push(other); return doc;
}
