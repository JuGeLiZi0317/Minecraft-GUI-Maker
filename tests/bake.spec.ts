import { test, expect, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { bakeProject } from './fixtures/bakeProject';

async function importBake(page: Page, pageB = false) {
  await page.goto('/');
  const doc = bakeProject(pageB);
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'bake.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: 'Bake / Assets 工作区' }).click();
  return doc;
}
async function openBakeMembers(panel: Locator) {
  await panel.locator('summary').filter({ hasText: '新建 / 选择成员' }).click();
}

async function exportZip(page: Page) {
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = function (blob) {
      if (blob instanceof Blob && blob.type === 'application/zip') (window as any).lastBakeZip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
      return original.call(this, blob);
    };
  });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  await expect(page.getByTestId('export-panel')).toBeVisible();
  return Buffer.from(await page.evaluate(() => (window as any).lastBakeZip));
}

function zipFiles(zip: Buffer) {
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    files.set(zip.subarray(offset + 30, offset + 30 + nameLength).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  return files;
}

async function pixels(page: Page, bytes: Buffer) {
  return page.evaluate(async data => {
    const image = await createImageBitmap(new Blob([new Uint8Array(data)])), canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, pixels: Array.from(imageData.data) };
  }, [...bytes]);
}

async function compositeBake(page: Page, panel: Buffer, baked: Buffer, bounds: { x: number; y: number; w: number; h: number }, crop: { x: number; y: number; w: number; h: number }) {
  return page.evaluate(async input => {
    const decode = (bytes: number[]) => createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const [background, overlay] = await Promise.all([decode(input.panel), decode(input.baked)]);
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
    const context = canvas.getContext('2d')!; context.drawImage(background, 0, 0, 320, 240, 0, 0, 320, 240);
    context.drawImage(overlay, input.bounds.x, input.bounds.y, input.bounds.w, input.bounds.h);
    return Array.from(context.getImageData(input.crop.x, input.crop.y, input.crop.w, input.crop.h).data);
  }, { panel: [...panel], baked: [...baked], bounds, crop });
}

test('Bake qualification explains exclusions; groups persist, preview, toggle and undo', async ({ page }) => {
  await importBake(page);
  const panel = page.getByRole('region', { name: 'Static Bake Groups' });
  await openBakeMembers(panel);
  await expect(panel.getByLabel('Bake成员 persistent_fill_1')).toBeEnabled();
  await expect(panel.getByLabel('Bake成员 dynamic_button')).toBeDisabled();
  await expect(panel.getByLabel('Bake成员 native_inventory')).toBeDisabled();
  await panel.locator('summary').filter({ hasText: '不支持的节点诊断' }).click();
  await expect(panel).toContainText('真实 Slot 不参与 Bake');
  await panel.getByLabel('Bake成员 persistent_fill_1').check(); await panel.getByLabel('Bake成员 persistent_fill_2').check();
  await panel.getByRole('button', { name: '创建 Bake Group (2)' }).click();
  const afterCreate = JSON.parse((await page.getByTestId('project-json').textContent())!);
  expect(afterCreate.schemaVersion).toBe('0.41.0'); expect(afterCreate.screens[0].bakeGroups[0]).toMatchObject({ memberIds: ['persistent_fill_1','persistent_fill_2'], enabled: true });
  await panel.locator('.bake-group-card > summary').first().click();
  await panel.getByRole('button', { name: '导出预览' }).click(); await expect(panel.getByLabel('Bake 导出预览 bakegroup_1')).toHaveAttribute('width', '65');
  await panel.getByRole('button', { name: '禁用 Bake' }).click();
  await expect.poll(async () => JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].bakeGroups[0].enabled).toBe(false);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  const undone = JSON.parse((await page.getByTestId('project-json').textContent())!); expect(undone.screens[0].bakeGroups[0].enabled).toBe(true);
  await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload(); await expect.poll(async () => (await page.getByTestId('project-json').textContent())?.includes('bakeGroups')).toBe(true);
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].bakeGroups[0]).toMatchObject({ memberIds: ['persistent_fill_1','persistent_fill_2'], enabled: true });
});

