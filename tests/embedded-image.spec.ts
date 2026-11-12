import { expect, test, type Page } from '@playwright/test';
import { embeddedImageProject } from './fixtures/embeddedImageProject';

async function captureZip(page: Page) {
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) {
    if (blob instanceof Blob && blob.type === 'application/zip') (window as unknown as { __zip: Promise<number[]> }).__zip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
    return original.call(this, blob);
  }; });
}
function zipFiles(zip: Buffer) {
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), name = zip.readUInt16LE(offset + 26), extra = zip.readUInt16LE(offset + 28), start = offset + 30 + name + extra;
    files.set(zip.subarray(offset + 30, offset + 30 + name).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  return files;
}
async function pixel(page: Page, bytes: Buffer, x: number, y: number) {
  return page.evaluate(async input => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(input.bytes)])), canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height; const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
    return Array.from(ctx.getImageData(input.x, input.y, 1, 1).data);
  }, { bytes: [...bytes], x, y });
}

test('embedded PNG renders in canvas/design/bake and is listed as an asset', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'embedded.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(embeddedImageProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '选择 embedded_img' }).click();
  await expect(page.getByLabel('上传嵌入式贴图')).toBeVisible();
  await page.screenshot({ path: 'outputs/Q5L/embedded-image.png', fullPage: true });
  await page.getByRole('button', { name: 'Bake / Assets 工作区' }).click();
  const panel = page.getByRole('region', { name: 'Static Bake Groups' });
  await panel.locator('.bake-group-card > summary').first().click();
  await panel.getByRole('button', { name: '导出预览' }).click();
  await expect(panel.getByLabel('Bake 导出预览 bakegroup_1')).toHaveAttribute('width', '64');
  await captureZip(page);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  const zip = Buffer.from(await page.evaluate(() => (window as unknown as { __zip: Promise<number[]> }).__zip)), files = zipFiles(zip);
  const manifest = JSON.parse([...files].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  expect(manifest.embeddedAssets).toEqual([expect.objectContaining({ id: 'asset_tex', width: 8, height: 8, mime: 'image/png' })]);
  expect(manifest.embeddedImageContract.version).toBe('1.0.0');
  expect(manifest.screens[0].designImage).toBeTruthy();
  expect(await pixel(page, files.get(manifest.screens[0].designImage.name)!, 32, 32)).toEqual([0, 255, 0, 255]);
  const baked = files.get(manifest.screens[0].bakeGroups[0].asset.path)!;
  expect(await pixel(page, baked, 2, 2)).toEqual([0, 255, 0, 255]);
  const spec = JSON.parse([...files].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  expect(spec.designIntent.assets).toEqual([expect.objectContaining({ id: 'asset_tex', width: 8, height: 8 })]);
});

import { EMBEDDED_IMAGE_DATA } from './fixtures/embeddedImageProject';

test('Image inspector uploads a PNG into the authoritative project asset store', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加 Image / Sprite' }).click();
  await expect(page.getByLabel('上传嵌入式贴图')).toBeVisible();
  await page.getByLabel('上传嵌入式贴图').setInputFiles({ name: 'checker.png', mimeType: 'image/png', buffer: Buffer.from(EMBEDDED_IMAGE_DATA, 'base64') });
  await expect.poll(async () => JSON.parse((await page.getByTestId('project-json').textContent())!).assets?.length).toBe(1);
  const doc = JSON.parse((await page.getByTestId('project-json').textContent())!);
  expect(doc.schemaVersion).toBe('0.56.0');
  expect(doc.assets[0]).toMatchObject({ name: 'checker.png', mime: 'image/png', width: 8, height: 8 });
  expect(doc.screens[0].nodes[0]).toMatchObject({ type: 'minecraft:image', props: { kind: 'embedded', textureWidth: 8, textureHeight: 8 } });
});

const canvasPoint = async (page: Page, x: number, y: number) => {
  const host = page.getByTestId('canvas-host'), rect = (await host.boundingBox())!, zoom = Number(await host.getAttribute('data-zoom'));
  return { x: rect.x + Number(await host.getAttribute('data-origin-x')) + x * zoom, y: rect.y + Number(await host.getAttribute('data-origin-y')) + y * zoom };
};
const hoverCanvas = async (page: Page, x: number, y: number) => { const point = await canvasPoint(page, x, y); await page.mouse.move(point.x, point.y); };

test('Image Texture, GUI Sprite and embedded PNG expose tooltips in Inspector and interaction preview', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'embedded.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(embeddedImageProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '选择 embedded_img' }).click();
  await page.getByTestId('tooltip-fields').locator('summary').click();
  await page.getByLabel('启用 Tooltip', { exact: true }).check();
  const field = page.getByLabel('Tooltip', { exact: true });
  await field.fill('嵌入式提示'); await field.press('Enter');
  const doc = JSON.parse((await page.getByTestId('project-json').textContent())!);
  expect(doc.schemaVersion).toBe('0.57.0');
  expect(doc.screens[0].nodes.find((node: any) => node.id === 'embedded_img').props.tooltip).toEqual({ kind: 'literal', value: '嵌入式提示' });
  await page.getByLabel('交互预览', { exact: true }).click();
  await expect(page.getByTestId('canvas-host')).toHaveAttribute('data-runtime-preview-active', 'true');
  await hoverCanvas(page, 40, 40);
  await expect(page.getByTestId('runtime-tooltip')).toHaveAttribute('data-tooltip-node', 'embedded_img');
  await expect(page.getByTestId('runtime-tooltip')).toContainText('嵌入式提示');
  await hoverCanvas(page, 120, 40);
  await expect(page.getByTestId('runtime-tooltip')).toHaveAttribute('data-tooltip-node', 'texture_img');
  await expect(page.getByTestId('runtime-tooltip')).toContainText('纹理提示');
  await hoverCanvas(page, 200, 40);
  await expect(page.getByTestId('runtime-tooltip')).toHaveAttribute('data-tooltip-node', 'sprite_img');
  await expect(page.getByTestId('runtime-tooltip')).toContainText('Sprite 提示');
});
