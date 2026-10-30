import { expect, test } from '@playwright/test';

test('CreativeTab normal workflow uses user client sprites, persists and exports', async ({ page }) => {
  const jar = process.env.GUI_CLIENT_JAR; test.skip(!jar, 'GUI_CLIENT_JAR 未提供');
  await page.goto('/'); await page.getByRole('button', { name: '资源包检查' }).click();
  const resources = page.getByRole('region', { name: '资源包检查' }); await resources.getByLabel('选择客户端 JAR').setInputFiles(jar!);
  await expect(resources).toContainText('客户端自报版本符合', { timeout: 60000 }); await page.getByRole('button', { name: '关闭资源包检查' }).click();
  await page.locator('.screen-settings summary').click(); await page.getByLabel('设计区底板').selectOption('supplied-panel-16');
  for (const [name, value] of [['X','10'], ['Y','28'], ['W','300'], ['H','140']]) await page.getByLabel(`Panel ${name}`).fill(value);
  await page.getByRole('button', { name: '应用 Panel 几何' }).click();
  await page.getByRole('button', { name: '添加 CreativeTab', exact: true }).click();
  await page.getByLabel('X', { exact: true }).fill('10'); await page.getByLabel('X', { exact: true }).press('Enter');
  await page.getByLabel('Y', { exact: true }).fill('0'); await page.getByLabel('Y', { exact: true }).press('Enter');
  await page.getByLabel('顶部列').selectOption('7'); await page.getByLabel('初始选中').check();
  await page.getByLabel('标签名称').fill('选项'); await page.getByLabel('标签名称').press('Enter');
  const doc = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  const saved = await doc(); expect(saved.schemaVersion).toBe('0.10.0'); expect(saved.screens[0].nodes[0].props).toEqual({ name: '选项', column: 7, selected: true });
  expect(saved.screens[0].nodes[0].bounds).toEqual({ x: 10, y: 0, w: 26, h: 32 });
  await page.locator('.studio-footer').click(); await page.keyboard.press('Control+z'); expect((await doc()).screens[0].nodes[0].props.name).toBe('CreativeTab'); await page.keyboard.press('Control+Shift+z'); expect(await doc()).toEqual(saved);
  await page.getByTestId('canvas-host').click({ position: { x: 60, y: 100 } }); await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(7);
  const data = await page.locator('.export-links a').evaluateAll(async els => { const fetchJSON = async (i: number) => (await fetch((els[i] as HTMLAnchorElement).href)).json();
    const bmp = await createImageBitmap(await (await fetch((els[1] as HTMLAnchorElement).href)).blob()), canvas = document.createElement('canvas'); canvas.width = bmp.width; canvas.height = bmp.height; const ctx = canvas.getContext('2d')!; ctx.drawImage(bmp, 0, 0); bmp.close();
    return { json: await fetchJSON(0), spec: await fetchJSON(2), manifest: await fetchJSON(6), pixel: Array.from(ctx.getImageData(15, 5, 1, 1).data) }; });
  expect(data.json).toEqual(saved); expect(data.manifest.visualResources.sprites['minecraft:container/creative_inventory/tab_top_selected_7'].status).toBe('valid');
  expect(data.spec.implementationRequirements.join(' ')).toContain('independent visual design node'); expect(data.pixel[3]).toBeGreaterThan(0);
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function(value) { if (value instanceof Blob && value.type === 'application/zip') (window as any).zipBytes = value.arrayBuffer().then(b => Array.from(new Uint8Array(b))); return original.call(this, value); }; });
  const download = page.waitForEvent('download'); await page.getByTestId('export-panel').getByRole('button', { name: '导出 ZIP' }).click(); await download;
  const zip = Buffer.from(await page.evaluate(() => (window as any).zipBytes)); let offset = 0; const files = new Map<string, Buffer>();
  while (zip.readUInt32LE(offset) === 0x04034b50) { const length = zip.readUInt32LE(offset + 18), n = zip.readUInt16LE(offset + 26), e = zip.readUInt16LE(offset + 28), start = offset + 30 + n + e; files.set(zip.subarray(offset + 30, offset + 30 + n).toString(), zip.subarray(start, start + length)); offset = start + length; }
  const project = [...files.entries()].find(([name]) => name.endsWith('.json') && !name.includes('manifest') && !name.includes('implementation'));
  expect(files.size).toBe(7); expect(JSON.parse(project![1].toString())).toEqual(saved);
  await page.reload(); expect(await doc()).toEqual(saved); await expect(page.getByTestId('canvas-host')).toContainText('未选择客户端资源');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'creative.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data.json)) }); await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功'); expect(await doc()).toEqual(saved);
});
import { emptyProject } from '../src/domain/model';

test('neutral fallback and panel overlap are shared by canvas and PNG', async ({ page }) => {
  await page.goto('/'); const fixture = emptyProject(); fixture.schemaVersion = '0.9.0'; fixture.screens[0].background = { kind: 'panel', style: 'custom-bevel-1', bounds: { x: 10, y: 28, w: 200, h: 100 } };
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'panel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await page.getByRole('button', { name: '添加 CreativeTab' }).click();
  await page.getByLabel('X', { exact: true }).fill('10'); await page.getByLabel('X', { exact: true }).press('Enter'); await page.getByLabel('Y', { exact: true }).fill('0'); await page.getByLabel('Y', { exact: true }).press('Enter');
  await page.getByTestId('canvas-host').click({ position: { x: 60, y: 100 } });
  const exportPixel = async () => { await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(7);
    return page.locator('.export-links a').nth(1).evaluate(async el => { const b = await createImageBitmap(await (await fetch((el as HTMLAnchorElement).href)).blob()); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const ctx = c.getContext('2d')!; ctx.drawImage(b, 0, 0); b.close(); return Array.from(ctx.getImageData(15, 29, 1, 1).data); }); };
  const unselected = await exportPixel(); expect(unselected).toEqual([85,85,85,255]);
  await page.getByRole('button', { name: '关闭导出结果' }).click(); await page.getByRole('button', { name: '选择 node_1' }).click(); await page.getByLabel('初始选中').check();
  await page.getByTestId('canvas-host').click({ position: { x: 60, y: 100 } }); const selected = await exportPixel(); expect(selected).not.toEqual(unselected);
  const canvas = await page.getByTestId('canvas-host').evaluate(host => { const c = host.querySelector('canvas')!, ctx = c.getContext('2d')!, z = Number(host.getAttribute('data-zoom')), d = devicePixelRatio; return Array.from(ctx.getImageData(Math.floor((Number(host.getAttribute('data-origin-x')) + 15.5*z)*d), Math.floor((Number(host.getAttribute('data-origin-y')) + 29.5*z)*d), 1, 1).data); });
  expect(canvas).toEqual(selected);
});