test('C2 exports deterministic cropped PNG assets and replaces originals at the same draw point', async ({ page }, testInfo) => {
  const source = await importBake(page), panel = page.getByRole('region', { name: 'Static Bake Groups' });
  await openBakeMembers(panel);
  for (const id of ['persistent_fill_1','persistent_fill_2']) await panel.getByLabel(`Bake成员 ${id}`).check();
  await panel.getByRole('button', { name: '创建 Bake Group (2)' }).click();
  for (const id of ['page_a_fill_1','page_a_fill_2']) await panel.getByLabel(`Bake成员 ${id}`).check();
  await panel.getByRole('button', { name: '创建 Bake Group (2)' }).click();
  for (const id of ['page_b_fill_1','page_b_fill_2']) await panel.getByLabel(`Bake成员 ${id}`).check();
  await panel.getByRole('button', { name: '创建 Bake Group (2)' }).click();
  const first = zipFiles(await exportZip(page)), manifestEntry = [...first].find(([name]) => name.endsWith('.manifest.json'))!;
  const manifest = JSON.parse(manifestEntry[1].toString()), screen = manifest.screens.find((entry: any) => entry.screenId === 'screen_main');
  expect(screen.panelTexture).not.toBeNull();
  expect(source.screens[0].nodes.find(node => node.id === 'demo_title')?.type).toBe('minecraft:string-widget');
  expect(screen.bakeGroups).toHaveLength(3);
  const [persistent, pageA, pageB] = screen.bakeGroups;
  expect(persistent.asset).toMatchObject({ bounds: { x: 20, y: 45, w: 65, h: 40 }, coordinateSpace: 'screen-gui', clip: 'design-area', drawOrder: 'first-member-position', sourceNodesSuppressed: ['persistent_fill_1','persistent_fill_2'] });
  expect(pageA.asset).not.toBeNull(); expect(pageB.asset).not.toBeNull();
  const spec = JSON.parse([...first].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  expect(spec.designIntent.bakeContract.authority).toContain('editable authority');
  expect(spec.designIntent.screens[0].bakeGroups[0].asset.path).toBe(persistent.asset.path);
  expect(spec.implementationRequirements.join(' ')).toContain('Disabled groups');
  for (const item of manifest.files) expect(createHash('sha256').update(first.get(item.name)!).digest('hex')).toBe(item.sha256);
  const designFile = [...first].find(([name]) => name.endsWith('.png') && !name.includes('/bakes/'))![1];
  const baked = first.get(persistent.asset.path)!;
  const designPixels = await pixels(page, designFile), bakedPixels = await pixels(page, baked);
  expect(designPixels).toMatchObject({ width: 320, height: 240 }); expect(bakedPixels).toMatchObject({ width: 65, height: 40 });
  const designCrop = await page.evaluate(data => {
    const image = new Image(); return new Promise(resolve => { image.onload = () => { const c = document.createElement('canvas'); c.width = 65; c.height = 40; const x = c.getContext('2d')!; x.drawImage(image, 20, 45, 65, 40, 0, 0, 65, 40); resolve(Array.from(c.getContext('2d')!.getImageData(0,0,65,40).data)); }; image.src = URL.createObjectURL(new Blob([new Uint8Array(data)], { type:'image/png' })); });
  }, [...designFile]);
  const composite = await compositeBake(page, first.get(screen.panelTexture.file)!, baked, persistent.asset.bounds, { x: 20, y: 45, w: 65, h: 40 });
  expect(designCrop).toEqual(composite);
  const second = zipFiles(await exportZip(page)), secondManifest = JSON.parse([...second].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  expect(secondManifest.screens[0].bakeGroups.map((group: any) => group.asset.sha256)).toEqual(screen.bakeGroups.map((group: any) => group.asset.sha256));
  expect(testInfo.project.name).toMatch(/dpr[12]/);
  expect(source.screens[0].nodes.find(node => node.id === 'native_inventory')?.type).toBe('native_region');
});

test('Page-scoped Bake assets stay separate and only the selected Page appears in reference PNG', async ({ page }) => {
  await importBake(page, true); const panel = page.getByRole('region', { name: 'Static Bake Groups' }); await openBakeMembers(panel);
  for (const id of ['persistent_fill_1','persistent_fill_2']) await panel.getByLabel(`Bake成员 ${id}`).check();
  await panel.getByRole('button', { name: '创建 Bake Group (2)' }).click();
  for (const id of ['page_a_fill_1','page_a_fill_2']) await panel.getByLabel(`Bake成员 ${id}`).check();
  await panel.getByRole('button', { name: '创建 Bake Group (2)' }).click();
  for (const id of ['page_b_fill_1','page_b_fill_2']) await panel.getByLabel(`Bake成员 ${id}`).check();
  await panel.getByRole('button', { name: '创建 Bake Group (2)' }).click();
  const files = zipFiles(await exportZip(page)), manifest = JSON.parse([...files].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  const groups = manifest.screens[0].bakeGroups; expect(groups.map((group: any) => group.diagnostic.scope.kind)).toEqual(['persistent','page','page']);
  const authority = JSON.parse([...files].find(([name]) => name.endsWith('.json') && !name.endsWith('.manifest.json') && !name.endsWith('.implementation.json'))![1].toString());
  expect(authority.screens[0].nodes.find((node: any) => node.id === 'page_b').props).toMatchObject({ selected: true, contentIds: ['page_b_fill_1','page_b_fill_2'] });
  expect(new Set(groups.map((group: any) => group.asset.path)).size).toBe(3);
  const design = await pixels(page, [...files].find(([name]) => name.endsWith('.png') && !name.includes('/bakes/'))![1]);
  const panelPixels = await pixels(page, files.get(manifest.screens[0].panelTexture.file)!);
  const at = (source: typeof design, x: number,y: number) => source.pixels.slice((y * source.width + x) * 4, (y * source.width + x) * 4 + 4);
  expect(at(design, 125,50)).toEqual(at(panelPixels, 125,50)); expect(at(design, 205,50)).not.toEqual(at(panelPixels, 205,50));
});
