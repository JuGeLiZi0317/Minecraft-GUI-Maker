import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { actionsOf, parseProject, type ExclusiveVisibleAction } from '../../../src/domain/schema';
import { initialControlState, reduceTypedBehaviorEvent } from '../../../src/domain/genericBehavior';
import { EXCLUSIVE_VISIBILITY_CONTRACT, planExclusiveVisibility } from '../../../src/domain/exclusiveVisibility';
import { behaviorToWorkspace, workspaceToBehavior } from '../../../src/behavior/blocklyModel';
import { registerBehaviorBlocks, setBlockContext } from '../../../src/behavior/blocks';
import { buildBehaviorIndex } from '../../../src/domain/behaviorDiagnostics';
import { effectiveRuntimeVisibility } from '../../../src/domain/runtimeVisibility';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';
import { createNode } from '../../../src/domain/model';
import { planDeletion } from '../../../src/domain/deletion';
import { EXCLUSIVE_CHOICES, exclusiveVisibilityProject } from '../../fixtures/exclusiveVisibilityProject';
import { structuresInspectorProject } from '../../fixtures/structuresInspectorProject';
import { branchControlProject } from '../../fixtures/branchControlProject';

registerBehaviorBlocks();

const event = (optionId: string) => ({ type: 'selection-change' as const, screenId: 'screen_main', nodeId: 'structure_selector', optionId, phase: 'confirm' as const, source: 'pointer' as const });
const actionOf = (doc = exclusiveVisibilityProject()) => actionsOf(doc.screens[0].behaviors[0])[0] as ExclusiveVisibleAction;

