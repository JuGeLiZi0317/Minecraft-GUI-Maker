import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { structuresInspectorProject } from '../../fixtures/structuresInspectorProject';
import { actionsOf, parseProject, type Behavior, type GuiProject } from '../../../src/domain/schema';
import { initialControlState, reduceTypedBehaviorEvent, type RuntimeBehaviorState } from '../../../src/domain/genericBehavior';
import { effectiveRuntimeVisibility } from '../../../src/domain/runtimeVisibility';
import { behaviorToWorkspace, workspaceToBehavior } from '../../../src/behavior/blocklyModel';
import { registerBehaviorBlocks, setBlockContext } from '../../../src/behavior/blocks';
import { createEditorStore } from '../../../src/editor/store';
import { createNode } from '../../../src/domain/model';
import { planDeletion } from '../../../src/domain/deletion';
import { diagnoseBakeCandidates } from '../../../src/domain/bake';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
registerBehaviorBlocks();
const parse = (doc: GuiProject) => parseProject(JSON.stringify(doc));
const event = (optionId: string) => ({ type: 'selection-change' as const, screenId: 'screen_main', nodeId: 'structure_selector', optionId, phase: 'confirm' as const, source: 'pointer' as const });

describe('Q3-D selection driven property groups', () => {
  it.each(['minecraft:radio-group', 'minecraft:dropdown'] as const)('validates %s and switches only the matching group without mutating authority', type => {
    const doc = parse(structuresInspectorProject(type)), before = JSON.stringify(doc), screen = doc.screens[0];
    let state = initialControlState(screen);
    expect(state.inspector_village.visible).toBe(true);
    expect(state.inspector_temple.visible).toBe(false);
    for (const choice of ['temple', 'end_city', 'village']) {
      const result = reduceTypedBehaviorEvent(screen, state, event(choice));
      state = result.next;
      expect(result.matchedRuleIds).toEqual(['show_village', 'show_temple', 'show_end_city']);
      for (const other of ['village', 'temple', 'end_city']) expect(state[`inspector_${other}`].visible).toBe(other === choice);
      expect(state.selection_summary.text).toBe(`Selected ${choice}`);
    }
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('composes Page and ancestor gates and preserves child runtime values', () => {
    const screen = parse(structuresInspectorProject()).screens[0];
    const input = screen.nodes.find(node => node.id === 'input_village')!;
    const initial = { ...initialControlState(screen), input_village: { text: 'retained' } };
    const hidden = reduceTypedBehaviorEvent(screen, initial, event('temple')).next;
    expect(effectiveRuntimeVisibility(screen.nodes, hidden)(input)).toBe(false);
    expect(hidden.input_village).toEqual(initial.input_village);
    const shown = reduceTypedBehaviorEvent(screen, hidden, event('village')).next;
    expect(effectiveRuntimeVisibility(screen.nodes, shown)(input)).toBe(true);
    const pageB: RuntimeBehaviorState = { ...shown, page_structures: { tabSelected: false }, page_other: { tabSelected: true } };
    expect(effectiveRuntimeVisibility(screen.nodes, pageB)(input)).toBe(false);
    expect(pageB.inspector_village.visible).toBe(true);
  });

  it('validates all branch targets and primitive types and gates the new semantics by version', () => {
    const doc = structuresInspectorProject();
    doc.schemaVersion = '0.43.0';
    expect(() => parse(doc)).toThrow('0.44.0');
    for (const targetId of ['missing', 'input_village']) {
      const bad = structuresInspectorProject();
      const rule = bad.screens[0].behaviors[0];
      if ('actions' in rule && rule.actions[0].type === 'if') rule.actions[0].thenActions[1] = { type: 'set-text', targetId, text: 'x' };
      expect(() => parse(bad)).toThrow('类型不匹配');
    }
    const invalid = structuresInspectorProject() as any;
    invalid.screens[0].behaviors[0].actions[0].thenActions[0].visible = 'true';
    expect(() => parse(invalid)).toThrow();
    const wrongText = structuresInspectorProject() as any;
    wrongText.screens[0].behaviors[0].actions[0].thenActions[1].text = 42;
    expect(() => parse(wrongText)).toThrow();
    for (const type of ['set-value', 'set-option']) {
      const unsupported = structuresInspectorProject() as any;
      unsupported.screens[0].behaviors[0].actions[0].thenActions[0] = { type, targetId: 'input_village', value: 42 };
      expect(() => parse(unsupported)).toThrow();
    }
  });

  it('rejects Native Region in either branch and preserves Bake exclusions for dynamic Fill', () => {
    const doc = structuresInspectorProject(), screen = doc.screens[0];
    screen.nodes.push(createNode('native_region', 'inventory', { x: 12, y: 238 }));
    const rule = screen.behaviors[0];
    if ('actions' in rule && rule.actions[0].type === 'if') rule.actions[0].elseActions = [{ type: 'set-visible', targetId: 'inventory', visible: false }];
    expect(() => parse(doc)).toThrow('Native Region');
    screen.nodes.pop();
    screen.nodes.push(createNode('minecraft:fill', 'dynamic_fill', { x: 16, y: 220 }));
    if ('actions' in rule && rule.actions[0].type === 'if') rule.actions[0].elseActions = [{ type: 'set-visible', targetId: 'dynamic_fill', visible: false }];
    expect(diagnoseBakeCandidates(parse(doc).screens[0]).find(item => item.nodeId === 'dynamic_fill')?.eligible).toBe(false);
  });

  it('does not subscribe to read dependencies or cascade programmatic text/visibility assignments', () => {
    const screen = structuresInspectorProject().screens[0];
    const second = structuredClone(screen.nodes[0]); second.id = 'read_only_selector'; screen.nodes.push(second);
    const initial = initialControlState(screen);
    const result = reduceTypedBehaviorEvent(screen, initial, { ...event('temple'), nodeId: second.id });
    expect(result.matchedRuleIds).toEqual([]);
    expect(result.next.inspector_village.visible).toBe(true);
    const hiddenSource = { ...initial, structure_selector: { ...initial.structure_selector, visible: false } };
    expect(reduceTypedBehaviorEvent(screen, hiddenSource, event('temple')).matchedRuleIds).toEqual([]);
    const source = screen.nodes[0]; source.parentContainerId = 'inspector_temple';
    expect(reduceTypedBehaviorEvent(screen, initial, event('temple')).matchedRuleIds).toEqual([]);
    expect(reduceTypedBehaviorEvent(screen, initial, event('temple'), { sourceVisible: true }).matchedRuleIds).toEqual([]);
  });

  it('round trips real Blockly visibility/text blocks, empty text and explicit bindings', () => {
    const doc = structuresInspectorProject(), screen = doc.screens[0];
    for (const rule of screen.behaviors) {
      const ws = new Blockly.Workspace(); setBlockContext(ws, screen);
      try {
        Blockly.serialization.workspaces.load(behaviorToWorkspace(rule), ws);
        const state = Blockly.serialization.workspaces.save(ws);
        expect(ws.getAllBlocks(false).some(block => block.type === 'gui_set_visible')).toBe(true);
        expect(workspaceToBehavior(state, rule.id, rule)).toEqual(rule);
      } finally { ws.dispose(); }
    }
    const empty: Behavior = { id: 'empty_text', event: { type: 'selection-change', sourceId: 'structure_selector' }, action: { type: 'set-text', targetId: 'selection_summary', text: '' } };
    expect(workspaceToBehavior(behaviorToWorkspace(empty), empty.id, empty)).toEqual(empty);
  });

  it('uses explicit heterogeneous events with the same OptionId read snapshot', () => {
    const doc = structuresInspectorProject(), screen = doc.screens[0];
    const slider = createNode('minecraft:slider', 'refresh_slider', { x: 16, y: 190 });
    if (slider.type !== 'minecraft:slider') throw new Error('Invalid Slider');
    Object.assign(slider.props, { min: 0, max: 100, step: 1, initialValue: 0 });
    screen.nodes.push(slider);
    for (const rule of screen.behaviors) rule.eventBindings!.push({ type: 'slider-change', sourceId: slider.id, payloadType: 'Number' });
    const parsed = parse(doc).screens[0];
    const result = reduceTypedBehaviorEvent(parsed, initialControlState(parsed), { type: 'slider-change', screenId: parsed.id, nodeId: slider.id, value: 42, phase: 'change' });
    expect(result.matchedRuleIds).toHaveLength(3);
    expect(result.next.structure_selector.optionId).toBe('village');
    expect(result.next.selection_summary.text).toBe('Selected village');
    expect(result.next.inspector_temple.visible).toBe(false);
  });

  it('explicit save upgrades once, supports Undo/Redo and unrelated legacy edits preserve versions', () => {
    const doc = structuresInspectorProject(); doc.screens[0].behaviors = []; doc.schemaVersion = '0.43.0';
    const store = createEditorStore(doc), rule = structuresInspectorProject().screens[0].behaviors[0];
    store.getState().saveBehavior(rule);
    expect(store.getState().doc.schemaVersion).toBe('0.44.0');
    store.getState().undo(); expect(store.getState().doc).toEqual(doc);
    store.getState().redo(); expect(store.getState().doc.screens[0].behaviors).toEqual([rule]);
    const old = createEditorStore(doc); old.getState().updateNode('structure_selector', node => ({ ...node, alias: 'renamed' }));
    expect(old.getState().doc.schemaVersion).toBe('0.43.0');
    const deleted = planDeletion(structuresInspectorProject(), { kind: 'node', screenId: 'screen_main', nodeId: 'selection_summary' });
    expect(deleted.document.screens[0].behaviors).toHaveLength(0);
  });

  it('exports the saved F2 branches and explicit game runtime semantics', async () => {
    const doc = structuresInspectorProject(), snapshot = beginExport(doc);
    const spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json');
    expect(spec.designIntent.behaviors).toEqual(doc.screens[0].behaviors);
    expect(spec.designIntent.genericBehaviorContract.inspectorBinding.visibilityTargets).toContain('Native Region is forbidden');
    expect(spec.designIntent.genericBehaviorContract.inspectorBinding.assignmentEvents).toContain('never emit');
    const projection = spec.designIntent.conditionalBehaviors[0];
    expect(projection.type === 'if' ? projection.thenActions : undefined).toEqual(actionsOf(doc.screens[0].behaviors[0])[0].type === 'if' ? (actionsOf(doc.screens[0].behaviors[0])[0] as any).thenActions : []);
  });
});
