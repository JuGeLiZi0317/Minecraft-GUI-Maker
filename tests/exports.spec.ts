import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createNode, emptyProject } from '../src/domain/model';
import type { GuiProject } from '../src/domain/schema';
import { showScreenControls } from './workspace-helpers';

const docOf = async (page: Page): Promise<GuiProject> => JSON.parse((await page.getByTestId('project-json').textContent())!);
const historyOf = (page: Page) => page.getByTestId('history-count').textContent();
async function load(page: Page, doc: GuiProject) {
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'design.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
}
async function generate(page: Page) {
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.export-links a')).toHaveCount(6);
}
async function filesOf(page: Page) {
  return page.locator('.export-links a').evaluateAll(async links => Promise.all(links.map(async link => {
    const a = link as HTMLAnchorElement;
    return { name: a.download, bytes: Array.from(new Uint8Array(await (await fetch(a.href)).arrayBuffer())) };
  })));
}
const json = (file: { bytes: number[] }) => JSON.parse(Buffer.from(file.bytes).toString('utf8'));
async function pixels(page: Page, index = 1, ratio = 1) {
  return page.locator('.export-links a').nth(index).evaluate(async (link, ratio) => {
    const blob = await (await fetch((link as HTMLAnchorElement).href)).blob(), bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const at = (x: number, y: number) => Array.from(data.slice((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data.buffer)), n => n.toString(16).padStart(2, '0')).join('');
    return { width: canvas.width, height: canvas.height, digest, origin: at(0, 0), fill: at(21 * ratio, 41 * ratio), outside: at(19 * ratio, 41 * ratio), handle: at(40 * ratio, 51 * ratio), hidden: at(101 * ratio, 101 * ratio), transparent: at(300 * ratio, 170 * ratio) };
  }, ratio);
}
function pngMetadata(bytes: number[]) {
  const buffer = Buffer.from(bytes); let offset = 8; const chunks: string[] = []; let metadata: any;
  while (offset < buffer.length) {
    const size = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    chunks.push(type);
    let crc = 0xffffffff;
    for (const byte of buffer.subarray(offset + 4, offset + 8 + size)) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    expect(buffer.readUInt32BE(offset + 8 + size)).toBe((crc ^ 0xffffffff) >>> 0);
    if (type === 'tEXt') { const text = buffer.toString('utf8', offset + 8, offset + 8 + size); if (text.startsWith('MinecraftGuiMaker\0')) metadata = JSON.parse(text.slice(18)); }
    offset += 12 + size;
  }
  expect(chunks.at(-1)).toBe('IEND'); expect(metadata).toBeDefined(); return metadata;
}
async function point(page: Page, x: number, y: number) {
  const host = page.getByTestId('canvas-host'), box = (await host.boundingBox())!;
  return { x: box.x + Number(await host.getAttribute('data-origin-x')) + x * Number(await host.getAttribute('data-zoom')),
    y: box.y + Number(await host.getAttribute('data-origin-y')) + y * Number(await host.getAttribute('data-zoom')) };
}
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible(); });