describe('B1.12 exclusive visibility mapping', () => {
  it('round-trips the authority action and rejects malformed tables', () => {
    const doc = exclusiveVisibilityProject();
    expect(parseProject(JSON.stringify(doc))).toEqual(doc);

    const duplicateOption = exclusiveVisibilityProject();
    actionOf(duplicateOption).mapping.push({ optionId: 'village', targetId: 'input_village' });
    expect(() => parseProject(JSON.stringify(duplicateOption))).toThrow('optionId 不能重复');

    const duplicateTarget = exclusiveVisibilityProject();
    actionOf(duplicateTarget).mapping[1].targetId = actionOf(duplicateTarget).mapping[0].targetId;
    expect(() => parseProject(JSON.stringify(duplicateTarget))).toThrow('目标不能映射到多个选项');

    const dangling = exclusiveVisibilityProject();
    actionOf(dangling).mapping[0].targetId = 'ghost_target';
    expect(() => parseProject(JSON.stringify(dangling))).toThrow('目标不存在');

    const unknownOption = exclusiveVisibilityProject();
    actionOf(unknownOption).mapping[0].optionId = 'nether';
    expect(() => parseProject(JSON.stringify(unknownOption))).toThrow('必须存在于');

    const legacyVersion = exclusiveVisibilityProject();
    legacyVersion.schemaVersion = '0.45.0';
    expect(() => parseProject(JSON.stringify(legacyVersion))).toThrow('0.46.0');

    const missingFallback = exclusiveVisibilityProject() as unknown as { screens: { behaviors: { actions: Record<string, unknown>[] }[] }[] };
    delete missingFallback.screens[0].behaviors[0].actions[0].fallback;
    expect(() => parseProject(JSON.stringify(missingFallback))).toThrow();
  });

  it('rejects targets that cannot carry runtime visibility and incompatible values', () => {
    const region = exclusiveVisibilityProject();
    region.screens[0].nodes.push(createNode('native_region', 'native_slots', { x: 0, y: 0 }));
    actionOf(region).mapping[1].targetId = 'native_slots';
    expect(() => parseProject(JSON.stringify(region))).toThrow('Native Region');

    const tab = exclusiveVisibilityProject();
    actionOf(tab).mapping[1].targetId = 'page_structures';
    expect(() => parseProject(JSON.stringify(tab))).toThrow('CreativeTab');

    const wrongReader = exclusiveVisibilityProject();
    actionOf(wrongReader).value = { type: 'read-control-value', nodeId: 'selection_summary' };
    expect(() => parseProject(JSON.stringify(wrongReader))).toThrow('Radio Group 或 Dropdown');

    const nested = exclusiveVisibilityProject();
    const inner = createNode('minecraft:string-widget', 'inner_note', { x: 8, y: 8 });
    inner.bounds = { x: 8, y: 8, w: 40, h: 16 };
    const panel = nested.screens[0].nodes.find(node => node.id === 'inspector_village')!;
    inner.parentContainerId = panel.id;
    nested.screens[0].nodes.push(inner);
    actionOf(nested).mapping[2].targetId = 'inner_note';
    expect(() => parseProject(JSON.stringify(nested))).toThrow('互为父子容器');
  });

  it('evaluates once, shows one target and hides the other table members', () => {
    const doc = exclusiveVisibilityProject(), screen = doc.screens[0];
    const before = structuredClone(doc);
    let state = initialControlState(screen);
    for (const choice of EXCLUSIVE_CHOICES) {
      const result = reduceTypedBehaviorEvent(screen, state, event(choice));
      state = result.next;
      expect(result.matchedRuleIds).toEqual(['inspect_exclusive']);
      for (const other of EXCLUSIVE_CHOICES) expect(state[`inspector_${other}`]?.visible).toBe(other === choice);
      expect(result.outcomes.join(' ')).toContain(choice);
    }
    expect(doc).toEqual(before);
  });

  it('leaves non-mapped nodes and hidden control values untouched', () => {
    const doc = exclusiveVisibilityProject(), screen = doc.screens[0];
    const before = initialControlState(screen);
    before.input_village = { text: '42' };
    before.selection_summary = { visible: false };
    const result = reduceTypedBehaviorEvent(screen, before, event('temple'));
    expect(result.next.selection_summary?.visible).toBe(false);
    expect(result.next.input_village?.text).toBe('42');
    expect(result.next.inspector_temple.visible).toBe(true);
    expect(result.next.inspector_village.visible).toBe(false);
  });

  it('applies hide-all and keep-current fallbacks for an unmapped input', () => {
    const hidden = exclusiveVisibilityProject({ fallback: 'hide-all', extraOption: 'nether' }), hiddenScreen = hidden.screens[0];
    const hiddenState = initialControlState(hiddenScreen);
    hiddenState.inspector_temple = { visible: true };
    const hiddenResult = reduceTypedBehaviorEvent(hiddenScreen, hiddenState, event('nether'));
    for (const choice of EXCLUSIVE_CHOICES) expect(hiddenResult.next[`inspector_${choice}`].visible).toBe(false);
    expect(hiddenResult.outcomes.join(' ')).toContain('hide-all');

    const kept = exclusiveVisibilityProject({ fallback: 'keep-current', extraOption: 'nether' }), keptScreen = kept.screens[0];
    const keptState = initialControlState(keptScreen);
    keptState.inspector_temple = { visible: true };
    const keptResult = reduceTypedBehaviorEvent(keptScreen, keptState, event('nether'));
    expect(keptResult.next.inspector_temple.visible).toBe(true);
    expect(keptResult.next.inspector_village).toBeUndefined();
    expect(keptResult.outcomes.join(' ')).toContain('keep-current');
  });

  it('validates every target before writing anything', () => {
    const nodes = exclusiveVisibilityProject().screens[0].nodes;
    expect(planExclusiveVisibility([{ optionId: 'a', targetId: 'inspector_village' }, { optionId: 'b', targetId: 'inspector_village' }], 'a', 'hide-all', nodes).kind).toBe('invalid');
    expect(planExclusiveVisibility([{ optionId: 'a', targetId: 'ghost' }], 'a', 'hide-all', nodes).kind).toBe('invalid');
    expect(planExclusiveVisibility([{ optionId: 'a', targetId: 'page_structures' }], 'a', 'hide-all', nodes).kind).toBe('invalid');
    expect(planExclusiveVisibility([{ optionId: 'a', targetId: 'inspector_village' }], undefined, 'hide-all', nodes).kind).toBe('invalid');
  });

  it('keeps Page gating authoritative for mapped targets', () => {
    const doc = exclusiveVisibilityProject({ endCityTarget: 'other_page_note' }), screen = doc.screens[0];
    const note = screen.nodes.find(node => node.id === 'other_page_note')!;
    let state = reduceTypedBehaviorEvent(screen, initialControlState(screen), event('end_city')).next;
    expect(state.other_page_note.visible).toBe(true);
    expect(effectiveRuntimeVisibility(screen.nodes, state)(note)).toBe(false);
    state = reduceTypedBehaviorEvent(screen, state, event('village')).next;
    expect(state.other_page_note.visible).toBe(false);
  });

  it('keeps explicit triggers and read dependencies independent', () => {
    const read = buildBehaviorIndex(exclusiveVisibilityProject())[0].rules[0];
    expect(read.eventBindings).toHaveLength(1);
    expect(read.reads).toHaveLength(1);
    expect(read.reads[0].nodeId).toBe('structure_selector');
    expect(read.actionTargets).toHaveLength(3);
    const eventValue = buildBehaviorIndex(exclusiveVisibilityProject({ value: 'event-value' }))[0].rules[0];
    expect(eventValue.reads).toEqual([]);
    expect(eventValue.actionTargets).toHaveLength(3);
  });

  it('survives real Blockly serialization', () => {
    const doc = exclusiveVisibilityProject(), rule = doc.screens[0].behaviors[0];
    const workspace = new Blockly.Workspace(); setBlockContext(workspace, doc.screens[0]);
    try {
      Blockly.serialization.workspaces.load(behaviorToWorkspace(rule), workspace);
      const control = workspace.getAllBlocks(false).find(block => block.type === 'gui_exclusive_visible')!;
      const pairs = control.getInputTargetBlock('MAPPING')!;
      expect(pairs.getFieldValue('OPTION')).toBe('village');
      expect(pairs.getNextBlock()!.getNextBlock()!.getFieldValue('TARGET')).toBe('inspector_end_city');
      const saved = Blockly.serialization.workspaces.save(workspace);
      expect(workspaceToBehavior(saved, rule.id, rule)).toEqual(rule);
      workspace.clear(); Blockly.serialization.workspaces.load(saved, workspace);
      expect(workspaceToBehavior(Blockly.serialization.workspaces.save(workspace), rule.id, rule)).toEqual(rule);
    } finally { workspace.dispose(); }
  });

  it('removes the whole rule when a mapped target is deleted', () => {
    const doc = exclusiveVisibilityProject();
    doc.screens[0].nodes = doc.screens[0].nodes.filter(node => node.parentContainerId !== 'inspector_temple');
    const plan = planDeletion(doc, { kind: 'node', screenId: 'screen_main', nodeId: 'inspector_temple' });
    expect(plan.rules).toEqual([{ screenId: 'screen_main', ruleId: 'inspect_exclusive' }]);
    expect(plan.document.screens[0].behaviors).toEqual([]);
  });

  it('upgrades only explicit edits and keeps Undo/Redo', () => {
    const old = structuresInspectorProject(), store = createEditorStore(old);
    expect(store.getState().doc).toEqual(old);
    store.getState().saveBehavior(exclusiveVisibilityProject().screens[0].behaviors[0]);
    expect(store.getState().doc.schemaVersion).toBe('0.46.0');
    store.getState().undo(); expect(store.getState().doc).toEqual(old);
    store.getState().redo(); expect(store.getState().doc.schemaVersion).toBe('0.46.0');
  });

  it('projects the mapping into the Agent Specification and manifest', async () => {
    const doc = exclusiveVisibilityProject();
    const snapshot = beginExport(doc), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json');
    expect(spec.designIntent.exclusiveVisibilityMappings).toHaveLength(1);
    expect(spec.designIntent.exclusiveVisibilityMappings![0].mapping.map(entry => entry.optionId)).toEqual([...EXCLUSIVE_CHOICES]);
    expect(spec.designIntent.exclusiveVisibilityMappings![0].fallback).toBe('hide-all');
    expect(spec.designIntent.exclusiveVisibilityContract).toEqual(EXCLUSIVE_VISIBILITY_CONTRACT);
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([137, 80, 78, 71]), async () => new Uint8Array([137, 80, 78, 71]));
    expect(bundle.manifest.exclusiveVisibilityContract.version).toBe('1.0.0');
    expect(bundle.manifest.screens[0].exclusiveVisibilityMappings).toHaveLength(1);
  });

  it('matches the B1.11 Switch demo for the three declared options', () => {
    const exclusive = exclusiveVisibilityProject().screens[0], chain = branchControlProject().screens[0];
    let a = initialControlState(exclusive), b = initialControlState(chain);
    for (const choice of EXCLUSIVE_CHOICES) {
      const left = reduceTypedBehaviorEvent(exclusive, a, event(choice)), right = reduceTypedBehaviorEvent(chain, b, event(choice));
      a = left.next; b = right.next;
      for (const candidate of EXCLUSIVE_CHOICES) expect(a[`inspector_${candidate}`]?.visible).toBe(b[`inspector_${candidate}`]?.visible);
    }
  });
});