import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { collectStatusReferences, formatStatusReference, statusReferencesFor } from '../../../src/domain/statusReferences';
import type { Behavior, GuiScreen } from '../../../src/domain/schema';

function fixture(): GuiScreen {
  const screen = emptyProject().screens[0];
  screen.nodes.push(createNode('minecraft:status-indicator', 'status_view'), createNode('minecraft:status-indicator', 'status_other'));
  screen.behaviorMaps = [{ id: 'map_status', name: 'Status map', mappings: [{ optionId: 'village', statusId: 'status_running' }] }];
  screen.behaviors = [
    { id: 'rule_constant', event: { type: 'button-click', sourceId: 'btn' }, action: { type: 'set-status', targetId: 'status_view', statusId: 'status_warning' } },
    { id: 'rule_inline', event: { type: 'selection-change', sourceId: 'selector' }, actions: [{
      type: 'if', condition: { type: 'event-option', operator: 'equals', optionId: 'village' },
      thenActions: [{ type: 'set-status', targetId: 'status_view', optionMappings: [{ optionId: 'village', statusId: 'status_stopped' }] }],
      elseActions: [{
        type: 'switch', valueType: 'OptionId', value: { type: 'event-value', field: 'optionId' },
        cases: [{ value: 'village', actions: [{ type: 'set-status', targetId: 'status_view', statusId: 'status_running' }] }],
      }],
    }] },
    { id: 'rule_map', event: { type: 'button-click', sourceId: 'btn' }, action: { type: 'set-status', targetId: 'status_view', mapRef: 'map_status' } },
    { id: 'rule_other_target', event: { type: 'button-click', sourceId: 'btn' }, action: { type: 'set-status', targetId: 'status_other', statusId: 'status_running' } },
  ] as Behavior[];
  return screen;
}

describe('Q4-C status references', () => {
  it('finds constant, inline mapping, shared map and nested switch references for the owning indicator', () => {
    const references = collectStatusReferences(fixture(), 'status_view');
    expect([...references.keys()].sort()).toEqual(['status_running', 'status_stopped', 'status_warning']);
    expect(statusReferencesFor(references, 'status_warning').map(reference => reference.kind)).toEqual(['set-status']);
    expect(statusReferencesFor(references, 'status_stopped').map(reference => reference.kind)).toEqual(['status-map']);
    expect(statusReferencesFor(references, 'status_running').map(reference => reference.ruleId).sort()).toEqual(['behaviorMaps:map_status', 'rule_inline', 'rule_map']);
    // A rule targeting another indicator does not block this indicator's status IDs.
    expect(statusReferencesFor(references, 'status_running').some(reference => reference.ruleId === 'rule_other_target')).toBe(false);
    expect(formatStatusReference(statusReferencesFor(references, 'status_warning')[0])).toContain('rule_constant');
  });

  it('reports every shared map entry even before a rule consumes the map', () => {
    const screen = fixture();
    screen.behaviors = [];
    const references = collectStatusReferences(screen, 'status_view');
    expect(statusReferencesFor(references, 'status_running').map(reference => reference.kind)).toEqual(['shared-status-map']);
    expect(statusReferencesFor(references, 'status_running')[0].path).toContain('mappings[0]');
  });

  it('returns an empty map when no rule or shared map references a status', () => {
    const screen = fixture();
    screen.behaviors = [];
    screen.behaviorMaps = [];
    expect(collectStatusReferences(screen, 'status_view').size).toBe(0);
  });
});
