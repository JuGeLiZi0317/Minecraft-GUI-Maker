import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { structuresInspectorProject } from './fixtures/structuresInspectorProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
async function load(page: Page, dropdown = false) {
  await page.goto('/');
  const doc = structuresInspectorProject(dropdown ? 'minecraft:dropdown' : 'minecraft:radio-group');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'StructuresInspector.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  return doc;
}
async function choose(page: Page, choice: string, dropdown = false) {
  if (dropdown) {
    await page.locator('[aria-controls="choices-structure_selector"]').click();
    await page.locator(`[data-choice-option="${choice}"]`).click();
  } else await page.getByRole('radio', { name: new RegExp(`^${choice} `) }).click();
}
async function clickGui(page: Page, x: number, y: number) {
  const point = await page.getByTestId('canvas-host').evaluate((element, p) => {
    const r = element.getBoundingClientRect(), d = (element as HTMLElement).dataset;
    return { x: r.x + Number(d.originX) + p.x * Number(d.zoom), y: r.y + Number(d.originY) + p.y * Number(d.zoom) };
  }, { x, y });
  await page.mouse.click(point.x, point.y);
  return point;
}
async function summaryPixels(page: Page) {
  return page.getByTestId('canvas-host').evaluate(element => {
    const canvas = element.querySelector('canvas')!, d = (element as HTMLElement).dataset;
    const scale = Number(d.zoom) * devicePixelRatio;
    const x = Math.round((Number(d.originX) + 184 * Number(d.zoom)) * devicePixelRatio);
    const y = Math.round((Number(d.originY) + 48 * Number(d.zoom)) * devicePixelRatio);
    return Array.from(canvas.getContext('2d')!.getImageData(x, y, Math.round(200 * scale), Math.round(20 * scale)).data);
  });
}
function zipFiles(zip: Buffer) {
  const result = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    result.set(zip.subarray(offset + 30, offset + 30 + nameLength).toString(), zip.subarray(start, start + size));
    offset = start + size;
  }
  return result;
}

for (const dropdown of [false, true]) test(`D1 ${dropdown ? 'Dropdown' : 'Radio'} keeps group inputs across selection and same-Screen Page changes`, async ({ page }) => {
  const doc = await load(page, dropdown), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const input = (choice: string) => page.getByLabel(`数值输入 input_${choice}`, { exact: true });
  await expect(input('village')).toBeVisible();
  const initialText = await summaryPixels(page);
  await expect(input('temple')).toBeHidden(); await expect(input('end_city')).toBeHidden();
  for (const [choice, value] of [['village', '42'], ['temple', '77'], ['end_city', '88']]) {
    if (choice !== 'village') await choose(page, choice, dropdown);
    await expect(input(choice)).toBeVisible();
    await input(choice).fill(value); await input(choice).press('Enter');
  }
  await clickGui(page, 410, 230);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => JSON.parse((await page.getByTestId('canvas-host').getAttribute('data-scroll-offsets'))!).inspector_end_city).toBe(24);
  expect(await summaryPixels(page)).not.toEqual(initialText);
  for (const [choice, value] of [['village', '42'], ['temple', '77'], ['end_city', '88']]) {
    await choose(page, choice, dropdown);
    await expect(input(choice)).toHaveValue(value);
    for (const other of ['village', 'temple', 'end_city'].filter(other => other !== choice)) {
      await expect(input(other)).toBeHidden();
      await input(other).evaluate(element => (element as HTMLInputElement).focus());
      await expect(input(other)).not.toBeFocused();
    }
  }
  await input('end_city').focus();
  await clickGui(page, 64, 24);
  for (const choice of ['village', 'temple', 'end_city']) await expect(input(choice)).toBeHidden();
  await clickGui(page, 410, 230);
  await page.mouse.wheel(0, 100);
  expect(JSON.parse((await page.getByTestId('canvas-host').getAttribute('data-scroll-offsets'))!).inspector_end_city).toBe(24);
  await expect(input('end_city')).not.toBeFocused();
  await choose(page, 'village', dropdown);
  await expect(input('village')).toBeHidden();
  await clickGui(page, 32, 24);
  await expect(input('village')).toHaveValue('42');
  await expect(input('village')).toBeVisible();
  expect(await summaryPixels(page)).toEqual(initialText);
  expect(await read(page)).toEqual(doc);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  await expect.poll(() => read(page)).toEqual(doc);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(input('village')).toHaveValue('10');
  await expect(input('temple')).toBeHidden();
});

