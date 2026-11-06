import {expect,test} from '@playwright/test';

async function open(page:import('@playwright/test').Page){await page.goto('/');await page.getByRole('button',{name:'Blockly 实验',exact:true}).click();await expect(page.getByTestId('blockly-diagnostic')).toContainText('与项目一致');return page.getByTestId('blockly-context-tools');}

test('Blockly heading and trigger controls share the app context bar, without GUI-only shortcuts or duplicate workspaces',async({page})=>{
 const tools=await open(page),bar=page.locator('.blockly-context-bar'),editor=page.getByTestId('blockly-editor'),before=await page.getByTestId('project-json').textContent();
 await expect(bar.getByTestId('blockly-context-tools')).toBeVisible();await expect(page.locator('header.blockly-editor-heading')).toHaveCount(0);
 await expect(editor.locator('.blockly-trigger-config')).toHaveCount(0);await expect(tools.locator('.blockly-trigger-config')).toBeVisible();
 for(const label of ['Blockly 当前 Screen','Blockly 规则','指定事件触发','多事件触发'])await expect(tools.getByLabel(label,{exact:true})).toBeVisible();
 await expect(page.getByLabel('工作区设置',{exact:true})).toBeHidden();await expect(bar.getByRole('button',{name:'资源包检查',exact:true})).toBeHidden();await expect(bar.locator('.screen-settings > summary')).toBeHidden();await expect(bar.getByRole('button',{name:'行为',exact:true})).toBeHidden();
 await page.getByRole('navigation',{name:'编辑器菜单'}).getByText('视图',{exact:true}).click();await page.getByRole('button',{name:'打开 GUI Scale 设置',exact:true}).click();await expect(page.getByLabel('游戏 GUI Scale',{exact:true})).toBeVisible();await page.keyboard.press('Escape');
 const id=await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/blockly_core.js?'))!;return (await import(url)).common.getMainWorkspace().id;});
 await page.getByRole('button',{name:'GUI 设计模式'}).click();await expect(tools).toBeHidden();await expect(page.getByLabel('工作区设置',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'资源包检查',exact:true})).toBeVisible();await expect(page.locator('.screen-settings > summary')).toBeVisible();await expect(page.getByRole('button',{name:'行为',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Blockly 实验',exact:true}).click();await expect(tools).toBeVisible();
 expect(await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/blockly_core.js?'))!;return (await import(url)).common.getMainWorkspace().id;})).toBe(id);
 expect(await page.getByTestId('project-json').textContent()).toBe(before);
});

test('Blockly context controls stay within the viewport and workspace SVG follows its reclaimed area',async({page},info)=>{
 const tools=await open(page);
 for(const width of [1440,1280,900,760,400]){
  await page.setViewportSize({width,height:1000});await expect(tools).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  const field=(await tools.locator('.blockly-trigger-config').boundingBox())!;expect(field.x).toBeGreaterThanOrEqual(0);expect(field.x+field.width).toBeLessThanOrEqual(width);
  for(const name of ['Blockly 当前 Screen','Blockly 规则']){const r=(await tools.getByLabel(name,{exact:true}).boundingBox())!;expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(width);}
  await expect.poll(()=>page.getByTestId('blockly-workspace').evaluate(host=>{const r=host.querySelector('.blocklySvg')!.getBoundingClientRect();return Math.abs(host.clientWidth-r.width)+Math.abs(host.clientHeight-r.height);})).toBeLessThan(3);
  expect((await page.getByTestId('blockly-workspace').boundingBox())!.height).toBeGreaterThan(220);
 }
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:info.outputPath('blockly-context.png')});
});
