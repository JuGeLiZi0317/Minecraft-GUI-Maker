import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createEditorStore } from '../src/editor/store';
import type { GuiProject } from '../src/domain/schema';

const read = async (page: import('@playwright/test').Page): Promise<GuiProject> => JSON.parse((await page.getByTestId('project-json').textContent())!);
function unzipStored(bytes: Buffer) {
  const entries = new Map<string, Buffer>();
  for (let at = 0; at + 30 <= bytes.length && bytes.readUInt32LE(at) === 0x04034b50;) {
    const size = bytes.readUInt32LE(at + 18), nameLength = bytes.readUInt16LE(at + 26), extraLength = bytes.readUInt16LE(at + 28), start = at + 30 + nameLength + extraLength;
    entries.set(bytes.subarray(at + 30, at + 30 + nameLength).toString('utf8'), bytes.subarray(start, start + size)); at = start + size;
  }
  return entries;
}
async function captureZip(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob && object.type === 'application/zip') (window as Window & { __treeViewZip?: Blob }).__treeViewZip = object;
      return original(object);
    };
  });
  await page.getByRole('button', { name: '一键导出 ZIP' }).click();
  await expect(page.locator('.statusbar [role="status"]')).toContainText('ZIP 已下载');
  return Buffer.from(await page.evaluate(async () => {
    const zip = (window as Window & { __treeViewZip?: Blob }).__treeViewZip;
    if (!zip) throw new Error('没有捕获到应用生成的 ZIP Blob');
    return Array.from(new Uint8Array(await zip.arrayBuffer()));
  }));
}

test('W2-C Tree View Inspector keeps the edited item panel open after Enter commits a field', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加 Tree View', exact: true }).click();
  const itemEditor = page.locator('.tree-item-editor').filter({ hasText: 'item_root' }).first();
  await itemEditor.locator('summary').click();
  const label = itemEditor.getByRole('textbox', { name: '显示名称' });
  await label.fill('Root renamed');
  await label.press('Enter');
  await expect(itemEditor).toHaveAttribute('open', '');
  const doc = await read(page), treeNode = doc.screens[0].nodes[0];
  expect(treeNode.type === 'minecraft:tree-view' && treeNode.props.items[0].label).toEqual({ kind: 'literal', value: 'Root renamed' });
});