test('D1/D2 real Blockly edit, Undo/Redo and IndexedDB restore use the saved F2 rule', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await page.getByLabel('Blockly 规则').selectOption('show_village');
  const editor = page.getByTestId('blockly-editor'), blocks = editor.locator('.blocklySvg .blocklyBlockCanvas');
  await expect(blocks.locator('[data-block-type="gui_set_visible"]').first()).toBeVisible();
  const text = blocks.locator('[data-block-type="gui_set_text"]');
  await text.locator(':scope > .blocklyField').last().dblclick();
  await page.locator('input.blocklyHtmlInput').fill('Village properties');
  await page.locator('input.blocklyHtmlInput').press('Enter');
  await editor.getByRole('button', { name: '保存积木规则', exact: true }).click();
  await expect(page.getByTestId('blockly-diagnostic')).toContainText('与项目一致');
  const saved = await read(page);
  expect(saved.screens[0].behaviors[0].actions[0].thenActions[1].text).toBe('Village properties');
  await page.getByRole('button', { name: 'GUI 设计模式', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await read(page)).screens[0].behaviors[0].actions[0].thenActions[1].text).toBe('Selected village');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  await expect.poll(() => read(page)).toEqual(saved);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await page.getByLabel('Blockly 规则').selectOption('show_village');
  await expect(blocks.locator('[data-block-type="gui_set_text"]').first()).toContainText('Village properties');
});

test('D1/D2 ZIP carries authoritative rules and game contract; writes the representative demo', async ({ page }) => {
  const doc = await load(page);
  await mkdir('outputs/Q3-D', { recursive: true });
  await writeFile('outputs/Q3-D/StructuresInspector.project.json', JSON.stringify(doc, null, 2));
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) {
    if (blob instanceof Blob && blob.type === 'application/zip') (window as any).__inspectorZip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
    return original.call(this, blob);
  }; });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  const zip = Buffer.from(await page.evaluate(() => (window as any).__inspectorZip));
  const files = zipFiles(zip), manifest = JSON.parse([...files].find(([path]) => path.endsWith('.manifest.json'))![1].toString());
  const authorityBytes = files.get(manifest.authority.file)!;
  const authority = JSON.parse(authorityBytes.toString());
  expect(authority).toEqual(doc);
  expect(createHash('sha256').update(authorityBytes).digest('hex')).toBe(manifest.authority.sha256);
  expect(manifest.genericBehaviorContract.inspectorBinding.assignmentEvents).toContain('never emit');
  const initialPixel = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0); bitmap.close();
    return Array.from(context.getImageData(420, 240, 1, 1).data);
  }, [...files.get(manifest.screens[0].designImage.name)!]);
  expect(initialPixel).toEqual([32, 48, 64, 255]);
  const spec = JSON.parse([...files].find(([path]) => path.endsWith('.implementation.json'))![1].toString());
  expect(spec.designIntent.behaviors).toEqual(doc.screens[0].behaviors);
  expect(spec.designIntent.genericBehaviorContract.inspectorBinding.assignmentEvents).toContain('never emit');
  await writeFile('outputs/Q3-D/StructuresInspector.zip', zip);
  await page.getByRole('button', { name: '关闭导出结果', exact: true }).click();
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await choose(page, 'temple');
  await page.screenshot({ path: 'outputs/Q3-D/StructuresInspector.web.png' });
});
