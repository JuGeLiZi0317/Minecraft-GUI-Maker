import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { parseProject } from '../../../src/domain/schema';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildPrompt, buildSpecification } from '../../../src/exports/specification';

describe('F1 rectangle and screen declarations', () => {
  it('validates targets, versions, rename, deletion and full history without downgrading F0', async () => {
    const store = createEditorStore(); store.getState().add('minecraft:fill'); const old = structuredClone(store.getState().doc);
    store.getState().saveScreenTarget({ id: 'screen_1', name: 'Options' }); expect(store.getState().doc.schemaVersion).toBe('0.7.0');
    store.getState().saveBehavior({ id: 'rule_1', event: { type: 'rectangle-click', sourceId: 'node_1' }, action: { type: 'open_screen', targetScreenId: 'screen_1' } });
    store.getState().saveScreenTarget({ id: 'screen_1', name: 'Settings' });
    const doc = structuredClone(store.getState().doc); expect(doc.screens[0].screenTargets).toEqual([{ id: 'screen_1', name: 'Settings' }]);
    expect(() => store.getState().deleteScreenTarget('screen_1')).toThrow('引用'); expect(store.getState().doc).toEqual(doc);
    store.getState().undo(); expect(store.getState().doc.screens[0].screenTargets?.[0].name).toBe('Options'); store.getState().redo(); expect(store.getState().doc).toEqual(doc);
    const legacy = structuredClone(doc); legacy.schemaVersion = '0.6.0'; expect(() => parseProject(JSON.stringify(legacy))).toThrow();
    const missing = structuredClone(doc); missing.screens[0].screenTargets = []; expect(() => parseProject(JSON.stringify(missing))).toThrow('未声明');
    const wrong = structuredClone(doc); wrong.screens[0].behaviors[0].event.sourceId = 'screen_1'; expect(() => parseProject(JSON.stringify(wrong))).toThrow();
    const snapshot = beginExport(doc), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json'), prompt = buildPrompt(spec);
    expect(spec.designIntent.screenTargets).toEqual(doc.screens[0].screenTargets); expect(prompt).toContain('mouse hit testing'); expect(prompt).toContain('target Screen creation and switching');
    store.getState().add('minecraft:checkbox'); store.getState().setPanel(true); expect(store.getState().doc.schemaVersion).toBe('0.7.0');
    store.getState().select('node_1'); expect(() => store.getState().deleteSelected()).toThrow('引用'); expect(store.getState().doc.screens[0].behaviors).toHaveLength(1);
    expect(old.schemaVersion).toBe('0.1.0'); expect(old.screens[0].screenTargets).toBeUndefined();
  });
  it('rejects old-version declaration even if empty and preserves valid F0 documents', () => {
    const store = createEditorStore(); store.getState().add('minecraft:button'); store.getState().add('minecraft:string-widget');
    store.getState().saveBehavior({ id: 'rule_1', event: { type: 'button-click', sourceId: 'node_1' }, action: { type: 'set-text', targetId: 'node_2', text: 'Hello' } });
    const f0 = structuredClone(store.getState().doc); expect(f0.schemaVersion).toBe('0.6.0'); expect(parseProject(JSON.stringify(f0))).toEqual(f0);
    f0.screens[0].screenTargets = []; expect(() => parseProject(JSON.stringify(f0))).toThrow('0.7.0');
  });
});
