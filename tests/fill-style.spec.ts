import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bakeProject } from './fixtures/bakeProject';
import { fillStyleDemoProject } from './fixtures/fillStyleDemoProject';

async function importProject(page: Page, project: unknown) {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'fill-style.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
}

async function readProject(page: Page) { return JSON.parse((await page.getByTestId('project-json').textContent())!); }

async function selectNode(page: Page, id: string) { await page.getByRole('button', { name: `选择 ${id}`, exact: true }).click(); }

function zipFiles(zip: Buffer) {
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    files.set(zip.subarray(offset + 30, offset + 30 + nameLength).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  return files;
}

async function imagePixels(page: Page, bytes: Buffer) {
  return page.evaluate(async data => {
    const image = await createImageBitmap(new Blob([new Uint8Array(data)])), canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); return { width: canvas.width, height: canvas.height, data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) };
  }, [...bytes]);
}

async function compositeBake(page: Page, panel: Buffer, baked: Buffer, bounds: { x: number; y: number; w: number; h: number }) {
  return page.evaluate(async input => {
    const decode = (bytes: number[]) => createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const [background, overlay] = await Promise.all([decode(input.panel), decode(input.baked)]), canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 240; const context = canvas.getContext('2d')!;
    context.drawImage(background, 0, 0, 320, 240, 0, 0, 320, 240);
    context.drawImage(overlay, input.bounds.x, input.bounds.y, input.bounds.w, input.bounds.h);
    return Array.from(context.getImageData(0, 0, 320, 240).data);
  }, { panel: [...panel], baked: [...baked], bounds });
}

function pixel(data: number[], width: number, x: number, y: number) { return data.slice((y * width + x) * 4, (y * width + x) * 4 + 4); }

async function canvasPixelsAt(page: Page, x: number, y: number) {
  return page.evaluate(point => {
    const host = document.querySelector('[data-testid="canvas-host"]')!, rect = host.getBoundingClientRect();
    const clientX = rect.left + Number(host.getAttribute('data-origin-x')) + point.x * Number(host.getAttribute('data-zoom'));
    const clientY = rect.top + Number(host.getAttribute('data-origin-y')) + point.y * Number(host.getAttribute('data-zoom'));
    return [...host.querySelectorAll('canvas')].flatMap(canvas => {
      const bounds = canvas.getBoundingClientRect(), context = canvas.getContext('2d');
      if (!context || bounds.width <= 0 || bounds.height <= 0 || clientX < bounds.left || clientY < bounds.top || clientX >= bounds.right || clientY >= bounds.bottom) return [];
      return [Array.from(context.getImageData(Math.floor((clientX - bounds.left) * canvas.width / bounds.width), Math.floor((clientY - bounds.top) * canvas.height / bounds.height), 1, 1).data)];
    });
  }, { x, y });
}

async function exportZip(page: Page) {
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = function (blob) {
      if (blob instanceof Blob && blob.type === 'application/zip') (window as any).fillStyleZip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
      return original.call(this, blob);
    };
  });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  return Buffer.from(await page.evaluate(() => (window as any).fillStyleZip));
}

test('Fill ARGB picker and text field update one document value, validate, undo, redo and persist', async ({ page }) => {
  await importProject(page, bakeProject()); await selectNode(page, 'persistent_fill_1');
  const styles = page.getByRole('region', { name: 'Rectangle 静态样式' });
  await expect(styles.getByLabel('填充色 ARGB')).toHaveValue('#80ff0000');
  await styles.getByLabel('可视取色').fill('#33cc66'); await styles.getByRole('button', { name: '应用颜色' }).click();
  expect((await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'persistent_fill_1').props.color).toBe('#8033CC66');
  await styles.getByLabel('填充色 ARGB').fill('#FF12AB34'); await styles.getByLabel('填充色 ARGB').press('Enter');
  expect((await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'persistent_fill_1').props.color).toBe('#FF12AB34');
  expect(await canvasPixelsAt(page, 30, 55)).toContainEqual([18, 171, 52, 255]);
  await styles.getByLabel('填充色 ARGB').fill('not-a-color'); await styles.getByLabel('填充色 ARGB').press('Enter');
  await expect(styles.getByLabel('填充色 ARGB')).toHaveAttribute('aria-invalid', 'true');
  expect((await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'persistent_fill_1').props.color).toBe('#FF12AB34');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'persistent_fill_1').props.color).toBe('#8033CC66');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  expect((await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'persistent_fill_1').props.color).toBe('#FF12AB34');
});

