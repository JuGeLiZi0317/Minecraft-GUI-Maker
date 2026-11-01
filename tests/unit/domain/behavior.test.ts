import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { parseProject } from '../../../src/domain/schema';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification, buildPrompt } from '../../../src/exports/specification';

describe('F0 behavior contract', () => {
  it('upgrades and validates rules atomically, preserving history and referenced deletion', async () => {
    const store = createEditorStore(); store.getState().add('minecraft:button'); store.getState().add('minecraft:string-widget');
    const before = structuredClone(store.getState().doc);
    store.getState().saveBehavior({ id: 'rule_1', event: { type: 'button-click', sourceId: 'node_1' }, action: { type: 'set-text', targetId: 'node_2', text: 'Hello' } });
    const after = structuredClone(store.getState().doc); expect(after.schemaVersion).toBe('0.17.0');
    store.getState().undo(); expect(store.getState().doc).toEqual(before); store.getState().redo(); expect(store.getState().doc).toEqual(after);
    expect(parseProject(JSON.stringify(after))).toEqual(after);
    const snap = beginExport(after), spec = buildSpecification(snap, await referenceFor(snap), 'x.json');
    expect(spec.designIntent.behaviors).toEqual(after.screens[0].behaviors); expect(buildPrompt(spec)).toContain('button-click');
    const invalid = structuredClone(after); invalid.schemaVersion = '0.5.0'; expect(() => store.getState().importJson(JSON.stringify(invalid))).toThrow(); expect(store.getState().doc).toEqual(after);
    const bad = structuredClone(after); bad.screens[0].behaviors[0].event.sourceId = 'node_2'; expect(() => parseProject(JSON.stringify(bad))).toThrow();
    store.getState().select('node_2'); expect(() => store.getState().deleteSelected()).toThrow('引用'); expect(store.getState().doc).toEqual(after);
    store.getState().deleteBehavior('rule_1'); store.getState().deleteSelected(); store.getState().undo(); store.getState().undo(); expect(store.getState().doc).toEqual(after);
    store.getState().add('minecraft:checkbox'); store.getState().setPanel(true); expect(store.getState().doc.schemaVersion).toBe('0.17.0');
  });
  it('rejects unknown events, actions and mismatched target types without partial changes', () => {
    const store = createEditorStore(); store.getState().add('minecraft:checkbox'); store.getState().add('minecraft:button'); const before = store.getState().doc;
    expect(() => store.getState().saveBehavior({ id: 'rule_1', event: { type: 'checkbox-change', sourceId: 'node_1' }, action: { type: 'set-text', targetId: 'node_2', text: 'x' } })).toThrow();
    expect(store.getState().doc).toEqual(before);
    const bad = structuredClone(before) as any; bad.schemaVersion = '0.6.0'; bad.screens[0].behaviors = [{ id: 'r', event: { type: 'script', sourceId: 'node_1' }, action: { type: 'set-visible', targetId: 'node_2', visible: true } }];
    expect(() => parseProject(JSON.stringify(bad))).toThrow(); bad.screens[0].behaviors[0].event.type = 'checkbox-change'; bad.screens[0].behaviors[0].action.type = 'script'; expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });
});
