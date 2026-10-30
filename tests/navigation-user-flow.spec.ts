import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('Rectangle navigation declaration, isolated canvas click, restore and ZIP', async ({ page }, info) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Rectangle', exact: true }).click();
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  await page.getByRole('button', { name: '行为', exact: true }).click(); const panel = page.getByTestId('behavior-panel');
  await panel.getByRole('button', { name: '新增 Screen 目标' }).click(); await panel.getByLabel('Screen 目标名称').fill('设置'); await panel.getByRole('button', { name: '保存 Screen 目标' }).click();
  await panel.getByRole('button', { name: '重命名 screen_1' }).click(); await panel.getByLabel('Screen 目标名称').fill('高级设置'); await panel.getByRole('button', { name: '保存 Screen 目标' }).click();
  await panel.getByRole('button', { name: '新增规则' }).click(); await expect(panel.getByLabel('行为事件')).toHaveValue('rectangle-click'); await expect(panel.getByLabel('行为动作')).toHaveValue('open_screen');
  await expect(panel.getByLabel('目标 Screen')).toHaveValue('screen_1'); await panel.getByRole('button', { name: '保存规则' }).click();
  const saved = await read(); expect(saved.schemaVersion).toBe('0.7.0'); expect(saved.screens[0].screenTargets).toEqual([{ id: 'screen_1', name: '高级设置' }]);
  expect(saved.screens[0].behaviors[0]).toMatchObject({ event: { type: 'rectangle-click', sourceId: 'node_1' }, action: { type: 'open_screen', targetScreenId: 'screen_1' } });
  expect(saved.screens[0].nodes[0].source.category).toBe('vanilla-draw');
  const history = await page.getByTestId('history-count').textContent(); await panel.getByRole('button', { name: '开始画布行为测试' }).click();
  const host = page.getByTestId('canvas-host'), point = await host.evaluate(el => { const r = el.getBoundingClientRect(), z = Number((el as HTMLElement).dataset.zoom); return { x: r.x + Number((el as HTMLElement).dataset.originX) + 19 * z, y: r.y + Number((el as HTMLElement).dataset.originY) + 19 * z }; });
  await page.mouse.click(point.x, point.y); await expect(panel.getByTestId('behavior-preview')).toContainText('导航意图：screen_1（高级设置）；未切换 Screen');
  await expect(page.getByRole('button', { name: '选择 node_1' })).toBeDisabled();
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 20, point.y, { steps: 3 }); await page.mouse.up();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur()); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Delete');
  expect(await read()).toEqual(saved); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await panel.getByRole('button', { name: '重置预览' }).click();
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 20, point.y, { steps: 3 }); await page.mouse.up();
  expect((await read()).screens[0].nodes[0].bounds.x).toBeGreaterThan(saved.screens[0].nodes[0].bounds.x);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur()); await page.keyboard.press('Control+z'); expect(await read()).toEqual(saved);
  await panel.getByRole('button', { name: '删除目标 screen_1' }).click();
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('仍被规则引用'); expect(await read()).toEqual(saved);
  await panel.getByRole('button', { name: '关闭行为' }).click(); await page.getByTestId('canvas-host').click({ position: { x: 60, y: 100 } }); await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload(); expect(await read()).toEqual(saved);
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP' }).click(); const zip = await event;
  const zipPath = info.outputPath('navigation.zip'); await zip.saveAs(zipPath); const bytes = await readFile(zipPath), files = new Map<string, Buffer>();
  for (let at = 0; bytes.readUInt32LE(at) === 0x04034b50;) { const size = bytes.readUInt32LE(at + 18), n = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28), start = at + 30 + n + extra; files.set(bytes.subarray(at + 30, at + 30 + n).toString('utf8'), bytes.subarray(start, start + size)); at = start + size; }
  expect(JSON.parse(files.get('Untitled interface.json')!.toString())).toEqual(saved);
  expect(JSON.parse(files.get('Untitled interface.manifest.json')!.toString()).behavior.screenTargets).toEqual(saved.screens[0].screenTargets);
  const prompt = files.get('Untitled interface.prompt.md')!.toString(); expect(prompt).toContain('mouse hit testing'); expect(prompt).toContain('target Screen creation and switching'); expect(prompt).toContain('rectangle-click');
});
