import { expect, test, type Page } from '@playwright/test';
import { pageExportProject } from './fixtures/pageExportProject';
import { multiPageImageProject } from './fixtures/multiPageImageProject';
import { zipFixture } from './resource-fixtures';
import { GUI_SPRITES } from '../src/resources/layered';

const captureZip = (page: Page) => page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) {
  if (blob instanceof Blob && blob.type === 'application/zip') (window as unknown as { __zip: Promise<number[]> }).__zip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
  return original.call(this, blob);
}; return true; });
const files = async (page: Page) => {
  const zip = Buffer.from(await page.evaluate(() => (window as unknown as { __zip: Promise<number[]> }).__zip));
  const map = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), name = zip.readUInt16LE(offset + 26), extra = zip.readUInt16LE(offset + 28), start = offset + 30 + name + extra;
    map.set(zip.subarray(offset + 30, offset + 30 + name).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  const manifest = JSON.parse([...map].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  const spec = JSON.parse([...map].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  return { map, manifest, spec };
};

const pixelAt = async (page: Page, bytes: Buffer, x: number, y: number) => page.evaluate(async input => {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(input.bytes)]));
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0); bitmap.close();
  return Array.from(context.getImageData(input.x, input.y, 1, 1).data);
}, { bytes: [...bytes], x, y });

test('single Screen multi-Page export produces one initial canonical pair plus one pair per additional Page', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'pages.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pageExportProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await captureZip(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  await download;
  const { map, manifest, spec } = await files(page);
  const pages = manifest.screens[0].pages;
  expect(pages).toHaveLength(2);
  expect(pages.filter((item: any) => item.initial)).toHaveLength(1);
  expect(pages.map((item: any) => item.pageId)).toEqual(['page_tab_a', 'page_tab_b']);
  expect(pages[0].designImage.name).toBe(manifest.screens[0].designImage.name);
  expect(pages[1].designImage.name).not.toBe(manifest.screens[0].designImage.name);
  expect([...map.keys()].filter(name => name.endsWith('.png') && !name.includes('bakes/'))).toHaveLength(4);
  expect(spec.designIntent.pageExportContract.version).toBe('1.0.0');
  expect(spec.designIntent.screens[0].pages).toHaveLength(2);
  expect(spec.designIntent.screens[0].pages[1]).toMatchObject({ pageId: 'page_tab_b', initial: false, designFile: pages[1].designImage.name });
  expect(await pixelAt(page, map.get(pages[0].designImage.name)!, 14, 55)).toEqual([170, 0, 0, 255]);
  expect(await pixelAt(page, map.get(pages[1].designImage.name)!, 34, 55)).toEqual([0, 170, 0, 255]);
});

test('Page-specific embedded images are captured for non-initial Page exports', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'page-images.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(multiPageImageProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await captureZip(page);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  const { map, manifest } = await files(page);
  const pages = manifest.screens[0].pages;
  expect(pages).toHaveLength(2);
  expect(await pixelAt(page, map.get(pages[0].designImage.name)!, 12, 32)).toEqual([0, 255, 0, 255]);
  expect(await pixelAt(page, map.get(pages[1].designImage.name)!, 112, 32)).toEqual([0, 255, 0, 255]);
});

test('multi-Screen export keeps real CreativeTab sprites in both Page reference states', async ({ page }) => {
  const project = multiPageImageProject();
  const [firstTab, secondTab] = project.screens[0].nodes;
  if (firstTab.type !== 'minecraft:creative-tab' || secondTab.type !== 'minecraft:creative-tab') throw new Error('Expected CreativeTabs');
  secondTab.props.column = 2;
  project.screens.push({ ...structuredClone(project.screens[0]), id: 'other_screen', nodes: [] });

  await page.goto('/');
  const png = async (color: string) => Buffer.from(await page.evaluate(fill => {
    const canvas = document.createElement('canvas');
    canvas.width = 26; canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = fill; ctx.fillRect(0, 0, 26, 32);
    return canvas.toDataURL().split(',')[1];
  }, color), 'base64');
  const selected = await png('#ff00ff'), unselected = await png('#00ffff');
  const spriteDir = 'assets/minecraft/textures/gui/sprites/container/creative_inventory';
  const jar = zipFixture([
    { name: 'version.json', data: JSON.stringify({ id: '1.21.1', pack_version: { resource: 34 } }) },
    { name: 'assets/minecraft/atlases/gui.json', data: JSON.stringify({ sources: [{ type: 'directory', source: 'gui/sprites', prefix: '' }] }) },
    ...GUI_SPRITES.map(id => ({ name: `assets/minecraft/textures/gui/sprites/${id.slice('minecraft:'.length)}.png`, data: selected })),
    ...[1, 2].flatMap(column => [
      { name: `${spriteDir}/tab_top_selected_${column}.png`, data: selected },
      { name: `${spriteDir}/tab_top_unselected_${column}.png`, data: unselected },
    ]),
  ]);
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'multi-screen-pages.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByText('视图', { exact: true }).click();
  await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover();
  await page.getByRole('button', { name: '选择已有资源包' }).click();
  const panel = page.getByRole('region', { name: '资源包检查' });
  await panel.getByLabel('选择客户端 JAR').setInputFiles({ name: 'client.jar', mimeType: 'application/java-archive', buffer: jar });
  await expect(panel).toContainText('客户端资源已检查并保存在本机');

  await captureZip(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  await download;
  const { map, manifest } = await files(page);
  const [initial, alternate] = manifest.screens[0].pages;
  expect(manifest.screens[1].pages).toEqual([]);
  expect(manifest.visualResources.screens.map((screen: { spriteIds: string[] }) => screen.spriteIds.length)).toEqual([4, 0]);
  expect(manifest.visualResources.diagnostics).toEqual([]);
  for (const [variant, colors] of [
    [initial, [[255, 0, 255, 255], [0, 255, 255, 255]]],
    [alternate, [[0, 255, 255, 255], [255, 0, 255, 255]]],
  ] as const) {
    const reference = map.get(variant.enlargedReferenceImage.name)!;
    expect(await pixelAt(page, reference, 15 * variant.scale, 15 * variant.scale)).toEqual(colors[0]);
    expect(await pixelAt(page, reference, 45 * variant.scale, 15 * variant.scale)).toEqual(colors[1]);
  }
});
