import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { repeatableListProject } from './fixtures/repeatableListProject';

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
  const authority = JSON.parse([...files].find(([name]) => name.endsWith('.json') && !name.endsWith('.manifest.json') && !name.endsWith('.implementation.json') && !name.endsWith('-diagnostics.json'))![1].toString());
  const manifest = JSON.parse([...files].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  const spec = JSON.parse([...files].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  return { zip, files, authority, manifest, spec };
};

async function importFixture(page: Page) {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q5b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(repeatableListProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await expect(page.getByTestId('canvas-host')).toBeVisible();
  const host = page.getByTestId('canvas-host'), box = (await host.boundingBox())!, originX = Number(await host.getAttribute('data-origin-x')), originY = Number(await host.getAttribute('data-origin-y')), zoom = Number(await host.getAttribute('data-zoom'));
  await page.mouse.click(box.x + originX + 250 * zoom, box.y + originY + 100 * zoom);
  await expect(page.getByRole('heading', { name: 'Repeatable List' })).toBeVisible();
}

test('Q5-B repeatable list preview rows, scroll, template edit, undo and reload', async ({ page }) => {
  await importFixture(page);
  await mkdir('outputs/Q5B', { recursive: true });
  await page.getByRole('button', { name: '选择 material_layers' }).click();
  await expect(page.getByRole('heading', { name: 'Repeatable List' })).toBeVisible();
  const host = page.getByTestId('canvas-host');
  const rows = async () => JSON.parse((await host.getAttribute('data-repeat-rows'))!);
  expect(await rows()).toEqual({ material_layers: 3 });
  for (const count of [0, 1, 3, 5, 10, 100]) {
    await page.getByRole('button', { name: `${count} 行`, exact: true }).click();
    expect((await rows()).material_layers).toBe(count);
    await host.screenshot({ path: `outputs/Q5B/repeatable-${count}.png` });
  }

  // Ten rows overflow the 162 px viewport. Wheel inside the list changes only the list offset.
  await page.getByRole('button', { name: '10 行', exact: true }).click();
  const box = (await host.boundingBox())!, originX = Number(await host.getAttribute('data-origin-x')), originY = Number(await host.getAttribute('data-origin-y')), zoom = Number(await host.getAttribute('data-zoom'));
  await page.mouse.move(box.x + originX + (100 + 82) * zoom, box.y + originY + (60 + 85) * zoom);
  await page.mouse.wheel(0, 240);
  await expect.poll(async () => JSON.parse((await host.getAttribute('data-scroll-offsets'))!)).toMatchObject({ material_layers: expect.any(Number) });
  const offsets = JSON.parse((await host.getAttribute('data-scroll-offsets'))!);
  expect(offsets.material_layers).toBeGreaterThan(0);

  // Select a template child, edit it, then undo/redo. The alias is editor metadata only.
  await page.getByRole('button', { name: '选择 material_label' }).click();
  const alias = page.getByLabel('控件别名');
  await alias.fill('材料层标签');
  await alias.blur();
  await expect.poll(async () => (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'material_label').alias).toBe('材料层标签');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'material_label').alias).toBeUndefined();
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'material_label').alias).toBe('材料层标签');

  // Template edits are shared by all preview rows: the alias is local metadata, so edit the text instead.
  await page.getByRole('button', { name: '选择 material_label' }).click();
  await page.getByRole('textbox', { name: '标签文字' }).fill('材料层');
  await page.getByRole('textbox', { name: '标签文字' }).blur();
  const edited = await read(page);
  expect(edited.screens[0].nodes.find((node: { id: string }) => node.id === 'material_label').props.text).toEqual({ kind: 'literal', value: '材料层' });
  expect(edited.screens[0].nodes.filter((node: { parentContainerId?: string }) => node.parentContainerId === 'material_layers')).toHaveLength(7);

  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  await expect.poll(async () => (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'material_label').props.text).toEqual({ kind: 'literal', value: '材料层' });
  await page.getByRole('button', { name: '选择 material_layers' }).click();
  await expect(page.getByRole('heading', { name: 'Repeatable List' })).toBeVisible();
  await expect(page.getByRole('button', { name: '3 行', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Q5-B ZIP, reference PNG and Agent Specification share the repeatable list contract', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: '选择 material_layers' }).click();
  await page.getByRole('button', { name: '10 行', exact: true }).click();
  await page.getByRole('button', { name: '选择 material_up' }).click();
  await expect(page.getByTestId('native-text-capability')).toContainText('setFGColor');
  const shadow = page.getByLabel('文字阴影');
  await shadow.click();
  await shadow.click();
  await expect(page.getByTestId('native-text-capability')).toContainText('原版文字恒带阴影');
  await mkdir('outputs/Q5B', { recursive: true });
  await captureZip(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  await download;
  const { zip, files, authority, manifest, spec } = await readZipFiles(page);
  expect(authority.schemaVersion).toBe('0.51.0');
  expect(authority.screens[0].nodes.find((node: { id: string }) => node.id === 'material_layers')).toMatchObject({
    type: 'minecraft:repeatable-list', props: { rowHeight: 34, templateId: 'material_row', dataSource: { mode: 'external', bindingKey: 'generator.material_layers' } },
  });
  expect(manifest.repeatableListContract).toMatchObject({ version: '1.0.0' });
  expect(manifest.nativeTextCapability).toMatchObject({ version: '1.0.0' });
  expect(manifest.nativeTextCapability.diagnostics.some((item: { nodeId: string; code: string }) => item.nodeId === 'material_up' && item.code === 'shadow-always-on')).toBe(true);
  expect(manifest.buttonColorModeContract).toMatchObject({ version: '1.0.0' });
  expect(manifest.buttonColorModeContract.modes.native).toContain('white');
  expect(spec.designIntent.nativeTextCapability.diagnostics.some((item: { nodeId: string }) => item.nodeId === 'material_up')).toBe(true);
  expect(spec.designIntent.buttonColorModeContract).toMatchObject({ version: '1.0.0' });
  const list = manifest.screens[0].repeatableLists[0];
  expect(list).toMatchObject({ nodeId: 'material_layers', rowHeight: 34, designPreviewRows: 3, templateId: 'material_row', templateOnly: true, expandedInstances: false });
  expect(list.children.map((child: { nodeId: string }) => child.nodeId)).toContain('material_block');
  expect(spec.repeatableListContract).toMatchObject({ version: '1.0.0' });
  expect(spec.designIntent.screen.repeatableLists[0].nodeId).toBe('material_layers');
  expect(spec.implementationRequirements.join('\n')).toContain('never use the visible row index as business identity');
  const design = [...files].find(([name]) => name.endsWith('.png') && !name.endsWith('.reference.png') && !name.endsWith('.background.png'))![1];
  const reference = [...files].find(([name]) => name.endsWith('.reference.png'))![1];
  expect(design.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(reference.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  await writeFile('outputs/Q5B/RepeatableList.project.json', JSON.stringify(authority, null, 2));
  await writeFile('outputs/Q5B/RepeatableList.zip', zip);
  await writeFile('outputs/Q5B/RepeatableListDesign.png', design);
  await writeFile('outputs/Q5B/RepeatableListReference.png', reference);
});
