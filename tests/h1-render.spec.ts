import { expect, test } from '@playwright/test';
import { createNode, emptyProject } from '../src/domain/model';
import { CHECKBOX_SPRITES, GUI_SPRITES } from '../src/resources/layered';
import { zipFixture } from './resource-fixtures';

test('isolated H1 canvas and reference PNG use initial geometry and state', async ({ page }) => {
  await page.goto('/');
  const doc = emptyProject(); doc.schemaVersion = '0.4.0';
  const check = createNode('minecraft:checkbox', 'check_1', { x: 20, y: 20 });
  const cycle = createNode('minecraft:cycle-button', 'cycle_1', { x: 20, y: 60 });
  if (check.type !== 'minecraft:checkbox' || cycle.type !== 'minecraft:cycle-button') throw new Error('bad fixture');
  check.props.selected = true; check.props.message = { kind: 'literal', value: 'Test' };
  doc.screens[0].nodes.push(check, cycle);
  // This test-only injection deliberately bypasses the production import gate.
  await page.evaluate(async json => {
    const path = '/src/editor/store.ts';
    const { editorStore } = await import(/* @vite-ignore */ path);
    editorStore.setState({ doc: JSON.parse(json), selected: null });
  }, JSON.stringify(doc));
  await expect(page.getByTestId('project-json')).toContainText('minecraft:checkbox');
  const png = await page.evaluate(async json => {
    const path = '/src/exports/designPng.ts'; const { renderDesignPng } = await import(/* @vite-ignore */ path);
    const snapshot = { document: JSON.parse(json) };
    const bytes = await renderDesignPng(snapshot, {}, 1);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = documentGlobalCreateCanvas(); c.width = bitmap.width; c.height = bitmap.height;
    const ctx = c.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
    return [Array.from(ctx.getImageData(22, 22, 1, 1).data), Array.from(ctx.getImageData(22, 62, 1, 1).data)];
    function documentGlobalCreateCanvas() { return window.document.createElement('canvas'); }
  }, JSON.stringify(doc));
  const sample = async (x: number, y: number) => page.getByTestId('canvas-host').evaluate((host, point) => {
    const c = host.querySelector('canvas')!, d = c.width / c.getBoundingClientRect().width;
    const z = Number(host.getAttribute('data-zoom'));
    return Array.from(c.getContext('2d')!.getImageData(Math.floor((Number(host.getAttribute('data-origin-x')) + (point.x + .5) * z) * d), Math.floor((Number(host.getAttribute('data-origin-y')) + (point.y + .5) * z) * d), 1, 1).data);
  }, { x, y });
  await page.mouse.move(0, 0);
  await expect.poll(() => sample(22, 22)).toEqual(png[0]);
  await expect.poll(() => sample(22, 62)).toEqual(png[1]);
  expect(png[0].slice(0, 3)).toEqual([21, 30, 43]);
  expect(png[1].slice(0, 3)).toEqual([49, 67, 84]);
});

test('interaction preview is isolated from the document and history', async ({ page }) => {
  await page.goto('/');
  const doc = emptyProject(); doc.schemaVersion = '0.4.0';
  doc.screens[0].nodes.push(createNode('minecraft:checkbox', 'check_1', { x: 20, y: 20 }), createNode('minecraft:cycle-button', 'cycle_1', { x: 20, y: 60 }));
  await page.evaluate(async json => { const path = '/src/editor/store.ts'; const { editorStore } = await import(/* @vite-ignore */ path); editorStore.setState({ doc: JSON.parse(json), selected: null }); }, JSON.stringify(doc));
  const host = page.getByTestId('canvas-host');
  const before = await page.getByTestId('project-json').textContent(), history = await page.getByTestId('history-count').textContent();
  await page.getByText('模式', { exact: true }).click(); await page.getByRole('button', { name: '交互预览' }).click();
  const point = async (x: number, y: number) => host.evaluate((element, p) => { const r = element.getBoundingClientRect(), z = Number(element.getAttribute('data-zoom')); return { x: r.x + Number(element.getAttribute('data-origin-x')) + p.x * z, y: r.y + Number(element.getAttribute('data-origin-y')) + p.y * z }; }, { x, y });
  const check = await point(25, 25), cycle = await point(40, 68);
  const beforeImage = await host.locator('canvas').first().screenshot();
  await page.mouse.click(check.x, check.y);
  const checkedImage = await host.locator('canvas').first().screenshot();
  expect(checkedImage.equals(beforeImage)).toBe(false);
  await page.mouse.click(cycle.x, cycle.y);
  await page.keyboard.down('Shift'); await page.mouse.click(cycle.x, cycle.y); await page.keyboard.up('Shift');
  await page.mouse.move(cycle.x, cycle.y); await page.mouse.wheel(0, 50);
  expect(await page.getByTestId('project-json').textContent()).toBe(before);
  expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await page.getByText('模式', { exact: true }).click(); await page.getByRole('button', { name: '交互预览' }).click();
  await page.getByText('模式', { exact: true }).click(); await expect(page.getByRole('button', { name: '交互预览' })).toHaveAttribute('aria-pressed', 'false');
});

