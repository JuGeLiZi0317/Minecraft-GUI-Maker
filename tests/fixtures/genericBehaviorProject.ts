import { usabilityProject } from './blocklyUsabilityProject';
import { createNode, literal } from '../../src/domain/model';
import type { Behavior, BehaviorCondition } from '../../src/domain/schema';
export function genericRule(kind: 'OptionId' | 'Number'): Behavior {
  const condition: BehaviorCondition = kind === 'OptionId'
    ? { type: 'compare', valueType: 'OptionId', operator: 'equals', left: { type: 'event-value', field: 'optionId' }, right: { type: 'constant', value: 'option_1' } }
    : { type: 'compare', valueType: 'Number', operator: 'greater-than', left: { type: 'event-value', field: 'value' }, right: { type: 'constant', value: 5 } };
  return kind === 'OptionId'
    ? { id: 'rule_generic_option', event: { type: 'selection-change', sourceId: 'node_22' }, actions: [{ type: 'if', condition, thenActions: [{ type: 'set-status', targetId: 'node_26', statusId: 'status_running' }], elseActions: [{ type: 'set-status', targetId: 'node_26', statusId: 'status_warning' }] }] }
    : { id: 'rule_generic_number', event: { type: 'slider-change', sourceId: 'slider_source' }, actions: [{ type: 'if', condition, thenActions: [{ type: 'set-progress-value', targetId: 'progress_target', mapping: 'normalize' }], elseActions: [{ type: 'set-progress-value', targetId: 'progress_target', mapping: 'direct' }] }] };
}
export function genericBehaviorProject(withRules = true) {
  const doc = usabilityProject(); doc.screens[0].designSize = { width: 480, height: 280, unit: 'gui-px' };
  const slider = createNode('minecraft:slider', 'slider_source'), progress = createNode('minecraft:progress-bar', 'progress_target');
  slider.bounds = { x: 10, y: 190, w: 180, h: 20 }; progress.bounds = { x: 225, y: 190, w: 180, h: 20 };
  if (slider.type === 'minecraft:slider') { slider.props.name = literal('通用数值来源'); slider.props.min = 0; slider.props.max = 10; slider.props.step = 1; slider.props.initialValue = 0; }
  if (progress.type === 'minecraft:progress-bar') { progress.props.min = 0; progress.props.max = 100; progress.props.initialValue = 0; }
  doc.screens[0].nodes.push(slider, progress);
  if (withRules) { doc.schemaVersion = '0.35.0'; doc.screens[0].behaviors.push(genericRule('OptionId'), genericRule('Number')); }
  return doc;
}
