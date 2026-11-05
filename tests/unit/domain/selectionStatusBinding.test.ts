import { IMPLEMENTATION_SPEC_VERSION, EXPORT_MANIFEST_VERSION } from '../../../src/exports/versions';
import { describe, expect, it } from 'vitest';
import { emptyProject, createNode } from '../../../src/domain/model';
import { parseProject, type Behavior, type BehaviorAction } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { resolveOptionStatusMapping, SELECTION_STATUS_BINDING_CONTRACT } from '../../../src/domain/selectionStatusBinding';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';

function fixture() {
  const doc = emptyProject(); doc.schemaVersion = '0.30.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
  const radio = createNode('minecraft:radio-group', 'radio_1');
  if (radio.type === 'minecraft:radio-group') radio.props.options = [
    { id: 'option_a', label: { kind: 'literal', value: 'Same label' }, disabled: false },
    { id: 'option_b', label: { kind: 'literal', value: 'Same label' }, disabled: false },
    { id: 'option_c', label: { kind: 'literal', value: 'Unmapped' }, disabled: false },
  ];
  if (radio.type === 'minecraft:radio-group') radio.props.initialSelectedOptionId = 'option_a';
  const status = createNode('minecraft:status-indicator', 'status_1');
  const dropdown = createNode('minecraft:dropdown', 'dropdown_1');
  doc.screens[0].nodes.push(radio, dropdown, status);
  return { doc, radio, dropdown, status };
}

