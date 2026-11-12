import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { structuresInspectorProject } from './fixtures/structuresInspectorProject';
import { createNode } from '../src/domain/model';
import { designPanelExpansion, nodeAbsoluteBounds } from '../src/domain/collapsiblePanel';

function fixture() {
  const doc = structuresInspectorProject(), screen = doc.screens[0];
  const other = createNode('minecraft:collapsible-panel', 'other_page_overlay', { x: 180, y: 76 });
  other.bounds = { x: 180, y: 76, w: 260, h: 180 };
  const child = createNode('minecraft:button', 'other_page_child', { x: 12, y: 32 }); child.parentContainerId = other.id;
  const fill = createNode('minecraft:fill', 'persistent_bake', { x: 16, y: 280 }); fill.bounds.w = 140; fill.bounds.h = 20;
  screen.nodes.push(other, child, fill);
  const page = screen.nodes.find(node => node.id === 'page_other');
  if (page?.type === 'minecraft:creative-tab') page.props.contentIds!.push(other.id);
  screen.bakeGroups = [{ id: 'bake_editor', name: 'Editor independent Bake', memberIds: [fill.id], enabled: true }];
  return doc;
}
const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
async function load(page: Page) {
  page.on('dialog', dialog => dialog.accept());
  const doc = fixture(); await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'EditorLayers.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  return doc;
}
async function point(page: Page, x: number, y: number) {
  return page.getByTestId('canvas-host').evaluate((element, p) => {
    const r = element.getBoundingClientRect(), d = (element as HTMLElement).dataset, zoom = Number(d.zoom);
    return { x: r.x + Number(d.originX) + p.x * zoom, y: r.y + Number(d.originY) + p.y * zoom, zoom };
  }, { x, y });
}
async function click(page: Page, x: number, y: number) { const p = await point(page, x, y); await page.mouse.click(p.x, p.y); }
const select = (page: Page, id: string) => page.getByRole('button', { name: `选择 ${id}`, exact: true });
const hide = (page: Page, id: string) => page.getByRole('button', { name: `编辑态隐藏 ${id}`, exact: true });
const solo = (page: Page, id: string) => page.getByRole('button', { name: `Solo ${id}`, exact: true });
const row = (page: Page, id: string) => page.locator(`[data-layer-node="${id}"]`);

test('three overlapping containers can be hidden or Solo edited without changing runtime initial state', async ({ page }) => {
  const doc = await load(page), history = await page.getByTestId('history-count').textContent();
  await click(page, 220, 132); await expect(select(page, 'input_temple')).toHaveAttribute('aria-pressed', 'true');
  await hide(page, 'inspector_temple').click();
  await expect(row(page, 'input_temple')).toHaveAttribute('data-editor-display', 'none');
  await click(page, 220, 122); await expect(select(page, 'input_end_city')).toHaveAttribute('aria-pressed', 'true');
  expect(await read(page)).toEqual(doc); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  for (const [index, choice] of ['village', 'temple', 'end_city'].entries()) {
    await solo(page, `inspector_${choice}`).click();
    const child = doc.screens[0].nodes.find(node => node.id === `input_${choice}`)!;
    const b = nodeAbsoluteBounds(child, doc.screens[0].nodes, {}, designPanelExpansion(doc.screens[0].nodes));
    await click(page, b.x + 30, b.y + 10);
    await expect(select(page, child.id)).toHaveAttribute('aria-pressed', 'true');
    await expect(row(page, 'structure_selector')).toHaveAttribute('data-editor-display', 'content');
    await page.getByLabel('X', { exact: true }).fill(String(13 + index)); await page.getByLabel('X', { exact: true }).press('Enter');
    expect((await read(page)).screens[0].nodes.find((node: any) => node.id === child.id).bounds.x).toBe(13 + index);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(solo(page, `inspector_${choice}`)).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '重做', exact: true }).click();
  }
  await page.getByRole('button', { name: '退出 Solo', exact: true }).click();
  await expect(row(page, 'inspector_temple')).toHaveAttribute('data-editor-display', 'none');
  const after = await read(page);
  expect(after.screens[0].behaviors).toEqual(doc.screens[0].behaviors);
  expect(after.screens[0].nodes.map((node: any) => node.state)).toEqual(doc.screens[0].nodes.map(node => node.state));
});

test('inactive Page content and descendants never intercept current Page hits in reference modes', async ({ page }) => {
  await load(page);
  for (const [index, mode] of ['current', 'outline', 'all'].entries()) {
    await page.getByLabel('Zoom', { exact: true }).selectOption(['1', '0.5', '2'][index]);
    await page.getByLabel('设计态 Page 显示').selectOption(mode);
    await click(page, 220, 132);
    await expect(select(page, 'input_temple')).toHaveAttribute('aria-pressed', 'true');
    await expect(row(page, 'other_page_child')).toHaveAttribute('data-editor-display', mode === 'current' ? 'none' : mode === 'outline' ? 'outline' : 'content');
    await expect(solo(page, 'other_page_overlay')).toBeDisabled();
  }
  await hide(page, 'inspector_temple').click();
  await select(page, 'input_temple').click(); await expect(page.getByLabel('X', { exact: true })).toHaveValue('12');
  await click(page, 220, 122); await expect(select(page, 'input_end_city')).toHaveAttribute('aria-pressed', 'true');
});

