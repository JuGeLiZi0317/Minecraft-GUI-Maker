import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { branchControlProject, ifChainProject } from './fixtures/branchControlProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
async function load(page: Page, chain = false) {
  await page.goto('/');
  const doc = chain ? ifChainProject() : branchControlProject();
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'B111.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  return doc;
}
for (const chain of [false, true]) test(`${chain ? 'If chain' : 'Switch'} one rule keeps Inspector inputs and Page session`, async ({ page }) => {
  const doc = await load(page, chain);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const input = (choice: string) => page.getByLabel(`数值输入 input_${choice}`, { exact: true });
  const choose = (choice: string) => page.getByRole('radio', { name: new RegExp(`^${choice} `) }).click();
  for (const [choice, value] of [['village', '42'], ['temple', '77'], ['end_city', '88']]) {
    await choose(choice); await expect(input(choice)).toBeVisible();
    await input(choice).fill(value); await input(choice).press('Enter');
    for (const other of ['village', 'temple', 'end_city'].filter(other => other !== choice)) {
      await expect(input(other)).toBeHidden();
      await input(other).evaluate(element => (element as HTMLInputElement).focus());
      await expect(input(other)).not.toBeFocused();
    }
  }
  for (const [choice, value] of [['village', '42'], ['temple', '77'], ['end_city', '88']]) { await choose(choice); await expect(input(choice)).toHaveValue(value); }
  const clickGui = async (x: number, y: number) => {
    const point = await page.getByTestId('canvas-host').evaluate((element, p) => {
      const rect = element.getBoundingClientRect(), data = (element as HTMLElement).dataset;
      return { x: rect.x + Number(data.originX) + p.x * Number(data.zoom), y: rect.y + Number(data.originY) + p.y * Number(data.zoom) };
    }, { x, y });
    await page.mouse.click(point.x, point.y);
  };
  await clickGui(64, 24);
  for (const choice of ['village', 'temple', 'end_city']) await expect(input(choice)).toBeHidden();
  await choose('village'); await expect(input('village')).toBeHidden();
  await clickGui(32, 24); await expect(input('village')).toHaveValue('42');
  expect(await read(page)).toEqual(doc);
  await mkdir('outputs/B1.11', { recursive: true });
  await page.screenshot({ path: `outputs/B1.11/${chain ? 'IfChain' : 'Switch'}.web.png` });
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload(); await expect.poll(() => read(page)).toEqual(doc);
});

test('Blockly dynamic branch graph saves, undoes and restores through IndexedDB', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await page.getByLabel('Blockly 规则').selectOption('inspect_structure');
  const editor = page.getByTestId('blockly-editor'), blocks = editor.locator('.blocklySvg .blocklyBlockCanvas');
  const control = blocks.locator('[data-block-type="gui_switch"]');
  await expect(control).toBeVisible();
  await expect(control).toContainText('Case 3'); await expect(control).toContainText('Default');
  await control.locator(':scope > .blocklyIconGroup').first().click();
  await expect(editor.locator('.blocklyBubbleCanvas').filter({ hasText: '分支顺序' }).first()).toBeVisible();
  await page.screenshot({ path: 'outputs/B1.11/Switch.blockly.png' });
  await control.locator(':scope > .blocklyIconGroup').first().click();
  const text = blocks.locator('[data-block-type="gui_set_text"]').first();
  await text.locator(':scope > .blocklyField').last().dblclick();
  await page.locator('input.blocklyHtmlInput').fill('Village branch edited');
  await page.locator('input.blocklyHtmlInput').press('Enter');
  await editor.getByRole('button', { name: '保存积木规则', exact: true }).click();
  const saved = await read(page);
  expect(saved.screens[0].behaviors).toHaveLength(1);
  expect(saved.screens[0].behaviors[0].actions[0].cases[0].actions[3].text).toBe('Village branch edited');
  await page.getByRole('button', { name: 'GUI 设计模式', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await read(page)).screens[0].behaviors[0].actions[0].cases[0].actions[3].text).toBe('Selected village');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload();
  await expect.poll(() => read(page)).toEqual(saved);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await page.getByLabel('Blockly 规则').selectOption('inspect_structure');
  await expect(control).toContainText('Case 3'); await expect(control).toContainText('Default');
  await expect(blocks.locator('[data-block-type="gui_set_text"]').first()).toContainText('Village branch edited');
});

