import { expect, test, type Page } from '@playwright/test';
import { createNode, emptyProject } from '../src/domain/model';
import { fillStyleDemoProject } from './fixtures/fillStyleDemoProject';

async function importProject(page: Page, doc: unknown) {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q3c2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
}
async function readProject(page: Page) { return JSON.parse((await page.getByTestId('project-json').textContent())!); }
async function selectNode(page: Page, id: string) { await page.getByRole('button', { name: `选择 ${id}`, exact: true }).click(); }
async function enableTranslation(page: Page, field = '按钮文字') { await page.getByLabel(`${field}类型`).selectOption('translate'); }
async function exportZip(page: Page) {
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) {
    if (blob instanceof Blob && blob.type === 'application/zip') (window as any).__q3c2Zip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
    return original.call(this, blob);
  }; });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  return Buffer.from(await page.evaluate(() => (window as any).__q3c2Zip));
}
function zipFiles(zip: Buffer) {
  const result = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    result.set(zip.subarray(offset + 30, offset + 30 + nameLength).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  return result;
}

function fiftyNodeProject() {
  const doc = emptyProject(); doc.schemaVersion = '0.42.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
  doc.project.name = 'Q3C2 Fifty Nodes'; const screen = doc.screens[0]; screen.designSize.height = 260;
  for (let i = 1; i <= 50; i++) {
    const type = i === 50 ? 'native_region' : i <= 2 || i % 2 === 1 ? 'minecraft:fill' : 'minecraft:button';
    const node = createNode(type, `node_${i}`, { x: (i % 8) * 34, y: 8 + Math.floor(i / 8) * 25 });
    if (node.type === 'minecraft:fill') node.bounds = { ...node.bounds, w: 10, h: 10 };
    if (node.type === 'minecraft:button') node.bounds = { ...node.bounds, w: 30, h: 18 };
    if (i === 1 || i === 2) node.alias = 'Background Frame';
    screen.nodes.push(node);
  }
  return doc;
}

test('Bake inspector stays compact, uses live aliases and keeps stable IDs visible for a 50-node Screen', async ({ page }) => {
  await importProject(page, fiftyNodeProject());
  await expect(page.getByRole('region', { name: 'Static Bake Groups' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Bake / Assets 工作区' }).click();
  await expect(page.getByLabel('Bake Workspace')).toBeVisible();
  const panel = page.getByRole('region', { name: 'Static Bake Groups' });
  await expect(panel.getByText(/50 节点/)).toBeVisible();
  await expect(panel.getByLabel('Bake成员 node_1', { exact: true })).toBeHidden();
  await panel.locator('summary').filter({ hasText: '新建 / 选择成员' }).click();
  await expect(panel.getByLabel('Bake成员 node_1', { exact: true })).toBeVisible();
  const duplicateAliases = panel.locator('.bake-node-name').filter({ hasText: 'Background Frame' });
  await expect(duplicateAliases).toHaveCount(2);
  await expect(duplicateAliases.first()).toContainText('node_1');
  await panel.getByLabel('Bake成员 node_1', { exact: true }).check(); await panel.getByLabel('Bake成员 node_2', { exact: true }).check();
  await panel.getByRole('button', { name: '创建 Bake Group (2)' }).click();
  await panel.locator('.bake-group-card > summary').first().click();
  await panel.locator('.bake-group-card').first().locator('summary').filter({ hasText: '已加入成员' }).click();
  await expect(panel.locator('.bake-group-card').first()).toContainText('Background Frame');
  await expect(panel.locator('.bake-group-card').first()).toContainText('node_1');

  await page.getByRole('button', { name: 'GUI 设计模式' }).click();
  await selectNode(page, 'node_1');
  await page.getByLabel('控件别名').fill('Renamed Frame'); await page.getByLabel('控件别名').press('Enter');
  await page.getByRole('button', { name: 'Bake / Assets 工作区' }).click();
  await expect(panel.locator('.bake-group-card').first()).toContainText('Renamed Frame');
  await expect(panel.locator('.bake-group-card').first()).toContainText('node_1');
  await expect(panel.locator('.bake-list-scroll').first()).toHaveCSS('max-height', '220px');
});

test('translation suggestions follow project namespace and alias; saved keys survive renames and mode changes', async ({ page }) => {
  const doc = fillStyleDemoProject(); doc.project.name = 'customdim'; doc.screens[0].nodes.find(node => node.id === 'demo_button')!.alias = 'submit';
  await importProject(page, doc); await selectNode(page, 'demo_button'); await enableTranslation(page);
  let saved = await readProject(page);
  expect(saved.screens[0].nodes.find((node: any) => node.id === 'demo_button').props.message.key).toBe('gui.customdim.submit');
  await page.getByTestId('tooltip-fields').locator('summary').click();
  await page.getByLabel('启用 Tooltip', { exact: true }).check();
  await page.getByLabel('Tooltip类型').selectOption('translate');
  expect((await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'demo_button').props.tooltip.key).toBe('gui.customdim.submit.tooltip');

  await page.getByLabel('按钮文字翻译键').fill('gui.manual.keep'); await page.getByLabel('按钮文字翻译键').press('Enter');
  await page.getByLabel('控件别名').fill('submit_primary'); await page.getByLabel('控件别名').press('Enter');
  await page.getByLabel('项目名称').fill('renamed project'); await page.getByLabel('项目名称').press('Enter');
  saved = await readProject(page);
  expect(saved.screens[0].nodes.find((node: any) => node.id === 'demo_button').props.message.key).toBe('gui.manual.keep');
  await page.getByLabel('按钮文字类型').selectOption('literal');
  expect((await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'demo_button').props.message.disabledKey).toBe('gui.manual.keep');
  await page.getByLabel('按钮文字类型').selectOption('translate');
  expect((await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'demo_button').props.message.key).toBe('gui.manual.keep');

  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(async () => (await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'demo_button').props.message.kind).toBe('literal');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  expect((await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'demo_button').props.message.key).toBe('gui.manual.keep');
  expect((await readProject(page)).schemaVersion).toBe('0.43.0');
});

test('explicit namespace and stable-ID fallbacks generate property-specific keys; duplicate keys are diagnosed and ZIP preserves values', async ({ page }) => {
  const doc = fillStyleDemoProject(); doc.project.name = 'customdim';
  doc.screens[0].nodes.find(node => node.id === 'demo_button')!.alias = 'submit';
  const second = createNode('minecraft:button', 'node_12', { x: 210, y: 24 }); second.bounds = { ...second.bounds, w: 80, h: 20 }; doc.screens[0].nodes.push(second);
  await importProject(page, doc);
  await page.locator('.localization-settings > summary').click();
  await page.getByLabel('本地化命名空间').fill('custom'); await page.getByLabel('本地化命名空间').press('Enter');
  await selectNode(page, 'demo_button'); await enableTranslation(page);
  expect((await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'demo_button').props.message.key).toBe('gui.custom.submit');
  await selectNode(page, 'node_12'); await enableTranslation(page);
  expect((await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'node_12').props.message.key).toBe('gui.custom.node_12');
  await page.getByLabel('按钮文字翻译键').fill('gui.custom.submit'); await page.getByLabel('按钮文字翻译键').press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: '翻译键重复' })).toBeVisible();

  const zip = zipFiles(await exportZip(page));
  const saved = await readProject(page);
  expect(saved.project.localizationNamespace).toBe('custom');
  expect(saved.screens[0].nodes.find((node: any) => node.id === 'node_12').props.message.key).toBe('gui.custom.submit');
  const authority = JSON.parse([...zip].find(([name]) => name.endsWith('.json') && !name.endsWith('.manifest.json') && !name.endsWith('.implementation.json') && !name.endsWith('.behavior-diagnostics.json'))![1].toString());
  const manifest = JSON.parse([...zip].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  expect(authority.project.localizationNamespace).toBe('custom');
  expect(authority.screens[0].nodes.find((node: any) => node.id === 'node_12').props.message.key).toBe('gui.custom.submit');
  expect(manifest.localizationContract.storedKeys.map((entry: any) => entry.key)).toContain('gui.custom.submit');
  expect(manifest.localizationContract.namespace).toBe('custom');
  await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload();
  expect((await readProject(page)).project.localizationNamespace).toBe('custom');
  expect((await readProject(page)).screens[0].nodes.find((node: any) => node.id === 'node_12').props.message.key).toBe('gui.custom.submit');
});

test('legacy gui.example is not rewritten by import or unrelated edits', async ({ page }) => {
  const doc = fillStyleDemoProject(); doc.schemaVersion = '0.42.0';
  const button = doc.screens[0].nodes.find(node => node.id === 'demo_button')!;
  if (button.type === 'minecraft:button') button.props.message = { kind: 'translate', key: 'gui.example', fallback: 'Trade' };
  await importProject(page, doc);
  expect((await readProject(page)).schemaVersion).toBe('0.42.0');
  await selectNode(page, 'demo_button'); await page.getByLabel('控件别名').fill('trade_button'); await page.getByLabel('控件别名').press('Enter');
  const saved = await readProject(page);
  expect(saved.schemaVersion).toBe('0.42.0');
  expect(saved.screens[0].nodes.find((node: any) => node.id === 'demo_button').props.message.key).toBe('gui.example');
});
