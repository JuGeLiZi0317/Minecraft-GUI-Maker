import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { showScreenControls } from './workspace-helpers';
import type { Page } from '@playwright/test';

async function stored(page: Page) { return page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('minecraft-gui-maker'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  try { const tx = db.transaction(['projects', 'workspace']); return await Promise.all(['projects', 'workspace'].map(name => new Promise<unknown[]>((resolve, reject) => { const r = tx.objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }))); } finally { db.close(); }
}); }

test('F0 normal workflow: rule, simulation, reset, save, restore and exports', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await page.getByRole('button', { name: '添加 StringWidget', exact: true }).click();
  await page.getByRole('button', { name: '行为', exact: true }).click(); const panel = page.getByTestId('behavior-panel');
  await panel.getByRole('button', { name: '新增规则' }).click();
  await expect(panel.getByLabel('行为事件')).toHaveValue('button-click'); await expect(panel.getByLabel('目标组件')).toHaveValue('node_2');
  await panel.getByLabel('行为文本').fill('已激活'); await panel.getByRole('button', { name: '保存规则' }).click();
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  const saved = await read(); expect(saved.schemaVersion).toBe('0.6.0'); expect(saved.screens[0].behaviors[0]).toMatchObject({ id: 'rule_1', event: { type: 'button-click', sourceId: 'node_1' }, action: { type: 'set-text', targetId: 'node_2', text: '已激活' } });
  await expect(page.getByTestId('save-status')).toContainText('已保存'); const database = await stored(page);
  const history = await page.getByTestId('history-count').textContent(), canvas = page.getByTestId('canvas-host');
  const before = await canvas.screenshot(); await panel.getByRole('button', { name: '模拟触发 node_1' }).click();
  await expect(panel.getByTestId('behavior-preview')).toContainText('已激活'); const after = await canvas.screenshot(); expect(before.equals(after)).toBe(false);
  expect(await read()).toEqual(saved); expect(await page.getByTestId('history-count').textContent()).toBe(history); expect(await stored(page)).toEqual(database);
  await panel.getByRole('button', { name: '重置预览' }).click(); await expect(panel.getByTestId('behavior-preview')).toHaveCount(0);
  await panel.getByRole('button', { name: '关闭行为' }).click(); await showScreenControls(page); await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload(); expect(await read()).toEqual(saved);
  const jsonEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON ↗' }).click(); const json = await jsonEvent;
  const jsonPath = info.outputPath('project.json'); await json.saveAs(jsonPath); expect(JSON.parse(await readFile(jsonPath, 'utf8'))).toEqual(saved);
  await page.getByLabel('导入项目文件').setInputFiles(jsonPath); await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功'); expect(await read()).toEqual(saved);
  const zipEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP' }).click(); const zip = await zipEvent;
  expect(zip.suggestedFilename()).toBe('Untitled interface.zip'); await expect(page.locator('.export-links a')).toHaveCount(6);
  const zipPath = info.outputPath('f0.zip'); await zip.saveAs(zipPath); const bytes = await readFile(zipPath), zipped = new Map<string, Buffer>();
  for (let at = 0; bytes.readUInt32LE(at) === 0x04034b50;) {
    const size = bytes.readUInt32LE(at + 18), nameLength = bytes.readUInt16LE(at + 26), extraLength = bytes.readUInt16LE(at + 28);
    const name = bytes.subarray(at + 30, at + 30 + nameLength).toString('utf8'), start = at + 30 + nameLength + extraLength;
    zipped.set(name, bytes.subarray(start, start + size)); at = start + size;
  }
  expect(JSON.parse(zipped.get('Untitled interface.json')!.toString()).screens[0].behaviors).toEqual(saved.screens[0].behaviors);
  expect(JSON.parse(zipped.get('Untitled interface.manifest.json')!.toString()).behavior.rules).toEqual(saved.screens[0].behaviors);
  const outputs = await page.locator('.export-links a').evaluateAll(async links => Promise.all(links.map(async link => await (await fetch((link as HTMLAnchorElement).href)).text())));
  expect(JSON.parse(outputs[2]).designIntent.behaviors).toEqual(saved.screens[0].behaviors); expect(outputs[3]).toContain('button-click'); expect(JSON.parse(outputs[5]).behavior.rules).toEqual(saved.screens[0].behaviors);
});

test('checkbox change simulates visibility, rule editing and deletion are undoable', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Checkbox' }).click(); await page.getByRole('button', { name: '添加 StringWidget' }).click();
  await page.getByRole('button', { name: '行为', exact: true }).click(); const panel = page.getByTestId('behavior-panel'); await panel.getByRole('button', { name: '新增规则' }).click();
  await panel.getByLabel('行为动作').selectOption('set-visible'); await panel.getByLabel('目标组件').selectOption('node_2'); await panel.getByLabel('行为可见性').selectOption('false'); await panel.getByRole('button', { name: '保存规则' }).click();
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!); const original = await read();
  const before = await page.getByTestId('canvas-host').screenshot(); await panel.getByRole('button', { name: /模拟触发 node_1/ }).click();
  await expect(panel.getByTestId('behavior-preview')).toContainText('"visible":false'); await expect(panel.getByTestId('behavior-preview')).toContainText('"checked":true');
  expect(before.equals(await page.getByTestId('canvas-host').screenshot())).toBe(false); expect(await read()).toEqual(original);
  await panel.getByRole('button', { name: '重置预览' }).click(); await panel.getByRole('button', { name: '编辑 rule_1' }).click(); await panel.getByLabel('行为可见性').selectOption('true'); await panel.getByRole('button', { name: '保存规则' }).click();
  expect((await read()).screens[0].behaviors[0].action.visible).toBe(true);
  await panel.getByRole('button', { name: '删除 rule_1' }).click(); expect((await read()).screens[0].behaviors).toHaveLength(0);
  await panel.getByRole('button', { name: '关闭行为' }).click(); await showScreenControls(page); await page.keyboard.press('Control+z'); expect((await read()).screens[0].behaviors).toHaveLength(1);
});
