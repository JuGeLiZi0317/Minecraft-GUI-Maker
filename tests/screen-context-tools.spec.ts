import {expect,test} from '@playwright/test';

test('screen tools live in the context bar and retain Screen CRUD, history, mode and state preview',async({page})=>{
 await page.goto('/');const tools=page.locator('.context-bar').getByRole('group',{name:'Screen 画布工具'});
 await expect(tools).toBeVisible();await expect(page.locator('.screen-toolbar')).toHaveCount(0);
 const select=tools.getByLabel('当前画布',{exact:true}), first=await select.inputValue();
 await tools.getByRole('button',{name:'新增画布',exact:true}).click();const second=await select.inputValue();expect(second).not.toBe(first);
 await tools.getByRole('button',{name:'重命名画布',exact:true}).click();await tools.getByLabel('画布名称',{exact:true}).fill('第二画布');await tools.getByRole('button',{name:'保存画布名称'}).click();
 await expect(select.locator('option:checked')).toContainText('第二画布');
 await select.selectOption(first);await expect(select).toHaveValue(first);await select.selectOption(second);
 page.once('dialog',dialog=>dialog.accept());await tools.getByRole('button',{name:'删除当前画布',exact:true}).click();await expect(select.locator('option')).toHaveCount(1);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(select.locator('option')).toHaveCount(2);
 await page.getByRole('button',{name:'重做',exact:true}).click();await expect(select.locator('option')).toHaveCount(1);
 await page.getByRole('button',{name:'Blockly 实验'}).click();await expect(tools).toHaveCount(0);await page.getByRole('button',{name:'GUI 设计模式'}).click();await expect(tools).toBeVisible();
 await page.getByRole('button',{name:'添加 Status Indicator',exact:true}).click();await page.getByRole('button',{name:'交互预览',exact:true}).click();
 await tools.getByLabel('打开状态预览控制',{exact:true}).click();await expect(tools.getByTestId('status-preview-events')).toBeVisible();
 await page.setViewportSize({width:400,height:1000});
 const popover=(await tools.locator('.status-preview-popover').boundingBox())!;expect(popover.x).toBeGreaterThanOrEqual(0);expect(popover.x+popover.width).toBeLessThanOrEqual(400);
});

test('moved Screen tools remain reachable across viewport sizes while Canvas starts at the card top',async({page},info)=>{
 for(const width of [1440,1280,1100,900,760,560,400]){
  await page.setViewportSize({width,height:1000});await page.goto('/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  const tools=page.locator('.context-bar').getByRole('group',{name:'Screen 画布工具'});
  for(const element of [tools.getByLabel('当前画布',{exact:true}),...['重命名画布','新增画布','删除当前画布'].map(name=>tools.getByRole('button',{name,exact:true}))]){
   const b=(await element.boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width);await expect(element).toBeInViewport();
  }
  const host=(await page.getByTestId('canvas-host').boundingBox())!,studio=(await page.locator('.studio').boundingBox())!;expect(host.y-studio.y).toBeLessThanOrEqual(2);
 }
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:info.outputPath('context-screen-tools.png')});
});