test('Page view state is isolated; deletion prunes references; refresh restores the default editor view', async ({ page }) => {
  await load(page);
  await hide(page, 'input_village').click();
  await page.getByRole('button', { name: '编辑 Other · page_other', exact: true }).click();
  await expect(hide(page, 'input_village')).toHaveAttribute('aria-pressed', 'false');
  await hide(page, 'other_page_child').click();
  await page.getByRole('button', { name: '编辑 Structures · page_structures（设计初始）', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑态显示 input_village', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await select(page, 'input_village').click(); await page.getByRole('button', { name: '删除组件', exact: true }).click();
  await expect(select(page, 'input_village')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(hide(page, 'input_village')).toHaveAttribute('aria-pressed', 'false');
  await solo(page, 'input_end_city').click(); await select(page, 'input_end_city').click(); await page.getByRole('button', { name: '删除组件', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出 Solo', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await hide(page, 'inspector_temple').click();
  const saved = await read(page); await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload(); await expect.poll(() => read(page)).toEqual(saved);
  await expect(hide(page, 'inspector_temple')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('设计态 Page 显示')).toHaveValue('current');
});

test('hiding a parent cancels an in-progress child drag without a document commit', async ({ page }) => {
  const doc = await load(page), history = await page.getByTestId('history-count').textContent();
  await solo(page, 'inspector_village').click(); await page.getByRole('button', { name: '退出 Solo' }).click();
  await hide(page, 'inspector_temple').click();
  const p = await point(page, 220, 125);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 12, p.y + 4, { steps: 3 });
  await hide(page, 'inspector_end_city').evaluate(button => (button as HTMLButtonElement).click());
  await page.mouse.move(p.x + 30, p.y + 8); await page.mouse.up();
  expect(await read(page)).toEqual(doc); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await expect(row(page, 'input_end_city')).toHaveAttribute('data-editor-display', 'none');
});

function unzip(zip: Buffer) {
  const files = new Map<string, Buffer>();
  for (let at = 0; at + 30 < zip.length && zip.readUInt32LE(at) === 0x04034b50;) {
    const n = zip.readUInt16LE(at + 26), extra = zip.readUInt16LE(at + 28), size = zip.readUInt32LE(at + 18), start = at + 30 + n + extra;
    files.set(zip.subarray(at + 30, at + 30 + n).toString(), zip.subarray(start, start + size)); at = start + size;
  }
  return files;
}
async function exported(page: Page) {
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) { if (blob instanceof Blob && blob.type === 'application/zip') (window as any).__layersZip = blob.arrayBuffer().then(b => Array.from(new Uint8Array(b))); return original.call(this, blob); }; });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  const files = unzip(Buffer.from(await page.evaluate(() => (window as any).__layersZip)));
  const manifest = JSON.parse([...files].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  await page.getByRole('button', { name: '关闭导出结果', exact: true }).click();
  return { files, manifest };
}
async function imagePixels(page: Page, bytes: Buffer) {
  return page.evaluate(async png => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0); bitmap.close();
    const digest = await crypto.subtle.digest('SHA-256', context.getImageData(0, 0, canvas.width, canvas.height).data);
    return { width: canvas.width, height: canvas.height, digest: Array.from(new Uint8Array(digest)) };
  }, [...bytes]);
}

test('editor masks leave JSON, F2, reference PNG and Bake PNG unchanged and normal preview uses its own session', async ({ page }) => {
  const doc = await load(page), before = await exported(page), history = await page.getByTestId('history-count').textContent();
  for (const id of ['inspector_village', 'inspector_temple', 'inspector_end_city', 'persistent_bake']) await hide(page, id).click();
  await solo(page, 'inspector_temple').click();
  const after = await exported(page);
  expect(after.files.get(after.manifest.authority.file)).toEqual(before.files.get(before.manifest.authority.file));
  expect(await imagePixels(page, after.files.get(after.manifest.screens[0].designImage.name)!)).toEqual(await imagePixels(page, before.files.get(before.manifest.screens[0].designImage.name)!));
  const bake = after.manifest.screens[0].bakeGroups[0].asset;
  expect(after.files.get(bake.path)).toEqual(before.files.get(before.manifest.screens[0].bakeGroups[0].asset.path));
  expect(bake.sha256).toBe(before.manifest.screens[0].bakeGroups[0].asset.sha256);
  expect(await read(page)).toEqual(doc); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await mkdir('outputs/Q3-E', { recursive: true });
  await writeFile('outputs/Q3-E/StructuresInspector_Layers.project.json', JSON.stringify(doc, null, 2));
  await page.screenshot({ path: `outputs/Q3-E/Solo-DPR${await page.evaluate(() => devicePixelRatio)}.png` });
  await page.getByRole('button', { name: '退出 Solo', exact: true }).click();
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByLabel('数值输入 input_village', { exact: true })).toBeVisible();
  await expect(page.getByLabel('数值输入 input_temple', { exact: true })).toBeHidden();
  await page.getByRole('radio', { name: /^temple / }).click();
  await expect(page.getByLabel('数值输入 input_temple', { exact: true })).toBeVisible();
  expect(await read(page)).toEqual(doc);
});
