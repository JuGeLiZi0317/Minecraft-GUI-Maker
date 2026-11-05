import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBehaviorDiagnostics, buildBehaviorIndex, classifyBehaviorOutcome, classifyValidationIssue } from '../../../src/domain/behaviorDiagnostics';
import { beginExport, sha256 } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';
import { buildZip } from '../../../src/exports/zip';
import { reduceTypedBehaviorEvent } from '../../../src/domain/genericBehavior';
import { createNode, literal } from '../../../src/domain/model';
import { genericBehaviorProject } from '../../fixtures/genericBehaviorProject';

function fixture() {
  const doc = genericBehaviorProject(), screen = doc.screens[0], rule = screen.behaviors[1];
  if (rule.event.type === 'selection-change') rule.event.additionalSourceIds = ['node_23'];
  if ('actions' in rule && rule.actions[0].type === 'if') rule.actions[0].thenActions.push({ type: 'set-status', targetId: 'node_26', mapRef: 'status_map_shared' });
  screen.behaviorMaps = [{ id: 'status_map_shared', name: '共享', mappings: [{ optionId: 'option_1', statusId: 'status_running' }] }];
  screen.behaviors.push({ id: 'rule_both', event: { type: 'button-click', sourceId: 'legacy_button' }, action: { type: 'set-visible', targetId: 'legacy_button', visible: false } });
  screen.screenTargets = [{ id: 'screen_decl', name: '未来页面' }]; screen.behaviors.push({ id: 'rule_nav', event: { type: 'button-click', sourceId: 'legacy_button' }, action: { type: 'open_screen', targetScreenId: 'screen_decl' } });
  const radio = screen.nodes.find(node => node.id === 'node_22')!, dropdown = screen.nodes.find(node => node.id === 'node_23')!;
  if (radio.type === 'minecraft:radio-group') radio.props.name = literal('相同名称'); if (dropdown.type === 'minecraft:dropdown') dropdown.props.name = literal('相同名称');
  const other = structuredClone(screen); other.id = 'screen_other'; other.title = screen.title; other.nodes = [createNode('minecraft:button', 'button_other'), createNode('minecraft:string-widget', 'label_other')]; other.behaviorMaps = []; other.screenTargets = []; other.behaviors = [{ id: 'rule_other', event: { type: 'button-click', sourceId: 'button_other' }, action: { type: 'set-text', targetId: 'label_other', text: 'x' } }]; doc.screens.push(other);
  return doc;
}
describe('B1.6 behavior diagnostics and stable reference index', () => {
  it('indexes multi-source, target, both, unbound and internal interactions by ID across Screens', () => {
    const doc = fixture(), before = structuredClone(doc), screens = buildBehaviorIndex(doc), first = screens[0];
    expect(first.nodes.find(node => node.nodeId === 'node_22')).toMatchObject({ label: '事件来源', sourceRuleIds: ['rule_generic_option'] });
    expect(first.nodes.find(node => node.nodeId === 'node_23')).toMatchObject({ label: '事件来源', sourceRuleIds: ['rule_generic_option'] });
    expect(first.nodes.find(node => node.nodeId === 'node_26')).toMatchObject({ label: '动作目标', targetRuleIds: ['rule_generic_option'], displayOnly: true });
    expect(first.nodes.find(node => node.nodeId === 'legacy_button')).toMatchObject({ label: '来源＋目标', sourceRuleIds: ['rule_legacy', 'rule_both', 'rule_nav'], targetRuleIds: ['rule_both'] });
    const blank = createNode('minecraft:dropdown', 'unbound'); doc.screens[0].nodes.push(blank, createNode('minecraft:edit-box', 'builtin'), createNode('minecraft:numeric-input', 'intent_only'));
    const newNodes = buildBehaviorIndex(doc)[0].nodes; expect(newNodes.find(node => node.nodeId === 'unbound')).toMatchObject({ label: '事件未绑定', builtInInteraction: true });
    expect(newNodes.find(node => node.nodeId === 'builtin')).toMatchObject({ label: '内置交互', sourceRuleIds: [] }); expect(newNodes.find(node => node.nodeId === 'intent_only')).toMatchObject({ label: '内置交互 · 意图未绑定', declaredIntents: ['numeric-commit'] });
    expect(screens[1].nodes.find(node => node.nodeId === 'button_other')?.sourceRuleIds).toEqual(['rule_other']); expect(before.screens[0].nodes).toHaveLength(first.nodes.length);
  });
  it('reports initial unavailable sources as design facts without claiming runtime outcome', () => {
    const doc = fixture(), slider = doc.screens[0].nodes.find(node => node.id === 'slider_source')!; slider.state.visible = false; if ('enabled' in slider.state) slider.state.enabled = false;
    const details = buildBehaviorIndex(doc)[0].nodes.find(node => node.nodeId === slider.id)!.details; expect(details).toContain('设计初态隐藏'); expect(details).toContain('设计初态禁用'); expect(details).toContain('运行时');
    const report = buildBehaviorDiagnostics(doc, { exportId: 'sample', documentSha256: 'snapshot' }); expect(JSON.stringify(report)).not.toContain('设计初态隐藏'); expect(report.runtimeUncertainty).toContain('no runtime');
  });
  it('retains old action/actions, navigation declarations, branch locations and shared definition references', () => {
    const original = fixture(), copy = structuredClone(original), rules = buildBehaviorIndex(original)[0].rules;
    expect(rules.find(rule => rule.ruleId === 'rule_legacy')?.actions).toMatchObject([{ path: 'action', type: 'set-text', targetId: 'legacy_label' }]);
    const typed = rules.find(rule => rule.ruleId === 'rule_generic_option')!;
    expect(typed.event).toMatchObject({ payloadType: 'OptionId', sourceIds: ['node_22', 'node_23'] });
    expect(typed.conditions).toMatchObject([{ path: 'actions[0].condition', actionType: 'if', valueType: 'OptionId' }]);
    expect(typed.actions).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'actions[0].thenActions[1]', mapRef: 'status_map_shared', valueMode: 'shared-map', targetId: 'node_26' }), expect.objectContaining({ path: 'actions[0].elseActions[0]' })]));
    expect(rules.find(rule => rule.ruleId === 'rule_generic_number')?.event).toMatchObject({ payloadType: 'Number' }); expect(rules.find(rule => rule.ruleId === 'rule_generic_number')?.actions).toEqual(expect.arrayContaining([expect.objectContaining({ mapping: 'normalize' }), expect.objectContaining({ mapping: 'direct' })]));
    expect(rules.find(rule => rule.ruleId === 'rule_nav')?.actions[0]).toMatchObject({ targetDeclarationId: 'screen_decl', boundScreenId: null });
    expect(original).toEqual(copy);
  });
  it('uses Schema errors to distinguish missing references and wrong target types', () => {
    const absent = fixture(), r1 = absent.screens[0].behaviors[0]; if ('action' in r1 && r1.action.type === 'set-text') r1.action.targetId = 'missing_node';
    expect(buildBehaviorIndex(absent)[0].rules[0].staticValidation.issues[0]).toMatchObject({ kind: 'invalid-reference', severity: 'error' });
    const wrong = fixture(), r2 = wrong.screens[0].behaviors[0]; if ('action' in r2 && r2.action.type === 'set-text') r2.action.targetId = 'node_22';
    expect(buildBehaviorIndex(wrong)[0].rules[0].staticValidation.issues[0]).toMatchObject({ kind: 'type-incompatible', severity: 'error' });
    expect(classifyValidationIssue('Invalid input', 'invalid_union').kind).toBe('type-incompatible'); expect(() => beginExport(absent)).toThrow(); expect(() => buildBehaviorDiagnostics(absent, { exportId: 'x', documentSha256: 'x' })).toThrow('拒绝');
  });
  it.each([
    ['事件未执行：来源隐藏、未启用', 'source-unavailable', 'warning'], ['条件为假且 else 为空，正常跳过', 'expected-skip', 'info'],
    ['事件已触发；没有匹配规则', 'no-matching-rule', 'info'], ['optionId a 未映射到目标', 'unmapped-option', 'info'],
    ['事件载荷无效', 'invalid-payload', 'warning'], ['目标 node_missing 不存在', 'target-unavailable', 'warning'],
    ['条件类型不兼容', 'type-incompatible', 'warning'], ['set-status 已执行', 'action-success', 'success'],
    ['未选分支跳过 1 个动作', 'expected-skip', 'info'], ['数值未变化，无更新', 'unchanged', 'info'],
  ] as const)('classifies %s without treating expected control flow as an error', (message, kind, severity) => {
    expect(classifyBehaviorOutcome(message)).toEqual({ message, kind, severity });
  });
  it('classifies actual unmapped, invalid payload and unavailable target outcomes without changing state', () => {
    const doc = fixture(), screen = doc.screens[0];
    screen.behaviors = screen.behaviors.filter(rule => rule.id !== 'rule_generic_option');
    screen.behaviors.push({ id: 'rule_unmapped', event: { type: 'selection-change', sourceId: 'node_23' }, action: { type: 'set-status', targetId: 'node_26', mapRef: 'status_map_shared' } });
    const event = { type: 'selection-change' as const, screenId: screen.id, nodeId: 'node_23', optionId: 'option_3', phase: 'confirm' as const, source: 'pointer' as const };
    const previous = { node_26: { statusId: 'status_stopped' } }, unmapped = reduceTypedBehaviorEvent(screen, previous, event);
    expect(unmapped.next).toEqual(previous); expect(unmapped.outcomes.map(classifyBehaviorOutcome)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'unmapped-option', severity: 'info' })]));
    const invalid = reduceTypedBehaviorEvent(screen, previous, { ...event, optionId: 'missing' }); expect(invalid.next).toEqual(previous); expect(classifyBehaviorOutcome(invalid.outcomes[0]).kind).toBe('invalid-payload');
    const missing = structuredClone(screen); missing.nodes = missing.nodes.filter(node => node.id !== 'node_26'); const result = reduceTypedBehaviorEvent(missing, previous, event);
    expect(result.next).toEqual(previous); expect(result.outcomes.map(classifyBehaviorOutcome)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'target-unavailable' })]));
    const wrong = structuredClone(screen), wrongRule = wrong.behaviors.find(rule => rule.id === 'rule_unmapped')!; if ('action' in wrongRule && wrongRule.action.type === 'set-status') wrongRule.action.targetId = 'node_22';
    expect(reduceTypedBehaviorEvent(wrong, previous, event).outcomes.map(classifyBehaviorOutcome)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'type-incompatible' })]));
    expect(classifyBehaviorOutcome(reduceTypedBehaviorEvent(screen, previous, { ...event, optionId: 'option_4' }).outcomes[0])).toMatchObject({ kind: 'expected-skip', severity: 'info' });
  });
  it('adds hashed diagnostics from the same multi-Screen snapshot alongside a real nonempty Panel resource', async () => {
    const doc = fixture(); doc.screens[0].background = { kind: 'panel', style: 'supplied-panel-16' };
    const png = new Uint8Array(readFileSync('src/gui/panel_16x.png')), resourceHash = await sha256(png);
    const visual = { generation: 12, base: 'sample-client.jar', overlay: 'sample-pack.zip', state: 'initial' as const, sprites: { 'minecraft:widget/button': { status: 'valid', sha256: resourceHash, imageLayer: 'overlay' } }, screens: doc.screens.map(screen => ({ screenId: screen.id, spriteIds: ['minecraft:widget/button'], diagnostics: [] as string[] })), diagnostics: [] as string[] };
    const authorityBefore = structuredClone(doc);
    const snapshot = beginExport(doc, { exportId: '00000000-0000-4000-8000-000000000016', createdAt: '2026-11-04T00:00:00.000Z' });
    let renders = 0; const bundle = await buildBundle(snapshot, async () => { if (++renders === 1) doc.screens[0].behaviors[1].id = 'changed_after_capture'; return png; }, async () => png, visual, { generation: 1, name: 'test-font' });
    const diagnosticFile = bundle.files.find(file => file.name.endsWith('.behavior-diagnostics.json'))!, diagnostic = JSON.parse(new TextDecoder().decode(diagnosticFile.bytes));
    expect(diagnostic).toMatchObject({ authoritative: false, reference: { exportId: '00000000-0000-4000-8000-000000000016', documentSha256: bundle.reference.documentSha256 }, screens: [{ screenId: 'screen_main' }, { screenId: 'screen_other' }] });
    expect(diagnostic.screens[0].rules.find((rule: { ruleId: string }) => rule.ruleId === 'rule_generic_option').actions).toEqual(expect.arrayContaining([expect.objectContaining({ mapRef: 'status_map_shared', path: 'actions[0].thenActions[1]' })]));
    const listed = bundle.manifest.files.find(file => file.name === diagnosticFile.name)!; expect(listed.bytes).toBe(diagnosticFile.bytes.length); expect(listed.sha256).toBe(await sha256(diagnosticFile.bytes)); expect(bundle.manifest.behaviorDiagnostics.sha256).toBe(listed.sha256);
    const panel = bundle.manifest.screens[0].panelTexture!; expect(panel.bytes).toBe(png.length); expect(panel.sha256).toBe(resourceHash); expect(bundle.manifest.visualResources?.sprites['minecraft:widget/button']).toMatchObject({ sha256: resourceHash, status: 'valid' });
    const spec = JSON.parse(new TextDecoder().decode(bundle.files.find(file => file.name.endsWith('.implementation.json'))!.bytes)); expect(spec.behaviorDiagnostics).toMatchObject({ file: diagnosticFile.name, authoritative: false, bytes: listed.bytes, sha256: listed.sha256 });
    const archive = new Uint8Array(await (await buildZip(bundle.files)).arrayBuffer()); const view = new DataView(archive.buffer); const names: string[] = []; let pos = 0;
    while (view.getUint32(pos, true) === 0x04034b50) { const size = view.getUint32(pos + 18, true), nameLength = view.getUint16(pos + 26, true), extraLength = view.getUint16(pos + 28, true); const start = pos + 30 + nameLength + extraLength; names.push(new TextDecoder().decode(archive.slice(pos + 30, pos + 30 + nameLength))); pos = start + size; }
    expect(names).toContain(diagnosticFile.name); expect(names).toContain(panel.name); expect(names).toContain(bundle.manifest.authority.file); expect(JSON.parse(snapshot.projectJson)).toEqual(authorityBefore); expect(doc).not.toEqual(authorityBefore); expect(diagnostic.screens[0].rules.some((rule: { ruleId: string }) => rule.ruleId === 'changed_after_capture')).toBe(false);
  });
});
