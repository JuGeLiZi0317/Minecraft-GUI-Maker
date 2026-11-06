import { expect, test, type Page } from '@playwright/test';
import { genericBehaviorProject } from './fixtures/genericBehaviorProject';
async function setup(page: Page) { await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({ name: 'blk2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(genericBehaviorProject())) }); await expect(page.locator('.statusbar [role=status]')).toContainText('导入成功'); await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click(); await page.getByLabel('Blockly 规则').selectOption('rule_generic_number'); await page.evaluate(async () => { const url = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/blockly_core.js?'))!; const b = await import(url); Object.assign(window, { __blk: b, __ws: b.common.getMainWorkspace() }); }); }
async function state(page: Page) { return page.evaluate(() => { const w = window as any; return { id: w.__ws.id, state: w.__blk.serialization.workspaces.save(w.__ws) }; }); }
async function sizeMatches(page: Page) { await expect.poll(() => page.evaluate(() => { const host = document.querySelector('.blockly-host')!, svg = host.querySelector('.blocklySvg')!; return Math.abs(host.clientWidth - svg.getBoundingClientRect().width) + Math.abs(host.clientHeight - svg.getBoundingClientRect().height); })).toBeLessThan(3); }
test('BLK-2 every entry remains accessible; help is view-only and invalid drafts stay visible', async ({ page }) => { await setup(page); const authority = await page.getByTestId('project-json').textContent(), before = await state(page); const editor = page.getByTestId('blockly-editor'); for (const name of ['保存积木规则', '放弃草稿并重新载入', '撤销积木', '重做积木', '返回 GUI 设计'])
    await expect(editor.getByRole('button', { name, exact: true })).toBeVisible(); await editor.locator('.blockly-create-tools > summary').click(); for (const name of ['新建通用规则', '新建简单条件规则', '新建共享规则'])
    await expect(editor.getByRole('button', { name, exact: true })).toBeVisible(); await expect(editor.getByLabel('通用规则事件')).toBeVisible(); await editor.locator('.blockly-create-tools > summary').click(); for (const selector of ['.blockly-help', '.blockly-dependencies', '.blockly-trigger-help', '.blockly-semantic-details']) {
    await page.locator(`${selector} > summary`).click();
    await sizeMatches(page);
    await page.locator(`${selector} > summary`).click();
} expect(await state(page)).toEqual(before); expect(await page.getByTestId('project-json').textContent()).toBe(authority); await page.evaluate(() => { const w = window as any; w.__ws.getTopBlocks(false)[0].setFieldValue('', 'SOURCE'); }); await expect(page.getByTestId('blockly-context-tools').getByLabel('Blockly 规则')).toBeDisabled(); await expect(editor.getByTestId('blockly-diagnostic')).toBeVisible(); await expect(editor.getByTestId('blockly-diagnostic')).toHaveClass(/attention/); await expect(editor.getByRole('button', { name: '保存积木规则', exact: true })).toBeDisabled(); await editor.getByRole('button', { name: '放弃草稿并重新载入' }).click(); await expect(page.getByTestId('blockly-context-tools').getByLabel('Blockly 规则')).toBeEnabled(); expect(await page.getByTestId('project-json').textContent()).toBe(authority); });
test('BLK-2 resize collapse and real block gestures preserve edits and connections', async ({ page }) => {
    await setup(page);
    const editor = page.getByTestId('blockly-editor'), host = editor.getByTestId('blockly-workspace');
    const before = await state(page);
    const initial = (await host.boundingBox())!.width;
    const grip = (await editor.getByRole('separator', { name: '调整共享映射面板宽度' }).boundingBox())!;
    await page.mouse.move(grip.x + 3, grip.y + 30);
    await page.mouse.down();
    await page.mouse.move(grip.x - 75, grip.y + 30, { steps: 12 });
    await page.mouse.up();
    expect((await host.boundingBox())!.width).toBeLessThan(initial);
    await sizeMatches(page);
    await page.getByTestId('blockly-context-tools').getByRole('button', { name: '收起映射面板' }).click();
    expect((await host.boundingBox())!.width).toBeGreaterThan(initial);
    await sizeMatches(page);
    await page.evaluate(() => { const w = window as any; w.__ws.scrollCenter(); });
    const root = editor.locator('.blocklySvg .blocklyBlockCanvas [data-block-type="gui_on_event"]').first();
    const transform = await root.getAttribute('transform');
    const box = (await root.boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + 25);
    await page.mouse.down();
    await page.mouse.move(box.x + 64, box.y + 65, { steps: 16 });
    await page.mouse.up();
    await expect(root).not.toHaveAttribute('transform', transform!);
    expect((await state(page)).id).toBe(before.id);
    await expect(editor.getByRole('button', { name: '保存积木规则' })).toBeDisabled();
    const detached = await page.evaluate(() => { const w = window as any, b = w.__ws.getAllBlocks(false).find((b: any) => b.type === 'gui_constant'), r = b.getSvgRoot().getBoundingClientRect(); b.unplug(false); b.moveBy(0, 160); return { id: b.id, x: r.x, y: r.y }; });
    const leaf = editor.locator(`.blocklySvg [data-block-id="${detached.id}"]`), leafBox = (await leaf.boundingBox())!;
    await page.mouse.move(leafBox.x + 13, leafBox.y + 4);
    await page.mouse.down();
    await page.mouse.move(detached.x + 13, detached.y + 4, { steps: 20 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => { const w = window as any; return w.__ws.getAllBlocks(false).find((b: any) => b.type === 'gui_constant').getParent()?.type; })).toBe('gui_compare');
    await expect(editor.getByRole('button', { name: '保存积木规则' })).toBeDisabled();
    await page.evaluate(() => { const w = window as any; w.__ws.getAllBlocks(false).find((b: any) => b.type === 'gui_constant').getField('VALUE').getSvgRoot().setAttribute('data-testid', 'blk2-value'); });
    await page.getByTestId('blk2-value').click();
    await page.locator('.blocklyHtmlInput').fill('7');
    await page.locator('.blocklyHtmlInput').press('Enter');
    await expect(editor.getByTestId('blockly-diagnostic')).toContainText('未保存草稿');
    await page.getByTestId('blockly-context-tools').getByRole('button', { name: '共享映射', exact: true }).click();
    await sizeMatches(page);
    await editor.getByRole('button', { name: '撤销积木', exact: true }).click();
    await expect(editor.getByTestId('blockly-semantic-preview')).toContainText('"value": 5');
    await editor.getByRole('button', { name: '重做积木', exact: true }).click();
    await expect(editor.getByTestId('blockly-semantic-preview')).toContainText('"value": 7');
    await editor.getByRole('button', { name: '保存积木规则' }).click();
    await expect(editor.getByTestId('blockly-diagnostic')).toContainText('与项目一致');
});
test('BLK-2 responsive Bento and mapping drafts stay accessible in both themes', async ({ page }, info) => { await setup(page); const editor = page.getByTestId('blockly-editor'); for (const name of ['浅色', '深色']) {
    await page.getByRole('navigation', { name: '编辑器菜单' }).getByText('视图', { exact: true }).click();
    await page.getByRole('button', { name: `主题：${name}`, exact: true }).click();
    for (const [width, height] of [[1440, 1000], [1440, 650], [760, 800], [400, 800]]) {
        await page.setViewportSize({ width, height });
        await expect(editor.getByRole('button', { name: '保存积木规则' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await editor.getByTestId('blockly-workspace').scrollIntoViewIfNeeded();
        await sizeMatches(page);
        expect((await editor.getByTestId('blockly-workspace').boundingBox())!.height).toBeGreaterThanOrEqual(220);
        await page.evaluate(() => (window as any).__ws.scrollCenter());
        await page.screenshot({ path: info.outputPath(`${name}-${width}x${height}.png`), animations: 'disabled' });
    }
} await page.getByTestId('blockly-context-tools').getByRole('button', { name: '共享映射', exact: true }).click(); const drawer = editor.locator('.blockly-drawer-backdrop'); await expect(drawer).toBeVisible(); await expect(drawer).toContainText('尚无共享映射'); await drawer.getByRole('button', { name: '新建共享映射' }).click(); await drawer.getByLabel('共享映射名称').fill('保留映射草稿'); await drawer.getByRole('button', { name: '关闭映射侧栏' }).click(); await page.getByTestId('blockly-context-tools').getByRole('button', { name: '共享映射', exact: true }).click(); await expect(drawer.getByLabel('共享映射名称')).toHaveValue('保留映射草稿'); await drawer.getByRole('button', { name: '取消', exact: true }).click(); await drawer.getByRole('button', { name: '新建共享映射' }).click(); await drawer.getByLabel('共享映射名称').fill('新共享映射'); await drawer.getByRole('button', { name: '添加映射项' }).click(); await drawer.getByRole('button', { name: '保存映射定义' }).click(); await expect(drawer).toContainText('新共享映射'); const saved = JSON.parse((await page.getByTestId('project-json').textContent())!); expect(saved.screens[0].behaviorMaps[0].mappings).toHaveLength(1); });
