import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { structuresInspectorProject } from './fixtures/structuresInspectorProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const apply = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const rename = async (page: Page, index: number, id: string) => {
  const field = page.getByLabel(`选项 ID ${index}`, { exact: true });
  await field.fill(id); await field.press('Enter');
};
const setText = async (page: Page, label: string, value: string) => {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value); await field.press('Enter');
};
const makeTranslatable = async (page: Page, label: string, key: string, fallback: string) => {
  await page.getByLabel(`${label}类型`, { exact: true }).selectOption('translate');
  await setText(page, `${label}翻译键`, key);
  await setText(page, `${label}预览文字`, fallback);
};
const point = (page: Page, x: number, y: number) => page.getByTestId('canvas-host').evaluate((host, pos) => {
  const rect = host.getBoundingClientRect(), data = (host as HTMLElement).dataset, zoom = Number(data.zoom);
  return { x: rect.left + Number(data.originX) + pos.x * zoom, y: rect.top + Number(data.originY) + pos.y * zoom };
}, { x, y });
const canvasShot = async (page: Page) => (await page.getByTestId('canvas-host').screenshot()).toString('base64');

test('CycleButton three localized options are fully editable without JSON, cycle in preview, and survive undo/reload/ZIP', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: '添加 CycleButton', exact: true }).click();
  const node = (await read(page)).screens[0].nodes[0];
  expect(node.props.options).toHaveLength(2);

  await rename(page, 1, 'always_day'); await rename(page, 2, 'always_night');
  await makeTranslatable(page, '选项文字 1', 'gui.customdim.time.always_day', '永昼');
  await makeTranslatable(page, '选项文字 2', 'gui.customdim.time.always_night', '永夜');
  await page.getByRole('button', { name: '新增选项', exact: true }).click();
  await rename(page, 3, 'normal');
  await makeTranslatable(page, '选项文字 3', 'gui.customdim.time.normal', '昼夜循环');
  await page.getByLabel('初始选项', { exact: true }).selectOption('always_day');
  await apply(page, '应用循环按钮选项');

  const saved = await read(page);
  const options = saved.screens[0].nodes[0].props.options;
  expect(options.map((option: { id: string }) => option.id)).toEqual(['always_day', 'always_night', 'normal']);
  expect(options.map((option: { text: { kind: string; key?: string } }) => option.text)).toEqual([
    { kind: 'translate', key: 'gui.customdim.time.always_day', fallback: '永昼' },
    { kind: 'translate', key: 'gui.customdim.time.always_night', fallback: '永夜' },
    { kind: 'translate', key: 'gui.customdim.time.normal', fallback: '昼夜循环' },
  ]);
  expect(saved.screens[0].nodes[0].props.initialOptionId).toBe('always_day');
  expect(saved.screens[0].nodes[0].props.options).toHaveLength(3);

  // Undo removes the third option; redo restores the applied document.
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await read(page)).screens[0].nodes[0].props.options).toHaveLength(2);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect(await read(page)).toEqual(saved);

  // Reload keeps every option and translation key.
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  await expect.poll(() => read(page)).toEqual(saved);

  // Interaction preview cycles through the three options and returns to the initial image after a full period.
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const bounds = (await read(page)).screens[0].nodes[0].bounds as { x: number; y: number; w: number; h: number };
  const center = await point(page, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
  await page.mouse.click(center.x, center.y);
  const first = await canvasShot(page);
  await page.mouse.click(center.x, center.y);
  const second = await canvasShot(page);
  await page.mouse.click(center.x, center.y);
  const third = await canvasShot(page);
  expect(new Set([first, second, third]).size).toBe(3);
  await page.mouse.click(center.x, center.y);
  expect(await canvasShot(page)).toBe(first);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();

  // ZIP keeps option IDs and TextSpec; the spec states the localization contract.
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) {
    if (blob instanceof Blob && blob.type === 'application/zip') (window as unknown as { __zip: Promise<number[]> }).__zip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
    return original.call(this, blob);
  }; });
  await mkdir('outputs/Q4', { recursive: true });
  await writeFile('outputs/Q4/CycleTimeMode.project.json', JSON.stringify(saved, null, 2));
  const download = page.waitForEvent('download'); await apply(page, '一键导出 ZIP'); await download;
  const zip = Buffer.from(await page.evaluate(() => (window as unknown as { __zip: Promise<number[]> }).__zip));
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    files.set(zip.subarray(offset + 30, offset + 30 + nameLength).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  const authority = JSON.parse([...files].find(([name]) => name.endsWith('.json') && !name.endsWith('.manifest.json') && !name.endsWith('.implementation.json') && !name.endsWith('-diagnostics.json'))![1].toString());
  expect(authority.screens[0].nodes[0].props.options.map((option: { id: string }) => option.id)).toEqual(['always_day', 'always_night', 'normal']);
  const spec = JSON.parse([...files].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  expect(spec.implementationRequirements.join(' ')).toContain('Literal or Translatable TextSpec');
  await page.screenshot({ path: 'outputs/Q4/CycleTimeMode.preview.png' });
  await writeFile('outputs/Q4/CycleTimeMode.zip', zip);
});