test('W2-C Tree View inspector transactions, initial PNG/export authority and preview navigation', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加 Tree View', exact: true }).click();
  const doc = await read(page);
  expect(doc.schemaVersion).toBe('0.28.0');
  expect(doc.screens[0].nodes[0]).toMatchObject({ type: 'minecraft:tree-view', props: { initialSelectedItemId: 'item_leaf_a' } });

  const rootEditor = page.locator('.tree-item-editor').filter({ hasText: 'item_root' }).first();
  await rootEditor.locator('summary').click();
  await rootEditor.getByRole('button', { name: '添加子项' }).click();
  await expect.poll(async () => (await read(page)).screens[0].nodes[0].type === 'minecraft:tree-view' ? ((await read(page)).screens[0].nodes[0] as Extract<GuiProject['screens'][number]['nodes'][number], { type: 'minecraft:tree-view' }>).props.items.length : 0).toBe(6);
  await expect(page.getByTestId('history-count')).not.toHaveText('0');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await read(page)).screens[0].nodes[0]).toMatchObject({ type: 'minecraft:tree-view', props: { items: expect.arrayContaining([expect.objectContaining({ id: 'item_leaf_a' })]) } });
  const node = (await read(page)).screens[0].nodes[0]; expect(node.type === 'minecraft:tree-view' && node.props.items).toHaveLength(5);

  const zipPath = info.outputPath('tree-view.zip'); await writeFile(zipPath, await captureZip(page)); const entries = unzipStored(await readFile(zipPath));
  const manifestFile = [...entries].find(([name]) => name.endsWith('.manifest.json'))![1], manifest = JSON.parse(manifestFile.toString());
  expect(manifest.screens[0].treeViews[0]).toMatchObject({ nodeId: 'node_1', initialSelectedItemId: 'item_leaf_a' });
  const authority = JSON.parse([...entries].find(([name]) => name.endsWith('.json') && !name.endsWith('.manifest.json') && !name.endsWith('.implementation.json'))![1].toString());
  expect(authority.screens[0].nodes[0].props.items).toHaveLength(5);
  const png = entries.get(manifest.screens[0].designImage.name)!; expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const tree = page.getByRole('tree', { name: 'Tree View', exact: true }); await expect(tree).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Leaf A' })).toHaveAttribute('aria-selected', 'true');
  const zoomBefore = await page.getByTestId('canvas-host').getAttribute('data-zoom');
  await page.getByRole('treeitem', { name: 'Root（不可选择）' }).click();
  await expect(tree).toHaveAttribute('aria-activedescendant', 'tree-node_1-item_root');
  const rootToggle = page.getByRole('button', { name: 'Root，收起', exact: true }); await rootToggle.click();
  await expect(page.getByRole('treeitem', { name: 'Leaf A' })).toHaveCount(0);
  await expect(tree).toHaveAttribute('aria-activedescendant', 'tree-node_1-item_root');
  await expect(page.getByRole('treeitem', { name: 'Other' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Root，展开', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'Leaf A' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('treeitem', { name: 'Other' }).click();
  await page.getByRole('button', { name: 'Root，收起', exact: true }).click();
  await expect(tree).toHaveAttribute('aria-activedescendant', 'tree-node_1-item_other');
  expect(await page.getByTestId('canvas-host').getAttribute('data-zoom')).toBe(zoomBefore);
  expect(JSON.stringify(await read(page))).toBe(JSON.stringify(doc));
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Root，收起', exact: true })).toHaveCount(1);
});

test('W2-C multi-Screen Tree View export preserves authority, per-Screen data and PNGs', async ({ page }, info) => {
  const store = createEditorStore(); store.getState().add('minecraft:tree-view'); const firstScreen = store.getState().currentScreenId;
  store.getState().addScreen(); const secondScreen = store.getState().currentScreenId;
  store.getState().add('minecraft:tree-view'); store.getState().add('minecraft:scrollable-panel');
  const doc = store.getState().doc;
  expect(doc.schemaVersion).toBe('0.28.0');
  await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({ name: 'tree.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await expect(page.getByTestId('project-json')).toContainText('item_leaf_a');
  const zipPath = info.outputPath('tree-view-multiscreen.zip'); await writeFile(zipPath, await captureZip(page)); const entries = unzipStored(await readFile(zipPath));
  const manifest = JSON.parse([...entries].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  expect(manifest.version).toBe('0.22.0'); expect(manifest.screens.map((screen: { screenId: string; treeViews: { nodeId: string }[] }) => [screen.screenId, screen.treeViews.length])).toEqual([[firstScreen, 1], [secondScreen, 1]]);
  expect([...entries.keys()].filter(name => /--screen_[A-Za-z0-9_-]+\.png$/.test(name))).toHaveLength(2);
  const authority = JSON.parse([...entries].find(([name]) => name.endsWith('.json') && !name.endsWith('.manifest.json') && !name.endsWith('.implementation.json'))![1].toString());
  expect(authority.screens.map((screen: GuiProject['screens'][number]) => screen.nodes.filter(node => node.type === 'minecraft:tree-view').length)).toEqual([1, 1]);
});

test('W2-C overflow scrolling, keyboard focus reveal and preview reinitialization stay inside Tree View', async ({ page }) => {
  const store = createEditorStore(); store.getState().add('minecraft:tree-view');
  const id = store.getState().selected!;
  store.getState().updateNode(id, node => {
    if (node.type === 'minecraft:tree-view') {
      node.bounds = { x: 16, y: 16, w: 180, h: 90 };
      node.props.items = Array.from({ length: 24 }, (_, index) => ({ id: `entry_${index}`, label: { kind: 'literal', value: `Entry ${index}` }, parentId: null, order: index, selectable: true, disabled: false }));
      node.props.initialExpandedIds = []; node.props.initialSelectedItemId = 'entry_0';
    }
    return node;
  });
  await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({ name: 'tree-overflow.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(store.getState().doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const tree = page.getByRole('tree', { name: 'Tree View', exact: true }), zoomBefore = await page.getByTestId('canvas-host').getAttribute('data-zoom');
  await tree.hover(); await page.mouse.wheel(0, 160); await expect.poll(() => tree.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.getByTestId('canvas-host').getAttribute('data-zoom')).toBe(zoomBefore);
  await tree.focus(); await page.keyboard.press('End'); await expect(tree).toHaveAttribute('aria-activedescendant', 'tree-node_1-entry_23');
  await expect.poll(() => tree.evaluate(element => element.scrollTop)).toBeGreaterThan(200);
  await page.keyboard.press('Enter'); await expect(page.getByRole('treeitem', { name: 'Entry 23' })).toHaveAttribute('aria-selected', 'true');
  const events = JSON.parse((await page.getByTestId('tree-view-events').getAttribute('data-events'))!); expect(events).toHaveLength(1);
  await page.getByRole('button', { name: '交互预览', exact: true }).click(); await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(tree).toHaveAttribute('aria-activedescendant', 'tree-node_1-entry_0'); await expect(tree).toHaveJSProperty('scrollTop', 0);
});
