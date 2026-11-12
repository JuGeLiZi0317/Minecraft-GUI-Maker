import { literal } from '../../src/domain/model';
import { exclusiveVisibilityProject } from './exclusiveVisibilityProject';
import type { Behavior, GuiScreen } from '../../src/domain/schema';
import type { NamedTextMapping } from '../../src/domain/textMapping';

export const STRUCTURE_TITLE_KEYS = {
  village: 'gui.customdim.structure.village',
  temple: 'gui.customdim.structure.temple',
  end_city: 'gui.customdim.structure.end_city',
} as const;
export const STRUCTURE_CHOICES = Object.keys(STRUCTURE_TITLE_KEYS) as (keyof typeof STRUCTURE_TITLE_KEYS)[];

const translate = (choice: keyof typeof STRUCTURE_TITLE_KEYS) => ({ kind: 'translate' as const, key: STRUCTURE_TITLE_KEYS[choice], fallback: `${choice[0].toUpperCase()}${choice.slice(1).replace('_', ' ')}` });

export function structureTitleMapping(): NamedTextMapping {
  return { id: 'mapping_structure_title', name: 'StructureTitle', inputType: 'OptionId', outputType: 'Text', entries: STRUCTURE_CHOICES.map(choice => ({ key: choice, value: translate(choice) })), fallback: { kind: 'literal', value: 'Unknown Structure' } };
}

/**
 * Structures Inspector with one declarative rule: exclusive container visibility plus a
 * named-mapping Lookup that writes the Inspector title. The initial title matches the
 * initial option; no initialization event is added.
 */
export function namedMappingProject(config: { fallback?: 'hide-all' | 'keep-current'; inputMode?: 'read' | 'event'; mapping?: NamedTextMapping | null } = {}) {
  const doc = exclusiveVisibilityProject({ fallback: config.fallback ?? 'hide-all' });
  doc.schemaVersion = '0.47.0';
  doc.project.name = 'StructuresInspectorTitles';
  const screen = doc.screens[0] as GuiScreen;
  if (config.mapping !== null) screen.textMappings = [config.mapping ?? structureTitleMapping()];
  const summary = screen.nodes.find(node => node.id === 'selection_summary');
  if (summary && summary.type === 'minecraft:string-widget') summary.props.text = translate('village');
  const rule = screen.behaviors[0] as Extract<Behavior, { actions: unknown[] }>;
  const exclusive = (rule.actions as unknown[])[0];
  screen.behaviors = [{
    id: 'inspect_structure',
    event: { type: 'selection-change', sourceId: 'structure_selector' },
    eventBindings: [{ type: 'selection-change', sourceId: 'structure_selector', payloadType: 'OptionId' }],
    actions: [exclusive, {
      type: 'set-text',
      targetId: 'selection_summary',
      value: { type: 'lookup', mappingId: 'mapping_structure_title', input: config.inputMode === 'event' ? { type: 'event-value', field: 'optionId' } : { type: 'read-control-value', nodeId: 'structure_selector' } },
    }],
  }] as unknown as Behavior[];
  void literal;
  return doc;
}