test('native mutator adds, undoes, reorders and saves Case/action pairs', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await page.getByLabel('Blockly 规则').selectOption('inspect_structure');
  const editor = page.getByTestId('blockly-editor');
  const control = editor.locator('.blocklySvg .blocklyBlockCanvas [data-block-type="gui_switch"]');
  await control.locator(':scope > .blocklyIconGroup').first().click();
  const mutate = async (operation: 'add' | 'reorder') => page.evaluate(async operation => {
    const resource = performance.getEntriesByType('resource').find(entry => /\/blockly_core\.js/.test(entry.name));
    if (!resource) throw new Error('Blockly runtime module missing');
    const module = await import(resource.name), Blockly = module.default ?? module;
    const workspace = Blockly.getMainWorkspace();
    const block = workspace.getAllBlocks(false).find((block: any) => block.type === 'gui_switch');
    const mutator = block.getIcon(Blockly.icons.MutatorIcon.TYPE).getWorkspace();
    const container = mutator.getAllBlocks(false).find((block: any) => block.type === 'gui_branch_container');
    const first = container.getInputTargetBlock('STACK'), second = first.getNextBlock(), third = second.getNextBlock(), fallback = third.getNextBlock();
    Blockly.Events.setGroup(true);
    if (operation === 'add') {
      const item = mutator.newBlock('gui_branch_item'); item.initSvg(); item.render();
      fallback.previousConnection.disconnect(); third.nextConnection.connect(item.previousConnection); item.nextConnection.connect(fallback.previousConnection);
    } else {
      first.previousConnection.disconnect(); first.nextConnection.disconnect(); second.nextConnection.disconnect(); third.nextConnection.disconnect();
      container.getInput('STACK').connection.connect(second.previousConnection);
      second.nextConnection.connect(first.previousConnection); first.nextConnection.connect(third.previousConnection); third.nextConnection.connect(fallback.previousConnection);
    }
    Blockly.Events.setGroup(false);
  }, operation);
  await mutate('add');
  await expect(control).toContainText('Case 4');
  await control.locator(':scope > .blocklyIconGroup').first().click();
  await expect(editor.getByRole('button', { name: '保存积木规则', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: '撤销积木', exact: true }).click();
  await expect(control).not.toContainText('Case 4');
  await control.locator(':scope > .blocklyIconGroup').first().click();
  await mutate('reorder');
  await control.locator(':scope > .blocklyIconGroup').first().click();
  await expect(editor.getByRole('button', { name: '保存积木规则', exact: true })).toBeEnabled();
  await editor.getByRole('button', { name: '保存积木规则', exact: true }).click();
  const doc = await read(page), action = doc.screens[0].behaviors[0].actions[0];
  expect(action.cases.map((entry: any) => entry.value)).toEqual(['temple', 'village', 'end_city']);
  expect(action.cases[0].actions[3].text).toBe('Selected temple');
});

function zipFiles(zip: Buffer) {
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    files.set(zip.subarray(offset + 30, offset + 30 + nameLength).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  return files;
}
for (const chain of [false, true]) test(`${chain ? 'IfChain' : 'Switch'} representative ZIP has one authority rule and matching contract`, async ({ page }) => {
  const doc = await load(page, chain), name = chain ? 'StructuresInspector_IfChain' : 'StructuresInspector_Switch';
  await mkdir('outputs/B1.11', { recursive: true });
  await writeFile(`outputs/B1.11/${name}.project.json`, JSON.stringify(doc, null, 2));
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) {
    if (blob instanceof Blob && blob.type === 'application/zip') (window as any).__branchZip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
    return original.call(this, blob);
  }; });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  const zip = Buffer.from(await page.evaluate(() => (window as any).__branchZip)), files = zipFiles(zip);
  const manifest = JSON.parse([...files].find(([path]) => path.endsWith('.manifest.json'))![1].toString());
  const authority = files.get(manifest.authority.file)!;
  expect(JSON.parse(authority.toString())).toEqual(doc);
  expect(createHash('sha256').update(authority).digest('hex')).toBe(manifest.authority.sha256);
  expect(manifest.screens).toHaveLength(1);
  const spec = JSON.parse([...files].find(([path]) => path.endsWith('.implementation.json'))![1].toString());
  expect(spec.designIntent.behaviors).toEqual(doc.screens[0].behaviors);
  expect(spec.designIntent.conditionalBehaviorContract.extendedBranches.switch).toContain('exactly once');
  expect(spec.designIntent.conditionalBehaviorContract.extendedBranches.actions).toContain('never emits');
  await writeFile(`outputs/B1.11/${name}.zip`, zip);
});
