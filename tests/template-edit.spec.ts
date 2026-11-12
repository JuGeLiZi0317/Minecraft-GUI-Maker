import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { repeatableCardProject } from './fixtures/repeatableCardProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const children = (doc: any) => doc.screens[0].nodes.filter((node: { parentContainerId?: string }) => node.parentContainerId === 'material_layers');

test('Q5-B.2-A enters an isolated row-template editor, adds/clamps members, reorders, undoes and restores', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q5b2a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(repeatableCardProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '选择 material_layers' }).click();
  await page.getByTestId('enter-template-edit').click();
  const host = page.getByTestId('canvas-host');
  await expect(host).toHaveAttribute('data-template-editing', 'material_layers');
  await expect(page.getByTestId('inspector-template-banner')).toBeVisible();
  await expect(page.getByTestId('template-tree-focus')).toBeVisible();
  await expect(page.getByRole('button', { name: '选择 outside_button' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '选择 card_name' })).toBeVisible();
  await mkdir('outputs/Q5B2A', { recursive: true });
  await host.screenshot({ path: 'outputs/Q5B2A/card-template-initial.png' });

  // Copy/paste a template member stays inside the same template.
  await page.getByRole('button', { name: '选择 card_number' }).click();
  const beforeCopy = children(await read(page)).length;
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect.poll(async () => children(await read(page)).length).toBe(beforeCopy + 1);
  expect(children(await read(page)).every((node: { parentContainerId?: string }) => node.parentContainerId === 'material_layers')).toBe(true);

  // Drag a member before adding overlapping controls.
  await page.getByRole('button', { name: '选择 card_name' }).click();
  const nameBefore = structuredClone(children(await read(page)).find((node: { id: string }) => node.id === 'card_name'));
  const box = (await host.boundingBox())!, originX = Number(await host.getAttribute('data-origin-x')), originY = Number(await host.getAttribute('data-origin-y')), zoom = Number(await host.getAttribute('data-zoom'));
  await page.mouse.click(box.x + originX + 169 * zoom, box.y + originY + 85 * zoom);
  await page.mouse.move(box.x + originX + 169 * zoom, box.y + originY + 85 * zoom);
  await page.mouse.down();
  await page.mouse.move(box.x + originX + 174 * zoom, box.y + originY + 90 * zoom);
  await page.mouse.up();
  const nameAfter = children(await read(page)).find((node: { id: string }) => node.id === 'card_name');
  expect(nameAfter.bounds).not.toEqual(nameBefore.bounds);
  expect(nameAfter.bounds.x + nameAfter.bounds.w).toBeLessThanOrEqual(109);
  expect(nameAfter.bounds.y + nameAfter.bounds.h).toBeLessThanOrEqual(66);

  await page.getByRole('button', { name: '选择 card_name' }).click();
  await page.getByLabel('控件别名').fill('模板名称');
  await page.getByLabel('控件别名').blur();
  expect(children(await read(page)).find((node: { id: string }) => node.id === 'card_name').alias).toBe('模板名称');

  // Draw order is an authoritative array move and participates in Undo/Redo.
  await page.getByRole('button', { name: '选择 card_number' }).click();
  const beforeOrder = (await read(page)).screens[0].nodes.map((node: { id: string }) => node.id);
  await page.getByRole('button', { name: '绘制更晚', exact: true }).click();
  const laterOrder = (await read(page)).screens[0].nodes.map((node: { id: string }) => node.id);
  expect(laterOrder.indexOf('card_number')).toBeGreaterThan(beforeOrder.indexOf('card_number'));
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await read(page)).screens[0].nodes.map((node: { id: string }) => node.id)).toEqual(beforeOrder);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await read(page)).screens[0].nodes.map((node: { id: string }) => node.id)).toEqual(laterOrder);

  const before = children(await read(page)).length;
  await page.getByRole('button', { name: '添加 StringWidget', exact: true }).click();
  await expect.poll(async () => children(await read(page)).length).toBe(before + 1);
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await expect.poll(async () => children(await read(page)).length).toBe(before + 2);
  const added = children(await read(page));
  expect(added.every((node: { bounds: { w: number; h: number } }) => node.bounds.w <= 109 && node.bounds.h <= 66)).toBe(true);

  // Unsupported template members are rejected with a visible reason.
  await page.getByRole('button', { name: '添加 Player Inventory', exact: true }).click();
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('Row Template 首版只接受');
  expect(children(await read(page)).some((node: { type: string }) => node.type === 'native_region')).toBe(false);

  await mkdir('outputs/Q5B2A', { recursive: true });
  await host.screenshot({ path: 'outputs/Q5B2A/card-template.png' });
  await page.getByRole('button', { name: '退出模板编辑', exact: true }).last().click();
  await expect(host).toHaveAttribute('data-template-editing', '');
  await expect(page.getByRole('button', { name: '选择 outside_button' })).toBeVisible();

  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  const restored = await read(page);
  expect(children(restored)).toHaveLength(before + 2);
  expect(restored.screens[0].nodes.find((node: { id: string }) => node.id === 'card_name').bounds).toEqual(nameAfter.bounds);
  expect(JSON.stringify(restored)).not.toContain('templateEditing');
});

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
  const authority = JSON.parse([...files].find(([name]) => name.endsWith('.json') && !name.endsWith('.manifest.json') && !name.endsWith('.implementation.json') && !name.endsWith('-diagnostics.json'))![1].toString());
  const manifest = JSON.parse([...files].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  const spec = JSON.parse([...files].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  return { zip, files, authority, manifest, spec };
};

test('Q5-B.2-A ZIP preserves exactly one 109×66 template and never expands simulation rows', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q5b2a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(repeatableCardProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await mkdir('outputs/Q5B2A', { recursive: true });
  await captureZip(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  await download;
  const { zip, files, authority, manifest, spec } = await readZipFiles(page);
  const list = authority.screens[0].nodes.find((node: { id: string }) => node.id === 'material_layers');
  expect(list).toMatchObject({ type: 'minecraft:repeatable-list', props: { rowHeight: 66, templateId: 'material_card' } });
  expect(authority.screens[0].nodes.filter((node: { parentContainerId?: string }) => node.parentContainerId === 'material_layers')).toHaveLength(10);
  const exportedList = manifest.screens[0].repeatableLists[0];
  expect(exportedList).toMatchObject({ nodeId: 'material_layers', templateOnly: true, expandedInstances: false, designPreviewRows: 3 });
  expect(exportedList.children).toHaveLength(10);
  expect(spec.repeatableListContract.design.template).toContain('exactly one');
  expect(spec.designIntent.screen.repeatableLists[0]).toMatchObject({ templateOnly: true, expandedInstances: false });
  const design = [...files].find(([name]) => name.endsWith('.png') && !name.endsWith('.reference.png') && !name.endsWith('.background.png'))![1];
  expect(design.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  await writeFile('outputs/Q5B2A/CardTemplate.project.json', JSON.stringify(authority, null, 2));
  await writeFile('outputs/Q5B2A/CardTemplate.zip', zip);
  await writeFile('outputs/Q5B2A/CardTemplateDesign.png', design);
});
