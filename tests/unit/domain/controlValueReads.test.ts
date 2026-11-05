import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { actionsOf, parseProject, type Behavior, type BehaviorCondition } from '../../../src/domain/schema';
import { initialControlState, reduceTypedBehaviorEvent } from '../../../src/domain/genericBehavior';
import { behaviorToWorkspace, workspaceToBehavior } from '../../../src/behavior/blocklyModel';
import { registerBehaviorBlocks, setBlockContext } from '../../../src/behavior/blocks';
import { buildBehaviorIndex } from '../../../src/domain/behaviorDiagnostics';
import { genericBehaviorProject } from '../../fixtures/genericBehaviorProject';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';
import { planDeletion } from '../../../src/domain/deletion';
import { createEditorStore } from '../../../src/editor/store';
registerBehaviorBlocks();
const option=(id:string):BehaviorCondition=>({type:'compare',valueType:'OptionId',operator:'equals',left:{type:'read-control-value',nodeId:'node_22'},right:{type:'constant',value:id}});
const number=(operator:'less-or-equal'|'greater-or-equal'):BehaviorCondition=>({type:'compare',valueType:'Number',operator,left:{type:'read-control-value',nodeId:'slider_source'},right:{type:'constant',value:5}});
const tree:BehaviorCondition={type:'or',conditions:[{type:'and',conditions:[option('option_1'),number('less-or-equal')]},{type:'and',conditions:[option('option_2'),number('greater-or-equal')]}]};
const rule=(type:'slider-change'|'selection-change'):Behavior=>({id:type==='slider-change'?'rule_slider_read':'rule_select_read',event:{type,sourceId:type==='slider-change'?'slider_source':'node_22'},actions:[{type:'if',condition:tree,thenActions:[{type:'set-status',targetId:'node_26',statusId:'status_running'}],elseActions:[{type:'set-status',targetId:'node_26',statusId:'status_warning'}]}]});
const make=()=>{const d=genericBehaviorProject(false);d.schemaVersion='0.37.0';const radio=d.screens[0].nodes.find(n=>n.id==='node_22');if(radio && (radio.type==='minecraft:radio-group' || radio.type==='minecraft:dropdown')) radio.props.initialSelectedOptionId='option_1';d.screens[0].behaviors.push(rule('slider-change'),rule('selection-change'));return d};
const slider=(value:number)=>({type:'slider-change' as const,screenId:'screen_main',nodeId:'slider_source',phase:'change' as const,value});
const selection=(optionId:string)=>({type:'selection-change' as const,screenId:'screen_main',nodeId:'node_22',phase:'confirm' as const,source:'pointer' as const,optionId});
describe('B1.9 current control values',()=>{
 it('initializes, updates event source before reading, and uses the latest state across both event domains',()=>{
  const screen=make().screens[0], initial=initialControlState(screen);expect(initial.slider_source.sliderValue).toBe(0);expect(initial.node_22.optionId).toBe('option_1');
  let state=reduceTypedBehaviorEvent(screen,initial,slider(4)).next;expect(state.node_26.statusId).toBe('status_running');
  state=reduceTypedBehaviorEvent(screen,state,selection('option_2')).next;expect(state.node_26.statusId).toBe('status_warning');
  state=reduceTypedBehaviorEvent(screen,state,slider(5)).next;expect(state.node_26.statusId).toBe('status_running');
  state=reduceTypedBehaviorEvent(screen,state,slider(6)).next;expect(state.node_26.statusId).toBe('status_running');
  state=reduceTypedBehaviorEvent(screen,state,selection('option_1')).next;expect(state.node_26.statusId).toBe('status_warning');expect(initial.node_22.optionId).toBe('option_1');
 });
 it('supports Dropdown reads and updates an unbound source without cascading events',()=>{
  const screen=make().screens[0];screen.behaviors=screen.behaviors.map(r=>r.id.startsWith('rule_') && r.event.type!=='button-click' ? JSON.parse(JSON.stringify(r).replaceAll('node_22','node_23')) : r);
  const dropdown=screen.nodes.find(n=>n.id==='node_23');if(!dropdown||dropdown.type!=='minecraft:dropdown')throw Error();dropdown.props.initialSelectedOptionId='option_1';
  let state=initialControlState(screen);state=reduceTypedBehaviorEvent(screen,state,{...selection('option_2'),nodeId:'node_23'}).next;expect(state.node_26.statusId).toBe('status_warning');state=reduceTypedBehaviorEvent(screen,state,slider(5)).next;expect(state.node_26.statusId).toBe('status_running');
  screen.behaviors=screen.behaviors.filter(r=>r.id!=='rule_select_read');const result=reduceTypedBehaviorEvent(screen,state,{...selection('option_1'),nodeId:'node_23'});expect(result.matchedRuleIds).toEqual([]);expect(result.next.node_23.optionId).toBe('option_1');expect(result.next.node_26.statusId).toBe('status_running');
 });
 it('allows reading hidden and disabled controls but fails missing values without taking else',()=>{
  const screen=make().screens[0], initial=initialControlState(screen);const radio=screen.nodes.find(n=>n.id==='node_22')!;radio.state.visible=false;if('enabled' in radio.state)radio.state.enabled=false;
  expect(reduceTypedBehaviorEvent(screen,initial,slider(4)).next.node_26.statusId).toBe('status_running');
  delete initial.node_22;const invalid=reduceTypedBehaviorEvent(screen,initial,slider(4));expect(invalid.next.node_26).toBeUndefined();expect(invalid.outcomes.join(' ')).toContain('两分支均跳过');
 });
 it('does not perform an invalid read in a short-circuited branch',()=>{
  const screen=make().screens[0], r=screen.behaviors.find(x=>x.id==='rule_select_read')!,a=actionsOf(r)[0];if(a.type!=='if')throw Error();a.condition={type:'or',conditions:[option('option_1'),number('less-or-equal')]};
  const initial=initialControlState(screen);delete initial.slider_source;const result=reduceTypedBehaviorEvent(screen,initial,selection('option_1'));expect(result.next.node_26.statusId).toBe('status_running');expect(result.outcomes.join(' ')).toContain('未求值');expect(result.outcomes.join(' ')).not.toContain('读取控件 slider_source 失败');
 });
 it('rejects invalid and cross-Screen reads and retains explicit upgrade/undo',()=>{
  const doc=make();expect(parseProject(JSON.stringify(doc))).toEqual(doc);const bad=structuredClone(doc),a=actionsOf(bad.screens[0].behaviors.at(-1)!)[0]; if(a.type!=='if'||a.condition.type!=='or')throw Error();const first=a.condition.conditions[0];if(first.type!=='and'||first.conditions[0].type!=='compare'||first.conditions[0].left.type!=='read-control-value')throw Error();first.conditions[0].left.nodeId='progress_target';expect(()=>parseProject(JSON.stringify(bad))).toThrow('兼容控件');
  const old=genericBehaviorProject(false),store=createEditorStore(old);const before=structuredClone(store.getState().doc);store.getState().saveBehavior(rule('slider-change'));expect(store.getState().doc.schemaVersion).toBe('0.37.0');store.getState().undo();expect(store.getState().doc).toEqual(before);
 });
 it('deletion atomically removes rules that read the removed control',()=>{
  const doc=make(), plan=planDeletion(doc,{kind:'node',screenId:doc.screens[0].id,nodeId:'slider_source'});expect(plan.rules.map(r=>r.ruleId)).toEqual(['rule_slider_read','rule_select_read']);expect(()=>parseProject(JSON.stringify(plan.document))).not.toThrow();expect(doc.screens[0].behaviors).toHaveLength(3);
 });
 it('exports reads separately from triggers in a multi-Screen snapshot',async()=>{
  const doc=make();doc.screens[0].behaviors=doc.screens[0].behaviors.filter(r=>r.id!=='rule_select_read');const store=createEditorStore(doc);store.getState().addScreen();const snapshot=beginExport(store.getState().doc),spec=buildSpecification(snapshot,await referenceFor(snapshot),'project.json');
  expect(spec.designIntent.genericBehaviorContract.controlReads.scope).toContain('updated first');expect(spec.designIntent.statusIndicators!.find(n=>n.nodeId==='node_26')!.updateIntent.binding).toContain('slider-change');
  const bundle=await buildBundle(snapshot,async()=>new Uint8Array([137,80,78,71]));expect(bundle.manifest.screens).toHaveLength(2);expect(bundle.manifest.screens[0].statusIndicators.find(n=>n.nodeId==='node_26')!.binding).toContain('updated');
  const file=bundle.files.find(f=>f.name.endsWith('.behavior-diagnostics.json'))!;const report=JSON.parse(new TextDecoder().decode(file.bytes));const item=report.screens[0].rules.find((r:{ruleId:string})=>r.ruleId==='rule_slider_read');expect(item.event.sourceIds).toEqual(['slider_source']);expect(item.reads).toEqual(expect.arrayContaining([expect.objectContaining({nodeId:'node_22',valueType:'OptionId'}),expect.objectContaining({nodeId:'slider_source',valueType:'Number'})]));
 });
 it.each(['slider-change','selection-change'] as const)('round trips real Blockly and reports read dependencies for %s',type=>{
  const doc=make(),r=rule(type),ws=new Blockly.Workspace();setBlockContext(ws,doc.screens[0]);try{Blockly.serialization.workspaces.load(behaviorToWorkspace(r),ws);expect(workspaceToBehavior(Blockly.serialization.workspaces.save(ws),r.id,r)).toEqual(r)}finally{ws.dispose()}
  expect(buildBehaviorIndex(doc)[0].rules.find(x=>x.ruleId===r.id)!.reads.map(x=>x.nodeId)).toEqual(['node_22','slider_source','node_22','slider_source']);
 });
});
