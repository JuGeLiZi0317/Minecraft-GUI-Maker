import { describe, expect, it } from 'vitest';
import { createNode } from '../../../src/domain/model';
import { collectOptionReferences, optionReferencesFor, formatOptionReference } from '../../../src/domain/optionReferences';
import { structuresInspectorProject } from '../../fixtures/structuresInspectorProject';
import type { Behavior, GuiNode } from '../../../src/domain/schema';

function fixture() {
  const doc = structuresInspectorProject();
  const screen = doc.screens[0];
  const status = createNode('minecraft:status-indicator', 'status_view', { x: 300, y: 200 });
  const button = createNode('minecraft:button', 'other_button', { x: 300, y: 260 });
  screen.nodes.push(status, button);
  screen.textMappings = [{ id: 'mapping_title', name: 'Title', inputType: 'OptionId', outputType: 'Text', entries: [{ key: 'temple', value: { kind: 'literal', value: 'T' } }], fallback: { kind: 'literal', value: '-' } }];
  screen.behaviors = [
    { id: 'rule_condition', event: { type: 'selection-change', sourceId: 'structure_selector' }, eventBindings: [{ type: 'selection-change', sourceId: 'structure_selector', payloadType: 'OptionId' }],
      actions: [{ type: 'if', condition: { type: 'compare', valueType: 'OptionId', operator: 'equals', left: { type: 'read-control-value', nodeId: 'structure_selector' }, right: { type: 'constant', value: 'night' } }, thenActions: [{ type: 'set-text', targetId: 'selection_summary', text: 'x' }], elseActions: [] }] },
    { id: 'rule_exclusive', event: { type: 'selection-change', sourceId: 'structure_selector' }, eventBindings: [{ type: 'selection-change', sourceId: 'structure_selector', payloadType: 'OptionId' }],
      actions: [{ type: 'set-exclusive-visible', value: { type: 'read-control-value', nodeId: 'structure_selector' }, mapping: [{ optionId: 'village', targetId: 'inspector_village' }, { optionId: 'temple', targetId: 'inspector_temple' }], fallback: 'hide-all' }] },
    { id: 'rule_status', event: { type: 'selection-change', sourceId: 'structure_selector' }, eventBindings: [{ type: 'selection-change', sourceId: 'structure_selector', payloadType: 'OptionId' }],
      actions: [{ type: 'set-status', targetId: 'status_view', optionMappings: [{ optionId: 'end_city', statusId: 'status_a' }] }] },
    { id: 'rule_lookup', event: { type: 'selection-change', sourceId: 'structure_selector' }, eventBindings: [{ type: 'selection-change', sourceId: 'structure_selector', payloadType: 'OptionId' }],
      actions: [{ type: 'set-text', targetId: 'selection_summary', value: { type: 'lookup', mappingId: 'mapping_title', input: { type: 'read-control-value', nodeId: 'structure_selector' } } }] },
    { id: 'rule_other', event: { type: 'button-click', sourceId: 'other_button' }, actions: [{ type: 'if', condition: { type: 'compare', valueType: 'OptionId', operator: 'equals', left: { type: 'constant', value: 'village' }, right: { type: 'constant', value: 'village' } }, thenActions: [{ type: 'set-text', targetId: 'selection_summary', text: 'y' }], elseActions: [] }] },
  ] as unknown as Behavior[];
  for (const option of ['village', 'temple', 'end_city', 'night']) {
    const selector = screen.nodes.find(node => node.id === 'structure_selector') as Extract<GuiNode, { type: 'minecraft:radio-group' }>;
    if (!selector.props.options.some(item => item.id === option)) selector.props.options.push({ id: option, label: { kind: 'literal', value: option }, disabled: false });
  }
  return doc;
}

describe('Q4 option references', () => {
  it('finds conditions, shared maps, exclusive mappings and named mappings for the owning control only', () => {
    const doc = fixture();
    const references = collectOptionReferences(doc.screens[0], 'structure_selector');
    expect([...references.keys()].sort()).toEqual(['end_city', 'night', 'temple', 'village']);
    expect(optionReferencesFor(references, 'night').map(item => item.kind)).toContain('condition');
    expect(optionReferencesFor(references, 'village').map(item => item.kind).sort()).toEqual(['exclusive-visibility']);
    expect(optionReferencesFor(references, 'temple').map(item => item.kind)).toContain('exclusive-visibility');
    expect(optionReferencesFor(references, 'temple').map(item => item.kind)).toContain('text-mapping');
    expect(optionReferencesFor(references, 'end_city').map(item => item.kind)).toEqual(['status-map']);
    // A rule bound to another control must not be attributed to this control.
    expect(optionReferencesFor(references, 'village').some(item => item.ruleId === 'rule_other')).toBe(false);
    expect(formatOptionReference(optionReferencesFor(references, 'night')[0])).toContain('rule_condition');
  });

  it('returns an empty map for a control with no rules', () => {
    const doc = fixture();
    doc.screens[0].behaviors = [];
    expect(collectOptionReferences(doc.screens[0], 'structure_selector').size).toBe(0);
  });
});