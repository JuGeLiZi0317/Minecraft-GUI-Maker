import { createNode, emptyProject, literal } from '../../src/domain/model';
import type { Behavior } from '../../src/domain/schema';

export function blocklyProject() {
  const doc = emptyProject(); doc.schemaVersion = '0.30.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
  const radio = createNode('minecraft:radio-group', 'node_22'), dropdown = createNode('minecraft:dropdown', 'node_23'), status = createNode('minecraft:status-indicator', 'node_26');
  for (const node of [radio, dropdown]) if (node.type === 'minecraft:radio-group' || node.type === 'minecraft:dropdown') {
    node.props.name = literal(node.type === 'minecraft:radio-group' ? '主选择' : '备用选择');
    node.props.options = [
      { id: 'option_1', label: literal('相同名称'), disabled: false }, { id: 'option_2', label: literal('相同名称'), disabled: false },
      { id: 'option_3', label: literal('未映射'), disabled: false }, { id: 'option_4', label: literal('禁用'), disabled: true },
    ]; node.props.initialSelectedOptionId = 'option_1';
  }
  radio.bounds = { x: 10, y: 15, w: 120, h: 80 }; dropdown.bounds = { x: 155, y: 20, w: 140, h: 20 };
  if (status.type === 'minecraft:status-indicator') { status.props.name = literal('共享状态'); status.props.initialStatusId = 'status_stopped'; }
  status.bounds = { x: 155, y: 105, w: 130, h: 24 };
  const button = createNode('minecraft:button', 'legacy_button'), label = createNode('minecraft:string-widget', 'legacy_label');
  button.bounds = { x: 10, y: 140, w: 50, h: 20 }; label.bounds = { x: 70, y: 140, w: 100, h: 18 };
  doc.screens[0].nodes = [radio, dropdown, status, button, label];
  doc.screens[0].behaviors = [{ id: 'rule_legacy', event: { type: 'button-click', sourceId: button.id }, action: { type: 'set-text', targetId: label.id, text: '保留原规则' } }];
  return doc;
}
export function sharedStatusRule(): Behavior {
  return { id: 'rule_shared', event: { type: 'selection-change', sourceId: 'node_22', additionalSourceIds: ['node_23'] }, actions: [
    { type: 'set-status', targetId: 'node_26', optionMappings: [{ optionId: 'option_1', statusId: 'status_running' }, { optionId: 'option_2', statusId: 'status_warning' }] },
  ] };
}
