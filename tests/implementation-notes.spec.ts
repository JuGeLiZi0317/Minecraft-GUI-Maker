import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { repeatableCardProject } from './fixtures/repeatableCardProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const children = (doc: any) => doc.screens[0].nodes.filter((node: { parentContainerId?: string }) => node.parentContainerId === 'material_layers');
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
  const prompt = [...files].find(([name]) => name.endsWith('.prompt.md'))![1].toString();
  return { zip, files, authority, manifest, spec, prompt };
};

test('Q5-C notes are editable, copied, undoable, persistent and exported with stable identities', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q5c.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(repeatableCardProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  expect(JSON.stringify(await read(page))).not.toContain('implementationNotes');

  // Screen note exists only when no node is selected.
  await page.getByTestId('screen-implementation-notes').locator('summary').click();
  await page.getByLabel('实现备注').fill('右侧选项来自当前世界的 Biome Registry；左侧初始为空；以完整注册 ID 去重；关闭后重新打开重置。');
  await page.getByLabel('实现备注').blur();
  await expect.poll(async () => (await read(page)).screens[0].implementationNotes).toContain('Biome Registry');

  await page.getByRole('button', { name: '选择 material_layers' }).click();
  await page.getByTestId('node-implementation-notes').locator('summary').click();
  await page.getByLabel('实现备注').fill('整个材料列表的数据源与生命周期说明。');
  await page.getByLabel('实现备注').blur();
  await expect.poll(async () => (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'material_layers').implementationNotes).toContain('数据源');

  await page.getByRole('button', { name: '选择 card_toggle' }).click();
  await page.getByTestId('node-implementation-notes').locator('summary').click();
  const toggleNote = '模式 1 启用两数值框；模式 2 禁用两数值框并保留内容。\nSpecial <tag> & "quote"';
  await page.getByLabel('实现备注').fill(toggleNote);
  await page.getByLabel('实现备注').blur();
  await expect.poll(async () => (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'card_toggle').implementationNotes).toBe(toggleNote);

  await page.getByLabel('控件别名').fill('toggle_mode');
  await page.getByLabel('控件别名').blur();
  expect((await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'card_toggle').implementationNotes).toBe(toggleNote);

  // Copy/paste keeps the note on the new stable node ID.
  const beforeIds = new Set(children(await read(page)).map((node: { id: string }) => node.id));
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  const copied = children(await read(page)).find((node: { id: string }) => !beforeIds.has(node.id));
  expect(copied?.implementationNotes).toBe(toggleNote);

  // Undo the paste and redo it.
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect(children(await read(page)).some((node: { id: string }) => !beforeIds.has(node.id))).toBe(false);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect(children(await read(page)).some((node: { id: string }) => !beforeIds.has(node.id))).toBe(true);

  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  const restored = await read(page);
  expect(restored.screens[0].implementationNotes).toContain('Biome Registry');
  expect(restored.screens[0].nodes.find((node: { id: string }) => node.id === 'card_toggle')).toMatchObject({ alias: 'toggle_mode', implementationNotes: toggleNote });

  await mkdir('outputs/Q5C', { recursive: true });
  await captureZip(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  await download;
  const { zip, authority, manifest, spec, prompt } = await readZipFiles(page);
  expect(authority.screens[0].implementationNotes).toContain('Biome Registry');
  expect(manifest.screens[0].implementationNotes).toMatchObject({ screenId: 'screen_main' });
  expect(manifest.screens[0].implementationNotes.nodes.some((node: { nodeId: string; note: string }) => node.nodeId === 'card_toggle' && node.note === toggleNote)).toBe(true);
  expect(spec.designIntent.implementationNotes[0].screenId).toBe('screen_main');
  expect(spec.designIntent.screens[0].nodes.find((node: { nodeId: string }) => node.nodeId === 'card_toggle').implementationNotes).toBe(toggleNote);
  expect(prompt).toContain('Widget: toggle_mode (card_toggle)');
  expect(prompt).toContain(toggleNote);
  await writeFile('outputs/Q5C/ImplementationNotes.project.json', JSON.stringify(authority, null, 2));
  await writeFile('outputs/Q5C/ImplementationNotes.zip', zip);
});
