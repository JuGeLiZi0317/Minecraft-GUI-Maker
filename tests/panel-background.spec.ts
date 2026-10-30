import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { emptyProject } from '../src/domain/model';

const documentOf = async (page: import('@playwright/test').Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const digest = (data: number[]) => createHash('sha256').update(Buffer.from(data)).digest('hex');
async function importLegacy(page: import('@playwright/test').Page, base = emptyProject()) {
  base.schemaVersion = '0.2.0'; base.screens[0].background = { kind: 'panel', style: 'custom-bevel-1' };
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(base)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
}

test('panel background is a separate 1:1 texture, stable across edits and local recovery', async ({ page }, info) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  const original = await documentOf(page); expect(original.schemaVersion).toBe('0.1.0');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  const before = await documentOf(page), history = await page.getByTestId('history-count').textContent();
  await importLegacy(page, structuredClone(before));
  const panel = await documentOf(page);
  await page.locator('.screen-settings summary').click();
  await expect(page.getByLabel('设计区底板')).toHaveValue('custom-bevel-1'); await expect(page.locator('option[value="custom-bevel-1"]')).toHaveAttribute('disabled', '');
  expect(panel.schemaVersion).toBe('0.2.0'); expect(panel.screens[0].background).toEqual({ kind: 'panel', style: 'custom-bevel-1' });
  expect(panel.screens[0].nodes).toEqual(before.screens[0].nodes);
  expect(parseInt((await page.getByTestId('history-count').textContent())!)).toBe(parseInt(history!) + 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await documentOf(page)).toEqual(before);
  await page.locator('.studio-footer').click(); await page.keyboard.press('Control+Shift+z'); expect(await documentOf(page)).toEqual(panel);
  await page.locator('.screen-settings summary').click();
  await page.getByLabel('设计区宽', { exact: true }).fill('360'); await page.getByLabel('设计区高', { exact: true }).fill('200');
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.export-links a')).toHaveCount(7);
  const files = await page.locator('.export-links a').evaluateAll(async links => Promise.all(links.map(async el => ({
    name: (el as HTMLAnchorElement).download, bytes: Array.from(new Uint8Array(await (await fetch((el as HTMLAnchorElement).href)).arrayBuffer())),
  }))));
  const json = (index: number) => JSON.parse(Buffer.from(files[index].bytes).toString());
  const doc = json(0), spec = json(2), manifest = json(6), png = Buffer.from(files[5].bytes);
  expect(doc.screens[0].designSize).toEqual({ width: 360, height: 200, unit: 'gui-px' });
  expect(doc.screens[0].nodes).toEqual(before.screens[0].nodes);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([512, 512]);
  expect(manifest.panelTexture).toMatchObject({ file: files[5].name, width: 512, height: 512, contentWidth: 360, contentHeight: 200, pixelRatio: 1, source: 'project-drawn-custom', layers: 'panel-only' });
  expect(manifest.reference).toEqual(spec.reference); expect(manifest.reference.revision).toBe(doc.project.revision);
  let offset = 8, pngMetadata: any;
  while (offset < png.length) {
    const size = png.readUInt32BE(offset), kind = png.toString('ascii', offset + 4, offset + 8);
    if (kind === 'tEXt') { const text = png.toString('utf8', offset + 8, offset + 8 + size); if (text.startsWith('MinecraftGuiMaker\0')) pngMetadata = JSON.parse(text.slice(18)); }
    offset += size + 12;
  }
  expect(pngMetadata).toMatchObject({ reference: manifest.reference, kind: 'panel-background-texture', pixelRatio: 1, width: 512, height: 512, contentWidth: 360, contentHeight: 200, source: 'project-drawn-custom' });
  expect(spec.designIntent.panelTexture.file).toBe(files[5].name);
  for (let i = 0; i < 6; i++) expect(manifest.files[i].sha256).toBe(digest(files[i].bytes));
  expect(Buffer.from(files[3].bytes).toString()).toContain('不含控件');
  const colors = await page.locator('.export-links a').evaluateAll(async els => {
    const read = async (index: number, x: number, y: number) => {
      const bmp = await createImageBitmap(await (await fetch((els[index] as HTMLAnchorElement).href)).blob());
      const canvas = document.createElement('canvas'); canvas.width = bmp.width; canvas.height = bmp.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(bmp, 0, 0); bmp.close(); return Array.from(ctx.getImageData(x, y, 1, 1).data);
    };
    return { corner: await read(5, 0, 0), insideTexture: await read(5, 30, 20), insideButtonPreview: await read(1, 30, 20), rightPadding: await read(5, 360, 20), bottomPadding: await read(5, 30, 200) };
  });
  expect(colors.corner).toEqual([55, 55, 55, 255]); expect(colors.insideTexture).toEqual([198, 198, 198, 255]);
  expect(colors.rightPadding).toEqual([0, 0, 0, 0]); expect(colors.bottomPadding).toEqual([0, 0, 0, 0]);
  expect(colors.insideButtonPreview).not.toEqual(colors.insideTexture);
  if (info.project.name.endsWith('dpr1')) {
    const folder = info.outputPath('sample'); await mkdir(folder, { recursive: true });
    for (const f of files) await writeFile(`${folder}/${f.name}`, Buffer.from(f.bytes));
  }
  expect(await page.evaluate(() => devicePixelRatio)).toBe(info.project.name.endsWith('dpr2') ? 2 : 1);
  await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload();
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible(); expect(await documentOf(page)).toEqual(doc);
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(original)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功'); expect(await documentOf(page)).toEqual(original);
});

test('failure while encoding the independent panel texture does not publish a partial batch', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  await importLegacy(page);
  const before = await documentOf(page), history = await page.getByTestId('history-count').textContent();
  await page.evaluate(() => {
    let count = 0; const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) { if (++count === 3) callback(null); else original.call(this, callback, type, quality); };
  });
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('PNG编码失败'); await expect(page.locator('.export-links a')).toHaveCount(0);
  expect(await documentOf(page)).toEqual(before); expect(await page.getByTestId('history-count').textContent()).toBe(history);
});

test('changing the panel after export starts cannot alter the captured background texture', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  await importLegacy(page);
  const captured = await documentOf(page);
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) { original.call(this, blob => setTimeout(() => callback(blob), 500), type, quality); };
  });
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await page.locator('.screen-settings summary').click(); await page.getByLabel('设计区底板').selectOption('none');
  await page.getByRole('button', { name: '查看导出结果', exact: true }).click();
  await expect(page.locator('.export-links a')).toHaveCount(7);
  const files = await page.locator('.export-links a').evaluateAll(async links => Promise.all(links.map(async el => Array.from(new Uint8Array(await (await fetch((el as HTMLAnchorElement).href)).arrayBuffer())))));
  const exported = JSON.parse(Buffer.from(files[0]).toString()), manifest = JSON.parse(Buffer.from(files[6]).toString());
  expect(exported).toEqual(captured); expect(manifest.reference.revision).toBe(captured.project.revision);
  expect(manifest.panelTexture.source).toBe('project-drawn-custom'); expect(digest(files[5])).toBe(manifest.files[5].sha256);
  expect((await documentOf(page)).screens[0].background.kind).toBe('none');
  await expect(page.getByTestId('export-panel')).toContainText('当前设计已改变');
});
