import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { structuresInspectorProject } from './fixtures/structuresInspectorProject';
import { createNode } from '../src/domain/model';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const renameTreeItem = async (page: Page, from: string, to: string) => {
  await openTreeItem(page, from);
  const field = page.getByLabel(`树项 ID ${from}`, { exact: true });
  await field.fill(to); await field.press('Enter');
  await expect(page.locator(`[data-testid="tree-item"][data-item-id="${to}"]`)).toBeVisible();
};
const openTreeItem = async (page: Page, id: string) => {
  const row = page.locator(`[data-testid="tree-item"][data-item-id="${id}"]`);
  if (!(await row.evaluate(element => (element as HTMLDetailsElement).open))) await row.locator('summary').click();
};
const setTreeLabel = async (page: Page, id: string, value: string) => {
  await openTreeItem(page, id);
  const field = page.getByLabel(`显示名称 ${id}`, { exact: true });
  await field.fill(value); await field.press('Enter');
};
const addTreeItem = async (page: Page, parent: string, id: string, label: string) => {
  await page.getByLabel('新树项父项').selectOption(parent);
  await page.getByLabel('新树项 ID').fill(id);
  await page.getByLabel('新树项名称').fill(label);
  await page.getByRole('button', { name: '新增树项', exact: true }).click();
  await expect(page.locator(`[data-testid="tree-item"][data-item-id="${id}"]`)).toBeVisible();
};
const openStatus = async (page: Page, statusId: string) => {
  await page.locator(`[data-testid="status-row"][data-status-id="${statusId}"] > summary`).click();
};
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
  const spec = JSON.parse([...files].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  return { zip, authority, spec };
};

test('Tree View item IDs and localized labels are editable, remap internal references, and survive undo/reload/ZIP', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: '添加 Tree View', exact: true }).click();

  await renameTreeItem(page, 'item_root', 'world');
  await renameTreeItem(page, 'item_branch', 'terrain');
  await renameTreeItem(page, 'item_leaf_a', 'plains');
  await renameTreeItem(page, 'item_leaf_b', 'mountains');
  await renameTreeItem(page, 'item_other', 'structures');
  // Structures is a second root by default; the acceptance tree makes it a child of World.
  await page.locator('[data-testid="tree-item"][data-item-id="structures"] > summary').click();
  await page.getByLabel('structures 父项', { exact: true }).selectOption('world');

  // The add form accepts a readable stable ID; children are ordered after existing siblings.
  await page.locator('.tree-add > summary').click();
  await addTreeItem(page, 'structures', 'village', 'Village');
  await addTreeItem(page, 'structures', 'temple', 'Temple');
  await setTreeLabel(page, 'world', 'World');
  await setTreeLabel(page, 'terrain', 'Terrain');
  await setTreeLabel(page, 'mountains', 'Mountains');
  await setTreeLabel(page, 'structures', 'Structures');
  await page.getByLabel('structures 初始展开', { exact: true }).check();

  // Labels are TextSpec: Plains becomes a Translation Key while the ID stays stable.
  await openTreeItem(page, 'plains');
  await page.getByLabel('显示名称 plains类型', { exact: true }).selectOption('translate');
  await page.getByLabel('显示名称 plains翻译键', { exact: true }).fill('gui.customdim.biome.plains');
  await page.getByLabel('显示名称 plains翻译键', { exact: true }).press('Enter');
  await page.getByLabel('显示名称 plains预览文字', { exact: true }).fill('Plains');
  await page.getByLabel('显示名称 plains预览文字', { exact: true }).press('Enter');

  const saved = await read(page), tree = saved.screens[0].nodes[0].props;
  const byId = Object.fromEntries(tree.items.map((item: { id: string }) => [item.id, item]));
  expect(Object.keys(byId).sort()).toEqual(['mountains', 'plains', 'structures', 'temple', 'terrain', 'village', 'world']);
  expect(byId.terrain.parentId).toBe('world');
  expect(byId.plains.parentId).toBe('terrain');
  expect(byId.mountains.parentId).toBe('terrain');
  expect(byId.structures.parentId).toBe('world');
  expect(byId.village.parentId).toBe('structures');
  expect(byId.temple.parentId).toBe('structures');
  expect([byId.village.order, byId.temple.order]).toEqual([0, 1]);
  expect(tree.initialSelectedItemId).toBe('plains');
  expect(tree.initialExpandedIds.slice().sort()).toEqual(['structures', 'terrain', 'world']);
  expect(byId.plains.label).toEqual({ kind: 'translate', key: 'gui.customdim.biome.plains', fallback: 'Plains' });

  for (let index = 0; index < 3; index++) await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await read(page)).screens[0].nodes[0].props.items.find((item: { id: string }) => item.id === 'plains').label).toEqual({ kind: 'literal', value: 'Leaf A' });
  for (let index = 0; index < 3; index++) await page.getByRole('button', { name: '重做', exact: true }).click();
  expect(await read(page)).toEqual(saved);

  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  await expect.poll(() => read(page)).toEqual(saved);

  await page.getByRole('button', { name: `选择 ${saved.screens[0].nodes[0].id}`, exact: true }).click();
  await openTreeItem(page, 'world');
  await page.locator('.tree-view-fields').scrollIntoViewIfNeeded();
  await mkdir('outputs/Q4C', { recursive: true });
  await page.screenshot({ path: 'outputs/Q4C/TreeCapability.png' });

  await captureZip(page);
  await writeFile('outputs/Q4C/TreeCapability.project.json', JSON.stringify(saved, null, 2));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  await download;
  const { zip, authority, spec } = await readZipFiles(page);
  const exported = authority.screens[0].nodes[0].props.items;
  expect(exported.map((item: { id: string }) => item.id)).toEqual(tree.items.map((item: { id: string }) => item.id));
  expect(exported.find((item: { id: string }) => item.id === 'plains').label).toMatchObject({ kind: 'translate', key: 'gui.customdim.biome.plains' });
  expect(spec.treeViewContract.nodes[0].items.map((item: { id: string }) => item.id)).toEqual(tree.items.map((item: { id: string }) => item.id));
  await writeFile('outputs/Q4C/TreeCapability.zip', zip);
});

