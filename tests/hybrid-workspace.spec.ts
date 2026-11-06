import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const captureDir = process.env.HYBRID_CAPTURE_DIR ? `${process.env.HYBRID_CAPTURE_DIR}/H1` : 'outputs/H1';
mkdirSync(captureDir, {recursive:true});
async function drag(page:Page, locator:Locator, dx:number, dy:number) { const r=(await locator.boundingBox())!; const x=r.x+r.width/2,y=r.y+r.height/2; await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:10});await page.mouse.up(); }
async function read(page:Page) { return JSON.parse((await page.getByTestId('project-json').textContent())!); }
test('module stack transfers adjacent heights, preserves preferences across screens and provides accessible collapsed state',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Screens 模块'}).click();
 const stack=page.getByTestId('hybrid-panel-stack');const structure=stack.locator('[data-module="structure"]'), components=stack.locator('[data-module="components"]'), screens=stack.locator('[data-module="screens"]');
 await expect(structure).toBeVisible();await expect(components).toBeVisible();await screens.scrollIntoViewIfNeeded();await expect(screens).toBeVisible();
 const body=components.locator('.hybrid-module-body');await body.hover();await page.mouse.wheel(0,220);await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);expect(await structure.locator('.hybrid-module-body').evaluate(el=>el.scrollTop)).toBe(0);
 const initial=await Promise.all([structure,components,screens].map(async l=>(await l.boundingBox())!.height));
 const split=page.getByRole('separator',{name:'调整 结构树 与 组件目录 高度'});await split.scrollIntoViewIfNeeded();await drag(page,split,0,40);
 const next=await Promise.all([structure,components,screens].map(async l=>(await l.boundingBox())!.height));expect(next[0]).toBe(initial[0]+40);expect(next[1]).toBe(initial[1]-40);expect(next[2]).toBe(initial[2]);
 await page.getByRole('button',{name:'折叠结构树'}).click();await expect(page.getByRole('button',{name:'展开结构树'})).toBeVisible();await page.getByRole('button',{name:'展开结构树'}).click();expect((await structure.boundingBox())!.height).toBe(next[0]);
 await screens.scrollIntoViewIfNeeded();await page.getByRole('button',{name:'新增 Screen',exact:true}).click();await expect(page.getByLabel('当前画布',{exact:true})).toHaveValue('screen_1');expect((await structure.boundingBox())!.height).toBe(next[0]);
 await page.getByRole('button',{name:'切换 Screen screen_main'}).click();expect((await structure.boundingBox())!.height).toBe(next[0]);await expect(page.getByTestId('save-status')).toContainText('已保存');await page.reload();expect((await structure.boundingBox())!.height).toBe(next[0]);
 for(const n of ['Screens 模块','结构树 模块','组件目录 模块']) await page.getByRole('button',{name:n}).click();await expect(page.getByLabel('模块侧栏')).toBeHidden();await expect(page.getByLabel('工作区模块')).toBeVisible();await page.getByRole('button',{name:'展开组件栏'}).click();await expect(page.getByLabel('模块侧栏')).toBeVisible();
});
test('real business controls, keyboard selection, HTML5 drop and export remain connected',async({page})=>{
 await page.goto('/');const original=await read(page);await page.getByRole('button',{name:'添加 Button',exact:true}).click();await page.getByRole('button',{name:'添加 EditBox',exact:true}).click();
 const buttons=page.locator('.layers .layer');await expect(buttons).toHaveCount(2);await buttons.first().focus();await page.keyboard.press('ArrowDown');await expect(buttons.nth(1)).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'添加 Slider',exact:true}).dragTo(page.getByTestId('canvas-host'),{targetPosition:{x:420,y:280}});const after=await read(page);expect(after.screens[0].nodes.length).toBe(original.screens[0].nodes.length+3);
 await page.getByRole('button',{name:'导出规格',exact:true}).click();await page.getByText('批次与校验信息',{exact:true}).click();await expect(page.getByTestId('export-reference')).toBeVisible();const authority=page.locator('.export-links a[download$=".json"]').first();expect(await authority.count()).toBe(1);expect(await read(page)).toEqual(after);
});
test('legacy v1 preferences preserve widths and smart guides; invalid values fall back safely',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('minecraft-gui-maker.workspace-preferences.v1',JSON.stringify({version:1,left:{mode:'pinned',width:275},right:{mode:'pinned',width:340},treeRatio:.42,smartGuides:false,smartSnap:false})));
 await page.goto('/');await expect(page.locator('.library')).toHaveCSS('width','275px');const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('minecraft-gui-maker.workspace-preferences.v2')!));expect(p).toMatchObject({version:2,left:{width:275},right:{width:340},treeRatio:.42,smartGuides:false,smartSnap:false});
 await page.evaluate(()=>localStorage.setItem('minecraft-gui-maker.workspace-preferences.v2','{invalid'));await page.reload();await expect(page.locator('.library')).toHaveCSS('width','275px');
});
test('short viewport permits reaching every module header and produces theme captures',async({page},info)=>{
 await page.setViewportSize({width:1100,height:650});await page.goto('/');await page.getByRole('button',{name:'Screens 模块'}).click();const stack=page.getByTestId('hybrid-panel-stack');
 for(const id of ['structure','components','screens']){const header=stack.locator(`[data-module="${id}"] header`);await header.scrollIntoViewIfNeeded();await expect(header).toBeInViewport();}
 await page.setViewportSize({width:1440,height:1000}); await stack.evaluate(el=>{el.scrollTop=0}); await page.screenshot({path:`${captureDir}/dark-${info.project.name}.png`});await page.getByRole('navigation',{name:'编辑器菜单'}).getByText('视图',{exact:true}).click();await page.getByRole('button',{name:'主题：浅色',exact:true}).click();await page.screenshot({path:`${captureDir}/light-${info.project.name}.png`});
});
