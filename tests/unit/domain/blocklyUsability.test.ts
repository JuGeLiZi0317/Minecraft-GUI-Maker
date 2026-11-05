import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { registerBehaviorBlocks, setBlockContext } from '../../../src/behavior/blocks';
import { behaviorToWorkspace, workspaceToBehavior } from '../../../src/behavior/blocklyModel';
import { actionsOf, parseProject, type Behavior, type SetStatusAction } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { literal, createNode } from '../../../src/domain/model';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';
import { EXPORT_MANIFEST_VERSION, IMPLEMENTATION_SPEC_VERSION } from '../../../src/exports/versions';
import { simpleStatusRule, usabilityProject } from '../../fixtures/blocklyUsabilityProject';

registerBehaviorBlocks();
const savedProject = () => { const doc = usabilityProject(); doc.schemaVersion = '0.34.0'; doc.screens[0].behaviors.push(simpleStatusRule()); return doc; };
describe('B1.4 direct status and simple conditions', () => {
  it('round trips the four real blocks, retaining stable IDs and readable names', () => {
    const doc = savedProject(), rule = simpleStatusRule(), ws = new Blockly.Workspace(); setBlockContext(ws, doc.screens[0]);
    try {
      Blockly.serialization.workspaces.load(behaviorToWorkspace(rule), ws);
      expect(ws.getAllBlocks(false)).toHaveLength(4);
      expect(ws.getAllBlocks(false).map(block => block.type).sort()).toEqual(['gui_if_selection', 'gui_on_selection_single', 'gui_set_status_direct', 'gui_set_status_direct'].sort());
      const direct = ws.getAllBlocks(false).find(block => block.type === 'gui_set_status_direct')!;
      expect(direct.getField('TARGET')!.getText()).toBe('共享状态'); expect(direct.getField('STATUS')!.getText()).toBe('运行');
      expect(direct.getTooltip()).toContain('status_running');
      expect(ws.getAllBlocks(false).find(block => block.type === 'gui_if_selection')!.getField('OPTION')!.getText()).toBe('启动');
      expect(workspaceToBehavior(Blockly.serialization.workspaces.save(ws), rule.id, rule)).toEqual(rule);
    } finally { ws.dispose(); }
  });
  it('keeps constant, inline and shared actions ordered in a multi-source graph', () => {
    const rule = simpleStatusRule(); if (rule.event.type === 'selection-change') rule.event.additionalSourceIds = ['node_23'];
    const branch = actionsOf(rule)[0]; if (branch.type !== 'if') throw Error('fixture');
    branch.thenActions.push({ type: 'set-status', targetId: 'node_26', mapRef: 'map_shared' });
    branch.elseActions.push({ type: 'set-status', targetId: 'node_26', optionMappings: [] });
    const doc = savedProject(); doc.screens[0].behaviorMaps = [{ id: 'map_shared', name: '公共映射', mappings: [{ optionId: 'option_1', statusId: 'status_warning' }] }]; doc.screens[0].behaviors[1] = rule;
    expect(parseProject(JSON.stringify(doc))).toEqual(doc);
    const ws = new Blockly.Workspace(); setBlockContext(ws, doc.screens[0]);
    try { Blockly.serialization.workspaces.load(behaviorToWorkspace(rule), ws); expect(workspaceToBehavior(Blockly.serialization.workspaces.save(ws), rule.id, rule)).toEqual(rule); } finally { ws.dispose(); }
    const bad = structuredClone(doc), dropdown = bad.screens[0].nodes.find(node => node.id === 'node_23')!;
    if (dropdown.type === 'minecraft:dropdown') dropdown.props.options[0].id = 'option_foreign';
    expect(() => parseProject(JSON.stringify(bad))).toThrow('每个来源');
  });
  it('atomically rejects mixed modes, missing/cross-Screen targets, stale statuses and wrong events', () => {
    const bad = (action: unknown, event?: Behavior['event']) => { const doc = savedProject(), rule = doc.screens[0].behaviors[1]; if ('actions' in rule) rule.actions = [action as SetStatusAction]; if (event) rule.event = event; return () => parseProject(JSON.stringify(doc)); };
    const constant = { type: 'set-status', targetId: 'node_26', statusId: 'status_running' };
    expect(bad({ ...constant, optionMappings: [] })).toThrow(); expect(bad({ ...constant, mapRef: 'map_shared' })).toThrow();
    expect(bad({ ...constant, statusId: 'status_missing' })).toThrow('有效状态'); expect(bad({ ...constant, targetId: 'node_22' })).toThrow('目标不存在');
    expect(bad(constant, { type: 'button-click', sourceId: 'legacy_button' })).toThrow('selection-change');
    const doc = savedProject(), second = structuredClone(doc.screens[0]); second.id = 'screen_second'; second.nodes = [createNode('minecraft:status-indicator', 'status_foreign')]; second.behaviors = []; doc.screens.push(second);
    const action = actionsOf(doc.screens[0].behaviors[1])[0]; if (action.type === 'if') action.thenActions[0].targetId = 'status_foreign';
    expect(() => parseProject(JSON.stringify(doc))).toThrow('目标不存在');
  });
  it('upgrades only on explicit constant save, restores exact history, and never downgrades on old edits', () => {
    const doc = usabilityProject(), store = createEditorStore(doc), before = structuredClone(store.getState().doc);
    expect(parseProject(JSON.stringify(before))).toEqual(before); behaviorToWorkspace(simpleStatusRule()); expect(store.getState().doc).toEqual(before);
    store.getState().saveBehavior(simpleStatusRule()); const after = structuredClone(store.getState().doc);
    expect(after.schemaVersion).toBe('0.34.0'); expect(after.screens[0].behaviors[0]).toEqual(before.screens[0].behaviors[0]);
    expect(() => parseProject(JSON.stringify({ ...after, schemaVersion: '0.33.0' }))).toThrow('0.34.0');
    store.getState().undo(); expect(store.getState().doc).toEqual(before); store.getState().redo(); expect(store.getState().doc).toEqual(after);
    const restored = createEditorStore(parseProject(JSON.stringify(after))); expect(restored.getState().doc).toEqual(after);
    restored.getState().saveBehavior(before.screens[0].behaviors[0]); restored.getState().add('minecraft:checkbox'); restored.getState().addScreen(); expect(restored.getState().doc.schemaVersion).toBe('0.34.0');
    const old = createEditorStore(before); old.getState().saveBehaviorMap({ id: 'map_old', name: '旧映射', mappings: [] }); expect(old.getState().doc.schemaVersion).toBe('0.32.0');
  });
  it('retains references after renaming and diagnoses incomplete simple blocks without throwing during load', () => {
    const doc = savedProject(), status = doc.screens[0].nodes.find(node => node.id === 'node_26')!, radio = doc.screens[0].nodes.find(node => node.id === 'node_22')!;
    if (status.type === 'minecraft:status-indicator') { status.props.name = literal('重命名的指示器'); status.props.statuses[0].label = literal('新的运行名称'); }
    if (radio.type === 'minecraft:radio-group') radio.props.options[0].label = literal('新的启动名称');
    expect(parseProject(JSON.stringify(doc)).screens[0].behaviors[1]).toEqual(simpleStatusRule());
    const state = behaviorToWorkspace(simpleStatusRule()); state.blocks!.blocks[0].inputs!.DO.block!.fields!.OPTION = '';
    const ws = new Blockly.Workspace(); setBlockContext(ws, doc.screens[0]);
    try { expect(() => Blockly.serialization.workspaces.load(state, ws)).not.toThrow(); expect(() => workspaceToBehavior(Blockly.serialization.workspaces.save(ws), 'rule_simple')).toThrow('OPTION'); } finally { ws.dispose(); }
    const noThen = behaviorToWorkspace(simpleStatusRule()); delete noThen.blocks!.blocks[0].inputs!.DO.block!.inputs!.THEN;
    expect(() => workspaceToBehavior(noThen, 'rule_simple')).toThrow('then');
  });
  it('exports constants in top-level and both branches, maps once, full JSON and multi-Screen authority', async () => {
    const store = createEditorStore(savedProject()); store.getState().saveBehaviorMap({ id: 'map_shared', name: '公共映射', mappings: [{ optionId: 'option_1', statusId: 'status_warning' }] });
    store.getState().saveBehavior({ id: 'rule_mixed', event: { type: 'selection-change', sourceId: 'node_23' }, actions: [{ type: 'set-status', targetId: 'node_26', statusId: 'status_running' }, { type: 'set-status', targetId: 'node_26', mapRef: 'map_shared' }] }); store.getState().addScreen();
    const doc = store.getState().doc, snapshot = beginExport(doc), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json');
    expect(spec.version).toBe(IMPLEMENTATION_SPEC_VERSION); expect(spec.designIntent.selectionStatusBindingContract!.action.constant).toContain('without reading or mapping optionId');
    expect(spec.designIntent.conditionalBehaviors[0]).toMatchObject({ thenActions: [{ statusId: 'status_running' }], elseActions: [{ statusId: 'status_warning' }] });
    expect(spec.designIntent.selectionStatusBindings![0]).toMatchObject({ statusId: 'status_running', unmapped: [], unmappedBySource: [{ optionIds: [] }] });
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([137, 80, 78, 71]));
    expect(bundle.manifest.version).toBe(EXPORT_MANIFEST_VERSION); expect(bundle.manifest.screens).toHaveLength(2);
    expect(bundle.manifest.screens[0].conditionalBehaviors[0]).toMatchObject({ thenActions: [{ statusId: 'status_running' }], elseActions: [{ statusId: 'status_warning' }] });
    expect(bundle.manifest.screens[0].selectionStatusBindings[0]).toMatchObject({ statusId: 'status_running', unmapped: [], unmappedPolicy: 'not-applicable: constant statusId assignment' });
    const authority = bundle.files.find(file => file.name === bundle.manifest.authority.file)!; expect(JSON.parse(new TextDecoder().decode(authority.bytes))).toEqual(doc);
  });
});
