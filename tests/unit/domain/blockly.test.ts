import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { behaviorToWorkspace, canEditWithBlocks, workspaceToBehavior, workspaceDraftSignature, type BehaviorWorkspaceState } from '../../../src/behavior/blocklyModel';
import { registerBehaviorBlocks, setBlockContext } from '../../../src/behavior/blocks';
import { matchesBehaviorEvent, parseProject, sourcesOf, type Behavior } from '../../../src/domain/schema';
import { behaviorNodeLabel } from '../../../src/domain/behaviorLabels';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';
import { EXPORT_MANIFEST_VERSION, IMPLEMENTATION_SPEC_VERSION } from '../../../src/exports/versions';
import { blocklyProject, sharedStatusRule } from '../../fixtures/blocklyProject';

registerBehaviorBlocks();
describe('B1 real Blockly graph and shared F2 authority', () => {
  it('captures an incomplete template baseline without F2 conversion and ignores layout-only changes', () => {
    const state = behaviorToWorkspace({ id: 'rule_new', event: { type: 'selection-change', sourceId: '' }, actions: [{ type: 'set-status', targetId: '', optionMappings: [] }] });
    expect(() => workspaceToBehavior(state, 'rule_new')).toThrow('SOURCE');
    const baseline = workspaceDraftSignature(state), moved = structuredClone(state), root = moved.blocks!.blocks[0];
    root.x = 300; root.y = 200; root.id = 'editor_only_id'; root.collapsed = true;
    expect(workspaceDraftSignature(moved)).toBe(baseline);
    root.inputs!.SOURCES.block!.fields!.SOURCE = 'node_22';
    expect(workspaceDraftSignature(moved)).not.toBe(baseline);
    root.inputs!.SOURCES.block!.fields!.SOURCE = '';
    expect(workspaceDraftSignature(moved)).toBe(baseline);
    delete root.inputs!.DO;
    expect(workspaceDraftSignature(moved)).not.toBe(baseline);
  });
  it('round trips real Blockly JSON without rewriting single/ordered F2 shape, IDs or array order', () => {
    const multi = sharedStatusRule(); if ('actions' in multi) multi.actions.push({ type: 'set-status', targetId: 'node_26', optionMappings: [{ optionId: 'option_2', statusId: 'status_stopped' }] });
    const single: Behavior = { id: 'single', event: { type: 'selection-change', sourceId: 'node_22' }, action: { type: 'set-status', targetId: 'node_26', optionMappings: [{ optionId: 'option_2', statusId: 'status_warning' }, { optionId: 'option_1', statusId: 'status_running' }] } };
    for (const rule of [multi, single]) {
      const ws = new Blockly.Workspace(); setBlockContext(ws, blocklyProject().screens[0]);
      try {
        Blockly.serialization.workspaces.load(behaviorToWorkspace(rule), ws);
        const saved = JSON.parse(JSON.stringify(Blockly.serialization.workspaces.save(ws))) as BehaviorWorkspaceState;
        expect(workspaceToBehavior(saved, rule.id, rule)).toEqual(rule);
        const again = new Blockly.Workspace(); setBlockContext(again, blocklyProject().screens[0]);
        try { Blockly.serialization.workspaces.load(saved, again); expect(workspaceToBehavior(Blockly.serialization.workspaces.save(again), rule.id, rule)).toEqual(rule); } finally { again.dispose(); }
      } finally { ws.dispose(); }
    }
    const legacy = blocklyProject().screens[0].behaviors[0]; expect(canEditWithBlocks(legacy)).toBe(false); expect(() => behaviorToWorkspace(legacy)).toThrow('原规则保持原样');
    const large = sharedStatusRule(); if ('actions' in large) large.actions = Array.from({ length: 50 }, () => ({ type: 'set-status', targetId: 'node_26', optionMappings: Array.from({ length: 100 }, (_, index) => ({ optionId: `option_${index}`, statusId: 'status_running' })) }));
    expect(canEditWithBlocks(large)).toBe(false); expect(() => behaviorToWorkspace(large)).toThrow('原规则保持原样');
  });
  it('round trips finite if/else blocks, both operators, ordered branches and an empty else', () => {
    const rule: Behavior = { id: 'rule_conditional', event: { type: 'selection-change', sourceId: 'node_22', additionalSourceIds: ['node_23'] }, actions: [
      { type: 'if', condition: { type: 'event-option', operator: 'equals', optionId: 'option_1' }, thenActions: [{ type: 'set-status', targetId: 'node_26', optionMappings: [{ optionId: 'option_1', statusId: 'status_running' }] }, { type: 'set-status', targetId: 'node_26', optionMappings: [{ optionId: 'option_1', statusId: 'status_warning' }] }], elseActions: [{ type: 'set-status', targetId: 'node_26', optionMappings: [{ optionId: 'option_2', statusId: 'status_stopped' }] }] },
      { type: 'if', condition: { type: 'event-option', operator: 'not-equals', optionId: 'option_1' }, thenActions: [{ type: 'set-status', targetId: 'node_26', mapRef: 'status_map_shared' }], elseActions: [] },
    ] };
    expect(canEditWithBlocks(rule)).toBe(true);
    const screen = blocklyProject().screens[0]; screen.behaviorMaps = [{ id: 'status_map_shared', name: '共享映射', mappings: [{ optionId: 'option_1', statusId: 'status_running' }, { optionId: 'option_2', statusId: 'status_warning' }] }];
    const workspace = new Blockly.Workspace(); setBlockContext(workspace, screen);
    try {
      const serialized = behaviorToWorkspace(rule); expect(serialized.blocks!.blocks[0].inputs!.DO.block!.type).toBe('gui_if');
      Blockly.serialization.workspaces.load(serialized, workspace);
      const actual = JSON.parse(JSON.stringify(Blockly.serialization.workspaces.save(workspace))) as BehaviorWorkspaceState;
      expect(workspaceToBehavior(actual, rule.id, rule)).toEqual(rule);
      expect(workspaceDraftSignature(actual)).toContain('gui_if_option');
    } finally { workspace.dispose(); }
  });
  it('validates conditions, upgrades only on explicit save, and preserves old F2 history', async () => {
    const doc = blocklyProject(), store = createEditorStore(doc), old = structuredClone(store.getState().doc);
    const rule: Behavior = { id: 'rule_if', event: { type: 'selection-change', sourceId: 'node_22' }, actions: [{ type: 'if', condition: { type: 'event-option', operator: 'equals', optionId: 'option_1' }, thenActions: [{ type: 'set-status', targetId: 'node_26', optionMappings: [{ optionId: 'option_1', statusId: 'status_running' }] }], elseActions: [] }] };
    expect(() => parseProject(JSON.stringify({ ...old, screens: old.screens.map(screen => ({ ...screen, behaviors: [rule] })) }))).toThrow('0.33.0');
    store.getState().saveBehavior(rule); const saved = structuredClone(store.getState().doc);
    expect(saved.schemaVersion).toBe('0.33.0'); expect(saved.screens[0].behaviors[0]).toEqual(old.screens[0].behaviors[0]); expect(saved.screens[0].behaviors[1]).toEqual(rule);
    expect(parseProject(JSON.stringify(saved))).toEqual(saved);
    const snapshot = beginExport(saved), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json');
    expect(spec.version).toBe(IMPLEMENTATION_SPEC_VERSION); expect(spec.designIntent.conditionalBehaviorContract).toMatchObject({ condition: { validEvents: ['selection-change'] }, branches: { nesting: false, leafActions: ['set-status', 'set-progress-value', 'set-visible', 'set-text'] } });
    expect(spec.designIntent.conditionalBehaviors).toMatchObject([{ ruleId: 'rule_if', sourceIds: ['node_22'], condition: { operator: 'equals', optionId: 'option_1' }, thenActions: [{ targetId: 'node_26', optionMappings: [{ optionId: 'option_1', statusId: 'status_running' }] }], elseActions: [] }]);
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([137, 80, 78, 71]));
    expect(bundle.manifest.version).toBe(EXPORT_MANIFEST_VERSION); expect(bundle.manifest.screens[0].conditionalBehaviors).toHaveLength(1);
    const mapDoc = blocklyProject(); mapDoc.schemaVersion = '0.32.0'; mapDoc.screens[0].behaviorMaps = [{ id: 'status_map_shared', name: '共享映射', mappings: [{ optionId: 'option_1', statusId: 'status_running' }] }];
    const mapStore = createEditorStore(mapDoc), mappedRule: Behavior = { ...rule, id: 'rule_map_if', actions: [{ type: 'if', condition: { type: 'event-option', operator: 'equals', optionId: 'option_1' }, thenActions: [{ type: 'set-status', targetId: 'node_26', mapRef: 'status_map_shared' }], elseActions: [] }] };
    mapStore.getState().saveBehavior(mappedRule); expect(mapStore.getState().doc.schemaVersion).toBe('0.33.0');
    const mapSnapshot = beginExport(mapStore.getState().doc), mapSpec = buildSpecification(mapSnapshot, await referenceFor(mapSnapshot), 'project.json');
    expect(mapSpec.designIntent.conditionalBehaviors).toMatchObject([{ thenActions: [{ targetId: 'node_26', mapRef: 'status_map_shared' }] }]);
    expect(mapSpec.designIntent.screens[0].behaviorMapReferences).toContainEqual({ mapId: 'status_map_shared', actionReferences: [{ ruleId: 'rule_map_if', actionIndex: 0 }] });
    const invalidMap = structuredClone(mapStore.getState().doc), mapped = invalidMap.screens[0].behaviors[1];
    if ('actions' in mapped && mapped.actions[0].type === 'if' && 'mapRef' in mapped.actions[0].thenActions[0]) mapped.actions[0].thenActions[0].mapRef = 'missing_map';
    expect(() => parseProject(JSON.stringify(invalidMap))).toThrow('共享映射 missing_map 不存在');
    store.getState().undo(); expect(store.getState().doc).toEqual(old); store.getState().redo(); expect(store.getState().doc).toEqual(saved);
    const invalid = (mutate: (candidate: Behavior) => void) => { const copy = structuredClone(saved); mutate(copy.screens[0].behaviors[1]); return () => parseProject(JSON.stringify(copy)); };
    expect(invalid(candidate => { candidate.event = { type: 'button-click', sourceId: 'legacy_button' }; })).toThrow('selection-change');
    expect(invalid(candidate => { if (candidate.event.type === 'selection-change' && 'actions' in candidate && candidate.actions[0].type === 'if' && candidate.actions[0].condition.type === 'event-option') candidate.actions[0].condition.optionId = 'missing_option'; })).toThrow('每个来源控件');
    expect(invalid(candidate => { if ('actions' in candidate && candidate.actions[0].type === 'if') candidate.actions[0].thenActions[0].targetId = 'missing_target'; })).toThrow('目标不存在');
  });
  it('rejects orphaned, disabled, duplicate and incomplete graphs rather than losing blocks', () => {
    const rule = sharedStatusRule(), state = behaviorToWorkspace(rule);
    const orphan = structuredClone(state); orphan.blocks!.blocks.push({ type: 'gui_mapping_pair' }); expect(() => workspaceToBehavior(orphan, rule.id)).toThrow('游离');
    const disabled = structuredClone(state); disabled.blocks!.blocks[0].disabledReasons = ['MANUALLY_DISABLED']; expect(() => workspaceToBehavior(disabled, rule.id)).toThrow('禁用');
    const incomplete = structuredClone(state); delete incomplete.blocks!.blocks[0].inputs!.DO; expect(() => workspaceToBehavior(incomplete, rule.id)).toThrow('至少需要一个');
    const duplicate = structuredClone(state); duplicate.blocks!.blocks[0].inputs!.SOURCES.block!.next!.block!.fields!.SOURCE = 'node_22'; expect(() => workspaceToBehavior(duplicate, rule.id)).toThrow('不能重复');
    const badType = structuredClone(state); badType.blocks!.blocks[0].inputs!.DO.block!.inputs!.VALUE.block!.inputs!.OPTION.block!.type = 'javascript'; expect(() => workspaceToBehavior(badType, rule.id)).toThrow('gui_event_option');
  });
  it('upgrades only explicitly saved multi-source rules; history and old-node edits preserve the new document', () => {
    const doc = blocklyProject(), store = createEditorStore(doc), before = structuredClone(store.getState().doc);
    behaviorToWorkspace(sharedStatusRule()); expect(store.getState().doc).toEqual(before);
    store.getState().saveBehavior(sharedStatusRule()); const saved = structuredClone(store.getState().doc);
    expect(saved.schemaVersion).toBe('0.31.0'); expect(saved.screens[0].behaviors[0]).toEqual(before.screens[0].behaviors[0]);
    expect(parseProject(JSON.stringify(saved))).toEqual(saved);
    store.getState().undo(); expect(store.getState().doc).toEqual(before); store.getState().redo(); expect(store.getState().doc).toEqual(saved);
    store.getState().add('minecraft:checkbox'); expect(store.getState().doc.schemaVersion).toBe('0.31.0');
    store.getState().addScreen(); expect(store.getState().doc.schemaVersion).toBe('0.31.0');
  });
  it('strictly validates every source, common mapped option ID and target; protects additional source deletion', () => {
    const store = createEditorStore(blocklyProject()); store.getState().saveBehavior(sharedStatusRule()); const saved = structuredClone(store.getState().doc);
    const bad = (mutate: (rule: Behavior) => void) => { const copy = structuredClone(saved); mutate(copy.screens[0].behaviors[1]); return () => parseProject(JSON.stringify(copy)); };
    expect(bad(rule => { if (rule.event.type === 'selection-change') rule.event.additionalSourceIds = ['node_22']; })).toThrow('不能重复');
    expect(bad(rule => { if (rule.event.type === 'selection-change') rule.event.additionalSourceIds = ['node_missing']; })).toThrow('每个来源');
    expect(bad(rule => { if (rule.event.type === 'selection-change') rule.event.additionalSourceIds = ['node_26']; })).toThrow('每个来源');
    const old = structuredClone(saved); old.schemaVersion = '0.30.0'; expect(() => parseProject(JSON.stringify(old))).toThrow('0.31.0');
    expect(() => store.getState().updateNode('node_23', node => { if (node.type === 'minecraft:dropdown') node.props.options = node.props.options.filter(option => option.id !== 'option_2'); return node; })).toThrow('有效选项');
    expect(store.getState().doc).toEqual(saved);
    store.getState().select('node_23'); expect(() => store.getState().deleteSelected()).toThrow('引用'); expect(store.getState().doc).toEqual(saved);
  });
  it('uses actual event identity once per rule and preserves readable labels across renaming', () => {
    const rule = sharedStatusRule(); expect(sourcesOf(rule)).toEqual(['node_22', 'node_23']);
    expect(matchesBehaviorEvent(rule, 'selection-change', 'node_23')).toBe(true); expect(matchesBehaviorEvent(rule, 'slider-change', 'node_23')).toBe(false);
    expect([rule].filter(rule => matchesBehaviorEvent(rule, 'selection-change', 'node_23'))).toHaveLength(1);
    const store = createEditorStore(blocklyProject()); store.getState().saveBehavior(rule);
    store.getState().updateNode('node_22', node => { if (node.type === 'minecraft:radio-group') node.props.name = { kind: 'literal', value: '新名称' }; return node; });
    expect(store.getState().doc.screens[0].behaviors[1]).toEqual(rule); expect(behaviorNodeLabel(store.getState().doc.screens[0].nodes[0], store.getState().doc.screens[0])).toContain('新名称 · Radio Group');
  });
  it('exports one shared action with all sources on a multi-Screen immutable snapshot', async () => {
    const store = createEditorStore(blocklyProject()); store.getState().saveBehavior(sharedStatusRule()); store.getState().addScreen();
    const snapshot = beginExport(store.getState().doc), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json');
    expect(spec.version).toBe(IMPLEMENTATION_SPEC_VERSION); expect(spec.designIntent.selectionStatusBindings).toMatchObject([{ sourceIds: ['node_22', 'node_23'], sharedActionChain: true, ruleIndex: 1, actionIndex: 0 }]);
    expect(spec.designIntent.behaviorCapability.unboundEventIntents).not.toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: 'node_23' })]));
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([137, 80, 78, 71]));
    expect(bundle.manifest.version).toBe(EXPORT_MANIFEST_VERSION); expect(bundle.manifest.screens).toHaveLength(2); expect(bundle.manifest.screens[0].selectionStatusBindings).toHaveLength(1);
    expect(bundle.manifest.screens[0].selectionStatusBindings[0]).toMatchObject({ sourceIds: ['node_22', 'node_23'], targetId: 'node_26' });
    expect(JSON.parse(snapshot.projectJson).screens[0].behaviors[1]).toEqual(sharedStatusRule()); expect(snapshot.projectJson).not.toContain('gui_on_selection');
  });
});