test('Dropdown options accept independent translation keys', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: '添加 Dropdown', exact: true }).click();
  await expect(page.getByLabel('选项 ID 1', { exact: true })).toHaveValue('option_1');
  await rename(page, 1, 'day'); await rename(page, 2, 'night');
  await makeTranslatable(page, '选项名称 1', 'gui.customdim.day', '白天');
  await makeTranslatable(page, '选项名称 2', 'gui.customdim.night', '夜晚');
  await page.getByRole('button', { name: '删除选项 3', exact: true }).click();
  await page.getByLabel('初始选择', { exact: true }).selectOption('night');
  await apply(page, '应用选择选项');
  const dropdown = (await read(page)).screens[0].nodes[0];
  expect(dropdown.props.options.map((option: { id: string }) => option.id)).toEqual(['day', 'night']);
  expect(dropdown.props.options[0]).toMatchObject({ id: 'day', label: { kind: 'translate', key: 'gui.customdim.day', fallback: '白天' } });
  expect(dropdown.props.initialSelectedOptionId).toBe('night');
  // Preview: the translated fallback is the visible label and the selection stays session-only.
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await page.getByRole('button', { name: 'Choice: 夜晚', exact: true }).click();
  await expect(page.getByRole('option', { name: '白天 (1/2)', exact: true })).toBeVisible();
  const before = await read(page);
  await page.getByRole('option', { name: '白天 (1/2)', exact: true }).click();
  expect(await read(page)).toEqual(before);
  await expect(page.getByTestId('selection-preview-events')).toHaveAttribute('data-events', /"optionId":"day"/);
});

test('Radio Group options accept independent translation keys', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: '添加 Radio Group', exact: true }).click();
  await expect(page.getByLabel('选项 ID 1', { exact: true })).toHaveValue('option_1');
  await rename(page, 1, 'always_day'); await rename(page, 2, 'always_night');
  await makeTranslatable(page, '选项名称 1', 'gui.customdim.time.always_day', '永昼');
  await makeTranslatable(page, '选项名称 2', 'gui.customdim.time.always_night', '永夜');
  await page.getByRole('button', { name: '删除选项 3', exact: true }).click();
  await page.getByLabel('初始选择', { exact: true }).selectOption('always_day');
  await apply(page, '应用选择选项');
  const radio = (await read(page)).screens[0].nodes[0];
  expect(radio.props.options.map((option: { id: string }) => option.id)).toEqual(['always_day', 'always_night']);
  expect(radio.props.options[1].label).toMatchObject({ kind: 'translate', key: 'gui.customdim.time.always_night' });
  // Interaction preview: clicking the second option changes only the session.
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect.poll(async () => page.getByRole('radio', { name: /^永夜/ }).count()).toBeGreaterThan(0);
  const before = await read(page);
  await page.getByRole('radio', { name: /^永夜/ }).click();
  expect(await read(page)).toEqual(before);
});

test('an option referenced by a rule cannot be renamed or deleted, while unreferenced options stay editable', async ({ page }) => {
  const doc = structuresInspectorProject();
  doc.schemaVersion = '0.48.0';
  const screen = doc.screens[0];
  screen.behaviors = [{
    id: 'title_by_option', event: { type: 'selection-change', sourceId: 'structure_selector' },
    eventBindings: [{ type: 'selection-change', sourceId: 'structure_selector', payloadType: 'OptionId' }],
    actions: [{ type: 'if', condition: { type: 'compare', valueType: 'OptionId', operator: 'equals', left: { type: 'read-control-value', nodeId: 'structure_selector' }, right: { type: 'constant', value: 'temple' } }, thenActions: [{ type: 'set-text', targetId: 'selection_summary', text: 'Temple' }], elseActions: [] }],
  }] as never;
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q4.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '选择 structure_selector', exact: true }).click();
  await expect(page.getByText(/被引用：title_by_option/)).toBeVisible();
  await expect(page.getByRole('button', { name: '删除选项 2', exact: true })).toBeDisabled();
  const field = page.getByLabel('选项 ID 2', { exact: true });
  await field.fill('evening'); await field.press('Enter');
  await expect(page.getByText(/已被规则引用，不能改 ID/)).toBeVisible();
  // Another option is free to rename.
  await rename(page, 3, 'city');
  await expect(page.getByLabel('选项 ID 3', { exact: true })).toHaveValue('city');
});