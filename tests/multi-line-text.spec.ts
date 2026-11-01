import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { packFiles, zipFixture } from './resource-fixtures';
import type { GuiProject } from '../src/domain/schema';

const current = async (page: Page): Promise<GuiProject> => JSON.parse((await page.getByTestId('project-json').textContent())!);
const first = async (page: Page) => (await current(page)).screens[0].nodes[0];
async function commit(page: Page, label: string, value: string) { const field = page.getByLabel(label, { exact: true }); await field.fill(value); await field.blur(); }
async function point(page: Page, x: number, y: number) {
  return page.getByTestId('canvas-host').evaluate((host, p) => { const r = host.getBoundingClientRect(), z = Number(host.getAttribute('data-zoom')); return { x: r.x + Number(host.getAttribute('data-origin-x')) + p.x * z, y: r.y + Number(host.getAttribute('data-origin-y')) + p.y * z }; }, { x, y });
}
function unpack(bytes: Buffer) {
  const entries = new Map<string, Buffer>(); let at = 0;
  while (at + 30 <= bytes.length && bytes.readUInt32LE(at) === 0x04034b50) {
    const size = bytes.readUInt32LE(at + 18), len = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28), start = at + 30 + len + extra;
    entries.set(bytes.subarray(at + 30, at + 30 + len).toString('utf8'), bytes.subarray(start, start + size)); at = start + size;
  }
  expect(bytes.readUInt32LE(at)).toBe(0x02014b50); return entries;
}

test('W1-A edits, drags, resizes by rows, isolates preview and persists exact JSON', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.getByRole('button', { name: '添加 MultiLineTextWidget', exact: true }).click();
  await commit(page, '多行文字', 'Hello world auto wrapping at the width boundary.\n\n中文说明 😀\nLast line');
  await commit(page, '最大宽度', '100'); await commit(page, '最大行数', '4');
  await page.getByLabel('对齐', { exact: true }).selectOption('center'); await commit(page, '颜色 ARGB', '#FFE0E0E0');
  await expect(page.getByLabel('多行文本布局诊断')).toContainText('已按最大行数截断');
  const initial = await first(page); expect(initial.bounds).toMatchObject({ w: 100, h: 36 });
  const stable = await current(page); await commit(page, 'H', '10');
  await expect(page.getByLabel('H', { exact: true })).toHaveAttribute('aria-invalid', 'true'); expect(await current(page)).toEqual(stable);
  await page.getByLabel('H', { exact: true }).press('Escape');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  const start = await point(page, initial.bounds.x + 20, initial.bounds.y + 5);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 13, start.y + 17, { steps: 5 }); await page.mouse.up();
  const moved = await first(page); expect(moved.id).toBe(initial.id); expect(moved.bounds.x).not.toBe(initial.bounds.x);
  const history = await page.getByTestId('history-count').textContent();
  const resize = await point(page, moved.bounds.x + moved.bounds.w, moved.bounds.y + moved.bounds.h);
  await page.mouse.move(resize.x, resize.y); await page.mouse.down(); await page.mouse.move(resize.x + 21, resize.y + 20, { steps: 6 }); await page.mouse.up();
  const resized = await first(page); expect(resized.bounds.w).toBeGreaterThan(moved.bounds.w); expect(resized.bounds.h % 9).toBe(0); expect(resized.props).toMatchObject({ maxWidth: resized.bounds.w, maxRows: resized.bounds.h / 9 });
  expect(await page.getByTestId('history-count').textContent()).not.toBe(history);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect((await first(page)).bounds).toEqual(moved.bounds);
  await page.getByRole('button', { name: '重做', exact: true }).click(); expect(await first(page)).toEqual(resized);
  const before = await current(page), hist = await page.getByTestId('history-count').textContent();
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await page.mouse.click(start.x, start.y); expect(await current(page)).toEqual(before); expect(await page.getByTestId('history-count').textContent()).toBe(hist);
  await page.screenshot({ path: info.outputPath('W1-preview.png') });
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload();
  await expect(page.getByTestId('save-status')).toContainText('已保存'); expect(await current(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('W1-A real multi-Screen ZIP contains authority, native agent contract, consistent hashes and PNGs', async ({ page }, info) => {
  // Observe the exact production download Blob before its short-lived URL is revoked.
  // Disk download cancellation is reported separately, never mistaken for successful saveAs.
  await page.addInitScript(() => {
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download.endsWith('.zip')) (window as unknown as { w1Zip: Promise<number[]> }).w1Zip = fetch(this.href).then(r => r.arrayBuffer()).then(b => Array.from(new Uint8Array(b)));
      return click.call(this);
    };
  });
  await page.goto('/'); await commit(page, '项目名称', 'W1-A MultiLine acceptance');
  await page.getByRole('button', { name: '添加 MultiLineTextWidget', exact: true }).click();
  await commit(page, '多行文字', 'Native MultiLineTextWidget\nHello world, automatic wrapping.\n中文说明与换行 😀\nFifth line is truncated.');
  await commit(page, '最大宽度', '140'); await commit(page, '最大行数', '4');
  await page.getByRole('button', { name: '新增画布', exact: true }).click();
  await page.getByRole('button', { name: '添加 MultiLineTextWidget', exact: true }).click();
  await page.getByLabel('多行文字类型').selectOption('translate'); await commit(page, '多行文字翻译键', 'gui.w1.description');
  await commit(page, '多行文字预览文字', 'Centered description\nSecond line\n第三行');
  await page.getByLabel('对齐', { exact: true }).selectOption('center');
  await commit(page, '最大宽度', '170'); await commit(page, '最大行数', '5');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  const before = await current(page), history = await page.getByTestId('history-count').textContent();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  const download = await downloadPromise;
  const dir = info.outputPath('delivery'); await mkdir(dir, { recursive: true });
  const path = resolve(dir, `W1-A-multi-screen-${info.project.name}.zip`);
  const bytes = Buffer.from(await page.evaluate(() => (window as unknown as { w1Zip: Promise<number[]> }).w1Zip));
  await writeFile(path, bytes);
  await info.attach('production-ZIP-transport', { body: `Exact app-generated download Blob saved by test harness. Browser download URL: ${download.url()}. Disk saveAs not asserted; cancellation remains SUSPENDING.`, contentType: 'text/plain' });
  const entries = unpack(bytes), manifestFile = [...entries.keys()].find(k => k.endsWith('.manifest.json'))!;
  const manifest = JSON.parse(entries.get(manifestFile)!.toString()), authority = JSON.parse(entries.get(manifest.authority.file)!.toString());
  expect(authority).toEqual(before); expect(authority.schemaVersion).toBe('0.17.0'); expect(manifest.screens).toHaveLength(2);
  for (const file of manifest.files) expect(createHash('sha256').update(entries.get(file.name)!).digest('hex')).toBe(file.sha256);
  for (const screen of manifest.screens) { const png = entries.get(screen.designImage.name)!; expect(png.readUInt32BE(16)).toBe(320); expect(png.readUInt32BE(20)).toBe(180); }
  const spec = JSON.parse(entries.get([...entries.keys()].find(k => k.endsWith('.implementation.json'))!)!.toString());
  expect(spec.version).toBe('0.7.0'); expect(spec.designIntent.screens[1].nodes[0].properties.text.key).toBe('gui.w1.description');
  expect(spec.designIntent.widgetContracts.multiLineTextWidget.shadow).toContain('props.textShadow is explicit');
  expect(spec.designIntent.widgetContracts.multiLineTextWidget.shadow).toContain('no presumed native shadow setter');
  const prompt = entries.get([...entries.keys()].find(k => k.endsWith('.prompt.md'))!)!.toString(); expect(prompt).toContain('NEVER call setSize'); expect(prompt).toContain('PENDING');
  expect(await current(page)).toEqual(before); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await page.getByRole('button', { name: '关闭导出结果' }).click(); await page.screenshot({ path: info.outputPath('W1-multi-screen.png') });
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: entries.get(manifest.authority.file)! });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功'); expect(await current(page)).toEqual(before);
});