test('complete bundle has matching references/hashes and clean logical PNG, independent of view/preview/DPR', async ({ page }, info) => {
  const doc = emptyProject();
  const fill = createNode('minecraft:fill', 'rectangle'); fill.bounds = { x: 20, y: 40, w: 20, h: 10 }; if (fill.type === 'minecraft:fill') fill.props.color = '#FFFF0000';
  const hidden = createNode('minecraft:fill', 'hidden'); hidden.bounds = { x: 100, y: 100, w: 20, h: 10 }; hidden.state.visible = false;
  doc.screens[0].nodes = [createNode('minecraft:button', 'button'), createNode('minecraft:edit-box', 'input', { x: 20, y: 70 }), createNode('minecraft:string-widget', 'label', { x: 20, y: 140 }), fill, hidden];
  await load(page, doc); await page.getByRole('button', { name: '选择 rectangle', exact: true }).click();
  const history = await historyOf(page); await generate(page);
  const files = await filesOf(page), manifest = json(files[5]), spec = json(files[2]);
  expect(json(files[0])).toEqual(doc); expect(spec.reference).toEqual(manifest.reference);
  expect(pngMetadata(files[1].bytes).reference).toEqual(manifest.reference);
  const enlargedMeta = pngMetadata(files[4].bytes);
  expect(enlargedMeta.reference).toEqual(manifest.reference); expect(enlargedMeta.pixelRatio).toBe(4);
  expect(manifest.enlargedReferenceImage).toMatchObject({ width: 1280, height: 720, pixelRatio: 4, background: 'preview-matte-#1c2634' });
  expect(Buffer.from(files[3].bytes).toString()).toContain(manifest.reference.documentSha256);
  for (let i = 0; i < 5; i++) {
    expect(manifest.files[i].sha256).toBe(createHash('sha256').update(Buffer.from(files[i].bytes)).digest('hex'));
    expect(manifest.files[i].bytes).toBe(files[i].bytes.length);
  }
  const original = await pixels(page);
  const enlarged = await pixels(page, 4, 4);
  expect(enlarged).toMatchObject({ width: 1280, height: 720, origin: [28, 38, 52, 255], fill: [255, 0, 0, 255], outside: [28, 38, 52, 255], hidden: [28, 38, 52, 255] });
  expect(original).toMatchObject({ width: 320, height: 180, origin: [0, 0, 0, 0], fill: [255, 0, 0, 255], outside: [0, 0, 0, 0], handle: [0, 0, 0, 0], hidden: [0, 0, 0, 0], transparent: [0, 0, 0, 0] });
  await page.getByRole('button', { name: '选择 button', exact: true }).click(); await generate(page);
  expect(await pixels(page)).toEqual(original);
  await page.getByRole('button', { name: '选择 rectangle', exact: true }).click();
  await showScreenControls(page);
  for (const zoom of ['0.5', '1', '2']) {
    await page.getByLabel('Zoom', { exact: true }).selectOption(zoom); await page.getByLabel('Pan X', { exact: true }).fill('31'); await page.getByLabel('Pan Y', { exact: true }).fill('-17');
    await generate(page); expect(await pixels(page)).toEqual(original); expect(await pixels(page, 4, 4)).toEqual(enlarged);
  }
  await page.locator('.screen-settings summary').click(); await page.getByRole('button', { name: '预览游戏缩放', exact: true }).click();
  await generate(page); expect(await pixels(page)).toEqual(original); expect(await pixels(page, 4, 4)).toEqual(enlarged);
  expect(await historyOf(page)).toBe(history); expect(await docOf(page)).toEqual(doc);
  await expect(page.getByRole('button', { name: '选择 rectangle', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => devicePixelRatio)).toBe(info.project.name.endsWith('dpr2') ? 2 : 1);
  const event = page.waitForEvent('download'); await page.locator('.export-links a').first().click(); const download = await event;
  await download.saveAs(info.outputPath('authoritative.json')); expect(JSON.parse(await readFile(info.outputPath('authoritative.json'), 'utf8'))).toEqual(doc);
  await page.locator('.screen-settings summary').click(); await page.getByRole('button', { name: '返回设计模式', exact: true }).click();
  await load(page, json(files[0])); expect(await docOf(page)).toEqual(doc);
  if (info.project.name.endsWith('dpr1')) { const folder = info.outputPath('sample'); await mkdir(folder, { recursive: true }); for (const f of files) await writeFile(`${folder}/${f.name}`, Buffer.from(f.bytes)); }
});

test('pending inline text commits before capture; async edits cannot change any output', async ({ page }) => {
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  const p = await point(page, 50, 25); await page.mouse.dblclick(p.x, p.y); await page.getByLabel('画布文字编辑').fill('Captured');
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) { original.call(this, blob => setTimeout(() => callback(blob), 1200), type, quality); };
  });
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await page.getByLabel('按钮文字', { exact: true }).fill('Later'); await page.getByLabel('按钮文字', { exact: true }).press('Enter');
  await expect(page.locator('.export-links a')).toHaveCount(6);
  const files = await filesOf(page), captured = json(files[0]), spec = json(files[2]);
  expect(captured.screens[0].nodes[0].props.message.value).toBe('Captured');
  expect(spec.designIntent.nodes[0].properties.message.value).toBe('Captured');
  expect(Buffer.from(files[3].bytes).toString()).toContain('Captured'); expect(Buffer.from(files[3].bytes).toString()).not.toContain('Later');
  expect(pngMetadata(files[1].bytes).reference.revision).toBe(captured.project.revision);
  expect(pngMetadata(files[4].bytes).reference.revision).toBe(captured.project.revision);
  expect((await docOf(page)).screens[0].nodes[0].props).toMatchObject({ message: { value: 'Later' } });
  await expect(page.getByTestId('export-panel')).toContainText('当前设计已改变');
  const capturedPixels = await pixels(page);
  const capturedEnlarged = await pixels(page, 4, 4);
  await page.getByLabel('按钮文字', { exact: true }).fill('Captured'); await page.getByLabel('按钮文字', { exact: true }).press('Enter');
  await generate(page); expect((await pixels(page)).digest).toBe(capturedPixels.digest); expect((await pixels(page, 4, 4)).digest).toBe(capturedEnlarged.digest);
});

