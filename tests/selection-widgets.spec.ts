import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createEditorStore } from '../src/editor/store';
import { isSelectionNode } from '../src/domain/selection';
import { literal } from '../src/domain/model';
import type { GuiProject } from '../src/domain/schema';

const read = async (page: Page): Promise<GuiProject> => JSON.parse((await page.getByTestId('project-json').textContent())!);
const events = async (page: Page) => JSON.parse((await page.getByTestId('selection-preview-events').getAttribute('data-events'))!);
async function load(page: Page, doc: GuiProject) { await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({ name: 'selection.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }); await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功'); }
function fixture() {
  const s = createEditorStore(); s.getState().add('minecraft:radio-group'); const radio = s.getState().selected!;
  s.getState().updateNode(radio, n => { n.bounds = { x: 10, y: 15, w: 130, h: 60 }; if (isSelectionNode(n)) { n.props.name = literal('Mode'); n.props.options[1].disabled = true; } return n; });
  s.getState().add('minecraft:dropdown'); const dropdown = s.getState().selected!;
  s.getState().updateNode(dropdown, n => { n.bounds = { x: 160, y: 30, w: 140, h: 20 }; if (n.type === 'minecraft:dropdown') { n.props.name = literal('Quality'); n.props.visibleRows = 3; n.props.options = Array.from({ length: 14 }, (_, i) => ({ id: `choice_${i}`, label: literal(`Quality ${i}`), disabled: i === 1 })); n.props.initialSelectedOptionId = 'choice_0'; } return n; });
  s.getState().add('minecraft:button'); const next = s.getState().selected!;
  s.getState().updateNode(next, n => { n.bounds = { x: 160, y: 65, w: 140, h: 20 }; if (n.type === 'minecraft:button') n.props.message = literal('Next Screen'); return n; });
  s.getState().setPanel(true); s.getState().setPanelBounds({ x: 150, y: 20, w: 160, h: 45 });
  const a = s.getState().currentScreenId; s.getState().addScreen(); const b = s.getState().currentScreenId;
  s.getState().add('minecraft:dropdown'); const edge = s.getState().selected!;
  s.getState().updateNode(edge, n => { n.bounds = { x: 170, y: 155, w: 140, h: 20 }; if (n.type === 'minecraft:dropdown') n.props.name = literal('Edge'); return n; });
  s.getState().add('minecraft:radio-group'); s.getState().updateNode(s.getState().selected!, n => { n.bounds = { x: 10, y: 20, w: 130, h: 60 }; if (n.type === 'minecraft:radio-group') n.state.enabled = false; return n; });
  s.getState().add('minecraft:button'); const back = s.getState().selected!; s.getState().updateNode(back, n => { n.bounds = { x: 10, y: 110, w: 100, h: 20 }; if (n.type === 'minecraft:button') n.props.message = literal('Back'); return n; });
  s.getState().saveScreenTarget({ id: 'target_a', name: 'Back', boundScreenId: a }); s.getState().saveBehavior({ id: 'back', event: { type: 'button-click', sourceId: back }, action: { type: 'open_screen', targetScreenId: 'target_a' } });
  s.getState().switchScreen(a); s.getState().saveScreenTarget({ id: 'target_b', name: 'Next', boundScreenId: b }); s.getState().saveBehavior({ id: 'next', event: { type: 'button-click', sourceId: next }, action: { type: 'open_screen', targetScreenId: 'target_b' } });
  s.getState().setEntryScreen(a); s.getState().renameProject('W1-C Selection acceptance'); return { s, a, b, radio, dropdown, edge, next, back };
}
async function canvasClick(page: Page, id: string) {
  const p = await page.getByTestId('canvas-host').evaluate((host, id) => { const doc = JSON.parse(document.querySelector('[data-testid="project-json"]')!.textContent!), current = (document.querySelector('[aria-label="当前画布"]') as HTMLSelectElement).value, n = doc.screens.find((s: any) => s.id === current).nodes.find((n: any) => n.id === id), r = host.getBoundingClientRect(), z = Number(host.getAttribute('data-zoom')); return { x: r.x + Number(host.getAttribute('data-origin-x')) + (n.bounds.x + n.bounds.w / 2) * z, y: r.y + Number(host.getAttribute('data-origin-y')) + (n.bounds.y + n.bounds.h / 2) * z }; }, id);
  await page.mouse.click(p.x, p.y);
}
test('W1-C Inspector option transactions, explicit replacement, reorder, geometry and persistence', async ({ page }, info) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Radio Group', exact: true }).click();
  expect((await read(page)).schemaVersion).toBe('0.18.0');
  await page.getByLabel('选项文字 option_2', { exact: true }).fill('Same label');
  await page.getByRole('button', { name: '上移 option_2', exact: true }).click();
  const old = await read(page); await page.getByRole('button', { name: '删除 option_1', exact: true }).click();
  await page.getByRole('button', { name: '应用选择选项', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('初始选择'); expect(await read(page)).toEqual(old);
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(0); expect(await read(page)).toEqual(old);
  await page.getByRole('button', { name: '关闭导出结果' }).click();
  await page.getByLabel('初始选择', { exact: true }).selectOption('option_2'); await page.getByRole('button', { name: '应用选择选项', exact: true }).click();
  const doc = await read(page), n = doc.screens[0].nodes[0]; expect(n.props).toMatchObject({ initialSelectedOptionId: 'option_2', options: [expect.objectContaining({ id: 'option_2' }), expect.objectContaining({ id: 'option_3' })] });
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await read(page)).toEqual(old); await page.getByRole('button', { name: '重做', exact: true }).click(); expect(await read(page)).toEqual(doc);
  await page.getByLabel('H', { exact: true }).fill('80'); await page.getByLabel('H', { exact: true }).blur();
  await page.getByRole('button', { name: '新增选项', exact: true }).click(); await page.getByRole('button', { name: '应用选择选项', exact: true }).click();
  const saved = await read(page); await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload(); await expect(page.getByTestId('save-status')).toContainText('已保存'); expect(await read(page)).toEqual(saved);
  await page.screenshot({ path: info.outputPath('W1C-inspector.png') });
});
test('W1-C1 radio single confirmation, disabled skip, keyboard and session isolation', async ({ page }, info) => {
  const f = fixture(); await load(page, f.s.getState().doc); const before = await read(page), history = await page.getByTestId('history-count').textContent();
  await canvasClick(page, f.radio); await expect(page.getByRole('button', { name: `选择 ${f.radio}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  const design = await read(page); await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const first = page.getByRole('radio', { name: 'One (1/3)', exact: true }), last = page.getByRole('radio', { name: 'Three (3/3)', exact: true });
  await first.click(); expect(await events(page)).toHaveLength(0); await first.press('ArrowDown'); await expect(last).toHaveAttribute('aria-checked', 'true'); expect(await events(page)).toHaveLength(1);
  await last.press('Home'); await expect(first).toHaveAttribute('aria-checked', 'true'); expect(await events(page)).toHaveLength(2);
  const disabled = (await page.getByRole('radio', { name: 'Two (2/3)', exact: true }).boundingBox())!; await page.mouse.click(disabled.x + 2, disabled.y + 2); expect(await events(page)).toHaveLength(2);
  await last.click(); await last.click(); expect(await events(page)).toHaveLength(3); expect(await read(page)).toEqual(design); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await page.screenshot({ path: info.outputPath('W1C-radio.png') });
  await page.getByRole('button', { name: '交互预览', exact: true }).click(); await page.getByRole('button', { name: '交互预览', exact: true }).click(); await expect(first).toHaveAttribute('aria-checked', 'true'); expect(await events(page)).toHaveLength(0);
  expect(before.project.id).toBe(design.project.id);
});
test('W1-C2 root overlay input priority, paired release, keyboard cancel/confirm and wheel isolation', async ({ page }, info) => {
  const f = fixture(); await load(page, f.s.getState().doc); await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Quality: Quality 0', exact: true }); await trigger.click(); const list = page.getByRole('listbox', { name: 'Quality', exact: true }); await expect(list).toBeVisible();
  await trigger.press('ArrowDown'); expect(await events(page)).toHaveLength(0); await expect(list).toHaveAttribute('aria-activedescendant', `choice-${f.dropdown}-choice_2`);
  await trigger.press('Escape'); await expect(list).toHaveCount(0); await expect(trigger).toHaveAttribute('aria-expanded', 'false'); await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(f.a);
  await trigger.click(); const disabled = (await page.getByRole('option', { name: 'Quality 1 (2/14)', exact: true }).boundingBox())!; await page.mouse.click(disabled.x + 3, disabled.y + 3); await expect(list).toBeVisible(); expect(await events(page)).toHaveLength(0);
  // Candidate 2 is drawn beyond Panel and over the underlying navigation Button.
  await page.getByRole('option', { name: 'Quality 2 (3/14)', exact: true }).click(); await expect(page.getByRole('button', { name: 'Quality: Quality 2', exact: true })).toBeVisible(); await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(f.a); expect(await events(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Quality: Quality 2', exact: true }).press('Enter'); await expect(list).toBeVisible(); await page.keyboard.press('End');
  await expect(list).toHaveAttribute('aria-activedescendant', `choice-${f.dropdown}-choice_13`); expect(await events(page)).toHaveLength(1);
  const zoom = await page.getByTestId('canvas-host').getAttribute('data-zoom'), box = (await list.boundingBox())!; await page.mouse.move(box.x + 5, box.y + 5); await page.mouse.wheel(0, -1000); await expect.poll(() => list.evaluate(e => e.scrollTop)).toBe(0); expect(await page.getByTestId('canvas-host').getAttribute('data-zoom')).toBe(zoom);
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); expect(await events(page)).toHaveLength(1); // unchanged confirmation
  await page.getByRole('button', { name: 'Quality: Quality 2', exact: true }).click(); await canvasClick(page, f.radio); await expect(list).toHaveCount(0); expect(await events(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Quality: Quality 2', exact: true }).click(); await page.keyboard.press('Tab'); await expect(list).toHaveCount(0);
  await page.getByRole('button', { name: 'Quality: Quality 2', exact: true }).click(); await page.setViewportSize({ width: 1400, height: 860 }); await expect(list).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('W1C-dropdown.png') });
});
test('W1-C navigation resets selected/open state, edge popup flips and disabled group stays inert', async ({ page }, info) => {
  const f = fixture(); await load(page, f.s.getState().doc); await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await page.getByRole('button', { name: 'Quality: Quality 0', exact: true }).click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await canvasClick(page, f.next); await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(f.b);
  const trigger = page.getByRole('button', { name: 'Edge: One', exact: true }); await trigger.click(); const list = page.getByRole('listbox', { name: 'Edge', exact: true }); await expect(list).toBeVisible(); expect((await list.boundingBox())!.y).toBeLessThan((await trigger.boundingBox())!.y);
  await page.screenshot({ path: info.outputPath('W1C-edge.png') }); await page.keyboard.press('Shift+Tab'); await expect(trigger).toBeFocused(); await trigger.press('Enter'); await page.keyboard.press('Escape');
  await expect(page.getByRole('radio', { name: 'One (1/3)', exact: true })).toBeDisabled();
  await canvasClick(page, f.back); await expect(page.getByRole('button', { name: 'Quality: Quality 0', exact: true })).toBeVisible(); expect(await events(page)).toHaveLength(0);
});
function unpack(bytes: Buffer) { const files = new Map<string, Buffer>(); let at = 0; while (bytes.readUInt32LE(at) === 0x04034b50) { const len = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28), size = bytes.readUInt32LE(at + 18), start = at + 30 + len + extra; files.set(bytes.subarray(at + 30, at + 30 + len).toString(), bytes.subarray(start, start + size)); at = start + size; } return files; }
test('W1-C actual product ZIP preserves complete options, snapshot hashes and closed PNG across Screens', async ({ page }, info) => {
  await page.addInitScript(() => { const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download.endsWith('.zip')) (window as any).selectionZip = fetch(this.href).then(r => r.arrayBuffer()).then(b => Array.from(new Uint8Array(b))); return click.call(this); }; });
  const f = fixture(); await load(page, f.s.getState().doc); const before = await read(page);
  await page.getByRole('button', { name: '交互预览', exact: true }).click(); await page.getByRole('button', { name: 'Quality: Quality 0', exact: true }).click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  const bytes = Buffer.from(await page.evaluate(() => (window as any).selectionZip)); const dir = resolve('outputs/W1-C'); await mkdir(dir, { recursive: true }); await writeFile(resolve(dir, `W1-C-${info.project.name}.zip`), bytes);
  await writeFile(resolve(dir, 'acceptance-project.json'), JSON.stringify(before, null, 2));
  const files = unpack(bytes), manifest = JSON.parse(files.get([...files.keys()].find(k => k.endsWith('.manifest.json'))!)!.toString()); expect(manifest.version).toBe('0.12.0'); expect(manifest.screens).toHaveLength(2);
  expect(JSON.parse(files.get(manifest.authority.file)!.toString())).toEqual(before); for (const file of manifest.files) expect(createHash('sha256').update(files.get(file.name)!).digest('hex')).toBe(file.sha256);
  const spec = JSON.parse(files.get([...files.keys()].find(k => k.endsWith('.implementation.json'))!)!.toString()); expect(spec.version).toBe('0.7.0'); expect(spec.designIntent.selectionEvents).toHaveLength(4); expect(spec.selectionRuntimeContract.overlay).toContain('matching release');
  expect(manifest.screens[0].selectionControls[1].options).toHaveLength(14);
  for (const screen of manifest.screens) { const png = files.get(screen.designImage.name)!; expect(png.readUInt32BE(16)).toBe(320); expect(png.readUInt32BE(20)).toBe(180); await writeFile(resolve(dir, `${info.project.name}-${screen.screenId}.png`), png); }
  expect(await read(page)).toEqual(before);
});

test('W1-C real design dragging and Resize enforce composite cell minima in one history transaction', async ({ page }) => {
  const f = fixture(); await load(page, f.s.getState().doc); await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  for (const id of [f.radio, f.dropdown]) {
    await page.getByRole('button', { name: `选择 ${id}`, exact: true }).click();
    const node = (await read(page)).screens[0].nodes.find(n => n.id === id)!;
    const p = await page.getByTestId('canvas-host').evaluate((host, b) => { const r = host.getBoundingClientRect(), z = Number(host.getAttribute('data-zoom')); return { x: r.x + Number(host.getAttribute('data-origin-x')) + (b.x + b.w) * z, y: r.y + Number(host.getAttribute('data-origin-y')) + (b.y + b.h) * z }; }, node.bounds);
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x - 250, p.y - 150, { steps: 5 }); await page.mouse.up();
    const resized = (await read(page)).screens[0].nodes.find(n => n.id === id)!; expect(resized.bounds.w).toBeGreaterThanOrEqual(20); expect(resized.bounds.h).toBeGreaterThanOrEqual(id === f.radio ? 60 : 20);
    await page.getByRole('button', { name: '撤销', exact: true }).click(); expect((await read(page)).screens[0].nodes.find(n => n.id === id)!.bounds).toEqual(node.bounds);
    await canvasClick(page, id); const committed = (await read(page)).screens[0].nodes.find(n => n.id === id)!;
    const point = await page.getByTestId('canvas-host').evaluate((host, b) => { const r = host.getBoundingClientRect(), z = Number(host.getAttribute('data-zoom')); return { x: r.x + Number(host.getAttribute('data-origin-x')) + (b.x + b.w / 2) * z, y: r.y + Number(host.getAttribute('data-origin-y')) + (b.y + b.h / 2) * z }; }, committed.bounds);
    await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 10, point.y + 20, { steps: 4 }); await page.mouse.up();
    expect((await read(page)).screens[0].nodes.find(n => n.id === id)!.bounds.y).not.toBe(committed.bounds.y);
  }
});

test('W1-C self navigation and imported owner removal clean overlays and old listeners', async ({ page }) => {
  const f = fixture(); f.s.getState().saveScreenTarget({ id: 'target_self', name: 'Self', boundScreenId: f.a }); f.s.getState().saveBehavior({ id: 'next', event: { type: 'button-click', sourceId: f.next }, action: { type: 'open_screen', targetScreenId: 'target_self' } });
  await load(page, f.s.getState().doc); await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await page.getByRole('button', { name: 'Quality: Quality 0', exact: true }).click(); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await canvasClick(page, f.next);
  await expect(page.getByRole('button', { name: 'Quality: Quality 0', exact: true })).toBeVisible(); expect(await events(page)).toHaveLength(0);
  await page.getByRole('button', { name: 'Quality: Quality 0', exact: true }).click();
  const replacement = structuredClone(f.s.getState().doc); replacement.screens[0].nodes = replacement.screens[0].nodes.filter(n => n.id !== f.dropdown);
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'removed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(replacement)) });
  await expect(page.getByRole('listbox')).toHaveCount(0); await expect(page.getByRole('button', { name: '交互预览', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '添加 Dropdown', exact: true }).click(); expect((await read(page)).screens[0].nodes.at(-1)!.type).toBe('minecraft:dropdown');
});

test('W1-C horizontal radio and custom font/resource environment keep runtime out of PNG', async ({ page }, info) => {
  await page.addInitScript(() => { const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download.endsWith('.zip')) (window as any).horizontalZip = fetch(this.href).then(r => r.arrayBuffer()).then(b => Array.from(new Uint8Array(b))); return click.call(this); }; });
  const f = fixture(); f.s.getState().updateNode(f.radio, n => { if (n.type === 'minecraft:radio-group') { n.props.orientation = 'horizontal'; n.bounds = { x: 10, y: 110, w: 290, h: 20 }; } return n; });
  await load(page, f.s.getState().doc);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  const bytes = Buffer.from(await page.evaluate(() => (window as any).horizontalZip)); await mkdir(resolve('outputs/W1-C'), { recursive: true }); await writeFile(resolve('outputs/W1-C', `W1-C-horizontal-${info.project.name}.zip`), bytes);
  await page.getByRole('button', { name: '资源包检查', exact: true }).click(); const resources = page.getByRole('region', { name: '资源包检查' });
  await resources.getByLabel('选择客户端 JAR').setInputFiles('C:/Users/JuGeLiZizzz/.gradle/caches/neoformruntime/artifacts/minecraft_1.21.1_client.jar'); await expect(resources).toContainText('客户端自报版本符合', { timeout: 60_000 }); await resources.getByRole('button', { name: '关闭资源包检查' }).click();
  await page.getByLabel('选择预览字体').setInputFiles('C:/Windows/Fonts/arial.ttf'); await expect(page.getByTestId('font-status')).toContainText('用户字体');
  const pixels = async () => {
    await page.getByRole('button', { name: '导出规格', exact: true }).click();
    const link = page.locator('.export-links a').filter({ hasText: '设计区 PNG' }).first(); await expect(link).toBeVisible();
    const bytes = await link.evaluate(async el => { const bitmap = await createImageBitmap(await (await fetch((el as HTMLAnchorElement).href)).blob()); const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); const bytes = Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data); bitmap.close(); return bytes; });
    await page.getByRole('button', { name: '关闭导出结果' }).click(); return bytes;
  };
  const initial = await pixels(); await page.getByRole('button', { name: '交互预览', exact: true }).click(); const first = page.getByRole('radio', { name: 'One (1/3)', exact: true }), last = page.getByRole('radio', { name: 'Three (3/3)', exact: true });
  await first.press('ArrowRight'); await expect(last).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Quality: Quality 0', exact: true }).click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  expect(await pixels()).toEqual(initial); await page.screenshot({ path: info.outputPath('W1C-font-horizontal.png') });
});

test('W1-C disabled Canvas matches PNG and popup respects explicit text style', async ({ page }) => {
  const f = fixture(); f.s.getState().updateNode(f.dropdown, n => { if (isSelectionNode(n)) { n.props.color = '#FFFF0000'; n.props.textShadow = true; } return n; });
  await load(page, f.s.getState().doc); await page.getByLabel('当前画布', { exact: true }).selectOption(f.b); await page.getByLabel('Zoom', { exact: true }).selectOption('1'); await page.mouse.move(0, 0);
  const pixel = await page.getByTestId('canvas-host').evaluate(host => { const canvas = host.querySelector('canvas')!, ratio = canvas.width / canvas.getBoundingClientRect().width, zoom = Number(host.getAttribute('data-zoom')); return Array.from(canvas.getContext('2d')!.getImageData(Math.floor((Number(host.getAttribute('data-origin-x')) + 18 * zoom) * ratio), Math.floor((Number(host.getAttribute('data-origin-y')) + 30 * zoom) * ratio), 1, 1).data); });
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); const png = page.locator('.export-links a').filter({ hasText: 'Screen 1 · 设计区 PNG' });
  const exported = await png.evaluate(async el => { const bitmap = await createImageBitmap(await (await fetch((el as HTMLAnchorElement).href)).blob()); const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height; const ctx = c.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close(); return Array.from(ctx.getImageData(18, 30, 1, 1).data); });
  expect(pixel).toEqual(exported); expect(exported).toEqual([119, 119, 119, 255]); await page.getByRole('button', { name: '关闭导出结果' }).click();
  await page.getByRole('button', { name: '交互预览', exact: true }).click(); await page.getByRole('button', { name: 'Quality: Quality 0', exact: true }).click(); const option = page.getByRole('option', { name: 'Quality 0 (1/14)', exact: true });
  await expect(option).toHaveCSS('color', 'rgb(255, 0, 0)'); expect(await option.evaluate(e => getComputedStyle(e).textShadow)).not.toBe('none');
});
