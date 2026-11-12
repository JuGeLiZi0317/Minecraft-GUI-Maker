import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { repeatableVisualSlotProject } from './fixtures/repeatableVisualSlotProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
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

test('Q5-E2 visual-only Single Slot repeats in Row Template; inventory/ghost remain rejected', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q5e2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(repeatableVisualSlotProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await mkdir('outputs/Q5E', { recursive: true });
  await page.getByRole('button', { name: '选择 material_layers' }).click();
  await page.getByTestId('enter-template-edit').click();
  await page.getByRole('button', { name: '选择 row_slot_visual' }).click();
  await expect(page.getByLabel('Single Slot 使用意图')).toHaveValue('visual_only');
  await page.getByLabel('Single Slot 使用意图').selectOption('inventory');
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('真实 Menu Slot');
  expect((await read(page)).screens[0].nodes.find((node: any) => node.id === 'row_slot_visual').props.usage).toBe('visual_only');

  await page.getByRole('button', { name: '添加 Single Slot', exact: true }).click();
  const nodes = (await read(page)).screens[0].nodes;
  const added = nodes.at(-1);
  expect(added).toMatchObject({ type: 'minecraft:single_slot', parentContainerId: 'material_layers', props: { usage: 'visual_only' } });
  expect(nodes.filter((node: any) => node.type === 'minecraft:single_slot').length).toBe(2);

  await page.getByTestId('canvas-host').screenshot({ path: 'outputs/Q5E/repeated-visual-slots.png' });
  await page.getByTestId('template-edit-banner').getByRole('button', { name: '退出模板编辑' }).click();
  await page.getByTestId('canvas-host').screenshot({ path: 'outputs/Q5E/repeated-visual-slots-preview.png' });
  await captureZip(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  await download;
  const { zip, manifest, spec } = await readZipFiles(page);
  const list = manifest.screens[0].repeatableLists[0];
  expect(list.templateOnly).toBe(true);
  expect(list.expandedInstances).toBe(false);
  expect(list.children.filter((child: any) => child.type === 'minecraft:single_slot')).toHaveLength(2);
  expect(manifest.screens[0].singleSlots.filter((slot: any) => slot.parentContainerId === 'material_layers')).toHaveLength(2);
  expect(manifest.screens[0].singleSlots.filter((slot: any) => slot.parentContainerId === 'material_layers').every((slot: any) => slot.usage === 'visual_only')).toBe(true);
  expect(spec.designIntent.singleSlotContract.rowTemplate).toContain('rejected');
  await writeFile('outputs/Q5E/RepeatedVisualSlots.zip', zip);
});