test('W1-A visible Canvas and PNG share text layout with system/user fonts and a resource session', async ({ page }, info) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 MultiLineTextWidget', exact: true }).click();
  await commit(page, '多行文字', 'Hello world\nABCDEFG\n中文 😀'); await commit(page, '最大宽度', '110'); await commit(page, '最大行数', '5');
  await page.getByRole('button', { name: '资源包检查', exact: true }).click();
  const resource = page.getByRole('region', { name: '资源包检查' });
  await resource.getByLabel('选择资源包 ZIP').setInputFiles({ name: 'synthetic.zip', mimeType: 'application/zip', buffer: zipFixture(packFiles()) });
  await expect(resource).toContainText('资源包已检查并载入'); await resource.getByRole('button', { name: '关闭资源包检查' }).click();
  for (const font of ['system', 'user']) {
    if (font === 'user') { await page.getByLabel('选择预览字体').setInputFiles('C:/Windows/Fonts/arial.ttf'); await expect(page.getByTestId('font-status')).toContainText('用户字体'); }
    const result = await page.evaluate(async () => {
      const pngPath = '/src/exports/designPng.ts', snapPath = '/src/exports/snapshot.ts', fontPath = '/src/render/previewFont.ts';
      const { renderDesignPng } = await import(/* @vite-ignore */ pngPath), { beginExport, referenceFor } = await import(/* @vite-ignore */ snapPath), { drawPreviewText, fontSession } = await import(/* @vite-ignore */ fontPath);
      const doc = JSON.parse(document.querySelector('[data-testid="project-json"]')!.textContent!), snapshot = beginExport(doc), font = await fontSession.capture(), n = doc.screens[0].nodes[0];
      const png = await renderDesignPng(snapshot, await referenceFor(snapshot), 1, undefined, font);
      const image = await createImageBitmap(new Blob([png], { type: 'image/png' }));
      const a = document.createElement('canvas'), b = document.createElement('canvas'); a.width = b.width = 320; a.height = b.height = 180;
      const ac = a.getContext('2d')!, bc = b.getContext('2d')!; ac.drawImage(image, 0, 0); image.close(); bc.translate(n.bounds.x, n.bounds.y); drawPreviewText(bc, n, n.bounds.w, n.bounds.h, font.family);
      const pa = ac.getImageData(0, 0, 320, 180).data, pb = bc.getImageData(0, 0, 320, 180).data;
      return { difference: pa.reduce((sum, v, i) => sum + (v === pb[i] ? 0 : 1), 0), ink: pa.filter((_, i) => i % 4 === 3 && pa[i] > 0).length };
    });
    expect(result.difference).toBe(0); expect(result.ink).toBeGreaterThan(50);
    await page.screenshot({ path: info.outputPath(`W1-${font}-font.png`) });
  }
});
