import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isNativeRegion, nativeRegions } from '../src/domain/nativeRegion';
import { namedMappingProject } from './fixtures/namedMappingProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);

/** Structures Inspector with a Persistent player inventory plus an optional Page ownership. */
function fixture(pageOwned: boolean) {
  const doc = namedMappingProject();
  doc.schemaVersion = pageOwned ? '0.48.0' : '0.47.0';
  const screen = doc.screens[0];
  const region = createInventory();
  screen.nodes.push(region);
  if (pageOwned) {
    const tab = screen.nodes.find(node => node.type === 'minecraft:creative-tab' && node.props.selected)!;
    if (tab.type === 'minecraft:creative-tab') tab.props.contentIds = [...(tab.props.contentIds ?? []), 'player_inventory'];
  }
  return doc;
}
function createInventory() {
  const project = namedMappingProject();
  const base = project.screens[0].nodes[0];
  void base;
  return { id: 'player_inventory', type: 'native_region' as const, bounds: { x: 8, y: 236, w: 162, h: 76 },
    source: { category: 'native-region' as const, className: 'net.minecraft.world.inventory.Slot' as const },
    state: { visible: true as const }, props: { kind: 'minecraft:player_inventory' as const }, events: {} };
}
async function load(page: Page, doc: ReturnType<typeof fixture>) {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'B114.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  return doc;
}
const clickGui = async (page: Page, x: number, y: number) => {
  const point = await page.getByTestId('canvas-host').evaluate((element, p) => {
    const rect = element.getBoundingClientRect(), data = (element as HTMLElement).dataset;
    return { x: rect.x + Number(data.originX) + p.x * Number(data.zoom), y: rect.y + Number(data.originY) + p.y * Number(data.zoom) };
  }, { x, y });
  await page.mouse.click(point.x, point.y);
};
const selectNode = async (page: Page, id: string) => {
  await page.getByRole('button', { name: `选择 ${id}`, exact: true }).click();
};

test('native region can be owned by a Page through the Inspector and stays a valid 0.48.0 document', async ({ page }) => {
  await load(page, fixture(false));
  await selectNode(page, 'player_inventory');
  await expect(page.getByText('Screen 根级区域。未归入 Page 时为 Persistent')).toBeVisible();
  await selectNode(page, 'page_structures');
  const checkbox = page.getByLabel('标签内容 player_inventory');
  await expect(checkbox).toBeEnabled();
  await checkbox.check();
  await page.getByRole('button', { name: '保存标签组' }).click();
  const saved = await read(page);
  expect(saved.schemaVersion).toBe('0.48.0');
  const tab = saved.screens[0].nodes.find((node: { id: string }) => node.id === 'page_structures');
  expect(tab.props.contentIds).toContain('player_inventory');
  const [region] = nativeRegions(saved.screens[0] as never);
  expect(region).toMatchObject({ persistent: false, pageGroupId: 'inspector_pages', pageIds: ['page_structures'] });
  expect(isNativeRegion(saved.screens[0].nodes.at(-1))).toBe(true);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await read(page)).schemaVersion).toBe('0.47.0');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect.poll(() => read(page)).toEqual(saved);
});

test('design canvas and interaction preview gate the owned region by active Page', async ({ page }) => {
  const doc = await load(page, fixture(true));
  await mkdir('outputs/B1.14', { recursive: true });
  // The region sits at design (8,236); on its owning Page it is painted and hit-testable.
  await page.screenshot({ path: 'outputs/B1.14/RegionOwnedDesignOwnPage.png' });
  await clickGui(page, 8, 236);
  await expect(page.getByLabel('Region kind', { exact: true })).toBeVisible();
  // Switching the design Page hides it: clicking the same point selects nothing there.
  await page.getByRole('button', { name: /^编辑 Other · page_other/ }).click();
  await page.screenshot({ path: 'outputs/B1.14/RegionOwnedDesignOtherPage.png' });
  await clickGui(page, 8, 236);
  await expect(page.getByLabel('Region kind', { exact: true })).toHaveCount(0);
  // Back to the owning Page: the region is hit-testable again, and the document never changed.
  await page.getByRole('button', { name: /^编辑 Structures · page_structures/ }).click();
  await clickGui(page, 8, 236);
  await expect(page.getByLabel('Region kind', { exact: true })).toBeVisible();
  expect(await read(page)).toEqual(doc);

  // Interaction preview: runtime Page switch keeps one session and gates the region.
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await page.screenshot({ path: 'outputs/B1.14/RegionOwnedActivePage.png' });
  await clickGui(page, 52, 24);
  expect(await read(page)).toEqual(doc);
  await page.screenshot({ path: 'outputs/B1.14/RegionOwnedInactivePage.png' });
  await clickGui(page, 8, 236);
  expect(await read(page)).toEqual(doc);
  await clickGui(page, 32, 24);
  await page.screenshot({ path: 'outputs/B1.14/RegionOwnedBackToOwnPage.png' });
  expect(await read(page)).toEqual(doc);
});

function zipFiles(zip: Buffer) {
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    files.set(zip.subarray(offset + 30, offset + 30 + nameLength).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  return files;
}
test('ZIP export carries contentIds ownership, derived nativeRegions and the 1.1.0 contract', async ({ page }) => {
  const doc = await load(page, fixture(true));
  await mkdir('outputs/B1.14', { recursive: true });
  await writeFile('outputs/B1.14/PageOwnedRegion.project.json', JSON.stringify(doc, null, 2));
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) {
    if (blob instanceof Blob && blob.type === 'application/zip') (window as unknown as { __zip: Promise<number[]> }).__zip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
    return original.call(this, blob);
  }; });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  const zip = Buffer.from(await page.evaluate(() => (window as unknown as { __zip: Promise<number[]> }).__zip)), files = zipFiles(zip);
  const manifest = JSON.parse([...files].find(([path]) => path.endsWith('.manifest.json'))![1].toString());
  const authority = files.get(manifest.authority.file)!;
  expect(JSON.parse(authority.toString())).toEqual(doc);
  expect(createHash('sha256').update(authority).digest('hex')).toBe(manifest.authority.sha256);
  const [region] = manifest.screens[0].nativeRegions;
  expect(region).toMatchObject({ nodeId: 'player_inventory', persistent: false, pageGroupId: 'inspector_pages', pageIds: ['page_structures'], slotCount: 36 });
  expect(manifest.screens[0].persistentWidgetIds).not.toContain('player_inventory');
  expect(manifest.nativeRegionContract.version).toBe('1.1.0');
  expect(manifest.nativeRegionContract.pagePolicy).toContain('same Screen/Menu instance');
  const spec = JSON.parse([...files].find(([path]) => path.endsWith('.implementation.json'))![1].toString());
  expect(spec.designIntent.nativeRegionContract.pageGating).toContain('Slot.isActive()');
  expect(spec.designIntent.nativeRegionContract.pageSwitching).toContain('carried');
  expect(spec.implementationRequirements.join(' ')).toContain('Slot.isActive()');
  await writeFile('outputs/B1.14/PageOwnedRegion.zip', zip);
});