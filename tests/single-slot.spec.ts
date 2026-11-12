import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { singleSlotProject } from './fixtures/singleSlotProject';
import { repeatableCardProject } from './fixtures/repeatableCardProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const nodeById = (doc: any, id: string) => doc.screens[0].nodes.find((node: { id: string }) => node.id === id);
const captureZip = (page: Page) => page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) {
  if (blob instanceof Blob && blob.type === 'application/zip') (window as unknown as { __zip: Promise<number[]> }).__zip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
  return original.call(this, blob);
}; return true; });
const readZipFiles = async (page: Page) => {
  const zip = Buffer.from(await page.evaluate(() => (window as unknown as { __zip: Promise<number[]> }).__zip));
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    files.set(zip.subarray(offset + 30, offset + 30 + nameLength).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  const manifest = JSON.parse([...files].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  const spec = JSON.parse([...files].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  return { zip, manifest, spec };
};

test('Q5-D Single Slot fixed geometry, usage, placeholder, drag, undo, reload and export', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q5d.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(singleSlotProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await mkdir('outputs/Q5D', { recursive: true });
  await page.getByTestId('canvas-host').screenshot({ path: 'outputs/Q5D/single-slots.png' });
  await page.getByRole('button', { name: '选择 slot_ghost' }).click();
  await expect(page.getByLabel('Single Slot 使用意图')).toHaveValue('ghost_selection');
  await expect(page.getByLabel('占位物品 ID')).toHaveValue('minecraft:iron_ingot');
  await expect(page.locator('.geometry').getByLabel('W')).toHaveCount(0);
  await expect(page.getByText('固定 18×18 GUI px')).toBeVisible();

  await page.getByLabel('Single Slot 使用意图').selectOption('visual_only');
  expect(nodeById(await read(page), 'slot_ghost').props.usage).toBe('visual_only');

  await page.getByRole('button', { name: '选择 slot_inventory' }).click();
  const host = page.getByTestId('canvas-host');
  const box = (await host.boundingBox())!, originX = Number(await host.getAttribute('data-origin-x')), originY = Number(await host.getAttribute('data-origin-y')), zoom = Number(await host.getAttribute('data-zoom'));
  await page.mouse.move(box.x + originX + 33 * zoom, box.y + originY + 57 * zoom);
  await page.mouse.down();
  await page.mouse.move(box.x + originX + 42 * zoom, box.y + originY + 66 * zoom);
  await page.mouse.up();
  expect(nodeById(await read(page), 'slot_inventory').bounds).toEqual({ x: 33, y: 57, w: 18, h: 18 });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect(nodeById(await read(page), 'slot_inventory').bounds).toEqual({ x: 24, y: 48, w: 18, h: 18 });
  await page.getByRole('button', { name: '重做', exact: true }).click();

  await page.getByRole('button', { name: '添加 Single Slot', exact: true }).click();
  await expect.poll(async () => (await read(page)).screens[0].nodes.filter((node: { type: string }) => node.type === 'minecraft:single_slot').length).toBe(4);
  const added = (await read(page)).screens[0].nodes.at(-1);
  expect(added).toMatchObject({ type: 'minecraft:single_slot', bounds: { w: 18, h: 18 }, props: { usage: 'inventory' } });

  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  expect(nodeById(await read(page), 'slot_ghost').props.usage).toBe('visual_only');
  expect(nodeById(await read(page), 'slot_inventory').bounds).toEqual({ x: 33, y: 57, w: 18, h: 18 });

  await mkdir('outputs/Q5D', { recursive: true });
  await captureZip(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  await download;
  const { zip, manifest, spec } = await readZipFiles(page);
  expect(manifest.singleSlotContract).toMatchObject({ version: '1.0.0', size: { w: 18, h: 18 } });
  expect(manifest.screens[0].singleSlots).toHaveLength(4);
  expect(manifest.screens[0].singleSlots.find((slot: any) => slot.nodeId === 'slot_ghost')).toMatchObject({ usage: 'visual_only', content: { x: 1, y: 1, w: 16, h: 16 } });
  expect(spec.designIntent.screen.singleSlots).toHaveLength(4);
  expect(spec.designIntent.singleSlotContract.rowTemplate).toContain('rejected');
  await writeFile('outputs/Q5D/SingleSlots.project.json', JSON.stringify(await read(page), null, 2));
  await writeFile('outputs/Q5D/SingleSlots.zip', zip);
});

test('Q5-E2 Single Slot added inside a Row Template becomes a non-interactive visual decoration', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q5e-card.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(repeatableCardProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '选择 material_layers' }).click();
  await page.getByTestId('enter-template-edit').click();
  await page.getByRole('button', { name: '添加 Single Slot', exact: true }).click();
  const slots = (await read(page)).screens[0].nodes.filter((node: { type: string; parentContainerId?: string }) => node.type === 'minecraft:single_slot' && node.parentContainerId === 'material_layers');
  expect(slots).toHaveLength(1);
  expect(slots[0].props.usage).toBe('visual_only');
});
