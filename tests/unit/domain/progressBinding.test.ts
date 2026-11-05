import { IMPLEMENTATION_SPEC_VERSION, EXPORT_MANIFEST_VERSION } from '../../../src/exports/versions';
import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { createNode, emptyProject } from '../../../src/domain/model';
import { mapSliderToProgress } from '../../../src/domain/progressBinding';
import { exportProject, parseProject, type Behavior } from '../../../src/domain/schema';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';
import { buildSpecification } from '../../../src/exports/specification';

const slider = () => {
  const node = createNode('minecraft:slider', 'slider_1');
  if (node.type !== 'minecraft:slider') throw Error('fixture');
  return node;
};
const progress = () => {
  const node = createNode('minecraft:progress-bar', 'progress_1');
  if (node.type !== 'minecraft:progress-bar') throw Error('fixture');
  return node;
};

describe('Q2-C Slider to Progress Bar mapping', () => {
  it('clamps direct values, maps normalized values, preserves the max endpoint and finite precision', () => {
    const source = { ...slider().props, min: 0, max: 10, step: 0.1, initialValue: 5, format: { decimals: 1, unit: '' } };
    const target = { min: 20, max: 80, initialValue: 20 };
    expect(mapSliderToProgress(source, target, 5, 'normalize')).toEqual({ value: 50 });
    expect(mapSliderToProgress(source, target, 10, 'normalize')).toEqual({ value: 80 });
    expect(mapSliderToProgress(source, target, 8.4, 'direct')).toEqual({ value: 20 });
    expect(mapSliderToProgress(source, target, 8.3, 'normalize')).toEqual({ value: 69.8 });
    expect(mapSliderToProgress(source, target, 10.1, 'normalize')).toHaveProperty('error');
    expect(mapSliderToProgress(source, target, Infinity, 'direct')).toHaveProperty('error');
  });
  it('defines constant ranges without division and rejects non-finite mappings', () => {
    const source = { ...slider().props, min: 4, max: 4, step: 1, initialValue: 4, format: { decimals: 0, unit: '' } };
    expect(mapSliderToProgress(source, { min: -5, max: 5, initialValue: 0 }, 4, 'normalize')).toEqual({ value: -5 });
    expect(mapSliderToProgress(source, { min: 9, max: 9, initialValue: 9 }, 4, 'normalize')).toEqual({ value: 9 });
    expect(mapSliderToProgress(source, { min: -5, max: 5, initialValue: 0 }, 4, 'direct')).toEqual({ value: 4 });
  });
});

describe('Q2-C F2 schema, history and export contract', () => {
  it('upgrades only when the explicit slider rule is saved and round-trips through undo/redo', async () => {
    const store = createEditorStore();
    store.getState().add('minecraft:slider'); const sourceId = store.getState().selected!;
    store.getState().add('minecraft:progress-bar'); const targetId = store.getState().selected!;
    const before = structuredClone(store.getState().doc);
    const rule: Behavior = { id: 'rule_1', event: { type: 'slider-change', sourceId }, actions: [{ type: 'set-progress-value', targetId, mapping: 'normalize' }] };
    store.getState().saveBehavior(rule);
    const saved = structuredClone(store.getState().doc);
    expect(saved.schemaVersion).toBe('0.29.0');
    expect(parseProject(exportProject(saved))).toEqual(saved);
    store.getState().undo(); expect(store.getState().doc).toEqual(before);
    store.getState().redo(); expect(store.getState().doc).toEqual(saved);

    const snapshot = beginExport(saved), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json');
    expect(spec.version).toBe(IMPLEMENTATION_SPEC_VERSION);
    expect(spec.designIntent.sliderProgressBindings).toMatchObject([{ sourceId, targetId, mapping: 'normalize', event: { type: 'slider-change', phase: 'change' } }]);
    expect(spec.designIntent.sliderProgressBindingContract!.implementation).toContain('no Java runtime is generated');
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([137, 80, 78, 71]));
    expect(bundle.manifest.version).toBe(EXPORT_MANIFEST_VERSION);
    expect(bundle.manifest.screens[0].sliderProgressBindings).toMatchObject([{ sourceId, targetId, mapping: 'normalize' }]);
  });
  it('rejects old-schema use and invalid source, target, or mixed action pairs atomically', () => {
    const doc = emptyProject(), source = slider(), target = progress();
    doc.schemaVersion = '0.29.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
    doc.screens[0].nodes.push(source, target);
    const rule: Behavior = { id: 'rule_1', event: { type: 'slider-change', sourceId: source.id }, action: { type: 'set-progress-value', targetId: target.id, mapping: 'direct' } };
    doc.screens[0].behaviors.push(rule);
    expect(parseProject(JSON.stringify(doc)).screens[0].behaviors).toEqual([rule]);
    const old = structuredClone(doc); old.schemaVersion = '0.28.0'; expect(() => parseProject(JSON.stringify(old))).toThrow('Schema 0.29.0');
    const badSource = structuredClone(doc); badSource.screens[0].behaviors[0].event.sourceId = target.id; expect(() => parseProject(JSON.stringify(badSource))).toThrow('事件来源');
    const badTarget = structuredClone(doc); if ('action' in badTarget.screens[0].behaviors[0]) badTarget.screens[0].behaviors[0].action = { type: 'set-progress-value', targetId: source.id, mapping: 'direct' }; expect(() => parseProject(JSON.stringify(badTarget))).toThrow('动作目标');
    const mixed = structuredClone(doc); mixed.screens[0].behaviors[0] = { id: 'rule_1', event: { type: 'slider-change', sourceId: source.id }, actions: [{ type: 'set-progress-value', targetId: target.id, mapping: 'direct' }, { type: 'set-visible', targetId: target.id, visible: true }] }; expect(() => parseProject(JSON.stringify(mixed))).toThrow('仅能搭配');
    expect(doc.screens[0].behaviors[0].event.sourceId).toBe(source.id);
  });
});
