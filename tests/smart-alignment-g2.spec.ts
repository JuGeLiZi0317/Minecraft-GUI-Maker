import { expect, test, type Page } from '@playwright/test';

type Bounds = { x: number; y: number; w: number; h: number };
async function doc(page: Page) { return JSON.parse((await page.getByTestId('project-json').textContent())!); }
async function nodes(page: Page) { return (await doc(page)).screens[0].nodes as { id: string; bounds: Bounds }[]; }
async function setNumber(page: Page, label: 'X' | 'Y' | 'W' | 'H', value: number, nodeIndex: number) {
  const field = page.getByLabel(label, { exact: true }); await field.fill(String(value)); await field.press('Enter');
  await expect.poll(async () => (await nodes(page))[nodeIndex].bounds[label.toLowerCase() as keyof Bounds]).toBe(value);
}
async function point(page: Page, x: number, y: number) {
  const host = page.getByTestId('canvas-host'), box = (await host.boundingBox())!;
  return { x: box.x + Number(await host.getAttribute('data-origin-x')) + x * Number(await host.getAttribute('data-zoom')),
    y: box.y + Number(await host.getAttribute('data-origin-y')) + y * Number(await host.getAttribute('data-zoom')) };
}
async function dragResize(page: Page, bounds: Bounds, width: number, height: number) {
  const zoom = Number(await page.getByTestId('canvas-host').getAttribute('data-zoom'));
  const from = await point(page, bounds.x + bounds.w - 0.5 / zoom, bounds.y + bounds.h - 0.5 / zoom);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x + (width - bounds.w) * zoom, from.y + (height - bounds.h) * zoom, { steps: 7 });
}
async function dragMove(page: Page, bounds: Bounds, x: number, y: number) {
  const from = await point(page, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x + (x - bounds.x) * Number(await page.getByTestId('canvas-host').getAttribute('data-zoom')),
    from.y + (y - bounds.y) * Number(await page.getByTestId('canvas-host').getAttribute('data-zoom')), { steps: 7 });
}
function undoCount(text: string) { return Number(text.match(/^(\d+) undo/)?.[1]); }

test('Resize snaps two Buttons to the same width, preserves the top-left, and is one undoable gesture', async ({ page }) => {
  await page.goto('/'); const host = page.getByTestId('canvas-host');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await setNumber(page, 'W', 100, 0);
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await setNumber(page, 'X', 16, 1); await setNumber(page, 'Y', 60, 1);
  await page.getByLabel('Zoom', { exact: true }).selectOption({ label: '100%' }); await page.getByLabel('Pan X', { exact: true }).fill('35');
  await page.locator('input[aria-label="Y"]').first().fill('-17');
  const before = (await nodes(page))[1].bounds, countBefore = undoCount((await page.getByTestId('history-count').textContent())!);
  await dragResize(page, before, 97, before.h);
  await expect(host).toHaveAttribute('data-alignment-x', '116');
  await page.mouse.up();
  await expect.poll(async () => (await nodes(page))[1].bounds.w).toBe(100);
  expect((await nodes(page))[1].bounds).toMatchObject({ x: before.x, y: before.y, w: 100, h: before.h });
  await expect.poll(async () => undoCount((await page.getByTestId('history-count').textContent())!)).toBe(countBefore + 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); await expect.poll(async () => (await nodes(page))[1].bounds.w).toBe(150);
  await page.getByRole('button', { name: '重做', exact: true }).click(); await expect.poll(async () => (await nodes(page))[1].bounds.w).toBe(100);
});

test('Resize aligns an EditBox right edge to a Button and keeps its left edge fixed', async ({ page }) => {
  await page.goto('/'); const host = page.getByTestId('canvas-host');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await page.getByRole('button', { name: '添加 EditBox', exact: true }).click(); await setNumber(page, 'X', 16, 1); await setNumber(page, 'Y', 60, 1);
  const before = (await nodes(page))[1].bounds;
  await dragResize(page, before, 149, before.h); await expect(host).toHaveAttribute('data-alignment-x', '166'); await page.mouse.up();
  await expect.poll(async () => (await nodes(page))[1].bounds.w).toBe(150);
  expect((await nodes(page))[1].bounds).toMatchObject({ x: before.x, y: before.y });
});

