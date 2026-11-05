import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { registerBehaviorBlocks, setBlockContext } from '../../../src/behavior/blocks';
import { behaviorToWorkspace, workspaceToBehavior } from '../../../src/behavior/blocklyModel';
import { actionsOf, parseProject, type BehaviorCondition } from '../../../src/domain/schema';
import { evaluateBehaviorCondition, reduceTypedBehaviorEvent } from '../../../src/domain/genericBehavior';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';
import { genericBehaviorProject, genericRule } from '../../fixtures/genericBehaviorProject';
import { simpleStatusRule } from '../../fixtures/blocklyUsabilityProject';
registerBehaviorBlocks();
const selection = (optionId = 'option_1') => ({ type: 'selection-change' as const, screenId: 'screen_main', nodeId: 'node_22', phase: 'confirm' as const, source: 'pointer' as const, optionId });
const numberEvent = (value: number) => ({ type: 'slider-change' as const, screenId: 'screen_main', nodeId: 'slider_source', phase: 'change' as const, value });
describe('B1.5 one typed orchestration for OptionId and Number', () => {
  it.each(['OptionId', 'Number'] as const)('round trips %s with the same generic event/compare/if/action block classes', kind => {
    const rule = genericRule(kind), ws = new Blockly.Workspace(); setBlockContext(ws, genericBehaviorProject().screens[0]);
    try {
      Blockly.serialization.workspaces.load(behaviorToWorkspace(rule), ws);
      expect(ws.getTopBlocks(false)).toHaveLength(1);
      for (const type of ['gui_on_event', 'gui_compare', 'gui_if', 'gui_action', 'gui_event_value', 'gui_constant']) expect(ws.getAllBlocks(false).some(block => block.type === type)).toBe(true);
      const compare = ws.getAllBlocks(false).find(block => block.type === 'gui_compare')!;
      expect(compare.getInput('LEFT')!.connection!.getCheck()).toEqual([kind]);
      expect(workspaceToBehavior(Blockly.serialization.workspaces.save(ws), rule.id, rule)).toEqual(rule);
    } finally { ws.dispose(); }
  });
  it('rejects illegal real Blockly connections and serialized forged type conversions', () => {
    const ws = new Blockly.Workspace(); setBlockContext(ws, genericBehaviorProject().screens[0]);
    try {
      const compare = ws.newBlock('gui_compare'), constant = ws.newBlock('gui_constant'), action = ws.newBlock('gui_action'), event = ws.newBlock('gui_event_value');
      constant.setFieldValue('StatusId', 'TYPE'); compare.setFieldValue('OptionId', 'TYPE');
      expect(ws.connectionChecker.canConnect(compare.getInput('LEFT')!.connection!, constant.outputConnection!, false)).toBe(false);
      event.setFieldValue('value', 'FIELD'); expect(ws.connectionChecker.canConnect(compare.getInput('LEFT')!.connection!, event.outputConnection!, false)).toBe(false);
      action.setFieldValue('currentValue', 'PROPERTY'); expect(ws.connectionChecker.canConnect(action.getInput('VALUE')!.connection!, constant.outputConnection!, false)).toBe(false);
      compare.setFieldValue('Number', 'TYPE'); expect(ws.connectionChecker.canConnect(compare.getInput('LEFT')!.connection!, event.outputConnection!, false)).toBe(true);
    } finally { ws.dispose(); }
    const state = behaviorToWorkspace(genericRule('Number')), comparison = state.blocks!.blocks[0].inputs!.DO.block!.inputs!.CONDITION.block!;
    comparison.inputs!.RIGHT.block!.fields!.VALUE = '5'; expect(() => workspaceToBehavior(state, 'forged')).toThrow('不接受字符串转换');
    comparison.inputs!.RIGHT.block!.fields!.TYPE = 'StatusId'; expect(() => workspaceToBehavior(state, 'forged')).toThrow('类型不兼容');
  });
  it('uses one reducer for both domains, branch exclusivity, ordered last-valid writes and existing mappings', () => {
    const screen = genericBehaviorProject().screens[0], before = structuredClone(screen);
    const a = reduceTypedBehaviorEvent(screen, null, selection()); expect(a.next.node_26.statusId).toBe('status_running'); expect(a.outcomes.join(' ')).toContain('进入 then'); expect(a.outcomes.join(' ')).not.toContain('/ status_warning 已执行');
    const b = reduceTypedBehaviorEvent(screen, a.next, numberEvent(6)); expect(b.next.progress_target.progressValue).toBe(60); expect(b.next.node_26.statusId).toBe('status_running');
    expect(reduceTypedBehaviorEvent(screen, b.next, numberEvent(3)).next.progress_target.progressValue).toBe(3);
    expect(reduceTypedBehaviorEvent(screen, null, numberEvent(10)).next.progress_target.progressValue).toBe(100);
    const c = reduceTypedBehaviorEvent(screen, b.next, selection('option_2')); expect(c.next.node_26.statusId).toBe('status_warning');
    screen.behaviors.push({ id: 'rule_last', event: { type: 'slider-change', sourceId: 'slider_source' }, actions: [{ type: 'set-progress-value', targetId: 'progress_target', mapping: 'direct' }] });
    const ordered = reduceTypedBehaviorEvent(screen, null, numberEvent(6)); expect(ordered.next.progress_target.progressValue).toBe(6); expect(ordered.matchedRuleIds).toEqual(['rule_generic_number', 'rule_last']); expect(ordered.outcomes.join(' ')).toMatch(/60[\s\S]*更新为 6（direct）/);
    expect(before.nodes).toEqual(screen.nodes); expect(screen.nodes.find(node => node.id === 'progress_target')!.props).toMatchObject({ initialValue: 0 });
  });
  it('keeps shared map and multi-source behavior in the same condition/reducer path', () => {
    const doc = genericBehaviorProject(), screen = doc.screens[0], rule = screen.behaviors[1];
    if (rule.event.type === 'selection-change') rule.event.additionalSourceIds = ['node_23'];
    const branch = actionsOf(rule)[0]; if (branch.type !== 'if') throw Error('fixture'); branch.thenActions.push({ type: 'set-status', targetId: 'node_26', mapRef: 'map_shared' });
    screen.behaviorMaps = [{ id: 'map_shared', name: '共享', mappings: [{ optionId: 'option_1', statusId: 'status_warning' }] }]; expect(parseProject(JSON.stringify(doc))).toEqual(doc);
    const result = reduceTypedBehaviorEvent(screen, null, { ...selection(), nodeId: 'node_23' }); expect(result.next.node_26.statusId).toBe('status_warning'); expect(result.matchedRuleIds).toEqual(['rule_generic_option']);
    const ws = new Blockly.Workspace(); setBlockContext(ws, screen); try { Blockly.serialization.workspaces.load(behaviorToWorkspace(rule), ws); expect(workspaceToBehavior(Blockly.serialization.workspaces.save(ws), rule.id, rule)).toEqual(rule); } finally { ws.dispose(); }
  });
  it.each([['equals', 5, true], ['not-equals', 5, false], ['greater-than', 6, true], ['less-than', 4, true], ['greater-or-equal', 5, true], ['less-or-equal', 5, true]] as const)('evaluates Number %s without coercion', (operator, value, expected) => {
    const condition: BehaviorCondition = { type: 'compare', valueType: 'Number', operator, left: { type: 'event-value', field: 'value' }, right: { type: 'constant', value: 5 } };
    expect(evaluateBehaviorCondition(condition, numberEvent(value))).toMatchObject({ value: expected });
    expect(evaluateBehaviorCondition(condition, selection())).toHaveProperty('error'); expect(evaluateBehaviorCondition(condition, numberEvent(NaN))).toHaveProperty('error');
  });
  it('rejects missing/wrong payloads, unavailable sources and stale Screen events without taking else', () => {
    const screen = genericBehaviorProject().screens[0];
    for (const event of [numberEvent(NaN), numberEvent(1.5), { ...numberEvent(6), screenId: 'old_screen' }, { ...selection(), optionId: 'option_4' }]) {
      const result = reduceTypedBehaviorEvent(screen, { sentinel: { progressValue: 7 } }, event); expect(result.next).toEqual({ sentinel: { progressValue: 7 } }); expect(result.matchedRuleIds).toEqual([]);
    }
    const slider = screen.nodes.find(node => node.id === 'slider_source')!; if ('enabled' in slider.state) slider.state.enabled = false;
    expect(reduceTypedBehaviorEvent(screen, null, numberEvent(6)).matchedRuleIds).toEqual([]);
    expect(reduceTypedBehaviorEvent(screen, { node_22: { visible: false } }, selection()).matchedRuleIds).toEqual([]);
  });
  it('validates common option references, nominal types, capability targets, event contexts and old-version gates', () => {
    const check = (mutate: (doc: ReturnType<typeof genericBehaviorProject>) => void) => { const doc = genericBehaviorProject(); mutate(doc); return () => parseProject(JSON.stringify(doc)); };
    expect(check(doc => { doc.schemaVersion = '0.34.0'; })).toThrow('0.35.0');
    expect(check(doc => { const a = actionsOf(doc.screens[0].behaviors[2])[0]; if (a.type === 'if') a.thenActions[0].targetId = 'node_26'; })).toThrow('目标');
    expect(check(doc => { doc.screens[0].behaviors[2].event = { type: 'selection-change', sourceId: 'node_22' }; })).toThrow('slider-change');
    expect(check(doc => { const a = actionsOf(doc.screens[0].behaviors[1])[0]; if (a.type === 'if' && a.condition.type === 'compare' && a.condition.valueType === 'OptionId' && a.condition.right.type === 'constant') a.condition.right.value = 'missing_option'; })).toThrow('每个来源');
    const raw: any = genericBehaviorProject(); raw.screens[0].behaviors[2].actions[0].condition.right.value = '5'; expect(() => parseProject(JSON.stringify(raw))).toThrow();
    raw.screens[0].behaviors[2].actions[0].condition.valueType = 'StatusId'; expect(() => parseProject(JSON.stringify(raw))).toThrow();
  });
  it('preserves old authority, explicit upgrade/history, new-version old edits, JSON and session reinitialization', () => {
    const doc = genericBehaviorProject(false); doc.schemaVersion = '0.34.0'; doc.screens[0].behaviors.push(simpleStatusRule());
    const store = createEditorStore(doc), before = structuredClone(store.getState().doc); behaviorToWorkspace(simpleStatusRule()); expect(store.getState().doc).toEqual(before);
    store.getState().saveBehavior(genericRule('Number')); const after = structuredClone(store.getState().doc); expect(after.schemaVersion).toBe('0.35.0'); expect(after.screens[0].behaviors.slice(0, 2)).toEqual(before.screens[0].behaviors);
    store.getState().undo(); expect(store.getState().doc).toEqual(before); store.getState().redo(); expect(store.getState().doc).toEqual(after);
    const restored = createEditorStore(parseProject(JSON.stringify(after))); restored.getState().saveBehavior(simpleStatusRule()); restored.getState().add('minecraft:checkbox'); restored.getState().addScreen(); expect(restored.getState().doc.schemaVersion).toBe('0.35.0');
    expect(reduceTypedBehaviorEvent(doc.screens[0], null, selection()).next.node_26.statusId).toBe('status_running'); expect(doc.screens[0].nodes.find(node => node.id === 'node_26')!.props).toMatchObject({ initialStatusId: 'status_stopped' });
  });
  it('adapts legacy OptionId values and StatusId constants without a separate execution representation', () => {
    const rule = genericRule('OptionId'), state = behaviorToWorkspace(rule), root = state.blocks!.blocks[0], branch = root.inputs!.DO.block!;
    branch.inputs!.CONDITION.block!.inputs!.LEFT.block = { type: 'gui_event_option' };
    const status = branch.inputs!.THEN.block!.inputs!.VALUE.block!;
    branch.inputs!.THEN.block = { type: 'gui_set_status', fields: { TARGET: 'node_26' }, inputs: { VALUE: { block: status } } };
    expect(workspaceToBehavior(state, rule.id, rule)).toEqual(rule);
  });
  it('skips invalid option references instead of treating them as false and permits an explicit visible tab source', () => {
    const screen = genericBehaviorProject().screens[0], rule = screen.behaviors[1], condition = actionsOf(rule)[0];
    if (condition.type === 'if' && condition.condition.type === 'compare' && condition.condition.valueType === 'OptionId' && condition.condition.right.type === 'constant') condition.condition.right.value = 'missing_option';
    const invalid = reduceTypedBehaviorEvent(screen, null, selection()); expect(invalid.next).toEqual({}); expect(invalid.outcomes.join(' ')).toContain('两分支均跳过');
    const node = screen.nodes.find(node => node.id === 'slider_source')!; node.state.visible = false;
    expect(reduceTypedBehaviorEvent(screen, null, numberEvent(6), { sourceVisible: true }).next.progress_target.progressValue).toBe(60);
  });
  it('exports both typed conditional domains, full ordered actions and unchanged multi-Screen authority', async () => {
    const store = createEditorStore(genericBehaviorProject()); store.getState().addScreen(); const snapshot = beginExport(store.getState().doc), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'authority.json');
    expect(spec.designIntent.genericBehaviorContract).toMatchObject({ scope: expect.stringContaining('same Screen'), execution: expect.stringContaining('one rule/action/branch') });
    expect(spec.designIntent.conditionalBehaviors).toMatchObject([{ event: { type: 'selection-change', phase: 'confirm' }, condition: { valueType: 'OptionId' } }, { event: { type: 'slider-change', phase: 'change' }, condition: { valueType: 'Number' }, thenActions: [{ type: 'set-progress-value', mapping: 'normalize' }], elseActions: [{ type: 'set-progress-value', mapping: 'direct' }] }]);
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([137, 80, 78, 71])); expect(bundle.manifest.screens).toHaveLength(2); expect(bundle.manifest.screens[0].conditionalBehaviors).toHaveLength(2); expect(bundle.manifest.genericBehaviorContract.types).toEqual(['Boolean', 'Number', 'Text', 'OptionId', 'StatusId']);
    const authority = bundle.files.find(file => file.name === bundle.manifest.authority.file)!; expect(JSON.parse(new TextDecoder().decode(authority.bytes))).toEqual(store.getState().doc);
  });
});
