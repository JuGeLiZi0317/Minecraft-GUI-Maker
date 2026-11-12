import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { actionsOf, parseProject, behaviorActionSchema, type SwitchBehaviorAction } from '../../../src/domain/schema';
import { initialControlState, reduceTypedBehaviorEvent, type RuntimeBehaviorState } from '../../../src/domain/genericBehavior';
import { behaviorToWorkspace, workspaceToBehavior } from '../../../src/behavior/blocklyModel';
import { registerBehaviorBlocks, setBlockContext } from '../../../src/behavior/blocks';
import { buildBehaviorIndex } from '../../../src/domain/behaviorDiagnostics';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';
import { createNode } from '../../../src/domain/model';
import { branchControlProject, ifChainProject } from '../../fixtures/branchControlProject';
import { structuresInspectorProject } from '../../fixtures/structuresInspectorProject';

registerBehaviorBlocks();
const actionOf = (doc = branchControlProject()) => actionsOf(doc.screens[0].behaviors[0])[0] as Extract<SwitchBehaviorAction, { valueType: 'OptionId' }>;
const event = (optionId: string) => ({ type: 'selection-change' as const, screenId: 'screen_main', nodeId: 'structure_selector', optionId, phase: 'confirm' as const, source: 'pointer' as const });

describe('B1.11 authority, runtime and Blockly', () => {
  it('validates typed cases, references, branch limits and explicit schema gates', () => {
    expect(parseProject(JSON.stringify(branchControlProject()))).toEqual(branchControlProject());
    const duplicate = actionOf(); duplicate.cases.push(structuredClone(duplicate.cases[0]));
    expect(() => behaviorActionSchema.parse(duplicate)).toThrow('Case');
    expect(() => behaviorActionSchema.parse({ ...actionOf(), cases: [{ value: 1, actions: actionOf().cases[0].actions }] })).toThrow();
    for (const mutate of [
      (doc: ReturnType<typeof branchControlProject>) => { doc.schemaVersion = '0.44.0'; },
      (doc: ReturnType<typeof branchControlProject>) => { actionOf(doc).cases[0].value = 'missing'; },
      (doc: ReturnType<typeof branchControlProject>) => { actionOf(doc).value = { type: 'read-control-value', nodeId: 'missing' }; },
      (doc: ReturnType<typeof branchControlProject>) => { actionOf(doc).cases[0].actions[0].targetId = 'missing'; },
      (doc: ReturnType<typeof branchControlProject>) => { actionOf(doc).cases = Array.from({ length: 17 }, (_, i) => ({ value: `v${i}`, actions: actionOf().cases[0].actions })); },
      (doc: ReturnType<typeof branchControlProject>) => { actionOf(doc).cases[0].actions = Array.from({ length: 51 }, () => actionOf().cases[0].actions[0]); },
    ]) { const doc = branchControlProject(); mutate(doc); expect(() => parseProject(JSON.stringify(doc))).toThrow(); }
  });
  for (const factory of [branchControlProject, ifChainProject]) it(`${factory.name} executes one branch, preserves state and authority`, () => {
    const doc = factory(), before = structuredClone(doc), screen = doc.screens[0];
    let state: RuntimeBehaviorState = { ...initialControlState(screen), input_village: { text: '42' } };
    for (const choice of ['village', 'temple', 'end_city', 'village']) {
      const result = reduceTypedBehaviorEvent(screen, state, event(choice)); state = result.next as typeof state;
      expect(result.matchedRuleIds).toHaveLength(1);
      for (const other of ['village', 'temple', 'end_city']) expect(state[`inspector_${other}`]?.visible).toBe(other === choice);
      expect(state.selection_summary.text).toBe(`Selected ${choice}`);
      expect(state.input_village.text).toBe('42');
      if (choice === 'village' && factory === ifChainProject) expect(result.outcomes.join(' ')).toContain('短路');
    }
    expect(doc).toEqual(before);
  });
  it('handles default, no match, single selector evaluation and action order', () => {
    const doc = branchControlProject(), screen = doc.screens[0], action = actionOf(doc);
    const selector = screen.nodes.find(node => node.id === 'structure_selector')!;
    if (selector.type !== 'minecraft:radio-group') throw Error();
    selector.props.options.push({ id: 'other', label: { kind: 'literal', value: 'Other' }, disabled: false });
    let result = reduceTypedBehaviorEvent(screen, initialControlState(screen), event('other'));
    expect(result.next.inspector_village.visible).toBe(false);
    expect(result.next.selection_summary.text).toBe('No inspector');
    delete action.defaultActions;
    result = reduceTypedBehaviorEvent(screen, initialControlState(screen), event('other'));
    expect(result.next.selection_summary).toBeUndefined();
    action.cases[0].actions.push({ type: 'set-text', targetId: 'selection_summary', text: 'last' });
    result = reduceTypedBehaviorEvent(screen, initialControlState(screen), event('village'));
    expect(result.next.selection_summary.text).toBe('last');
    // Immutable read snapshot and first-match selection remain unaffected by actions.
    action.cases[1].value = 'village';
    result = reduceTypedBehaviorEvent(screen, initialControlState(screen), event('village'));
    expect(result.next.selection_summary.text).toBe('last');
    action.value = { type: 'read-control-value', nodeId: 'missing' };
    result = reduceTypedBehaviorEvent(screen, initialControlState(screen), event('village'));
    expect(result.next.selection_summary).toBeUndefined();
    expect(result.outcomes.join(' ')).toContain('invalid');
  });
  for (const factory of [branchControlProject, ifChainProject]) it(`${factory.name} survives real Blockly serialization`, () => {
    const doc = factory(), rule = doc.screens[0].behaviors[0];
    const workspace = new Blockly.Workspace(); setBlockContext(workspace, doc.screens[0]);
    try {
      Blockly.serialization.workspaces.load(behaviorToWorkspace(rule), workspace);
      const saved = Blockly.serialization.workspaces.save(workspace);
      expect(workspaceToBehavior(saved, rule.id, rule)).toEqual(rule);
      workspace.clear(); Blockly.serialization.workspaces.load(saved, workspace);
      expect(workspaceToBehavior(Blockly.serialization.workspaces.save(workspace), rule.id, rule)).toEqual(rule);
    } finally { workspace.dispose(); }
  });
  it('supports typed Number switch and stops invalid if chains before fallback', () => {
    const doc = branchControlProject(), screen = doc.screens[0];
    const slider = createNode('minecraft:slider', 'number_selector', { x: 10, y: 280 });
    screen.nodes.push(slider);
    screen.behaviors = [{ id: 'numbers', event: { type: 'slider-change', sourceId: slider.id }, actions: [{ type: 'switch', valueType: 'Number', value: { type: 'event-value', field: 'value' }, cases: [{ value: 50, actions: [{ type: 'set-text', targetId: 'selection_summary', text: 'fifty' }] }], defaultActions: [{ type: 'set-text', targetId: 'selection_summary', text: 'other' }] }] }];
    expect(() => parseProject(JSON.stringify(doc))).not.toThrow();
    const result = reduceTypedBehaviorEvent(screen, initialControlState(screen), { type: 'slider-change', phase: 'change', screenId: screen.id, nodeId: slider.id, value: 50 });
    expect(result.next.selection_summary.text).toBe('fifty');
    const chain = ifChainProject(), action = actionsOf(chain.screens[0].behaviors[0])[0];
    if (action.type !== 'if') throw Error();
    action.condition = { type: 'compare', valueType: 'OptionId', operator: 'equals', left: { type: 'read-control-value', nodeId: 'missing' }, right: { type: 'constant', value: 'village' } };
    const skipped = reduceTypedBehaviorEvent(chain.screens[0], initialControlState(chain.screens[0]), event('temple'));
    expect(skipped.next.selection_summary).toBeUndefined();
    expect(skipped.outcomes.join(' ')).toContain('整个分支链跳过');
  });
  it('native mutator reorders paired cases/actions, adds/removes and restores shapes', () => {
    const doc = branchControlProject(), rule = doc.screens[0].behaviors[0];
    const workspace = new Blockly.Workspace(), mutatorWorkspace = new Blockly.Workspace();
    setBlockContext(workspace, doc.screens[0]);
    try {
      Blockly.serialization.workspaces.load(behaviorToWorkspace(rule), workspace);
      const block = workspace.getAllBlocks(false).find(block => block.type === 'gui_switch')! as Blockly.Block & {
        decompose(workspace: Blockly.Workspace): Blockly.Block;
        saveConnections(container: Blockly.Block): void;
        compose(container: Blockly.Block): void;
      };
      const container = block.decompose(mutatorWorkspace); block.saveConnections(container);
      const first = container.getInputTargetBlock('STACK')!, second = first.getNextBlock()!, third = second.getNextBlock()!, fallback = third.getNextBlock()!;
      first.previousConnection!.disconnect(); first.nextConnection!.disconnect(); second.nextConnection!.disconnect(); third.nextConnection!.disconnect();
      container.getInput('STACK')!.connection!.connect(second.previousConnection!);
      second.nextConnection!.connect(first.previousConnection!); first.nextConnection!.connect(third.previousConnection!); third.nextConnection!.connect(fallback.previousConnection!);
      block.compose(container);
      const restored = workspaceToBehavior(Blockly.serialization.workspaces.save(workspace), rule.id, rule);
      const action = actionsOf(restored)[0]; if (action.type !== 'switch') throw Error();
      expect(action.cases.map(entry => entry.value)).toEqual(['temple', 'village', 'end_city']);
      expect(action.cases[0].actions.at(-1)).toMatchObject({ text: 'Selected temple' });
      // Removing a branch preserves disconnected children, which must be dealt with explicitly.
      first.previousConnection!.disconnect(); first.nextConnection!.disconnect(); second.nextConnection!.connect(third.previousConnection!);
      block.compose(container);
      expect(block.saveExtraState!()).toMatchObject({ count: 2 });
      expect(() => workspaceToBehavior(Blockly.serialization.workspaces.save(workspace), rule.id, rule)).toThrow('游离');
      // Reattaching the removed branch restores the same connected authority.
      second.nextConnection!.disconnect(); second.nextConnection!.connect(first.previousConnection!); first.nextConnection!.connect(third.previousConnection!);
      block.compose(container);
      expect(workspaceToBehavior(Blockly.serialization.workspaces.save(workspace), rule.id, rule)).toEqual(restored);
    } finally { workspace.dispose(); mutatorWorkspace.dispose(); }
  });
  it('offers Case options from the selected read control rather than the trigger', () => {
    const doc = branchControlProject(), screen = doc.screens[0], selector = structuredClone(screen.nodes[0]);
    if (selector.type !== 'minecraft:radio-group') throw Error();
    selector.id = 'other_selector'; selector.props.options = [{ id: 'castle', label: { kind: 'literal', value: 'Castle' }, disabled: false }]; selector.props.initialSelectedOptionId = 'castle';
    screen.nodes.push(selector);
    const action = actionOf(doc); action.value = { type: 'read-control-value', nodeId: selector.id };
    action.cases = [{ value: 'castle', actions: action.cases[0].actions }];
    expect(() => parseProject(JSON.stringify(doc))).not.toThrow();
    const workspace = new Blockly.Workspace(); setBlockContext(workspace, screen);
    try {
      Blockly.serialization.workspaces.load(behaviorToWorkspace(screen.behaviors[0]), workspace);
      const constant = workspace.getAllBlocks(false).find(block => block.type === 'gui_constant')!;
      const options = (constant.getField('VALUE') as Blockly.FieldDropdown).getOptions(false);
      expect(options).toContainEqual(['Castle', 'castle']);
      expect(workspaceToBehavior(Blockly.serialization.workspaces.save(workspace), screen.behaviors[0].id, screen.behaviors[0])).toEqual(screen.behaviors[0]);
    } finally { workspace.dispose(); }
  });
  it('enforces total actions, target types and deleted-read cleanup', async () => {
    const doc = branchControlProject(), action = actionOf(doc);
    const template = structuredClone(action.cases[0]);
    action.cases = Array.from({ length: 5 }, (_, i) => ({ value: ['village', 'temple', 'end_city', 'four', 'five'][i], actions: Array.from({ length: 50 }, () => template.actions[0]) }));
    expect(() => parseProject(JSON.stringify(doc))).toThrow('200');
    const invalid = branchControlProject();
    actionOf(invalid).cases[1].actions[0] = { type: 'set-text', targetId: 'inspector_village', text: 'bad' };
    expect(() => parseProject(JSON.stringify(invalid))).toThrow('类型不匹配');
    const { planDeletion } = await import('../../../src/domain/deletion');
    const readOnly = branchControlProject();
    const selector = structuredClone(readOnly.screens[0].nodes[0]); selector.id = 'read_only_selector';
    readOnly.screens[0].nodes.push(selector); actionOf(readOnly).value = { type: 'read-control-value', nodeId: selector.id };
    const plan = planDeletion(readOnly, { kind: 'node', screenId: 'screen_main', nodeId: selector.id });
    expect(plan.rules).toEqual([{ screenId: 'screen_main', ruleId: 'inspect_structure' }]);
    expect(plan.document.screens[0].behaviors).toEqual([]);
  });
  it('upgrades only explicit edits, preserves Undo/Redo and exposes branch references in export', async () => {
    const old = structuresInspectorProject(), store = createEditorStore(old);
    expect(store.getState().doc).toEqual(old);
    const rule = branchControlProject().screens[0].behaviors[0];
    store.getState().saveBehavior(rule);
    expect(store.getState().doc.schemaVersion).toBe('0.45.0');
    store.getState().undo(); expect(store.getState().doc).toEqual(old);
    store.getState().redo(); expect(store.getState().doc.schemaVersion).toBe('0.45.0');
    const doc = branchControlProject(), index = buildBehaviorIndex(doc)[0].rules[0];
    expect(index.readDependencies[0].nodeId).toBe('structure_selector');
    expect(index.actionTargets).toHaveLength(16);
    const snapshot = beginExport(doc), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json');
    expect(spec.designIntent.behaviors).toEqual(doc.screens[0].behaviors);
    expect(spec.designIntent.conditionalBehaviors[0].type).toBe('switch');
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([137,80,78,71]), async () => new Uint8Array([137,80,78,71]));
    expect(bundle.manifest.genericBehaviorContract).toBeDefined();
  });
});
