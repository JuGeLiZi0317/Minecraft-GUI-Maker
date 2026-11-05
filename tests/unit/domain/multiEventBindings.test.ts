import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { actionsOf, matchesBehaviorEvent, parseProject, type Behavior, type BehaviorCondition } from '../../../src/domain/schema';
import { initialControlState, reduceTypedBehaviorEvent } from '../../../src/domain/genericBehavior';
import { buildBehaviorIndex } from '../../../src/domain/behaviorDiagnostics';
import { behaviorToWorkspace, workspaceToBehavior } from '../../../src/behavior/blocklyModel';
import { registerBehaviorBlocks, setBlockContext } from '../../../src/behavior/blocks';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';
import { buildZip } from '../../../src/exports/zip';
import { buildSpecification } from '../../../src/exports/specification';
import { genericBehaviorProject } from '../../fixtures/genericBehaviorProject';
import { createNode } from '../../../src/domain/model';

registerBehaviorBlocks();
const option = (id: string): BehaviorCondition => ({ type:'compare', valueType:'OptionId', operator:'equals', left:{type:'read-control-value',nodeId:'node_22'}, right:{type:'constant',value:id} });
const number = (op:'less-or-equal'|'greater-or-equal'): BehaviorCondition => ({ type:'compare', valueType:'Number', operator:op, left:{type:'read-control-value',nodeId:'slider_source'}, right:{type:'constant',value:5} });
const condition: BehaviorCondition = {type:'or',conditions:[{type:'and',conditions:[number('less-or-equal'),option('option_1')]},{type:'and',conditions:[number('greater-or-equal'),option('option_2')]}]};
const rule = (multi: boolean): Behavior => ({ id:'rule_multi', event:{type:'selection-change',sourceId:'node_22'}, ...(multi ? {eventBindings:[{type:'selection-change' as const,sourceId:'node_22',payloadType:'OptionId' as const},{type:'slider-change' as const,sourceId:'slider_source',payloadType:'Number' as const}]} : {}), actions:[{type:'if',condition,thenActions:[{type:'set-status',targetId:'node_26',statusId:'status_running'}],elseActions:[{type:'set-status',targetId:'node_26',statusId:'status_warning'}]}] });
const doc = (multi: boolean) => { const result=genericBehaviorProject(false); result.schemaVersion=multi?'0.38.0':'0.37.0'; result.screens[0].behaviors=[rule(multi)]; const n=result.screens[0].nodes.find(n=>n.id==='node_22'); if(n?.type==='minecraft:radio-group') n.props.initialSelectedOptionId='option_1'; return result; };
const slider = (value:number) => ({type:'slider-change' as const,screenId:'screen_main',nodeId:'slider_source',phase:'change' as const,value});
const select = (optionId:string) => ({type:'selection-change' as const,screenId:'screen_main',nodeId:'node_22',phase:'confirm' as const,source:'pointer' as const,optionId});

