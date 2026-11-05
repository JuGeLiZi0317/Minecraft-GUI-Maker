import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { behaviorToWorkspace, workspaceToBehavior } from '../../../src/behavior/blocklyModel';
import { registerBehaviorBlocks, setBlockContext } from '../../../src/behavior/blocks';
import { createNode } from '../../../src/domain/model';
import { parseProject, statusMappingsOf, type BehaviorMap } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';
import { blocklyProject } from '../../fixtures/blocklyProject';

registerBehaviorBlocks();

const mapping: BehaviorMap = { id: 'status_map_main', name: '运行状态映射', mappings: [{ optionId: 'option_1', statusId: 'status_running' }, { optionId: 'option_2', statusId: 'status_warning' }] };

describe('Screen-scoped shared Blockly maps', () => {
  it('shares one stable map across actions and updates all references without auto-merging equal definitions', () => {
    const store = createEditorStore(blocklyProject());
    const other = createNode('minecraft:status-indicator', 'node_27');
    store.setState(state => ({ ...state, doc: { ...state.doc, screens: state.doc.screens.map(screen => ({ ...screen, nodes: [...screen.nodes, other] })) } }));
    store.getState().saveBehaviorMap(mapping);
    const first = { id: 'rule_map_radio', event: { type: 'selection-change' as const, sourceId: 'node_22' }, action: { type: 'set-status' as const, targetId: 'node_26', mapRef: mapping.id } };
    const second = { id: 'rule_map_dropdown', event: { type: 'selection-change' as const, sourceId: 'node_23' }, action: { type: 'set-status' as const, targetId: 'node_27', mapRef: mapping.id } };
    store.getState().saveBehavior(first); store.getState().saveBehavior(second);
    expect(store.getState().doc.schemaVersion).toBe('0.32.0');
    expect(store.getState().doc.screens[0].behaviors.slice(-2).map(rule => 'action' in rule && rule.action.type === 'set-status' && 'mapRef' in rule.action ? rule.action.mapRef : null)).toEqual([mapping.id, mapping.id]);
    const changed = structuredClone(mapping); changed.mappings[0].statusId = 'status_warning'; store.getState().saveBehaviorMap(changed);
    const screen = store.getState().doc.screens[0];
    expect(statusMappingsOf(screen, first.action)).toEqual(changed.mappings); expect(statusMappingsOf(screen, second.action)).toEqual(changed.mappings);
    const changedDoc = structuredClone(store.getState().doc); store.getState().undo(); expect(statusMappingsOf(store.getState().doc.screens[0], first.action)).toEqual(mapping.mappings); store.getState().redo(); expect(store.getState().doc).toEqual(changedDoc);
    store.getState().saveBehaviorMap({ ...changed, id: 'status_map_copy', name: '独立副本' });
    const independent = { ...changed, id: 'status_map_copy', mappings: changed.mappings.map(pair => ({ ...pair })) }; independent.mappings[0].statusId = 'status_stopped'; store.getState().saveBehaviorMap(independent);
    expect(statusMappingsOf(store.getState().doc.screens[0], first.action)[0].statusId).toBe('status_warning');
    expect(statusMappingsOf(store.getState().doc.screens[0], { ...first.action, mapRef: independent.id })[0].statusId).toBe('status_stopped');
  });

  it('preserves the map reference through real Blockly serialization and keeps inline B1 rules unchanged', () => {
    const doc = blocklyProject(); doc.schemaVersion = '0.32.0'; doc.screens[0].behaviorMaps = [mapping];
    const shared = { id: 'rule_shared_map', event: { type: 'selection-change' as const, sourceId: 'node_22' }, action: { type: 'set-status' as const, targetId: 'node_26', mapRef: mapping.id } };
    const workspace = new Blockly.Workspace(); setBlockContext(workspace, doc.screens[0]);
    try {
      Blockly.serialization.workspaces.load(behaviorToWorkspace(shared), workspace);
      const serialized = JSON.parse(JSON.stringify(Blockly.serialization.workspaces.save(workspace)));
      expect(workspaceToBehavior(serialized, shared.id, shared)).toEqual(shared);
    } finally { workspace.dispose(); }
    const inline = blocklyProject().screens[0].behaviors[0]; expect(inline).toBeDefined();
    expect(parseProject(JSON.stringify(doc))).toEqual(doc);
  });

  it('rejects dangling, cross-screen, duplicate and source/target-incompatible references atomically', () => {
    const store = createEditorStore(blocklyProject()); store.getState().saveBehaviorMap(mapping);
    const valid = { id: 'rule_map', event: { type: 'selection-change' as const, sourceId: 'node_22' }, action: { type: 'set-status' as const, targetId: 'node_26', mapRef: mapping.id } };
    store.getState().saveBehavior(valid); const saved = structuredClone(store.getState().doc);
    const badRef = structuredClone(saved); const rule = badRef.screens[0].behaviors[1]; if ('action' in rule) rule.action = { ...valid.action, mapRef: 'missing_map' }; expect(() => parseProject(JSON.stringify(badRef))).toThrow('共享映射');
    const badScreen = structuredClone(saved); badScreen.screens[0].behaviorMaps = []; expect(() => parseProject(JSON.stringify(badScreen))).toThrow('不存在于当前 Screen');
    const duplicate = structuredClone(saved); duplicate.screens[0].behaviorMaps!.push({ ...mapping }); expect(() => parseProject(JSON.stringify(duplicate))).toThrow('ID 不能重复');
    const oldSchema = structuredClone(saved); oldSchema.schemaVersion = '0.31.0'; expect(() => parseProject(JSON.stringify(oldSchema))).toThrow('0.32.0');
    const missingOption = structuredClone(saved); missingOption.screens[0].behaviorMaps![0].mappings[0].optionId = 'option_missing'; expect(() => parseProject(JSON.stringify(missingOption))).toThrow('optionId 必须存在');
    expect(() => store.getState().deleteBehaviorMap(mapping.id)).toThrow('仍被行为动作引用'); expect(store.getState().doc).toEqual(saved);
    store.getState().deleteBehavior('rule_map'); store.getState().deleteBehaviorMap(mapping.id); expect(store.getState().doc.screens[0].behaviorMaps).toEqual([]);
  });

  it('uses one Screen definition in the ZIP specification and preserves history and project JSON', async () => {
    const store = createEditorStore(blocklyProject()); store.getState().saveBehaviorMap(mapping);
    store.getState().saveBehavior({ id: 'rule_map', event: { type: 'selection-change', sourceId: 'node_22' }, action: { type: 'set-status', targetId: 'node_26', mapRef: mapping.id } });
    store.getState().addScreen(); const saved = structuredClone(store.getState().doc), snapshot = beginExport(saved), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json');
    expect(spec.designIntent.screens[0].behaviorMaps).toEqual([mapping]); expect(spec.designIntent.screens[0].behaviorMapReferences).toEqual([{ mapId: mapping.id, actionReferences: [{ ruleId: 'rule_map', actionIndex: 0 }] }]);
    expect(spec.designIntent.selectionStatusBindings).toMatchObject([{ mapRef: mapping.id }]); expect(spec.designIntent.selectionStatusBindings?.[0]).not.toHaveProperty('optionMappings');
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([137, 80, 78, 71]));
    expect(bundle.manifest.screens[0].behaviorMaps).toEqual([mapping]); expect(bundle.manifest.screens[0].selectionStatusBindings[0]).toMatchObject({ mapRef: mapping.id }); expect(bundle.manifest.screens[0].selectionStatusBindings[0]).not.toHaveProperty('optionMappings');
    expect(parseProject(snapshot.projectJson)).toEqual(saved);
    store.getState().undo(); expect(store.getState().doc.screens).toHaveLength(1); store.getState().redo(); expect(store.getState().doc).toEqual(saved);
  });
});
