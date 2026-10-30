import { expect, test } from '@playwright/test';
import { emptyProject } from '../src/domain/model';

test('independent panel retains global coordinates through history, recovery and export', async ({ page }) => {
  await page.goto('/');
  const legacy = emptyProject(); legacy.schemaVersion = '0.2.0'; legacy.screens[0].background = { kind: 'panel', style: 'custom-bevel-1' };
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  const doc = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  expect((await doc()).screens[0].background).toEqual(legacy.screens[0].background);
  for (const [name, value] of [['X', '10'], ['Y', '28'], ['W', '200'], ['H', '120']]) await page.getByLabel(`Panel ${name}`).fill(value);
  await page.getByRole('button', { name: '应用 Panel 几何' }).click();
  const saved = await doc(); expect(saved.schemaVersion).toBe('0.9.0'); expect(saved.screens[0].background.bounds).toEqual({ x: 10, y: 28, w: 200, h: 120 });
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect((await doc()).schemaVersion).toBe('0.2.0');
  await page.getByRole('button', { name: '重做', exact: true }).click(); expect(await doc()).toEqual(saved);
  await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload(); expect(await doc()).toEqual(saved);
  const canvasPixels = await page.getByTestId('canvas-host').evaluate(host => {
    const canvas = host.querySelector('canvas')!, ctx = canvas.getContext('2d')!, zoom = Number(host.getAttribute('data-zoom')), ox = Number(host.getAttribute('data-origin-x')), oy = Number(host.getAttribute('data-origin-y')), dpr = devicePixelRatio;
    const sample = (x: number, y: number) => Array.from(ctx.getImageData(Math.floor((ox + x * zoom) * dpr), Math.floor((oy + y * zoom) * dpr), 1, 1).data);
    return { outside: sample(5.5, 5.5), inside: sample(30.5, 40.5) };
  });
  expect(canvasPixels.outside).toEqual([28, 38, 52, 255]); expect(canvasPixels.inside).toEqual([198, 198, 198, 255]);
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(7);
  const result = await page.locator('.export-links a').evaluateAll(async links => {
    const read = async (index: number, x: number, y: number) => { const bmp = await createImageBitmap(await (await fetch((links[index] as HTMLAnchorElement).href)).blob()); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const ctx = c.getContext('2d')!; ctx.drawImage(bmp, 0, 0); bmp.close(); return Array.from(ctx.getImageData(x, y, 1, 1).data); };
    return { designOutside: await read(1, 0, 0), designInside: await read(1, 10, 28), panelOutside: await read(5, 0, 0), panelInside: await read(5, 10, 28), manifest: await (await fetch((links[6] as HTMLAnchorElement).href)).json() };
  });
  expect(result.designOutside[3]).toBe(0); expect(result.panelOutside[3]).toBe(0); expect(result.panelInside).toEqual(result.designInside); expect(result.panelInside[3]).toBe(255);
  expect(result.manifest.panelTexture.panelBounds).toEqual(saved.screens[0].background.bounds);
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function(blob) { if (blob instanceof Blob && blob.type === 'application/zip') (window as any).panelZip = blob.arrayBuffer().then(b => Array.from(new Uint8Array(b))); return original.call(this, blob); }; });
  const download = page.waitForEvent('download'); await page.getByTestId('export-panel').getByRole('button', { name: '导出 ZIP' }).click(); expect((await download).suggestedFilename()).toMatch(/\.zip$/);
  const zip = Buffer.from(await page.evaluate(() => (window as any).panelZip)); let pos = 0; const files = new Map<string, Buffer>();
  while (zip.readUInt32LE(pos) === 0x04034b50) { const size = zip.readUInt32LE(pos + 18), nameLength = zip.readUInt16LE(pos + 26), extra = zip.readUInt16LE(pos + 28), start = pos + 30 + nameLength + extra; files.set(zip.subarray(pos + 30, pos + 30 + nameLength).toString('utf8'), zip.subarray(start, start + size)); pos = start + size; }
  const project = [...files.entries()].find(([name]) => name.endsWith('.json') && !name.includes('manifest') && !name.includes('implementation'));
  expect(project).toBeTruthy(); expect(JSON.parse(project![1].toString())).toEqual(saved); expect(files.size).toBe(7);

});