test('pending property and screen size are committed; invalid fields block full batch and standalone JSON', async ({ page }) => {
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await page.getByLabel('按钮文字', { exact: true }).fill('Property draft'); await generate(page);
  expect(json((await filesOf(page))[0]).screens[0].nodes[0].props.message.value).toBe('Property draft');
  await showScreenControls(page); await page.locator('.screen-settings summary').click(); await page.getByLabel('设计区宽', { exact: true }).fill('400'); await page.getByLabel('设计区高', { exact: true }).fill('220');
  await generate(page); expect(await pixels(page)).toMatchObject({ width: 400, height: 220 });
  const stable = await docOf(page), history = await historyOf(page);
  await page.getByRole('button', { name: '选择 node_1', exact: true }).click();
  await page.getByLabel('W', { exact: true }).fill('0'); await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('本批未生成'); await expect(page.locator('.export-links a')).toHaveCount(0);
  expect(await docOf(page)).toEqual(stable); expect(await historyOf(page)).toBe(history);
  let downloads = 0; page.on('download', () => downloads++);
  await page.getByRole('button', { name: '导出 JSON' }).click(); await expect(page.getByRole('alert')).toBeVisible(); expect(downloads).toBe(0);
  await page.getByLabel('W', { exact: true }).press('Escape');
  await showScreenControls(page); await page.locator('.screen-settings summary').click();
  await page.getByLabel('设计区宽', { exact: true }).fill('0'); await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('设计区宽高'); expect(await docOf(page)).toEqual(stable);
});

test('encoder failure clears stale links and URLs, retry succeeds; oversized PNG refuses without modifying history', async ({ page }) => {
  await page.evaluate(() => {
    const original = URL.revokeObjectURL; (window as any).__revoked = [];
    URL.revokeObjectURL = url => { (window as any).__revoked.push(url); original(url); };
    (window as any).__toBlob = HTMLCanvasElement.prototype.toBlob;
  });
  await generate(page); const history = await historyOf(page), doc = await docOf(page);
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = callback => callback(null); });
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('PNG编码失败');
  await expect(page.locator('.export-links a')).toHaveCount(0); expect(await page.evaluate(() => (window as any).__revoked.length)).toBe(6);
  expect(await historyOf(page)).toBe(history); expect(await docOf(page)).toEqual(doc);
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = (window as any).__toBlob; }); await generate(page);
  await page.evaluate(() => {
    let calls = 0; const original = (window as any).__toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
      if (++calls === 2) callback(null); else original.call(this, callback, type, quality);
    };
  });
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('PNG编码失败'); await expect(page.locator('.export-links a')).toHaveCount(0);
  expect(await historyOf(page)).toBe(history); expect(await docOf(page)).toEqual(doc);
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = (window as any).__toBlob; }); await generate(page);
  const large = emptyProject(); large.screens[0].designSize = { width: 8192, height: 8192, unit: 'gui-px' }; await load(page, large);
  const largeHistory = await historyOf(page); await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('上限'); await expect(page.locator('.export-links a')).toHaveCount(0);
  expect(await historyOf(page)).toBe(largeHistory); expect(await docOf(page)).toEqual(large);
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON' }).click(); await event;
});

test('unfinished composition and invalid inline input prevent export; Escape restores a successful path', async ({ page }) => {
  await page.getByRole('button', { name: '添加 EditBox', exact: true }).click();
  const field = page.getByLabel('输入初值', { exact: true }); await field.fill('pending');
  await field.dispatchEvent('compositionstart');
  const stable = await docOf(page), history = await historyOf(page);
  // Keyboard activation keeps the synthetic composition unfinished at the input boundary.
  await page.getByRole('button', { name: '导出规格', exact: true }).dispatchEvent('click');
  await expect(page.getByRole('alert')).toContainText('组合输入'); await expect(page.locator('.export-links a')).toHaveCount(0);
  expect(await docOf(page)).toEqual(stable); expect(await historyOf(page)).toBe(history);
  await field.dispatchEvent('compositionend'); await field.press('Escape');
  const p = await point(page, 50, 25); await page.mouse.dblclick(p.x, p.y);
  await page.getByLabel('画布文字编辑').fill('x'.repeat(33));
  await page.getByRole('button', { name: '导出规格', exact: true }).dispatchEvent('click');
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('本批未生成');
  expect(await docOf(page)).toEqual(stable); expect(await historyOf(page)).toBe(history);
  await page.getByLabel('画布文字编辑').press('Escape'); await generate(page);
});

test('missing Canvas2D or SHA-256 reports full failure and preserves document/history', async ({ page }) => {
  const doc = await docOf(page), history = await historyOf(page);
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext; (window as any).__getContext = original;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, ...args: any[]) {
      if (!this.isConnected && this.width === 320 && this.height === 180) return null;
      return (original as any).apply(this, args);
    } as any;
  });
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('绘图上下文'); await expect(page.locator('.export-links a')).toHaveCount(0);
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.getContext = (window as any).__getContext;
    Object.defineProperty(crypto, 'subtle', { configurable: true, value: undefined });
  });
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('摘要'); await expect(page.locator('.export-links a')).toHaveCount(0);
  expect(await docOf(page)).toEqual(doc); expect(await historyOf(page)).toBe(history);
});