test('checkbox inspector reports reference, screen and preview-budget overflow without rejecting the data', async ({ page }) => {
  await page.goto('/');
  const doc = emptyProject(); doc.schemaVersion = '0.4.0';
  const node = createNode('minecraft:checkbox', 'check_1', { x: 300, y: 160 });
  if (node.type !== 'minecraft:checkbox') throw new Error('unexpected type');
  node.bounds = { x: 300, y: 160, w: 20, h: 20 }; node.props.maxWidth = 25;
  node.props.message = { kind: 'literal', value: 'x'.repeat(1023) + '😀' + 'tail' }; doc.screens[0].nodes.push(node);
  await page.evaluate(async json => { const path = '/src/editor/store.ts'; const { editorStore } = await import(/* @vite-ignore */ path); editorStore.setState({ doc: JSON.parse(json), selected: 'check_1' }); }, JSON.stringify(doc));
  const diagnostic = page.getByLabel('复选框布局诊断');
  await expect(diagnostic).toContainText('超出参考边界');
  await expect(diagnostic).toContainText('超出设计区');
  await expect(diagnostic).toContainText('已截断');
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].nodes[0].props.message.value).toBe(node.props.message.value);
});

test('checkbox uses decoded synthetic sprite pixels for focus and selected combinations', async ({ page }) => {
  await page.goto('/');
  const colors = ['#a00000', '#00a000', '#0000a0', '#a0a000'];
  const images = await page.evaluate(async colors => Promise.all(colors.map(async color => {
    const canvas = document.createElement('canvas'); canvas.width = 17; canvas.height = 17;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 17, 17);
    return canvas.toDataURL('image/png').split(',')[1];
  })), colors);
  const path = (id: string) => `assets/minecraft/textures/gui/sprites/${id.slice(10)}.png`;
  const jar = zipFixture([{ name: 'version.json', data: JSON.stringify({ id: '1.21.1', pack_version: { resource: 34 } }) },
    { name: 'assets/minecraft/atlases/gui.json', data: JSON.stringify({ sources: [{ type: 'directory', source: 'gui/sprites', prefix: '' }] }) },
    ...GUI_SPRITES.map(id => ({ name: path(id), data: Buffer.from(images[0], 'base64') })),
    ...CHECKBOX_SPRITES.map((id, i) => ({ name: path(id), data: Buffer.from(images[i], 'base64') }))]);
  await page.getByText('视图', { exact: true }).click(); await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover(); await page.getByRole('button', { name: '选择已有资源包' }).click();
  const panel = page.getByRole('region', { name: '资源包检查' });
  await panel.getByLabel('选择客户端 JAR').setInputFiles({ name: 'synthetic.jar', mimeType: 'application/java-archive', buffer: jar });
  await expect(panel).toContainText('客户端自报版本符合');
  await panel.getByRole('button', { name: '关闭资源包检查' }).click();
  const doc = emptyProject(); doc.schemaVersion = '0.4.0';
  doc.screens[0].nodes.push(createNode('minecraft:checkbox', 'check_1', { x: 20, y: 20 }));
  await page.evaluate(async json => { const path = '/src/editor/store.ts'; const { editorStore } = await import(/* @vite-ignore */ path); editorStore.setState({ doc: JSON.parse(json), selected: null }); }, JSON.stringify(doc));
  const host = page.getByTestId('canvas-host');
  const coords = await host.evaluate(element => { const r = element.getBoundingClientRect(), z = Number(element.getAttribute('data-zoom')); return { x: r.x + Number(element.getAttribute('data-origin-x')) + 25 * z, y: r.y + Number(element.getAttribute('data-origin-y')) + 25 * z }; });
  const pixel = () => host.evaluate(element => { const c = element.querySelector('canvas')!, d = c.width / c.getBoundingClientRect().width, z = Number(element.getAttribute('data-zoom')); return Array.from(c.getContext('2d')!.getImageData(Math.floor((Number(element.getAttribute('data-origin-x')) + 22.5 * z) * d), Math.floor((Number(element.getAttribute('data-origin-y')) + 22.5 * z) * d), 1, 1).data); });
  await page.mouse.move(coords.x, coords.y);
  await expect.poll(pixel).toEqual([160, 0, 0, 255]); // hover alone is not focus
  await page.getByText('模式', { exact: true }).click(); await page.getByRole('button', { name: '交互预览' }).click();
  await page.mouse.click(coords.x, coords.y); await expect.poll(pixel).toEqual([160, 160, 0, 255]);
  await page.mouse.click(coords.x, coords.y); await expect.poll(pixel).toEqual([0, 160, 0, 255]);
  await page.getByText('模式', { exact: true }).click(); await page.getByRole('button', { name: '交互预览' }).click();
  await page.evaluate(async () => { const path = '/src/editor/store.ts'; const { editorStore } = await import(/* @vite-ignore */ path); const state = editorStore.getState(), next = structuredClone(state.doc); next.screens[0].nodes[0].props.selected = true; editorStore.setState({ doc: next }); });
  await expect.poll(pixel).toEqual([0, 0, 160, 255]);
});
