import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { showScreenControls } from './workspace-helpers';

async function database(page: Page) { return page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('minecraft-gui-maker'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  try { const tx = db.transaction(['projects', 'workspace']); return await Promise.all(['projects', 'workspace'].map(name => new Promise<unknown[]>((resolve, reject) => { const r = tx.objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }))); } finally { db.close(); }
}); }
async function position(page: Page, x: number, y: number) {
  for (const [label, value] of [['X', x], ['Y', y]] as const) { const field = page.getByLabel(label, { exact: true }); await field.fill(String(value)); await field.press('Enter'); }
}
test('two tabs execute ordered cross-node actions, reset, persist and export ZIP', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await position(page, 10, 10);
  await page.getByLabel('按钮文字', { exact: true }).fill('标签 A'); await page.getByLabel('按钮文字', { exact: true }).press('Enter');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await position(page, 165, 10);
  await page.getByLabel('按钮文字', { exact: true }).fill('标签 B'); await page.getByLabel('按钮文字', { exact: true }).press('Enter');
  for (const [x, y] of [[10, 60], [10, 90], [165, 60], [165, 90]]) { await page.getByRole('button', { name: '添加 StringWidget', exact: true }).click(); await position(page, x, y); }
  await page.getByRole('button', { name: '行为', exact: true }).click(); const panel = page.getByTestId('behavior-panel');
  async function addAction(index: number, target: string, value: boolean) {
    if (index > 1) await panel.getByRole('button', { name: '添加动作' }).click(); const suffix = index === 1 ? '' : ` ${index}`;
    await panel.getByLabel(`行为动作${suffix}`, { exact: true }).selectOption('set-visible');
    await panel.getByLabel(`目标组件${suffix}`, { exact: true }).selectOption(target);
    await panel.getByLabel(`行为可见性${suffix}`, { exact: true }).selectOption(String(value));
  }
  await panel.getByRole('button', { name: '新增规则' }).click(); await expect(panel.getByLabel('触发组件').locator('option:checked')).toContainText('标签 A');
  await addAction(1, 'node_3', false); await addAction(2, 'node_3', true); await addAction(3, 'node_4', true); await addAction(4, 'node_5', false); await addAction(5, 'node_6', false);
  await panel.getByRole('button', { name: '添加动作' }).click(); await panel.getByLabel('行为动作 6', { exact: true }).selectOption('set-text'); await panel.getByLabel('目标组件 6', { exact: true }).selectOption('node_3');
  await panel.getByLabel('行为文本 6', { exact: true }).fill('这是非常长的预览文字用于触发宽度提示和验证文字不会调整组件尺寸');
  await expect(panel.getByText('文字可能超出目标宽度', { exact: false })).toBeVisible(); await panel.getByRole('button', { name: '保存规则' }).click();
  await panel.getByRole('button', { name: '新增规则' }).click(); await panel.getByLabel('触发组件').selectOption('node_2');
  await addAction(1, 'node_3', false); await addAction(2, 'node_4', false); await addAction(3, 'node_5', true); await addAction(4, 'node_6', true);
  await panel.getByRole('button', { name: '上移动作 4' }).click(); await panel.getByRole('button', { name: '保存规则' }).click();
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!); const saved = await read();
  expect(saved.schemaVersion).toBe('0.8.0'); expect(saved.screens[0].behaviors[0].actions.map((a: {targetId: string}) => a.targetId)).toEqual(['node_3','node_3','node_4','node_5','node_6','node_3']);
  expect(saved.screens[0].behaviors[1].actions.map((a: {targetId: string}) => a.targetId)).toEqual(['node_3','node_4','node_6','node_5']);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur()); await page.keyboard.press('Control+z'); expect((await read()).screens[0].behaviors).toHaveLength(1); await page.keyboard.press('Control+Shift+z'); expect(await read()).toEqual(saved);
  await expect(page.getByTestId('save-status')).toContainText('已保存'); const stored = await database(page), history = await page.getByTestId('history-count').textContent();
  const host = page.getByTestId('canvas-host'); const point = async (x: number, y: number) => host.evaluate((el, p) => { const r = el.getBoundingClientRect(), z = Number((el as HTMLElement).dataset.zoom); return { x: r.x + Number((el as HTMLElement).dataset.originX) + p.x * z, y: r.y + Number((el as HTMLElement).dataset.originY) + p.y * z }; }, { x, y });
  await panel.getByRole('button', { name: '开始画布行为测试' }).click(); await panel.getByRole('button', { name: '收起行为面板' }).click();
  let p = await point(25, 20); await page.mouse.click(p.x, p.y); await panel.getByRole('button', { name: '展开行为面板' }).click();
  let state = await panel.getByTestId('behavior-preview').textContent(); expect(state).toContain('"node_3":{"visible":true'); expect(state).toContain('"node_5":{"visible":false');
  await panel.getByRole('button', { name: '收起行为面板' }).click(); p = await point(180, 20); await page.mouse.click(p.x, p.y); await panel.getByRole('button', { name: '展开行为面板' }).click();
  state = await panel.getByTestId('behavior-preview').textContent(); expect(state).toContain('"node_3":{"visible":false'); expect(state).toContain('"node_5":{"visible":true'); expect(state).toContain('"node_6":{"visible":true');
  expect(await read()).toEqual(saved); expect(await page.getByTestId('history-count').textContent()).toBe(history); expect(await database(page)).toEqual(stored);
  await panel.getByRole('button', { name: '重置预览' }).click(); await expect(panel.getByTestId('behavior-preview')).toHaveCount(0); await panel.getByRole('button', { name: '关闭行为' }).click();
  await page.getByRole('button', { name: '选择 node_3' }).click(); await page.getByRole('button', { name: '删除组件' }).click(); await expect(page.locator('.statusbar [role="alert"]')).toContainText('仍被行为规则引用'); expect(await read()).toEqual(saved);
  await showScreenControls(page); await page.reload(); expect(await read()).toEqual(saved);
  const jsonEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON ↗' }).click(); const json = await jsonEvent, path = info.outputPath('ordered.json'); await json.saveAs(path);
  await page.getByLabel('导入项目文件').setInputFiles(path); await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功'); expect(await read()).toEqual(saved);
  const zipEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP' }).click(); const zip = await zipEvent, zipPath = info.outputPath('ordered.zip'); await zip.saveAs(zipPath);
  const bytes = await readFile(zipPath), files = new Map<string, Buffer>(); for (let at = 0; bytes.readUInt32LE(at) === 0x04034b50;) { const size = bytes.readUInt32LE(at + 18), n = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28), start = at + 30 + n + extra; files.set(bytes.subarray(at + 30, at + 30 + n).toString('utf8'), bytes.subarray(start, start + size)); at = start + size; }
  const project = JSON.parse(files.get('Untitled interface.json')!.toString()), spec = JSON.parse(files.get('Untitled interface.implementation.json')!.toString()), manifest = JSON.parse(files.get('Untitled interface.manifest.json')!.toString());
  expect(project.screens[0].behaviors).toEqual(saved.screens[0].behaviors); expect(spec.designIntent.behaviors).toEqual(saved.screens[0].behaviors); expect(manifest.behavior.rules).toEqual(saved.screens[0].behaviors); expect(files.get('Untitled interface.prompt.md')!.toString()).toContain('actions 数组按顺序执行');
});