describe('Q3-A selection to Status Indicator binding', () => {
  it('resolves strictly by stable IDs and keeps unmapped options inert', () => {
    const mappings = [{ optionId: 'option_a', statusId: 'status_running' }, { optionId: 'option_b', statusId: 'status_warning' }];
    expect(resolveOptionStatusMapping('option_a', mappings, ['status_running', 'status_warning'])).toEqual({ kind: 'mapped', statusId: 'status_running' });
    expect(resolveOptionStatusMapping('option_b', mappings, ['status_running', 'status_warning'])).toEqual({ kind: 'mapped', statusId: 'status_warning' });
    expect(resolveOptionStatusMapping('option_c', mappings, ['status_running', 'status_warning'])).toEqual({ kind: 'unmapped' });
    expect(resolveOptionStatusMapping('option_a', mappings, ['status_warning'])).toEqual({ kind: 'invalid', statusId: 'status_running' });
    expect(SELECTION_STATUS_BINDING_CONTRACT.unmapped).toContain('never infer by label');
  });

  it('rejects invalid source, target, duplicate mappings and stale option/status references atomically', () => {
    const { doc } = fixture();
    const valid: Behavior = { id: 'rule_1', event: { type: 'selection-change', sourceId: 'radio_1' }, action: { type: 'set-status', targetId: 'status_1', optionMappings: [{ optionId: 'option_a', statusId: 'status_running' }] } };
    doc.screens[0].behaviors.push(valid); expect(parseProject(JSON.stringify(doc))).toEqual(doc);
    const bad = (mutate: (rule: Extract<BehaviorAction, { type: 'set-status' }>) => void) => {
      const copy = structuredClone(doc), rule = copy.screens[0].behaviors[0]; if (!('action' in rule) || rule.action.type !== 'set-status') throw new Error('fixture error'); mutate(rule.action); return () => parseProject(JSON.stringify(copy));
    };
    expect(bad(action => { if ('optionMappings' in action) action.optionMappings.push({ optionId: 'option_a', statusId: 'status_warning' }); })).toThrow('不能重复');
    expect(bad(action => { if ('optionMappings' in action) action.optionMappings[0].optionId = 'missing_option'; })).toThrow('有效选项 ID');
    expect(bad(action => { if ('optionMappings' in action) action.optionMappings[0].statusId = 'missing_status'; })).toThrow('有效状态 ID');
    const wrongSource = structuredClone(doc); (wrongSource.screens[0].behaviors[0] as { event: { sourceId: string } }).event.sourceId = 'status_1'; expect(() => parseProject(JSON.stringify(wrongSource))).toThrow('事件来源不存在');
    const wrongTarget = structuredClone(doc); if ('action' in wrongTarget.screens[0].behaviors[0]) wrongTarget.screens[0].behaviors[0].action = { type: 'set-status', targetId: 'radio_1', optionMappings: [] }; expect(() => parseProject(JSON.stringify(wrongTarget))).toThrow('动作目标不存在');
    const crossScreen = structuredClone(doc), foreignScreen = structuredClone(crossScreen.screens[0]); foreignScreen.id = 'screen_other'; foreignScreen.title = { kind: 'literal', value: 'Other' }; foreignScreen.nodes = [createNode('minecraft:status-indicator', 'status_other')]; foreignScreen.behaviors = []; crossScreen.screens.push(foreignScreen);
    if ('action' in crossScreen.screens[0].behaviors[0]) crossScreen.screens[0].behaviors[0].action = { type: 'set-status', targetId: 'status_other', optionMappings: [] };
    expect(() => parseProject(JSON.stringify(crossScreen))).toThrow('动作目标不存在');
    const oldVersion = structuredClone(doc); oldVersion.schemaVersion = '0.29.0'; expect(() => parseProject(JSON.stringify(oldVersion))).toThrow('Schema 0.30.0');
  });

  it('uses normal history, preserves Q2-C rules at Schema 0.30 and exports Screen-local mappings', async () => {
    const { doc } = fixture(); doc.schemaVersion = '0.29.0'; const store = createEditorStore(doc);
    const original = structuredClone(store.getState().doc);
    store.getState().saveBehavior({ id: 'rule_1', event: { type: 'selection-change', sourceId: 'radio_1' }, action: { type: 'set-status', targetId: 'status_1', optionMappings: [{ optionId: 'option_a', statusId: 'status_running' }, { optionId: 'option_b', statusId: 'status_warning' }] } });
    const saved = structuredClone(store.getState().doc); expect(saved.schemaVersion).toBe('0.30.0');
    expect(() => parseProject(JSON.stringify(saved))).not.toThrow();
    store.getState().undo(); expect(store.getState().doc).toEqual(original); store.getState().redo(); expect(store.getState().doc).toEqual(saved);
    const slider = createNode('minecraft:slider', 'slider_1'), progress = createNode('minecraft:progress-bar', 'progress_1');
    store.getState().updateNode('status_1', node => node);
    const withQ2 = structuredClone(saved); withQ2.screens[0].nodes.push(slider, progress); withQ2.screens[0].behaviors.push({ id: 'rule_2', event: { type: 'slider-change', sourceId: 'slider_1' }, action: { type: 'set-progress-value', targetId: 'progress_1', mapping: 'normalize' } });
    expect(() => parseProject(JSON.stringify(withQ2))).not.toThrow();
    store.getState().addScreen(); const snapshot = beginExport(store.getState().doc), reference = await referenceFor(snapshot), spec = buildSpecification(snapshot, reference, 'project.json');
    expect(spec.version).toBe(IMPLEMENTATION_SPEC_VERSION); expect(spec.designIntent.selectionStatusBindings).toMatchObject([{ sourceId: 'radio_1', targetId: 'status_1', optionMappings: [{ optionId: 'option_a', statusId: 'status_running' }, { optionId: 'option_b', statusId: 'status_warning' }] }]);
    expect(spec.designIntent.selectionStatusBindingContract!.unmapped).toContain('leave target statusId unchanged');
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([137, 80, 78, 71]));
    expect(bundle.manifest.version).toBe(EXPORT_MANIFEST_VERSION); expect(bundle.manifest.screens[0].selectionStatusBindings[0]).toMatchObject({ sourceId: 'radio_1', targetId: 'status_1', unmapped: ['option_c'] });
    expect(bundle.manifest.screens).toHaveLength(2);
  });
});
