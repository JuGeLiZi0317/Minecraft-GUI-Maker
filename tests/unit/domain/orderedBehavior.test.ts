import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { actionsOf, parseProject, type Behavior } from '../../../src/domain/schema';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildPrompt, buildSpecification } from '../../../src/exports/specification';

describe('F2 ordered behavior', () => {
  it('upgrades only when ordered actions are committed and preserves their references and order', async () => {
    const store = createEditorStore(); store.getState().add('minecraft:button'); store.getState().add('minecraft:string-widget'); store.getState().add('minecraft:fill');
    const before = structuredClone(store.getState().doc);
    const rule: Behavior = { id: 'rule_1', event: { type: 'button-click', sourceId: 'node_1' }, actions: [
      { type: 'set-visible', targetId: 'node_3', visible: false }, { type: 'set-text', targetId: 'node_2', text: 'hello' }, { type: 'set-visible', targetId: 'node_3', visible: true },
    ] };
    store.getState().saveBehavior(rule); const saved = structuredClone(store.getState().doc); expect(saved.schemaVersion).toBe('0.8.0');
    store.getState().undo(); expect(store.getState().doc).toEqual(before); store.getState().redo(); expect(store.getState().doc).toEqual(saved);
    expect(parseProject(JSON.stringify(saved))).toEqual(saved); expect(actionsOf(saved.screens[0].behaviors[0])).toEqual(rule.actions);
    const bad = structuredClone(saved); bad.schemaVersion = '0.7.0'; expect(() => parseProject(JSON.stringify(bad))).toThrow('0.8.0');
    const missing = structuredClone(saved); if ('actions' in missing.screens[0].behaviors[0]) missing.screens[0].behaviors[0].actions[1] = { type: 'set-text', targetId: 'missing', text: 'x' };
    expect(() => store.getState().importJson(JSON.stringify(missing))).toThrow(); expect(store.getState().doc).toEqual(saved);
    for (const id of ['node_1', 'node_2', 'node_3']) { store.getState().select(id); expect(() => store.getState().deleteSelected()).toThrow('引用'); expect(store.getState().doc).toEqual(saved); }
    store.getState().add('minecraft:checkbox'); store.getState().setPanel(true); expect(store.getState().doc.schemaVersion).toBe('0.8.0');
    const snapshot = beginExport(saved), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'x.json'); expect(spec.designIntent.behaviors).toEqual(saved.screens[0].behaviors); expect(buildPrompt(spec)).toContain('actions 数组按顺序执行');
  });
  it('keeps old single-action F0 documents unchanged and blocks unsupported shapes', () => {
    const store = createEditorStore(); store.getState().add('minecraft:button'); store.getState().add('minecraft:string-widget');
    store.getState().saveBehavior({ id: 'rule_1', event: { type: 'button-click', sourceId: 'node_1' }, action: { type: 'set-text', targetId: 'node_2', text: 'old' } });
    const old = structuredClone(store.getState().doc); expect(old.schemaVersion).toBe('0.6.0'); expect(parseProject(JSON.stringify(old))).toEqual(old);
    const mixed = structuredClone(old) as any; mixed.schemaVersion = '0.8.0'; mixed.screens[0].behaviors[0].actions = [mixed.screens[0].behaviors[0].action]; expect(() => parseProject(JSON.stringify(mixed))).toThrow();
  });
  it('protects screen targets referenced by an ordered rule and never downgrades on rename', () => {
    const store = createEditorStore(); store.getState().add('minecraft:fill'); store.getState().saveScreenTarget({ id: 'screen_1', name: 'Settings' });
    store.getState().saveBehavior({ id: 'rule_1', event: { type: 'rectangle-click', sourceId: 'node_1' }, actions: [{ type: 'set-visible', targetId: 'node_1', visible: true }, { type: 'open_screen', targetScreenId: 'screen_1' }] });
    expect(() => store.getState().deleteScreenTarget('screen_1')).toThrow('引用');
    store.getState().saveScreenTarget({ id: 'screen_1', name: 'Renamed' }); expect(store.getState().doc.schemaVersion).toBe('0.8.0');
    expect(store.getState().doc.screens[0].screenTargets?.[0]).toEqual({ id: 'screen_1', name: 'Renamed' });
  });
});
