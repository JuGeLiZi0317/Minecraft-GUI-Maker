import { structuresInspectorProject } from './structuresInspectorProject';
import type { Behavior } from '../../src/domain/schema';

export const EXCLUSIVE_CHOICES = ['village', 'temple', 'end_city'] as const;

/**
 * Structures Inspector demo rewritten as one declarative exclusive visibility mapping.
 * Mirrors the B1.11 Switch demo for the three declared options so both can be compared.
 */
export function exclusiveVisibilityProject(config: { fallback?: 'hide-all' | 'keep-current'; value?: 'read-selection' | 'event-value'; endCityTarget?: string; extraOption?: string } = {}) {
  const doc = structuresInspectorProject();
  doc.schemaVersion = '0.46.0';
  doc.project.name = 'StructuresInspectorExclusive';
  const screen = doc.screens[0], selectorId = 'structure_selector';
  const selector = screen.nodes.find(node => node.id === selectorId);
  if (!selector || (selector.type !== 'minecraft:radio-group' && selector.type !== 'minecraft:dropdown')) throw new Error('Missing selector');
  if (config.extraOption) selector.props.options.push({ id: config.extraOption, label: { kind: 'literal', value: config.extraOption }, disabled: false });
  const targets: Record<string, string> = { village: 'inspector_village', temple: 'inspector_temple', end_city: config.endCityTarget ?? 'inspector_end_city' };
  const value = config.value === 'event-value' ? { type: 'event-value' as const, field: 'optionId' as const } : { type: 'read-control-value' as const, nodeId: selectorId };
  screen.behaviors = [{
    id: 'inspect_exclusive',
    event: { type: 'selection-change', sourceId: selectorId },
    eventBindings: [{ type: 'selection-change', sourceId: selectorId, payloadType: 'OptionId' }],
    actions: [{ type: 'set-exclusive-visible', value, mapping: EXCLUSIVE_CHOICES.map(choice => ({ optionId: choice, targetId: targets[choice] })), fallback: config.fallback ?? 'hide-all' }],
  } satisfies Behavior];
  return doc;
}