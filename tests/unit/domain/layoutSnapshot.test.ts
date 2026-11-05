import { describe, expect, it } from 'vitest';
import { canonical, semanticFingerprint, validSnapshot } from '../../../src/behavior/layoutSnapshot';
import { behaviorToWorkspace, workspaceToBehavior } from '../../../src/behavior/blocklyModel';
import { sharedStatusRule } from '../../fixtures/blocklyProject';

describe('Blockly layout cache authority boundary', () => {
  it('normalizes object order while preserving ordered actions', () => {
    expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
    expect(canonical({ actions: [1, 2] })).not.toBe(canonical({ actions: [2, 1] }));
  });
  it('rejects incompatible versions, rule changes and shared-map changes', () => {
    const rule = sharedStatusRule(), maps: any[] = [];
    const snapshot = { version: 1, blocklyVersion: '13', screenId: 'screen', ruleId: rule.id, fingerprint: semanticFingerprint(rule, maps), state: {} };
    expect(validSnapshot(snapshot, 'screen', rule, maps, '13')).toBe(true);
    expect(validSnapshot(snapshot, 'other', rule, maps, '13')).toBe(false);
    expect(validSnapshot(snapshot, 'screen', rule, maps, '14')).toBe(false);
    expect(validSnapshot(snapshot, 'screen', { ...rule, id: 'other' }, maps, '13')).toBe(false);
    expect(validSnapshot(snapshot, 'screen', rule, [{ id: 'm', name: 'm', mappings: [] }], '13')).toBe(false);
    expect(validSnapshot(null, 'screen', rule, maps, '13')).toBe(false);
    expect(validSnapshot(snapshot, 'screen', { ...rule, event: { ...rule.event, sourceId: 'changed' } }, maps, '13')).toBe(false);
    const graph = behaviorToWorkspace(rule); graph.blocks!.blocks[0].type = 'unknown_block';
    expect(() => workspaceToBehavior(graph, rule.id, rule)).toThrow();
  });
});