test('Status Indicator blocks referenced renames, edits unreferenced IDs and exposes both TextSpec text layers', async ({ page }) => {
  const doc = structuresInspectorProject();
  doc.schemaVersion = '0.48.0';
  const screen = doc.screens[0];
  screen.nodes.push(createNode('minecraft:status-indicator', 'status_view', { x: 300, y: 220 }));
  screen.behaviors.push({
    id: 'status_by_option',
    event: { type: 'selection-change', sourceId: 'structure_selector' },
    eventBindings: [{ type: 'selection-change', sourceId: 'structure_selector', payloadType: 'OptionId' }],
    actions: [{ type: 'set-status', targetId: 'status_view', optionMappings: [{ optionId: 'temple', statusId: 'status_running' }] }],
  } as never);
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q4c-status.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '选择 status_view', exact: true }).click();

  // A status used by a set-status mapping cannot be renamed; the diagnostic names the rule.
  await openStatus(page, 'status_running');
  const blocked = page.getByLabel('状态 ID 1', { exact: true });
  await blocked.fill('status_active'); await blocked.press('Enter');
  await expect(page.getByText(/已被规则引用，不能改 ID/)).toBeVisible();
  await expect(page.locator('.status-entry .field-error').filter({ hasText: 'status_by_option' })).toBeVisible();

  // An unreferenced status keeps its color and can be renamed.
  await openStatus(page, 'status_warning');
  const free = page.getByLabel('状态 ID 3', { exact: true });
  await free.fill('status_alert'); await free.press('Enter');
  await expect(page.locator('[data-testid="status-row"][data-status-id="status_alert"]')).toBeVisible();

  // Status name and the optional display-text override are both Literal/Translation Key TextSpec.
  await openStatus(page, 'status_stopped');
  await page.getByLabel('状态名称 2类型', { exact: true }).selectOption('translate');
  await page.getByLabel('状态名称 2翻译键', { exact: true }).fill('gui.customdim.status.stopped');
  await page.getByLabel('状态名称 2翻译键', { exact: true }).press('Enter');
  await page.getByLabel('状态名称 2预览文字', { exact: true }).fill('已停止');
  await page.getByLabel('状态名称 2预览文字', { exact: true }).press('Enter');

  await openStatus(page, 'status_alert');
  await page.getByLabel('独立显示文本 3', { exact: true }).check();
  await page.getByLabel('状态显示文本 3类型', { exact: true }).selectOption('translate');
  await page.getByLabel('状态显示文本 3翻译键', { exact: true }).fill('gui.customdim.status.alert');
  await page.getByLabel('状态显示文本 3翻译键', { exact: true }).press('Enter');
  await page.getByLabel('状态显示文本 3预览文字', { exact: true }).fill('警报');
  await page.getByLabel('状态显示文本 3预览文字', { exact: true }).press('Enter');

  await page.getByRole('button', { name: '应用状态定义', exact: true }).click();
  const saved = await read(page), status = saved.screens[0].nodes.find((node: { id: string }) => node.id === 'status_view').props;
  expect(status.statuses.map((entry: { statusId: string }) => entry.statusId)).toEqual(['status_running', 'status_stopped', 'status_alert']);
  expect(status.statuses[1].label).toEqual({ kind: 'translate', key: 'gui.customdim.status.stopped', fallback: '已停止' });
  expect(status.statuses[2].text).toEqual({ kind: 'translate', key: 'gui.customdim.status.alert', fallback: '警报' });
  expect(status.statuses[2].color).toBe('#FFFFB347');
  expect(status.initialStatusId).toBe('status_stopped');
  expect(saved.screens[0].behaviors.find((rule: { id: string }) => rule.id === 'status_by_option').actions[0].optionMappings[0].statusId).toBe('status_running');

  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'status_view').props.statuses.map((entry: { statusId: string }) => entry.statusId)).toEqual(['status_running', 'status_stopped', 'status_warning']);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect(await read(page)).toEqual(saved);

  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  await expect.poll(() => read(page)).toEqual(saved);

  await page.getByRole('button', { name: '选择 status_view', exact: true }).click();
  await openStatus(page, 'status_alert');
  await page.locator('.status-fields').scrollIntoViewIfNeeded();
  await mkdir('outputs/Q4C', { recursive: true });
  await page.screenshot({ path: 'outputs/Q4C/StatusCapability.png' });

  await captureZip(page);
  await writeFile('outputs/Q4C/StatusCapability.project.json', JSON.stringify(saved, null, 2));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  await download;
  const { zip, authority, spec } = await readZipFiles(page);
  const exportedStatus = authority.screens[0].nodes.find((node: { id: string }) => node.id === 'status_view').props;
  expect(exportedStatus.statuses[2]).toMatchObject({ statusId: 'status_alert', color: '#FFFFB347', text: { kind: 'translate', key: 'gui.customdim.status.alert' } });
  expect(spec.statusIndicatorContract.definitions.find((item: { nodeId: string }) => item.nodeId === 'status_view').statuses.map((entry: { statusId: string }) => entry.statusId)).toEqual(['status_running', 'status_stopped', 'status_alert']);
  await writeFile('outputs/Q4C/StatusCapability.zip', zip);
});
