import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createEditorStore } from '../src/editor/store';
import { isNumericNode } from '../src/render/numericWidgets';
import { validValue } from '../src/domain/numeric';
import type { GuiProject } from '../src/domain/schema';
import { GUI_SPRITES, SLIDER_SPRITES } from '../src/resources/layered';
import { meta, zipFixture } from './resource-fixtures';

const c = { min: -.15, max: .3, step: .1, initialValue: .05, numericType: 'decimal' as const, format: { decimals: 2, unit: 'm' } };
const read = async (page: Page): Promise<GuiProject> => JSON.parse((await page.getByTestId('project-json').textContent())!);
const events = async (page: Page) => JSON.parse((await page.getByTestId('numeric-preview-events').getAttribute('data-events'))!);
async function importDoc(page: Page, doc: GuiProject) { await page.getByLabel('导入项目文件').setInputFiles({ name: 'numeric.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }); await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功'); }
async function field(page: Page, label: string, value: string) { await page.getByLabel(label, { exact: true }).fill(value); await page.getByLabel(label, { exact: true }).blur(); }
function fixture() {
  const s = createEditorStore(); s.getState().add('minecraft:numeric-input'); const input = s.getState().selected!;
  s.getState().updateNode(input, n => { if (isNumericNode(n)) { Object.assign(n.props, c); n.bounds = { x: 20, y: 30, w: 110, h: 20 }; } return n; });
  s.getState().add('minecraft:slider'); const slider = s.getState().selected!;
  s.getState().updateNode(slider, n => { if (isNumericNode(n)) { Object.assign(n.props, c); n.bounds = { x: 20, y: 80, w: 150, h: 20 }; } return n; });
  s.getState().setEntryScreen(s.getState().currentScreenId); return { s, input, slider };
}
async function canvasClick(page: Page, id: string) {
  const p = await page.getByTestId('canvas-host').evaluate((host, id) => { const doc = JSON.parse(document.querySelector('[data-testid="project-json"]')!.textContent!), active = (document.querySelector('[aria-label="当前画布"]') as HTMLSelectElement).value, n = doc.screens.find((s: any) => s.id === active).nodes.find((n: any) => n.id === id), r = host.getBoundingClientRect(), z = Number(host.getAttribute('data-zoom')); return { x: r.x + Number(host.getAttribute('data-origin-x')) + (n.bounds.x + n.bounds.w / 2) * z, y: r.y + Number(host.getAttribute('data-origin-y')) + (n.bounds.y + n.bounds.h / 2) * z }; }, id);
  await page.mouse.click(p.x, p.y);
}
function unpack(bytes: Buffer) {
  const out = new Map<string, Buffer>(); let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) { const len = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28), size = bytes.readUInt32LE(at + 18), start = at + 30 + len + extra; out.set(bytes.subarray(at + 30, at + 30 + len).toString('utf8'), bytes.subarray(start, start + size)); at = start + size; }
  return out;
}

