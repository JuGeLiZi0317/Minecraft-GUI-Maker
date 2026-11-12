import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { nativeInventoryProject } from './fixtures/nativeInventoryProject';
import { createNode } from '../src/domain/model';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
async function point(page: Page, x: number, y: number) {
  return page.getByTestId('canvas-host').evaluate((host, pos) => { const rect = host.getBoundingClientRect(), data = (host as HTMLElement).dataset, zoom = Number(data.zoom); return { x: rect.left + Number(data.originX) + pos.x * zoom, y: rect.top + Number(data.originY) + pos.y * zoom }; }, { x, y });
}
async function importDemo(page: Page, pages = false) {
  await page.goto('/');
  const doc = nativeInventoryProject();
  if (pages) {
    const a = createNode('minecraft:creative-tab', 'page_a', { x: 24, y: 50 }), b = createNode('minecraft:creative-tab', 'page_b', { x: 60, y: 50 });
    if (a.type !== 'minecraft:creative-tab' || b.type !== 'minecraft:creative-tab') throw new Error('fixture');
    Object.assign(a.props, { groupId: 'pages', contentIds: ['node_title'], selected: true });
    Object.assign(b.props, { groupId: 'pages', contentIds: [], selected: false }); doc.screens[0].nodes.push(a, b);
  }
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'native.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功'); return doc;
}
async function samples(page: Page, points: { x: number; y: number }[]) {
  return page.getByTestId('canvas-host').evaluate((host, positions) => { const canvas = host.querySelector('canvas')!, ctx = canvas.getContext('2d')!, data = (host as HTMLElement).dataset, z = Number(data.zoom), d = devicePixelRatio;
    return positions.map(p => Array.from(ctx.getImageData(Math.floor((Number(data.originX) + p.x * z) * d), Math.floor((Number(data.originY) + p.y * z) * d), 1, 1).data));
  }, points);
}

test('Native Regions palette creates a single fixed-size region; inspector, drag, undo and IndexedDB restore it', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Player Inventory', exact: true }).click();
  await expect(page.getByLabel('Region kind', { exact: true })).toHaveValue('minecraft:player_inventory');
  await expect(page.getByLabel('固定宽度', { exact: true })).toHaveValue('162'); await expect(page.getByLabel('固定高度', { exact: true })).toHaveValue('76');
  await expect(page.getByLabel('W', { exact: true })).toHaveCount(0); await expect(page.getByLabel('H', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('父容器', { exact: true })).toHaveCount(0);
  for (const [label, value] of [['X', '24'], ['Y', '70'], ['控件别名', 'Native Inventory']]) { await page.getByLabel(label, { exact: true }).fill(value); await page.getByLabel(label, { exact: true }).press('Enter'); }
  expect((await read(page)).screens[0].nodes).toHaveLength(1);
  const before = await read(page), p = await point(page, 70, 100);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 40, p.y + 20, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => (await read(page)).screens[0].nodes[0].bounds.x).not.toBe(24);
  const after = await read(page), region = after.screens[0].nodes[0];
  expect(region.bounds).toMatchObject({ w: 162, h: 76 }); expect(region.props).toEqual(before.screens[0].nodes[0].props); expect(region.alias).toBe('Native Inventory');
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await read(page)).toEqual(before);
  await page.getByRole('button', { name: '重做', exact: true }).click(); expect(await read(page)).toEqual(after);
  await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload(); await expect.poll(() => read(page)).toEqual(after);
});

test('Native Region stays Screen-root when dragged over a container', async ({ page }) => {
  await page.goto('/');
  const doc = nativeInventoryProject(), container = createNode('minecraft:scrollable-panel', 'container', { x: 10, y: 90 });
  container.bounds = { x: 10, y: 90, w: 250, h: 130 }; doc.screens[0].nodes.unshift(container);
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'overlap.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  const p = await point(page, 70, 130);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 30, p.y + 15, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'node_inventory').bounds.x).not.toBe(24);
  const region = (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'node_inventory');
  expect(region.parentContainerId).toBeUndefined(); expect(region.bounds).toMatchObject({ w: 162, h: 76 });
});

