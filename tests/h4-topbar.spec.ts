import { test, expect } from '@playwright/test';
import { fillViewSetting } from './topbar-helpers';

const documentOf = (page: import('@playwright/test').Page) => page.getByTestId('project-json').textContent();

test('H4-A high frequency tools and secondary settings retain view-only semantics and geometry', async ({ page }) => {
  await page.goto('/');
  const doc = await documentOf(page), host = page.getByTestId('canvas-host'), box = await host.boundingBox();
  for (const name of ['选择工具', '平移工具', '重置视图', '交互预览', '导出规格', '一键导出 ZIP', '导出 JSON ↗', '本地保存状态和副本']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '平移工具' }).click(); await expect(page.getByRole('button', { name: '平移工具' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('显示网格').check(); await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await fillViewSetting(page, 'Pan X', '31'); await fillViewSetting(page, 'Pan Y', '-17'); await fillViewSetting(page, '网格间距', '12');
  await expect(host).toHaveAttribute('data-grid-spacing', '12'); await expect(page.getByLabel('Pan X', { exact: true })).toHaveValue('31');
  await page.getByLabel('工作区设置', { exact: true }).click();
  await expect(page.getByRole('region', { name: '工作区次级设置' })).toBeVisible();
  expect(await host.boundingBox()).toEqual(box);
  await page.getByRole('button', { name: '字体选择' }).click(); await expect(page.locator('#context-font-menu')).toBeVisible();
  await page.getByRole('button', { name: '使用系统字体', exact: true }).click();
  await page.keyboard.press('Escape'); await expect(page.getByLabel('工作区设置', { exact: true })).toBeFocused();
  await expect(page.getByRole('region', { name: '工作区次级设置' })).toBeHidden();
  await page.getByRole('button', { name: '重置视图' }).click();
  await expect(page.getByLabel('Pan X', { exact: true })).toHaveValue('0');
  expect(await documentOf(page)).toBe(doc); expect(await host.boundingBox()).toEqual(box);
});

test('H4-A menu keyboard access, global mode commands, resources and draft-safe reopening', async ({ page }) => {
  await page.goto('/'); const doc = await documentOf(page), menu = page.getByRole('navigation', { name: '编辑器菜单' });
  for (const name of ['文件','编辑','视图','模式','工具','帮助']) await expect(menu.getByText(name, { exact: true })).toBeVisible();
  const file = menu.getByText('文件', { exact: true }); await file.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '导入设计 JSON' })).toBeVisible();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: '新的GUI项目' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(file).toBeFocused(); await expect(page.getByRole('button', { name: '导入设计 JSON' })).toBeHidden();
  await menu.getByText('模式', { exact: true }).click(); await page.getByRole('button', { name: '切换到 Blockly 行为' }).click();
  await expect(page.getByTestId('blockly-editor')).toBeVisible(); await expect(page.getByRole('button', { name: '选择工具' })).toBeHidden();
  await expect(page.locator('.blockly-context-bar').getByRole('button', { name: '资源包检查', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'GUI 设计模式' }).click();
  await page.getByRole('button', { name: '资源包检查', exact: true }).click(); await expect(page.getByRole('region', { name: '资源包检查', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭资源包检查' }).click();
  await page.getByLabel('工作区设置', { exact: true }).click(); await expect(page.getByTestId('font-status')).toBeVisible();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'GUI 设计模式' }).click();
  await expect(page.getByTestId('canvas-host')).toBeVisible(); expect(await documentOf(page)).toBe(doc);
  await page.locator('.screen-settings > summary').click(); const width=page.getByLabel('设计区宽', { exact: true }); await width.fill('360');
  await page.locator('.brand-mark').click(); await page.locator('.screen-settings > summary').click(); await expect(width).toHaveValue('360');
  expect(await documentOf(page)).toBe(doc);
});

for (const width of [1920,1440,1280,1100,900,760,560,400]) test(`H4-A top entries stay in bounds at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({width,height:width===1440?650:900}); await page.goto('/');
  for (const selector of ['.app-header','.context-bar','.workspace']) {
    const b=(await page.locator(selector).boundingBox())!; expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x+b.width).toBeLessThanOrEqual(width);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  for(const selector of ['.editor-menu > details > summary','.context-bar button:not([hidden])','.context-bar > .workspace-mode-switch button','.header-actions .primary']) {
    const controls=page.locator(selector); for (let i=0;i<await controls.count();i++) if(await controls.nth(i).isVisible()) {
      const box=(await controls.nth(i).boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(width);
      await expect(controls.nth(i)).toBeInViewport();
    }
  }
  await page.getByLabel('工作区设置', {exact:true}).click(); await expect(page.getByLabel('Pan X',{exact:true})).toBeInViewport();
  const pop=(await page.getByRole('region',{name:'工作区次级设置'}).boundingBox())!; expect(pop.x+pop.width).toBeLessThanOrEqual(width); expect(pop.y+pop.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Blockly 实验'}).click(); await expect(page.getByTestId('blockly-editor')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  await page.screenshot({path:info.outputPath(`topbar-${width}.png`)});
});

test('H4-A repeated export keeps pointer target stable and still reports real encoder failures', async ({ page }) => {
  await page.goto('/'); const exportButton=page.getByRole('button',{name:'导出规格',exact:true});
  await exportButton.click(); await expect(page.locator('.export-links a')).toHaveCount(7);
  const before=(await exportButton.boundingBox())!;
  await page.evaluate(()=>{(window as any).__h4ToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=callback=>callback(null);});
  await page.mouse.move(before.x+before.width/2,before.y+before.height/2); await page.mouse.down();
  expect(await exportButton.boundingBox()).toEqual(before); await page.mouse.up();
  await expect(page.locator('.statusbar [role=alert]')).toContainText('PNG编码失败');
  await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=(window as any).__h4ToBlob;});
  await exportButton.click(); await expect(page.locator('.export-links a')).toHaveCount(7);
  await page.getByRole('button',{name:'关闭导出结果'}).click(); await page.setViewportSize({width:400,height:900});
  for(const name of ['导出规格','查看导出结果']) { const b=(await page.getByRole('button',{name,exact:true}).boundingBox())!; expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(400); }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(400);
});

test('H4-A global menu popovers and nested resources stay reachable after moving menus right', async ({ page }) => {
  for(const width of [1440,1280,1100,900,760,560,400]) {
    await page.setViewportSize({width,height:900}); await page.goto('/');
    const menu=page.getByRole('navigation',{name:'编辑器菜单'});
    for(const label of ['文件','编辑','视图','模式','工具','帮助']) {
      const entry=menu.locator(':scope > details').filter({has:page.locator(':scope > summary').filter({hasText:label})});
      await menu.getByText(label,{exact:true}).click();
      const pop=entry.locator(':scope > div'),b=(await pop.boundingBox())!;
      expect(b.x,`${width} ${label}`).toBeGreaterThanOrEqual(0);expect(b.x+b.width,`${width} ${label}`).toBeLessThanOrEqual(width);
      await menu.getByText(label,{exact:true}).click();
    }
    await menu.getByText('视图',{exact:true}).click();
    const resources=menu.getByText('资源包检查',{exact:true});
    if(width>760) await resources.hover(); else await resources.click();
    const item=menu.getByRole('button',{name:'选择已有资源包',exact:true}), b=(await item.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width);await item.click();
    await expect(page.getByRole('region',{name:'资源包检查',exact:true})).toBeVisible();
  }
});

test('H4-A global undo redo shortcuts still apply one design transaction', async ({ page }) => {
  await page.goto('/'); const read=async()=>JSON.parse((await documentOf(page))!);
  await page.getByRole('button',{name:'添加 Button',exact:true}).click(); await expect.poll(async()=>(await read()).screens[0].nodes.length).toBe(1);
  const committed=await documentOf(page);
  await page.getByTestId('canvas-host').click({position:{x:60,y:100}});
  await page.keyboard.press('Control+z'); await expect.poll(async()=>(await read()).screens[0].nodes.length).toBe(0);
  await page.keyboard.press('Control+Shift+z'); expect(await documentOf(page)).toBe(committed);
});
