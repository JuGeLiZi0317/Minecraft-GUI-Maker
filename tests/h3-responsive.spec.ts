import { test, expect } from '@playwright/test';
for (const width of [1920,1440,1280,1100,900,760,560,400]) {
 test(`workspace stays accessible at ${width}px`, async ({page}) => {
   await page.setViewportSize({width,height:width===1440?650:900}); await page.goto('/');
   const rail=page.getByLabel('工作区模块'), host=page.getByTestId('canvas-host'); await expect(rail).toBeVisible(); await expect(host).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
   const rr=(await rail.boundingBox())!; expect(rr.x).toBeGreaterThanOrEqual(0); expect(rr.x+rr.width).toBeLessThanOrEqual(width);
   const panel=page.getByLabel('模块侧栏'), pr=(await panel.boundingBox())!; expect(pr.x+pr.width).toBeLessThanOrEqual(width);
   for (const id of ['结构树','组件目录']) { const header=panel.getByRole('region',{name:id}).locator('header'); await header.scrollIntoViewIfNeeded(); await expect(header).toBeInViewport(); }
   if (width<=560) { await expect(page.locator('.inspector')).toBeHidden(); await page.getByRole('button',{name:'展开属性栏'}).click(); await expect(page.locator('.inspector')).toBeVisible(); await page.getByRole('button',{name:'收起属性栏'}).click(); await expect(page.locator('.inspector')).toBeHidden(); }
   await page.getByRole('button',{name:'Blockly 实验'}).click(); await expect(page.locator('.blockly-editor.active')).toBeVisible(); expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 });
}

test('narrowing and restoring viewport preserves stable preferences and project revision',async({page})=>{
 const key='minecraft-gui-maker.workspace-preferences.v2';
 await page.addInitScript(key=>localStorage.setItem(key,JSON.stringify({version:2,left:{mode:'pinned',width:310},right:{mode:'pinned',width:350},openedModules:['screens','structure','behavior'],collapsedModules:{screens:true,structure:false,components:false,behavior:true},panelHeights:{screens:160,structure:260,components:310,behavior:180},treeRatio:.4,smartGuides:false,smartSnap:false})),key);
 await page.setViewportSize({width:1440,height:900}); await page.goto('/'); await expect(page.getByLabel('模块侧栏')).toBeVisible();
 const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key), revision=await page.getByTestId('project-json').textContent();
 await page.setViewportSize({width:400,height:900}); await expect(page.getByLabel('模块侧栏')).toBeVisible(); await page.setViewportSize({width:1440,height:900});
 await expect(page.getByLabel('模块侧栏')).toHaveCSS('width','310px'); await expect(page.locator('.inspector')).toHaveCSS('width','350px');
 await page.reload(); const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key); expect(after).toEqual(before); expect(await page.getByTestId('project-json').textContent()).toBe(revision);
});

test('compact navigation menus remain clickable above the workspace',async({page})=>{
 await page.setViewportSize({width:400,height:900}); await page.goto('/');
 await page.getByRole('navigation',{name:'编辑器菜单'}).getByText('视图',{exact:true}).click();
 await page.getByRole('button',{name:'主题：浅色',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});

test('compact nested resource menu stays in the viewport and can be used',async({page})=>{
 await page.setViewportSize({width:400,height:900}); await page.goto('/');
 const menu=page.getByRole('navigation',{name:'编辑器菜单'}); await menu.getByText('视图',{exact:true}).click();
 await menu.getByText('资源包检查',{exact:true}).click(); const choice=menu.getByRole('button',{name:'使用默认样式'});
 await expect(choice).toBeInViewport(); await choice.click(); await expect(page.locator('.statusbar [role=status]')).toContainText('默认样式');
});

test('all four module headers remain reachable in a short compact window',async({page})=>{
 await page.setViewportSize({width:400,height:650}); await page.goto('/');
 await page.getByRole('button',{name:'Screens 模块'}).click();await page.getByRole('button',{name:'行为 模块'}).click();
 const side=page.getByLabel('模块侧栏');for(const name of ['Screens','结构树','组件目录','行为']){const header=side.getByRole('region',{name,exact:true}).locator('header');await header.scrollIntoViewIfNeeded();await expect(header).toBeInViewport();}
});