test('Bento frame demo shares pixel geometry with Bake and keeps dynamic Button and Native Region separate', async ({ page }) => {
  const project = fillStyleDemoProject(); await importProject(page, project);
  const panel = page.getByRole('region', { name: 'Static Bake Groups' });
  await panel.locator('summary').first().click();
  await panel.locator('summary').filter({ hasText: '新建 / 选择成员' }).click();
  for (const id of ['demo_plain', 'demo_framed', 'demo_raised', 'demo_inset']) await panel.getByLabel(`Bake成员 ${id}`).check();
  await panel.getByRole('button', { name: '创建 Bake Group (4)' }).click();
  await panel.locator('.bake-group-card > summary').first().click();
  await panel.getByRole('button', { name: '导出预览' }).click();
  await expect(panel.getByLabel('Bake 导出预览 bakegroup_1')).toHaveAttribute('width', '180');

  const firstZip = await exportZip(page), first = zipFiles(firstZip), manifest = JSON.parse([...first].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  if (process.env.Q3C1_SAVE_DEMO === '1') {
    const output = resolve(process.cwd(), 'outputs', 'Q3-C.1'); await mkdir(output, { recursive: true });
    await writeFile(resolve(output, 'Q3C1_Static_Frames_Demo.zip'), firstZip);
  }
  const metadata = manifest.screens[0], group = metadata.bakeGroups[0], baked = first.get(group.asset.path)!, designFile = first.get(metadata.designImage.name)!;
  expect(manifest.rectangleStyleContract.presets.bevel_raised).toContain('top/left highlightColor');
  expect(metadata.staticRectangles.map((item: any) => item.stylePreset)).toEqual(['plain', 'framed', 'bevel_raised', 'bevel_inset']);
  const implementation = JSON.parse([...first].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  expect(implementation.designIntent.rectangleStyleContract.rendering).toContain('share the same ordered integer fill rectangles');
  expect(implementation.designIntent.nodes.find((node: any) => node.nodeId === 'demo_inset').staticRectangle.paintRects).toHaveLength(9);
  expect(metadata.nativeRegions).toHaveLength(1); expect(group.asset.bounds).toEqual({ x: 22, y: 46, w: 180, h: 104 });
  expect(group.asset.sourceNodesSuppressed).toEqual(['demo_plain', 'demo_framed', 'demo_raised', 'demo_inset']);
  expect(createHash('sha256').update(baked).digest('hex')).toBe(group.asset.sha256);
  const design = await imagePixels(page, designFile), raster = await imagePixels(page, baked);
  const composited = await compositeBake(page, first.get(metadata.panelTexture.file)!, baked, group.asset.bounds);
  for (const [x, y] of [[23, 47], [130, 46], [24, 121], [118, 122], [30, 55], [30, 125], [124, 125]]) {
    expect(pixel(design.data, 320, x, y), `design pixel ${x},${y}`).toEqual(pixel(composited, 320, x, y));
  }
  let changedPixels = 0, maxChannelDelta = 0;
  for (let y = group.asset.bounds.y; y < group.asset.bounds.y + group.asset.bounds.h; y++) for (let x = group.asset.bounds.x; x < group.asset.bounds.x + group.asset.bounds.w; x++) {
    if (x >= 48 && x < 198 && y >= 63 && y < 83) continue; // dynamic Button intentionally draws above the Bake Group
    const a = pixel(design.data, 320, x, y), b = pixel(composited, 320, x, y);
    if (a.some((value, channel) => value !== b[channel])) changedPixels++;
    maxChannelDelta = Math.max(maxChannelDelta, ...a.map((value, channel) => Math.abs(value - b[channel])));
  }
  expect({ changedPixels, maxChannelDelta }).toEqual({ changedPixels: 0, maxChannelDelta: 0 });
  expect(pixel(raster.data, raster.width, 48 - 22, 63 - 46)).toEqual([101, 116, 141, 255]);
  expect(pixel(design.data, 320, 80, 73)).not.toEqual(pixel(composited, 320, 80, 73));

  await panel.getByRole('button', { name: '禁用 Bake' }).click();
  const disabledFiles = zipFiles(await exportZip(page)), disabledManifest = JSON.parse([...disabledFiles].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  const disabledDesign = await imagePixels(page, disabledFiles.get(metadata.designImage.name)!);
  expect(disabledDesign.data).toEqual(design.data);
  expect(disabledManifest.screens[0].bakeGroups[0].asset).toBeNull();
  await panel.getByRole('button', { name: '启用 Bake' }).click();

  await selectNode(page, 'demo_raised');
  const styleEditor = page.getByRole('region', { name: 'Rectangle 静态样式' });
  await styleEditor.getByLabel('Rectangle 样式预设').selectOption('bevel_inset');
  const updated = await readProject(page), raisedNode = updated.screens[0].nodes.find((node: any) => node.id === 'demo_raised');
  expect(updated.schemaVersion).toBe('0.42.0');
  expect(raisedNode.props).toMatchObject({ stylePreset: 'bevel_inset', borderColor: '#FF303641', highlightColor: '#FFE1E6EE', shadowColor: '#FF3F4652' });
  const second = zipFiles(await exportZip(page)), secondManifest = JSON.parse([...second].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  expect(secondManifest.screens[0].bakeGroups[0].asset.sha256).not.toBe(group.asset.sha256);
  await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload();
  const restored = await readProject(page);
  expect(restored.schemaVersion).toBe('0.42.0');
  expect(restored.screens[0].nodes.find((node: any) => node.id === 'demo_raised').props).toMatchObject({ stylePreset: 'bevel_inset', borderColor: '#FF303641', highlightColor: '#FFE1E6EE', shadowColor: '#FF3F4652' });
});
