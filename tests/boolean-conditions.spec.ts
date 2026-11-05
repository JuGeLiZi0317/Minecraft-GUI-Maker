import { expect, test } from '@playwright/test';
import { actionsOf } from '../src/domain/schema';
import { genericBehaviorProject } from './fixtures/genericBehaviorProject';

test('B1.8 boolean tree survives real Blockly save and layout recovery and drives preview', async ({ page }) => {
 const doc=genericBehaviorProject(); doc.schemaVersion='0.36.0';
 const action=actionsOf(doc.screens[0].behaviors[2])[0]; if(action.type!=='if') throw Error();
 const original=structuredClone(action.condition);
 action.condition={type:'and',conditions:[original,{type:'not',condition:{type:'compare',valueType:'Number',operator:'greater-than',left:{type:'event-value',field:'value'},right:{type:'constant',value:8}}}]};
 await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({name:'b18.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))}); await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
 await page.getByRole('button',{name:'Blockly 实验',exact:true}).click();const editor=page.getByTestId('blockly-editor'); await editor.getByLabel('Blockly 规则').selectOption('rule_generic_number');
 const info=await page.evaluate(async()=>{const path=performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('/blockly_core.js?'))!;const b=await import(path);const ws=b.common.getMainWorkspace();return {types:ws.getAllBlocks(false).map((block:any)=>block.type),id:ws.getTopBlocks(false)[0].id as string}});
 expect(info.types.filter((type:string)=>type==='gui_and')).toHaveLength(1);expect(info.types.filter((type:string)=>type==='gui_not')).toHaveLength(1);await expect(editor.getByTestId('blockly-diagnostic')).toContainText('连接与引用有效');
 const root=editor.locator(`[data-block-id="${info.id}"]`); await page.evaluate(async()=>{const path=performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('/blockly_core.js?'))!;const b=await import(path);b.common.getMainWorkspace().getTopBlocks(false)[0].moveBy(90,60)});
 const transform=await root.getAttribute('transform'); await expect(editor.getByRole('button',{name:'保存积木规则'})).toBeDisabled(); await page.waitForTimeout(400);await expect(page.getByTestId('save-status')).toContainText('本地已保存');
 await page.reload();await page.getByRole('button',{name:'Blockly 实验',exact:true}).click();await editor.getByLabel('Blockly 规则').selectOption('rule_generic_number');await expect(editor).toContainText('已恢复本机 Blockly 布局');await expect(root).toHaveAttribute('transform',transform!);
 const saved=JSON.parse((await page.getByTestId('project-json').textContent())!);expect(saved.screens[0].behaviors[2].actions[0].condition).toEqual(action.condition);
 await page.getByRole('button',{name:'GUI 设计模式'}).click();await page.getByRole('button',{name:'行为',exact:true}).click();await page.getByRole('button',{name:'交互预览',exact:true}).click();
 const slider=page.getByRole('slider',{name:'滑块 slider_source'});await slider.focus();for(let i=0;i<6;i++) await slider.press('ArrowRight');
 const panel=page.getByTestId('behavior-panel');await expect(panel.getByTestId('behavior-preview')).toContainText('"progressValue":60');await expect(panel.getByTestId('behavior-event-log')).toContainText('AND → true');
});

test('B1.8 authors and saves a boolean condition in the real Blockly workspace', async ({ page }) => {
 const doc=genericBehaviorProject();await page.goto('/');await page.getByLabel('导入项目文件').setInputFiles({name:'b15.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
 await page.getByRole('button',{name:'Blockly 实验',exact:true}).click();const editor=page.getByTestId('blockly-editor');await editor.getByLabel('Blockly 规则').selectOption('rule_generic_number');
 await page.evaluate(async()=>{const path=performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('/blockly_core.js?'))!;const b=await import(path);const ws=b.common.getMainWorkspace();const branch=ws.getAllBlocks(false).find((x:any)=>x.type==='gui_if');const cmp=branch.getInputTargetBlock('CONDITION');cmp.outputConnection.disconnect();const and=ws.newBlock('gui_and');and.initSvg();and.render();branch.getInput('CONDITION').connection.connect(and.outputConnection);and.getInput('C0').connection.connect(cmp.outputConnection);const not=ws.newBlock('gui_not');not.initSvg();not.render();and.getInput('C1').connection.connect(not.outputConnection);const cp=ws.newBlock('gui_compare');cp.initSvg();cp.render();not.getInput('CONDITION').connection.connect(cp.outputConnection);const val=ws.newBlock('gui_event_value');val.setFieldValue('value','FIELD');val.initSvg();val.render();cp.getInput('LEFT').connection.connect(val.outputConnection);const num=ws.newBlock('gui_constant');num.initSvg();num.render();num.setFieldValue(8,'VALUE');cp.getInput('RIGHT').connection.connect(num.outputConnection);cp.setFieldValue('greater-than','OPERATOR');});
 await expect(editor.getByRole('button',{name:'保存积木规则'})).toBeEnabled();await editor.getByRole('button',{name:'保存积木规则'}).click();await expect.poll(async()=>JSON.parse((await page.getByTestId('project-json').textContent())!).schemaVersion).toBe('0.36.0');
 const saved=JSON.parse((await page.getByTestId('project-json').textContent())!);expect(saved.screens[0].behaviors[2].actions[0].condition).toMatchObject({type:'and',conditions:[{type:'compare'},{type:'not',condition:{type:'compare'}}]});
 await expect(page.getByTestId('save-status')).toContainText('本地已保存');await page.reload();await page.getByRole('button',{name:'Blockly 实验',exact:true}).click();await editor.getByLabel('Blockly 规则').selectOption('rule_generic_number');await expect(editor).toContainText('已恢复本机 Blockly 布局');
});
