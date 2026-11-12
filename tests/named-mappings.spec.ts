import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { namedMappingProject, STRUCTURE_TITLE_KEYS } from './fixtures/namedMappingProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
async function load(page: Page, doc = namedMappingProject()) {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'B113.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  return doc;
}
const choose = (page: Page, choice: string) => page.getByRole('radio', { name: new RegExp(`^${choice} `) }).click();

test('lookup drives the Inspector title with exclusive visibility and no extra events', async ({ page }) => {
  const doc = await load(page);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const input = (choice: string) => page.getByLabel(`数值输入 input_${choice}`, { exact: true });
  for (const choice of ['temple', 'end_city', 'village']) {
    await choose(page, choice); await expect(input(choice)).toBeVisible();
    for (const other of ['temple', 'end_city', 'village'].filter(item => item !== choice)) await expect(input(other)).toBeHidden();
  }
  expect(await read(page)).toEqual(doc);
  await mkdir('outputs/B1.13', { recursive: true });
  await page.screenshot({ path: 'outputs/B1.13/Lookup.preview.png' });
});

test('Blockly shows the Lookup graph and restores it after reload', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await page.getByLabel('Blockly 规则').selectOption('inspect_structure');
  const editor = page.getByTestId('blockly-editor');
  const lookup = editor.locator('.blocklySvg .blocklyBlockCanvas [data-block-type="gui_lookup"]');
  await expect(lookup).toBeVisible();
  await expect(lookup).toContainText('StructureTitle');
  const mapping = await page.evaluate(async () => {
    const resource = performance.getEntriesByType('resource').find(entry => /\/blockly_core\.js/.test(entry.name));
    const module = await import(resource!.name), Blockly = module.default ?? module;
    const block = Blockly.getMainWorkspace().getAllBlocks(false).find((item: { type: string }) => item.type === 'gui_lookup');
    return { mapping: block.getFieldValue('MAPPING'), input: block.getInputTargetBlock('INPUT')?.type, check: block.outputConnection?.getCheck() };
  });
  expect(mapping).toEqual({ mapping: 'mapping_structure_title', input: 'gui_read_control', check: ['Text'] });
  await mkdir('outputs/B1.13', { recursive: true });
  await page.screenshot({ path: 'outputs/B1.13/Lookup.blockly.png' });
  await page.reload();
  await expect.poll(() => read(page)).toEqual(namedMappingProject());
});

test('named mapping CRUD persists through IndexedDB and drives the next trigger', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  const editor = page.getByTestId('blockly-editor');
  const panel = editor.getByTestId('blockly-text-mappings');
  await expect(panel).toContainText('StructureTitle');
  await expect(panel).toContainText('1 个引用');
  await panel.getByRole('button', { name: '编辑', exact: true }).first().click();
  const form = editor.getByTestId('blockly-text-map-editor');
  await expect(form).toBeVisible();
  await form.getByLabel('命名映射文本类型 2').selectOption('literal');
  await form.getByLabel('命名映射文本 2').fill('Temple Revised');
  await form.getByRole('button', { name: '保存命名映射' }).click();
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  const saved = await read(page);
  expect(saved.screens[0].textMappings[0].entries[1].value).toEqual({ kind: 'literal', value: 'Temple Revised' });
  await page.reload(); await expect.poll(() => read(page)).toEqual(saved);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await choose(page, 'temple');
  await expect(page.getByLabel('数值输入 input_temple', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await expect(page.getByTestId('blockly-editor').getByTestId('blockly-text-mappings')).toContainText('Temple Revised');
});

function zipFiles(zip: Buffer) {
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    files.set(zip.subarray(offset + 30, offset + 30 + nameLength).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  return files;
}
test('representative ZIP keeps authority, hashes and the mapping contract consistent', async ({ page }) => {
  const doc = await load(page);
  await mkdir('outputs/B1.13', { recursive: true });
  await writeFile('outputs/B1.13/StructuresInspectorTitles.project.json', JSON.stringify(doc, null, 2));
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
  const definition = manifest.screens[0].textMappings[0].definitions[0];
  expect(definition.id).toBe('mapping_structure_title');
  expect(definition.entryDisplay.map((entry: { translationKey: string }) => entry.translationKey)).toEqual(Object.values(STRUCTURE_TITLE_KEYS));
  expect(definition.references).toHaveLength(1);
  expect(manifest.textMappingContract.version).toBe('1.0.0');
  const spec = JSON.parse([...files].find(([path]) => path.endsWith('.implementation.json'))![1].toString());
  expect(spec.designIntent.textMappings[0].lookups[0].mappingId).toBe('mapping_structure_title');
  expect(spec.designIntent.textMappingContract.text).toContain('never displayed as a raw key');
  await writeFile('outputs/B1.13/StructuresInspectorTitles.zip', zip);
});