test('W1-B atomic Inspector, design gestures, history, persistence and invalid constraint barrier', async ({ page }, info) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Numeric Input', exact: true }).click();
  await page.getByLabel('数值类型', { exact: true }).selectOption('decimal');
  for (const [label, value] of [['最小值', '-0.15'], ['最大值', '0.3'], ['步进', '0.1'], ['初始数值', '0.05'], ['显示小数位', '2'], ['数值单位', 'm']]) await page.getByLabel(label, { exact: true }).fill(value);
  const before = await read(page); expect(before.screens[0].nodes[0].props).toMatchObject({ min: 0 });
  await page.getByRole('button', { name: '应用数值约束' }).click(); expect((await read(page)).screens[0].nodes[0].props).toMatchObject(c);
  await page.getByLabel('步进', { exact: true }).fill('0'); const good = await read(page); await page.getByRole('button', { name: '应用数值约束' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'step > 0' })).toBeVisible(); expect(await read(page)).toEqual(good);
  await page.getByLabel('步进', { exact: true }).fill('0.1'); await page.getByRole('button', { name: '添加 Slider', exact: true }).click();
  await field(page, 'X', '20'); await field(page, 'Y', '80'); await field(page, 'W', '180'); await field(page, 'H', '24');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  let node = (await read(page)).screens[0].nodes.at(-1)!;
  await canvasClick(page, node.id); await expect(page.getByRole('button', { name: `选择 ${node.id}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Existing smart snapping can move a selected node by a few pixels; target its committed handle.
  node = (await read(page)).screens[0].nodes.at(-1)!;
  const p = await page.getByTestId('canvas-host').evaluate((host, b) => { const r = host.getBoundingClientRect(), z = Number(host.getAttribute('data-zoom')); return { x: r.x + Number(host.getAttribute('data-origin-x')) + (b.x + b.w) * z, y: r.y + Number(host.getAttribute('data-origin-y')) + (b.y + b.h) * z }; }, node.bounds);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 20, p.y + 5, { steps: 4 }); await page.mouse.up();
  const resized = await read(page); expect(resized.screens[0].nodes.at(-1)!.bounds.w).toBeGreaterThan(node.bounds.w);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect((await read(page)).screens[0].nodes.at(-1)!.bounds).toEqual(node.bounds);
  await page.getByRole('button', { name: '重做', exact: true }).click(); expect(await read(page)).toEqual(resized);
  await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload(); await expect(page.getByTestId('save-status')).toContainText('已保存'); expect(await read(page)).toEqual(resized);
  await page.screenshot({ path: info.outputPath('W1B-design.png') });
});

test('W1-B1 draft/error recovery, exactly-once Enter+Tab and isolated export initial values', async ({ page }, info) => {
  const { s, input, slider } = fixture(); await page.goto('/'); await importDoc(page, s.getState().doc); const doc = await read(page), history = await page.getByTestId('history-count').textContent();
  await page.getByRole('button', { name: '交互预览', exact: true }).click(); const box = page.getByLabel(`数值输入 ${input}`, { exact: true });
  for (const draft of ['-', '', '.', '0.1', '0.9']) { await box.fill(draft); await box.press('Enter'); await expect(box).toHaveAttribute('aria-invalid', 'true'); await expect(box).toHaveValue(draft); expect(await events(page)).toHaveLength(0); }
  await page.screenshot({ path: info.outputPath('W1B-input-error.png') });
  await box.fill('.15'); await box.press('Enter'); await expect(box).toHaveValue('0.15'); expect(await events(page)).toEqual([expect.objectContaining({ nodeId: input, value: .15, type: 'numeric-commit' })]);
  await box.press('Tab'); expect(await events(page)).toHaveLength(1);
  const range = page.getByRole('slider', { name: `滑块 ${slider}` }); await range.focus(); await range.press('ArrowRight'); await expect(range).toHaveAttribute('aria-valuenow', '0.15');
  expect(await read(page)).toEqual(doc); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.export-links a')).toHaveCount(6);
  const json = await page.locator('.export-links a').first().evaluate(async el => (await fetch((el as HTMLAnchorElement).href)).json()); expect(json).toEqual(doc);
  await page.getByRole('button', { name: '关闭导出结果' }).click(); await box.fill('-'); await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await page.getByRole('button', { name: '交互预览', exact: true }).click(); await expect(page.getByLabel(`数值输入 ${input}`, { exact: true })).toHaveValue('0.05'); expect(await events(page)).toHaveLength(0);
});

test('W1-B2 pointer capture, off-grid max, consumed arrow steps, constant/minimum size and disabled controls', async ({ page }, info) => {
  const { s, slider } = fixture(); s.getState().add('minecraft:slider'); const disabled = s.getState().selected!; s.getState().updateNode(disabled, n => { if (n.type === 'minecraft:slider') { n.state.enabled = false; n.bounds = { x: 180, y: 30, w: 100, h: 20 }; } return n; });
  s.getState().add('minecraft:slider'); const constant = s.getState().selected!; s.getState().updateNode(constant, n => { if (n.type === 'minecraft:slider') { n.props.min = n.props.max = n.props.initialValue = 7; n.props.showValue = false; n.bounds = { x: 180, y: 80, w: 9, h: 9 }; } return n; });
  await page.goto('/'); await importDoc(page, s.getState().doc); await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const range = page.getByRole('slider', { name: `滑块 ${slider}`, exact: true }), r = (await range.boundingBox())!;
  await range.click({ position: { x: r.width - 2, y: r.height / 2 } }); await expect(range).toHaveAttribute('aria-valuenow', '0.3');
  await range.press('ArrowLeft'); await expect(range).toHaveAttribute('aria-valuenow', '0.25'); await range.press('ArrowLeft'); await expect(range).toHaveAttribute('aria-valuenow', '0.15');
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down(); await page.mouse.move(r.x - 40, r.y + r.height + 40, { steps: 8 }); const count = (await events(page)).length; await page.mouse.up(); expect(await events(page)).toHaveLength(count); await expect(range).toHaveAttribute('aria-valuenow', '-0.15');
  for (const event of await events(page)) expect(validValue(c, event.value)).toBe(true);
  const frozen = page.getByRole('slider', { name: `滑块 ${disabled}`, exact: true }), fr = (await frozen.boundingBox())!; await page.mouse.click(fr.x + fr.width / 2, fr.y + fr.height / 2); await expect(frozen).toHaveAttribute('aria-valuenow', '50');
  const tiny = page.getByRole('slider', { name: `滑块 ${constant}`, exact: true }); await tiny.click(); await tiny.press('ArrowRight'); await expect(tiny).toHaveAttribute('aria-valuenow', '7'); expect(await events(page)).toHaveLength(count);
  await page.screenshot({ path: info.outputPath('W1B-sliders.png') });
});

function navigationFixture() {
  const { s, input, slider } = fixture(), a = s.getState().currentScreenId;
  s.getState().add('minecraft:button'); const next = s.getState().selected!; s.getState().updateNode(next, n => ({ ...n, bounds: { x: 180, y: 30, w: 90, h: 20 } }));
  s.getState().add('minecraft:button'); const self = s.getState().selected!; s.getState().updateNode(self, n => ({ ...n, bounds: { x: 180, y: 70, w: 90, h: 20 } }));
  s.getState().addScreen(); const b = s.getState().currentScreenId; s.getState().add('minecraft:numeric-input'); const otherInput = s.getState().selected!;
  s.getState().add('minecraft:button'); const back = s.getState().selected!; s.getState().updateNode(back, n => ({ ...n, bounds: { x: 180, y: 70, w: 90, h: 20 } }));
  s.getState().saveScreenTarget({ id: 'target_a', name: 'Back', boundScreenId: a }); s.getState().saveBehavior({ id: 'go_a', event: { type: 'button-click', sourceId: back }, action: { type: 'open_screen', targetScreenId: 'target_a' } });
  s.getState().switchScreen(a); s.getState().saveScreenTarget({ id: 'target_b', name: 'Next', boundScreenId: b }); s.getState().saveScreenTarget({ id: 'target_self', name: 'Self', boundScreenId: a });
  s.getState().saveBehavior({ id: 'go_b', event: { type: 'button-click', sourceId: next }, action: { type: 'open_screen', targetScreenId: 'target_b' } });
  s.getState().saveBehavior({ id: 'go_self', event: { type: 'button-click', sourceId: self }, action: { type: 'open_screen', targetScreenId: 'target_self' } });
  return { s, a, b, input, slider, otherInput, next, self, back };
}
test('W1-B open_screen including self resets numeric state with behavior panel closed', async ({ page }) => {
  const f = navigationFixture(); f.s.getState().switchScreen(f.b); f.s.getState().add('minecraft:cycle-button');
  const cycle = f.s.getState().selected!; f.s.getState().updateNode(cycle, n => ({ ...n, bounds: { x: 20, y: 110, w: 150, h: 20 } })); f.s.getState().switchScreen(f.a);
  await page.goto('/'); await importDoc(page, f.s.getState().doc); const before = await read(page);
  await page.getByRole('button', { name: '交互预览', exact: true }).click(); const box = page.getByLabel(`数值输入 ${f.input}`, { exact: true });
  await box.fill('0.15'); await box.press('Enter'); await canvasClick(page, f.self); await expect(box).toHaveValue('0.05'); expect(await events(page)).toHaveLength(0);
  await box.fill('-'); await canvasClick(page, f.next); await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(f.b);
  await expect(page.getByRole('button', { name: '交互预览', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const other = page.getByLabel(`数值输入 ${f.otherInput}`, { exact: true }); await other.fill('3'); await other.press('Enter');
  const cyclePoint = await page.getByTestId('canvas-host').evaluate(host => { const r = host.getBoundingClientRect(), z = Number(host.getAttribute('data-zoom')); return { x: r.x + Number(host.getAttribute('data-origin-x')) + 80 * z, y: r.y + Number(host.getAttribute('data-origin-y')) + 120 * z }; });
  await page.mouse.move(cyclePoint.x, cyclePoint.y); const canvas = page.getByTestId('canvas-host').locator('canvas').first(), cycleBefore = await canvas.screenshot(); await page.mouse.wheel(0, 50);
  await expect.poll(async () => (await canvas.screenshot()).equals(cycleBefore)).toBe(false);
  await canvasClick(page, f.back); await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(f.a); await expect(box).toHaveValue('0.05');
  await expect(page.getByRole('slider', { name: `滑块 ${f.slider}`, exact: true })).toHaveAttribute('aria-valuenow', '0.05'); expect(await read(page)).toEqual(before);
});

test('W1-B production multi-Screen ZIP preserves design snapshot, typed events and native responsibilities', async ({ page }, info) => {
  await page.addInitScript(() => { const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download.endsWith('.zip')) (window as any).numericZip = fetch(this.href).then(r => r.arrayBuffer()).then(b => Array.from(new Uint8Array(b))); return click.call(this); }; });
  const f = navigationFixture(); f.s.getState().renameProject('W1-B Numeric controls'); await page.goto('/'); await importDoc(page, f.s.getState().doc);
  const before = await read(page); await page.getByRole('button', { name: '交互预览', exact: true }).click(); await page.getByLabel(`数值输入 ${f.input}`, { exact: true }).fill('.15'); await page.getByLabel(`数值输入 ${f.input}`, { exact: true }).press('Enter');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  const bytes = Buffer.from(await page.evaluate(() => (window as any).numericZip)); const dir = info.outputPath('delivery'); await mkdir(dir, { recursive: true }); await writeFile(resolve(dir, `W1-B-multi-screen-${info.project.name}.zip`), bytes);
  const files = unpack(bytes), manifest = JSON.parse(files.get([...files.keys()].find(k => k.endsWith('.manifest.json'))!)!.toString()), authority = JSON.parse(files.get(manifest.authority.file)!.toString());
  expect(authority).toEqual(before); expect(authority.schemaVersion).toBe('0.17.0'); expect(manifest.version).toBe('0.12.0'); expect(manifest.screens).toHaveLength(2);
  for (const file of manifest.files) expect(createHash('sha256').update(files.get(file.name)!).digest('hex')).toBe(file.sha256);
  expect(manifest.screens[0].numericControls[0].initialValue).toBe(.05);
  const spec = JSON.parse(files.get([...files.keys()].find(k => k.endsWith('.implementation.json'))!)!.toString()); expect(spec.version).toBe('0.7.0'); expect(spec.designIntent.numericEvents).toHaveLength(3);
  const prompt = files.get([...files.keys()].find(k => k.endsWith('.prompt.md'))!)!.toString(); expect(prompt).toContain('setFilter'); expect(prompt).toContain('no F2 numeric dataflow'); expect(prompt).toContain('return true');
  for (const screen of manifest.screens) { const png = files.get(screen.designImage.name)!; expect(png.readUInt32BE(16)).toBe(320); expect(png.readUInt32BE(20)).toBe(180); }
  await page.getByRole('button', { name: '关闭导出结果' }).click(); await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await importDoc(page, authority); expect(await read(page)).toEqual(before); await page.screenshot({ path: info.outputPath('W1B-multi-screen.png') });
});

test('W1-B Slider uses actual client sprites/user font and diagnoses corrupt handle fallback in export', async ({ page }, info) => {
  test.setTimeout(120_000);
  const { s } = fixture(); await page.goto('/'); await importDoc(page, s.getState().doc);
  await page.getByRole('button', { name: '资源包检查', exact: true }).click(); const panel = page.getByRole('region', { name: '资源包检查' });
  await panel.getByLabel('选择客户端 JAR').setInputFiles('C:/Users/JuGeLiZizzz/.gradle/caches/neoformruntime/artifacts/minecraft_1.21.1_client.jar'); await expect(panel).toContainText('客户端自报版本符合', { timeout: 60000 }); await panel.getByRole('button', { name: '关闭资源包检查' }).click();
  await page.getByLabel('选择预览字体').setInputFiles('C:/Windows/Fonts/arial.ttf'); await expect(page.getByTestId('font-status')).toContainText('用户字体');
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(6);
  const manifest = await page.locator('.export-links a').last().evaluate(async e => (await fetch((e as HTMLAnchorElement).href)).json());
  expect(manifest.visualResources.sprites[SLIDER_SPRITES[0]].status).toBe('valid'); expect(manifest.visualResources.sprites[SLIDER_SPRITES[2]].status).toBe('valid');
  await page.getByRole('button', { name: '关闭导出结果' }).click(); await page.screenshot({ path: info.outputPath('W1B-client-font.png') });
  await page.getByRole('button', { name: '资源包检查', exact: true }).click();
  const broken = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(broken); broken.writeUInt32BE(13, 8); broken.write('IHDR', 12); broken.writeUInt32BE(8, 16); broken.writeUInt32BE(20, 20);
  await panel.getByLabel('选择资源包 ZIP').setInputFiles({ name: 'bad-handle.zip', mimeType: 'application/zip', buffer: zipFixture([{ name: 'pack.mcmeta', data: meta }, { name: 'assets/minecraft/textures/gui/sprites/widget/slider_handle.png', data: broken }]) });
  await expect(panel).toContainText('资源包已检查并载入'); await panel.getByRole('button', { name: '关闭资源包检查' }).click();
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(6);
  const fallback = await page.locator('.export-links a').last().evaluate(async e => (await fetch((e as HTMLAnchorElement).href)).json()); expect(fallback.visualResources.sprites[SLIDER_SPRITES[2]].status).toBe('invalid');
  expect(fallback.visualResources.diagnostics.join(' ')).toContain('slider_handle'); expect(GUI_SPRITES).toHaveLength(5);
});