test('all 36 exact slot positions survive zoom and Page switches as one Persistent Region', async ({ page }) => {
  const doc = await importDemo(page, true);
  const positions = [0, 18, 36, 58].flatMap(y => Array.from({ length: 9 }, (_, col) => ({ x: 24 + col * 18 + 8, y: 110 + y + 8 })));
  for (const zoom of ['100%', '200%']) {
    await page.getByLabel('Zoom', { exact: true }).selectOption({ label: zoom });
    await expect.poll(() => samples(page, positions)).toEqual(positions.map(() => [139,139,139,255]));
  }
  const history = await page.getByTestId('history-count').textContent();
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  for (const x of [65, 29, 65, 29]) { const p = await point(page, x, 60); await page.mouse.click(p.x, p.y); await expect.poll(() => samples(page, positions)).toEqual(positions.map(() => [139,139,139,255])); }
  expect(await read(page)).toEqual(doc); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await page.getByRole('button', { name: '选择 page_a', exact: true }).click();
  // B1.14: Page ownership is allowed from Schema 0.48.0; the checkbox is no longer disabled.
  const checkbox = page.getByLabel('标签内容 node_inventory', { exact: true });
  await expect(checkbox).toBeEnabled();
  await checkbox.check();
  await page.getByRole('button', { name: '保存标签组' }).click();
  const owned = await read(page);
  expect(owned.schemaVersion).toBe('0.48.0');
  expect(owned.screens[0].nodes.find((node: { id: string }) => node.id === 'page_a').props.contentIds).toContain('node_inventory');
  // Its owning Page still paints all 36 backgrounds at the exact positions.
  await expect.poll(() => samples(page, positions)).toEqual(positions.map(() => [139,139,139,255]));
  // The other Page neither paints nor hit-tests the region.
  const views = page.getByLabel('标签编辑视图');
  await views.getByRole('button', { name: /page_b/ }).click();
  const off = await point(page, 32, 118); await page.mouse.click(off.x, off.y);
  await expect(page.getByLabel('Region kind', { exact: true })).toHaveCount(0);
  // Returning to the owning Page restores both painting and hit testing.
  await views.getByRole('button', { name: /page_a/ }).click();
  const on = await point(page, 32, 118); await page.mouse.click(on.x, on.y);
  await expect(page.getByLabel('Region kind', { exact: true })).toBeVisible();
  await expect.poll(() => samples(page, positions)).toEqual(positions.map(() => [139,139,139,255]));
});

test('real PNG and ZIP retain one Screen and one Native Region with hashes and native Menu intent', async ({ page }, testInfo) => {
  const doc = await importDemo(page);
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.export-links a[download$=".manifest.json"]')).toHaveCount(1);
  const files = await page.locator('.export-links a').evaluateAll(async links => Promise.all(links.map(async link => ({ name: (link as HTMLAnchorElement).download, bytes: Array.from(new Uint8Array(await (await fetch((link as HTMLAnchorElement).href)).arrayBuffer())) }))));
  const data = (suffix: string) => Buffer.from(files.find(file => file.name.endsWith(suffix))!.bytes);
  const manifest = JSON.parse(data('.manifest.json').toString()), spec = JSON.parse(data('.implementation.json').toString());
  expect(JSON.parse(Buffer.from(files.find(file => file.name === manifest.authority.file)!.bytes).toString())).toEqual(doc);
  expect(createHash('sha256').update(Buffer.from(files.find(file => file.name === manifest.authority.file)!.bytes)).digest('hex')).toBe(manifest.authority.sha256);
  expect(manifest.screens).toHaveLength(1); expect(manifest.screens[0].nativeRegions[0].slots).toHaveLength(36);
  expect(spec.designIntent.screens[0].nativeRegions[0].coordinateSpace).toBe('screen_local'); expect(spec.designIntent.nodes).toHaveLength(2);
  expect(spec.implementationRequirements.join(' ')).toContain('AbstractContainerMenu'); expect(data('.prompt.md').toString()).toContain('leftPos');
  const image = await page.locator('.export-links a[download$=".png"]').first().evaluate(async link => {
    const bmp = await createImageBitmap(await (await fetch((link as HTMLAnchorElement).href)).blob()), canvas = document.createElement('canvas'); canvas.width = bmp.width; canvas.height = bmp.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bmp, 0, 0); bmp.close();
    return { width: canvas.width, height: canvas.height, pixels: [0,18,36,58].flatMap(y => Array.from({ length: 9 }, (_, col) => Array.from(ctx.getImageData(24+col*18+8,110+y+8,1,1).data))) };
  });
  expect(image).toEqual({ width: 320, height: 240, pixels: Array.from({ length: 36 }, () => [139,139,139,255]) });
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function(blob) { if (blob instanceof Blob && blob.type === 'application/zip') (window as any).nativeZip = blob.arrayBuffer().then(bytes => Array.from(new Uint8Array(bytes))); return original.call(this, blob); }; });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 ZIP', exact: true }).click(); await download;
  const zip = Buffer.from(await page.evaluate(() => (window as any).nativeZip)); expect(zip.readUInt32LE(0)).toBe(0x04034b50);
  const zipped = new Map<string, Buffer>();
  for (let at = 0; zip.readUInt32LE(at) === 0x04034b50;) { const length = zip.readUInt32LE(at+18), n = zip.readUInt16LE(at+26), extra = zip.readUInt16LE(at+28), start = at+30+n+extra; zipped.set(zip.subarray(at+30,at+30+n).toString(), zip.subarray(start,start+length)); at = start+length; }
  for (const file of manifest.files) expect(createHash('sha256').update(zipped.get(file.name)!).digest('hex')).toBe(file.sha256);
  expect(JSON.parse(zipped.get(manifest.authority.file)!.toString()).screens[0].nodes.filter((node: { type: string }) => node.type === 'native_region')).toHaveLength(1);
  if (testInfo.project.name === 'chromium-dpr1') {
    const directory = 'outputs/Q3-B'; await mkdir(directory, { recursive: true });
    for (const file of files) await writeFile(`${directory}/${file.name}`, Buffer.from(file.bytes));
    await writeFile(`${directory}/Q3B_Player_Inventory.zip`, zip);
    await page.getByRole('button', { name: '关闭导出结果', exact: true }).click();
    await page.screenshot({ path: `${directory}/editor-dpr1.png`, fullPage: true });
  }
});
