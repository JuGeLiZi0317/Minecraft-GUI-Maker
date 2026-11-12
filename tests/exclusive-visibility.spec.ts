import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { exclusiveVisibilityProject } from './fixtures/exclusiveVisibilityProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
async function load(page: Page) {
  await page.goto('/');
  const doc = exclusiveVisibilityProject();
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'B112.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  return doc;
}
async function clickGui(page: Page, x: number, y: number) {
  const point = await page.getByTestId('canvas-host').evaluate((element, p) => {
    const rect = element.getBoundingClientRect(), data = (element as HTMLElement).dataset;
    return { x: rect.x + Number(data.originX) + p.x * Number(data.zoom), y: rect.y + Number(data.originY) + p.y * Number(data.zoom) };
  }, { x, y });
  await page.mouse.click(point.x, point.y);
}

test('exclusive mapping swaps Inspectors, keeps values and obeys the Page group', async ({ page }) => {
  const doc = await load(page);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const input = (choice: string) => page.getByLabel(`数值输入 input_${choice}`, { exact: true });
  const choose = (choice: string) => page.getByRole('radio', { name: new RegExp(`^${choice} `) }).click();
  // Confirming the already-selected option emits no event, and Page-owned nodes keep their
  // Page default until the first mapping runs; start from a different option.
  for (const [choice, value] of [['temple', '77'], ['end_city', '88'], ['village', '42']]) {
    await choose(choice); await expect(input(choice)).toBeVisible();
    await input(choice).fill(value); await input(choice).press('Enter');
    for (const other of ['village', 'temple', 'end_city'].filter(other => other !== choice)) await expect(input(other)).toBeHidden();
  }
  for (const [choice, value] of [['village', '42'], ['temple', '77'], ['end_city', '88']]) { await choose(choice); await expect(input(choice)).toHaveValue(value); }
  await clickGui(page, 64, 24);
  for (const choice of ['village', 'temple', 'end_city']) await expect(input(choice)).toBeHidden();
  await clickGui(page, 32, 24);
  await expect(input('end_city')).toBeVisible();
  await choose('village'); await expect(input('village')).toBeVisible();
  expect(await read(page)).toEqual(doc);
  await mkdir('outputs/B1.12', { recursive: true });
  await page.screenshot({ path: 'outputs/B1.12/Exclusive.preview.png' });
});

test('Blockly renders, edits and restores the mapping table', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await page.getByLabel('Blockly 规则').selectOption('inspect_exclusive');
  const editor = page.getByTestId('blockly-editor');
  const control = editor.locator('.blocklySvg .blocklyBlockCanvas [data-block-type="gui_exclusive_visible"]');
  await expect(control).toBeVisible();
  await expect(control).toContainText('隐藏全部映射目标');
  await expect(editor.locator('.blocklySvg .blocklyBlockCanvas [data-block-type="gui_exclusive_pair"]')).toHaveCount(3);
  const graph = await page.evaluate(async () => {
    const resource = performance.getEntriesByType('resource').find(entry => /\/blockly_core\.js/.test(entry.name));
    if (!resource) throw new Error('Blockly runtime module missing');
    const module = await import(resource.name), Blockly = module.default ?? module;
    const block = Blockly.getMainWorkspace().getAllBlocks(false).find((item: { type: string }) => item.type === 'gui_exclusive_visible');
    const rows: string[][] = [];
    for (let pair = block.getInputTargetBlock('MAPPING'); pair; pair = pair.getNextBlock()) rows.push([pair.getFieldValue('OPTION'), pair.getFieldValue('TARGET')]);
    return { rows, fallback: block.getFieldValue('FALLBACK') };
  });
  expect(graph.rows).toEqual([['village', 'inspector_village'], ['temple', 'inspector_temple'], ['end_city', 'inspector_end_city']]);
  expect(graph.fallback).toBe('hide-all');
  await page.evaluate(async () => {
    const resource = performance.getEntriesByType('resource').find(entry => /\/blockly_core\.js/.test(entry.name));
    if (!resource) throw new Error('Blockly runtime module missing');
    const module = await import(resource.name), Blockly = module.default ?? module;
    const block = Blockly.getMainWorkspace().getAllBlocks(false).find((item: { type: string }) => item.type === 'gui_exclusive_visible');
    block.setFieldValue('keep-current', 'FALLBACK');
  });
  await editor.getByRole('button', { name: '保存积木规则', exact: true }).click();
  const saved = await read(page);
  expect(saved.screens[0].behaviors[0].actions[0].fallback).toBe('keep-current');
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.screenshot({ path: 'outputs/B1.12/Exclusive.blockly.png' });
  await page.reload();
  await expect.poll(() => read(page)).toEqual(saved);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await page.getByLabel('Blockly 规则').selectOption('inspect_exclusive');
  await expect(control).toContainText('保持现状');
});

function zipFiles(zip: Buffer) {
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    files.set(zip.subarray(offset + 30, offset + 30 + nameLength).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  return files;
}
test('representative ZIP carries the mapping table and contract', async ({ page }) => {
  const doc = await load(page);
  await mkdir('outputs/B1.12', { recursive: true });
  await writeFile('outputs/B1.12/StructuresInspectorExclusive.project.json', JSON.stringify(doc, null, 2));
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) {
    if (blob instanceof Blob && blob.type === 'application/zip') (window as unknown as { __exclusiveZip: Promise<number[]> }).__exclusiveZip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
    return original.call(this, blob);
  }; });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  const zip = Buffer.from(await page.evaluate(() => (window as unknown as { __exclusiveZip: Promise<number[]> }).__exclusiveZip)), files = zipFiles(zip);
  const manifest = JSON.parse([...files].find(([path]) => path.endsWith('.manifest.json'))![1].toString());
  const authority = files.get(manifest.authority.file)!;
  expect(JSON.parse(authority.toString())).toEqual(doc);
  expect(manifest.exclusiveVisibilityContract.version).toBe('1.0.0');
  expect(manifest.screens[0].exclusiveVisibilityMappings).toHaveLength(1);
  expect(manifest.screens[0].exclusiveVisibilityMappings[0].mapping.map((entry: { targetId: string }) => entry.targetId))
    .toEqual(['inspector_village', 'inspector_temple', 'inspector_end_city']);
  const spec = JSON.parse([...files].find(([path]) => path.endsWith('.implementation.json'))![1].toString());
  expect(spec.designIntent.exclusiveVisibilityMappings[0].fallback).toBe('hide-all');
  expect(spec.designIntent.exclusiveVisibilityContract.gating).toContain('Page');
  await writeFile('outputs/B1.12/StructuresInspectorExclusive.zip', zip);
});