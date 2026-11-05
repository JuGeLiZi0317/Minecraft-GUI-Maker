import { expect, test } from '@playwright/test';
import { genericBehaviorProject } from './fixtures/genericBehaviorProject';
import type { Behavior, BehaviorCondition } from '../src/domain/schema';

const option = (id:string): BehaviorCondition => ({type:'compare',valueType:'OptionId',operator:'equals',left:{type:'read-control-value',nodeId:'node_22'},right:{type:'constant',value:id}});
const number = (op:'less-or-equal'|'greater-or-equal'): BehaviorCondition => ({type:'compare',valueType:'Number',operator:op,left:{type:'read-control-value',nodeId:'slider_source'},right:{type:'constant',value:50}});
const condition:BehaviorCondition={type:'or',conditions:[{type:'and',conditions:[number('less-or-equal'),option('option_1')]},{type:'and',conditions:[number('greater-or-equal'),option('option_2')]}]};
function project(multi:boolean) {
 const doc=genericBehaviorProject(false); doc.schemaVersion=multi?'0.38.0':'0.37.0';
 const slider=doc.screens[0].nodes.find(n=>n.id==='slider_source'); if(slider?.type!=='minecraft:slider') throw Error(); slider.props.max=100; slider.props.initialValue=49;
 const radio=doc.screens[0].nodes.find(n=>n.id==='node_22'); if(radio?.type!=='minecraft:radio-group') throw Error(); radio.props.initialSelectedOptionId='option_1';
 const rule:Behavior={id:'rule_multi',event:{type:'selection-change',sourceId:'node_22'},...(multi?{eventBindings:[{type:'selection-change' as const,sourceId:'node_22',payloadType:'OptionId' as const},{type:'slider-change' as const,sourceId:'slider_source',payloadType:'Number' as const}]}:{}),actions:[{type:'if',condition,thenActions:[{type:'set-status',targetId:'node_26',statusId:'status_running'}],elseActions:[{type:'set-status',targetId:'node_26',statusId:'status_warning'}]}]};
 doc.screens[0].behaviors=[rule]; return doc;
}
async function load(page:import('@playwright/test').Page, multi:boolean) {
 await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({name:'b110.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project(multi)))}); await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
}
test('单事件和多事件以当前控件快照计算，只有声明的事件会触发', async ({page}) => {
 await load(page,false); await page.getByRole('button',{name:'行为',exact:true}).click(); await page.getByRole('button',{name:'交互预览',exact:true}).click();
 const preview=page.getByTestId('behavior-panel').getByTestId('behavior-preview'), slider=page.getByRole('slider',{name:'滑块 slider_source'});
 await slider.focus(); await slider.press('ArrowRight'); await expect(slider).toHaveAttribute('aria-valuenow','50'); await expect(preview).not.toContainText('status_running');
 await page.getByRole('radio',{name:'其他 (2/4)',exact:true}).click(); await expect(preview).toContainText('status_running');
 await slider.focus(); await slider.press('ArrowLeft'); await expect(preview).toContainText('status_running');
 await load(page,true); await page.getByRole('button',{name:'行为',exact:true}).click(); await page.getByRole('button',{name:'交互预览',exact:true}).click();
 const preview2=page.getByTestId('behavior-panel').getByTestId('behavior-preview'), slider2=page.getByRole('slider',{name:'滑块 slider_source'});
 await page.getByRole('radio',{name:'其他 (2/4)',exact:true}).click(); await expect(preview2).toContainText('status_warning');
 await slider2.focus(); await slider2.press('ArrowRight'); await expect(preview2).toContainText('status_running'); await expect(slider2).toHaveAttribute('aria-valuenow','50');
 await slider2.press('ArrowLeft'); await expect(preview2).toContainText('status_warning');
});
test('Blockly 多事件显式配置保留草稿，保存后恢复并与权威 JSON 一致', async ({page}) => {
 await load(page,false); await page.getByRole('button',{name:'Blockly 实验',exact:true}).click(); const editor=page.getByTestId('blockly-editor'); await editor.getByLabel('Blockly 规则').selectOption('rule_multi');
 await expect(editor).toContainText('读取某个控件不代表该控件变化会触发规则'); await editor.getByLabel('多事件触发').check(); await editor.getByLabel('触发 slider_source').check();
 await expect(editor.getByTestId('blockly-diagnostic')).toContainText('未保存草稿'); await expect(editor).toContainText('slider_source / slider-change / Number');
 const before=JSON.parse((await page.getByTestId('project-json').textContent())!); expect(before.screens[0].behaviors[0].eventBindings).toBeUndefined();
 await page.getByRole('button',{name:'一键导出 ZIP',exact:true}).click(); await expect(page.locator('.statusbar [role="alert"]')).toContainText('Blockly');
 await editor.getByRole('button',{name:'保存积木规则'}).click(); await expect(page.getByTestId('save-status')).toContainText('本地已保存');
 const after=JSON.parse((await page.getByTestId('project-json').textContent())!); expect(after.schemaVersion).toBe('0.38.0'); expect(after.screens[0].behaviors[0].eventBindings).toEqual([{type:'selection-change',sourceId:'node_22',payloadType:'OptionId'},{type:'slider-change',sourceId:'slider_source',payloadType:'Number'}]);
 await page.reload({ waitUntil:'domcontentloaded', timeout:8000 }); await page.getByRole('button',{name:'Blockly 实验',exact:true}).click(); await expect(editor.getByLabel('Blockly 规则')).toHaveValue('rule_multi'); await expect(editor.getByLabel('触发 slider_source')).toBeChecked(); expect(JSON.parse((await page.getByTestId('project-json').textContent())!)).toEqual(after);
});