describe('B1.10 explicit event subscriptions', () => {
  it('distinguishes P selection-only and O dual-trigger semantics, committing source before snapshot', () => {
    const p=doc(false).screens[0], o=doc(true).screens[0];
    expect(initialControlState(o).node_26).toBeUndefined();
    const p1=reduceTypedBehaviorEvent(p,initialControlState(p),slider(6));
    expect(p1.matchedRuleIds).toEqual([]); expect(p1.next.slider_source.sliderValue).toBe(6); expect(p1.next.node_26).toBeUndefined();
    const p2=reduceTypedBehaviorEvent(p,p1.next,select('option_2')); expect(p2.next.node_26.statusId).toBe('status_running');
    const o1=reduceTypedBehaviorEvent(o,initialControlState(o),slider(6)); expect(o1.matchedRuleIds).toEqual(['rule_multi']); expect(o1.next.node_26.statusId).toBe('status_warning');
    const o2=reduceTypedBehaviorEvent(o,o1.next,select('option_2')); expect(o2.next.node_26.statusId).toBe('status_running');
    const o3=reduceTypedBehaviorEvent(o,o2.next,slider(4)); expect(o3.next.node_26.statusId).toBe('status_warning');
    expect(reduceTypedBehaviorEvent(o,o3.next,slider(5)).next.node_26.statusId).toBe('status_running');
  });
  it('rejects duplicate, cross-Screen, mismatched payload, bad primary and missing event values', () => {
    expect(parseProject(JSON.stringify(doc(true)))).toEqual(doc(true));
    for (const mutate of [
      (d:ReturnType<typeof doc>)=>d.screens[0].behaviors[0].eventBindings!.push(d.screens[0].behaviors[0].eventBindings![0]),
      (d:ReturnType<typeof doc>)=>{d.screens[0].behaviors[0].eventBindings![1].sourceId='missing_node'},
      (d:ReturnType<typeof doc>)=>{(d.screens[0].behaviors[0].eventBindings![1] as {payloadType:string}).payloadType='OptionId'},
      (d:ReturnType<typeof doc>)=>{d.screens[0].behaviors[0].eventBindings![0].sourceId='node_23'},
      (d:ReturnType<typeof doc>)=>{const a=actionsOf(d.screens[0].behaviors[0])[0];if(a.type==='if')a.condition={type:'compare',valueType:'Number',operator:'equals',left:{type:'event-value',field:'value'},right:{type:'constant',value:5}}},
      (d:ReturnType<typeof doc>)=>{const a=actionsOf(d.screens[0].behaviors[0])[0];if(a.type==='if')a.condition={type:'compare',valueType:'OptionId',operator:'equals',left:{type:'event-value',field:'optionId'},right:{type:'constant',value:'option_1'}}},
    ]) { const bad=doc(true); mutate(bad); expect(()=>parseProject(JSON.stringify(bad))).toThrow(); }
    const old=doc(true); old.schemaVersion='0.37.0'; expect(()=>parseProject(JSON.stringify(old))).toThrow('0.38.0');
    const cross=doc(true), other=structuredClone(cross.screens[0]); other.id='screen_other'; other.nodes=[createNode('minecraft:slider','foreign_slider')]; other.behaviors=[]; other.behaviorMaps=[]; other.screenTargets=[]; cross.screens.push(other); cross.screens[0].behaviors[0].eventBindings![1].sourceId='foreign_slider'; expect(()=>parseProject(JSON.stringify(cross))).toThrow('同 Screen');
    const invalid=initialControlState(doc(true).screens[0]); delete invalid.node_22;
    const result=reduceTypedBehaviorEvent(doc(true).screens[0],invalid,slider(4)); expect(result.next.node_26).toBeUndefined(); expect(result.outcomes.join(' ')).toContain('两分支均跳过');
  });
  it('executes matching rules in order while reading the committed source snapshot', () => {
    const d=doc(true), second=structuredClone(d.screens[0].behaviors[0]); second.id='rule_last';
    if('actions' in second) second.actions=[{type:'set-status',targetId:'node_26',statusId:'status_stopped'}];
    d.screens[0].behaviors.push(second); expect(parseProject(JSON.stringify(d))).toEqual(d);
    const result=reduceTypedBehaviorEvent(d.screens[0],initialControlState(d.screens[0]),slider(6));
    expect(result.matchedRuleIds).toEqual(['rule_multi','rule_last']); expect(result.next.node_26.statusId).toBe('status_stopped');
  });
  it('retains legacy same-type sources and Blockly graph round trip', () => {
    const old=doc(false), r=old.screens[0].behaviors[0]; if(r.event.type!=='selection-change')throw Error(); r.event.additionalSourceIds=['node_23']; old.schemaVersion='0.37.0';
    expect(parseProject(JSON.stringify(old))).toEqual(old); expect(matchesBehaviorEvent(r,'selection-change','node_23')).toBe(true); expect(matchesBehaviorEvent(r,'slider-change','node_23')).toBe(false);
    const d=doc(true), entry=d.screens[0].behaviors[0], ws=new Blockly.Workspace(); setBlockContext(ws,d.screens[0]);
    try { Blockly.serialization.workspaces.load(behaviorToWorkspace(entry),ws); expect(workspaceToBehavior(Blockly.serialization.workspaces.save(ws),entry.id,entry)).toEqual(entry); } finally { ws.dispose(); }
    const store=createEditorStore(doc(false)); store.getState().saveBehavior(rule(true)); expect(store.getState().doc.schemaVersion).toBe('0.38.0'); store.getState().undo(); expect(store.getState().doc).toEqual(doc(false));
  });
  it('accepts current-event values when every binding has the same payload and matches a rule once', () => {
    const d=doc(true), entry=d.screens[0].behaviors[0];
    entry.eventBindings=[{type:'selection-change',sourceId:'node_22',payloadType:'OptionId'},{type:'selection-change',sourceId:'node_23',payloadType:'OptionId'}];
    const action=actionsOf(entry)[0]; if(action.type!=='if')throw Error(); action.condition={type:'compare',valueType:'OptionId',operator:'equals',left:{type:'event-value',field:'optionId'},right:{type:'constant',value:'option_1'}};
    expect(parseProject(JSON.stringify(d))).toEqual(d);
    const e={...select('option_1'),nodeId:'node_23'}; const result=reduceTypedBehaviorEvent(d.screens[0],initialControlState(d.screens[0]),e);
    expect(result.matchedRuleIds).toEqual(['rule_multi']); expect(result.next.node_26.statusId).toBe('status_running');
    entry.eventBindings.push(entry.eventBindings[1]); expect(()=>parseProject(JSON.stringify(d))).toThrow('不能重复');
    expect(reduceTypedBehaviorEvent(d.screens[0],initialControlState(d.screens[0]),e).matchedRuleIds).toEqual(['rule_multi']);
  });
  it('exports separate bindings, reads and targets in diagnostics and agent specification', async () => {
    const d=doc(true), summary=buildBehaviorIndex(d)[0].rules[0]; expect(summary.eventBindings.map(b=>b.type)).toEqual(['selection-change','slider-change']); expect(summary.readDependencies.map(r=>r.nodeId)).toContain('slider_source'); expect(summary.actionTargets.map(a=>a.targetId)).toContain('node_26');
    const snapshot=beginExport(d), reference=await referenceFor(snapshot), spec=buildSpecification(snapshot,reference,'project.json');
    expect(spec.designIntent.behaviorRuleReferences[0].eventBindings).toEqual(summary.eventBindings);
    const bundle=await buildBundle(snapshot,async()=>new Uint8Array([137,80,78,71]));
    const report=JSON.parse(new TextDecoder().decode(bundle.files.find(f=>f.name.endsWith('.behavior-diagnostics.json'))!.bytes)); expect(report.screens[0].rules[0].eventBindings).toEqual(summary.eventBindings);
    const authority=JSON.parse(new TextDecoder().decode(bundle.files.find(f=>f.name===bundle.manifest.authority.file)!.bytes)); expect(authority.screens[0].behaviors[0].eventBindings).toEqual(rule(true).eventBindings);
    const bytes=Buffer.from(await (await buildZip(bundle.files)).arrayBuffer()), files=new Map<string,Buffer>();
    for(let at=0;at+30<=bytes.length && bytes.readUInt32LE(at)===0x04034b50;) { const len=bytes.readUInt16LE(at+26), extra=bytes.readUInt16LE(at+28), size=bytes.readUInt32LE(at+18), start=at+30+len+extra; files.set(bytes.subarray(at+30,at+30+len).toString(),bytes.subarray(start,start+size)); at=start+size; }
    expect(JSON.parse(files.get(bundle.manifest.authority.file)!.toString()).screens[0].behaviors[0].eventBindings).toEqual(rule(true).eventBindings);
    const zippedReport=JSON.parse(files.get(bundle.manifest.behaviorDiagnostics.name)!.toString()); expect(zippedReport.screens[0].rules[0].eventBindings).toEqual(summary.eventBindings);
  });
});
