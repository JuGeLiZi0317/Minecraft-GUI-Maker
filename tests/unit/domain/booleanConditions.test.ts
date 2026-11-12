import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { behaviorConditionSchema, actionsOf, parseProject, type BehaviorCondition } from '../../../src/domain/schema';
import { evaluateBehaviorCondition, reduceTypedBehaviorEvent } from '../../../src/domain/genericBehavior';
import { behaviorToWorkspace, workspaceToBehavior } from '../../../src/behavior/blocklyModel';
import { registerBehaviorBlocks, setBlockContext } from '../../../src/behavior/blocks';
import { createEditorStore } from '../../../src/editor/store';
import { genericBehaviorProject, genericRule } from '../../fixtures/genericBehaviorProject';
import { buildBehaviorIndex } from '../../../src/domain/behaviorDiagnostics';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';
registerBehaviorBlocks();
const cmp = (n: number): BehaviorCondition => ({ type:'compare', valueType:'Number', operator:'greater-than', left:{ type:'event-value',field:'value' }, right:{type:'constant',value:n} });
const ev = (value: number) => ({type:'slider-change' as const,screenId:'screen_main',nodeId:'slider_source',phase:'change' as const,value});
const ruleWith = (condition: BehaviorCondition) => { const rule=genericRule('Number'); const a=actionsOf(rule)[0]; if(a.type!=='if') throw Error(); a.condition=condition; return rule; };
describe('B1.8 boolean trees', () => {
 it('evaluates AND OR NOT left-to-right and propagates invalid without taking else', () => {
  const trace:string[]=[];
  expect(evaluateBehaviorCondition({type:'and',conditions:[cmp(3),cmp(4)]},ev(5))).toMatchObject({value:true});
  expect(evaluateBehaviorCondition({type:'or',conditions:[cmp(6),cmp(7)]},ev(5))).toMatchObject({value:false});
  expect(evaluateBehaviorCondition({type:'not',condition:cmp(6)},ev(5))).toMatchObject({value:true});
  const invalid = {type:'event-option',operator:'equals',optionId:'bad'} as const;
  expect(evaluateBehaviorCondition({type:'not',condition:invalid},ev(5))).toHaveProperty('error');
  expect(evaluateBehaviorCondition({type:'or',conditions:[cmp(3),invalid]},ev(5),trace)).toMatchObject({value:true});
  expect(trace.join(' ')).toContain('未求值'); expect(trace.join(' ')).not.toContain('invalid');
  const trace2:string[]=[];expect(evaluateBehaviorCondition({type:'and',conditions:[cmp(7),invalid]},ev(5),trace2)).toMatchObject({value:false});expect(trace2.join(' ')).toContain('未求值');
  const screen=genericBehaviorProject().screens[0]; screen.behaviors[2]=ruleWith({type:'not',condition:invalid}); expect(reduceTypedBehaviorEvent(screen,null,ev(5)).next).toEqual({});
  expect(reduceTypedBehaviorEvent(screen,null,ev(NaN)).outcomes.join(' ')).toContain('载荷无效');
 });
 it('enforces depth and node count and validates all references even after short circuit', () => {
  let c:BehaviorCondition=cmp(0); for(let i=0;i<4;i++) c={type:'not',condition:c}; expect(behaviorConditionSchema.safeParse(c).success).toBe(true);
  expect(behaviorConditionSchema.safeParse({type:'not',condition:c}).success).toBe(false);
  expect(behaviorConditionSchema.safeParse({type:'and',conditions:Array.from({length:31},()=>cmp(0))}).success).toBe(true);
  expect(behaviorConditionSchema.safeParse({type:'and',conditions:Array.from({length:32},()=>cmp(0))}).success).toBe(false);
  const doc=genericBehaviorProject(); doc.schemaVersion='0.36.0'; const rule=doc.screens[0].behaviors[1], action=actionsOf(rule)[0]; if(action.type!=='if') throw Error();
  action.condition={type:'or',conditions:[{type:'event-option',operator:'equals',optionId:'option_1'},{type:'event-option',operator:'equals',optionId:'missing'}]};
  expect(()=>parseProject(JSON.stringify(doc))).toThrow('每个来源');
 });
 it.each(['OptionId','Number'] as const)('round trips Blockly %s and keeps semantic version transaction', kind => {
  const doc=genericBehaviorProject(), rule=genericRule(kind), a=actionsOf(rule)[0]; if(a.type!=='if') throw Error();
  a.condition={type:'and',conditions:[a.condition,{type:'not',condition:structuredClone(a.condition)}]};
  const store=createEditorStore(doc), before=structuredClone(store.getState().doc);store.getState().saveBehavior(rule);expect(store.getState().doc.schemaVersion).toBe('0.36.0');
  store.getState().undo();expect(store.getState().doc).toEqual(before);store.getState().redo(); expect(parseProject(JSON.stringify(store.getState().doc))).toEqual(store.getState().doc);
  const ws=new Blockly.Workspace();setBlockContext(ws,doc.screens[0]); try {Blockly.serialization.workspaces.load(behaviorToWorkspace(rule),ws);expect(workspaceToBehavior(Blockly.serialization.workspaces.save(ws),rule.id,rule)).toEqual(rule);expect(ws.getAllBlocks(false).some(b=>b.type==='gui_and')).toBe(true);} finally {ws.dispose()}
 });
 it('round trips an imported three-child Boolean block without flattening', () => {
  const rule=ruleWith({type:'and',conditions:[cmp(1),cmp(2),cmp(3)]}),ws=new Blockly.Workspace();setBlockContext(ws,genericBehaviorProject().screens[0]);
  try { Blockly.serialization.workspaces.load(behaviorToWorkspace(rule),ws);const block=ws.getAllBlocks(false).find(b=>b.type==='gui_and')!;expect(block.getInput('C2')).toBeTruthy();expect(workspaceToBehavior(Blockly.serialization.workspaces.save(ws),rule.id,rule)).toEqual(rule); } finally {ws.dispose()}
 });
 it('does not add a 100-action event limit to legacy projects', () => {
  const doc=genericBehaviorProject(); const r=genericRule('Number');
  doc.screens[0].behaviors=Array.from({length:3},(_,i)=>({id:`legacy_${i}`,event:r.event,actions:Array.from({length:50},()=>({type:'set-progress-value' as const,targetId:'progress_target',mapping:'direct' as const}))}));
  expect(parseProject(JSON.stringify(doc))).toEqual(doc);
  expect(reduceTypedBehaviorEvent(doc.screens[0],null,ev(6)).matchedRuleIds).toHaveLength(3);
 });
 it('keeps recursive diagnostics and structured export', async () => {
  const doc=genericBehaviorProject(), rule=ruleWith({type:'or',conditions:[cmp(5),{type:'not',condition:cmp(2)}]});doc.schemaVersion='0.36.0';doc.screens[0].behaviors[2]=rule;
  expect(buildBehaviorIndex(doc)[0].rules.find(r=>r.ruleId===rule.id)!.conditions.map(c=>c.type)).toEqual(['or','compare','not','compare']);
  const store=createEditorStore(doc);store.getState().addScreen();const snapshot=beginExport(store.getState().doc), spec=buildSpecification(snapshot,await referenceFor(snapshot),'authority.json');const action = actionsOf(rule)[0]; if(action.type !== 'if') throw Error(); const projection = spec.designIntent.conditionalBehaviors.find(c=>c.ruleId===rule.id); expect(projection?.type === 'if' ? projection.condition : undefined).toEqual(action.condition);
  const bundle=await buildBundle(snapshot,async()=>new Uint8Array([137,80,78,71]));expect(bundle.manifest.genericBehaviorContract.boolean.maxNodes).toBe(32);expect(bundle.manifest.screens).toHaveLength(2);const file=bundle.files.find(f=>f.name.endsWith('.behavior-diagnostics.json'))!;const diagnostics=JSON.parse(new TextDecoder().decode(file.bytes));expect(JSON.stringify(diagnostics)).toContain('conditions[1].condition');
 });
});