test('three horizontal controls get one equal-gap marker, snap, undo, and clear on Escape', async ({ page }) => {
  await page.goto('/'); const host = page.getByTestId('canvas-host');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await setNumber(page, 'X', 20, 0); await setNumber(page, 'Y', 20, 0); await setNumber(page, 'W', 30, 0);
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await setNumber(page, 'X', 110, 1); await setNumber(page, 'Y', 20, 1); await setNumber(page, 'W', 30, 1);
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await setNumber(page, 'X', 60, 2); await setNumber(page, 'Y', 20, 2); await setNumber(page, 'W', 30, 2);
  const original = (await nodes(page))[2].bounds, countBefore = undoCount((await page.getByTestId('history-count').textContent())!);
  await dragMove(page, original, 64, original.y);
  await expect(host).toHaveAttribute('data-spacing-axis', 'x'); await expect(host).toHaveAttribute('data-spacing-gap', '15'); await page.mouse.up();
  await expect.poll(async () => (await nodes(page))[2].bounds.x).toBe(65);
  await expect.poll(async () => undoCount((await page.getByTestId('history-count').textContent())!)).toBe(countBefore + 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); await expect.poll(async () => (await nodes(page))[2].bounds.x).toBe(60);
  const beforeCancel = await doc(page), countAfterUndo = await page.getByTestId('history-count').textContent();
  await dragMove(page, original, 64, original.y); await expect(host).toHaveAttribute('data-spacing-axis', 'x');
  await page.keyboard.press('Escape'); await expect(host).toHaveAttribute('data-spacing-axis', ''); await page.mouse.up();
  expect(await doc(page)).toEqual(beforeCancel); expect(await page.getByTestId('history-count').textContent()).toBe(countAfterUndo);
});

test('three vertical controls receive a vertical equal-gap mark at integer GUI coordinates', async ({ page }) => {
  await page.goto('/'); const host = page.getByTestId('canvas-host');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await setNumber(page, 'X', 20, 0); await setNumber(page, 'Y', 20, 0);
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await setNumber(page, 'X', 20, 1); await setNumber(page, 'Y', 80, 1);
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await setNumber(page, 'X', 20, 2); await setNumber(page, 'Y', 48, 2);
  const original = (await nodes(page))[2].bounds;
  await dragMove(page, original, original.x, 48); await expect(host).toHaveAttribute('data-spacing-axis', 'y'); await expect(host).toHaveAttribute('data-spacing-gap', '10');
  await page.mouse.up(); await expect.poll(async () => (await nodes(page))[2].bounds.y).toBe(50);
});

test('overlapping peers do not produce an equal-spacing hint', async ({ page }) => {
  await page.goto('/'); const host = page.getByTestId('canvas-host');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await setNumber(page, 'X', 20, 0); await setNumber(page, 'Y', 20, 0); await setNumber(page, 'W', 50, 0);
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await setNumber(page, 'X', 40, 1); await setNumber(page, 'Y', 20, 1); await setNumber(page, 'W', 50, 1);
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await setNumber(page, 'X', 35, 2); await setNumber(page, 'Y', 20, 2); await setNumber(page, 'W', 30, 2);
  const original = (await nodes(page))[2].bounds;
  await dragMove(page, original, 36, original.y); await expect(host).toHaveAttribute('data-spacing-axis', ''); await page.mouse.up();
});

test('screen switch after a gesture clears all temporary alignment state without editing the project', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  const host = page.getByTestId('canvas-host'), secondNode = (await nodes(page))[1].bounds;
  await dragMove(page, secondNode, 18, secondNode.y); await expect(host).toHaveAttribute('data-alignment-x', '16'); await page.mouse.up();
  await expect(host).toHaveAttribute('data-alignment-x', '');
  const imported = await doc(page); imported.schemaVersion = '0.12.0';
  const second = structuredClone(imported.screens[0]); second.id = 'screen_second'; second.title = { kind: 'literal', value: 'Second Screen' };
  second.nodes = []; second.behaviors = []; second.variables = []; second.screenTargets = [];
  imported.screens.push(second);
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'two-screens.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await expect.poll(async () => (await doc(page)).screens.length).toBe(2);
  const box = (await host.boundingBox())!, zoom = 0.5;
  await page.getByLabel('Zoom', { exact: true }).selectOption({ label: '50%' });
  const originX = Number(await host.getAttribute('data-origin-x')), originY = Number(await host.getAttribute('data-origin-y'));
  const history = await page.getByTestId('history-count').textContent(), before = await doc(page);
  await page.mouse.click(box.x + originX + (320 + 60 + 24) * zoom, box.y + originY - 12);
  await expect(page.locator('.canvas-caption')).toContainText('screen_second');
  await expect(host).toHaveAttribute('data-alignment-x', ''); await expect(host).toHaveAttribute('data-alignment-y', ''); await expect(host).toHaveAttribute('data-spacing-axis', '');
  expect(await doc(page)).toEqual(before); expect(await page.getByTestId('history-count').textContent()).toBe(history);
});
