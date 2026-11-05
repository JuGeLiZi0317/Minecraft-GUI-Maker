import { expect, test, type Page } from '@playwright/test';
import { createNode, emptyProject } from '../src/domain/model';

function fixture(initialExpanded: boolean) {
  const doc = emptyProject(); doc.schemaVersion = '0.27.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
  const panel = createNode('minecraft:collapsible-panel', 'collapse_1', { x: 30, y: 20 });
  if (panel.type !== 'minecraft:collapsible-panel') throw Error('fixture');
  panel.bounds = { x: 30, y: 20, w: 180, h: 120 }; panel.props.initialExpanded = initialExpanded; panel.props.backgroundColor = '#FF123456';
  const child = createNode('minecraft:button', 'child_1', { x: 10, y: 15 }); child.bounds.w = 60; child.parentContainerId = panel.id;
  const root = createNode('minecraft:button', 'root_1', { x: 70, y: 90 }); root.bounds.w = 60;
  doc.screens[0].nodes = [panel, child, root];
  const other = structuredClone(doc.screens[0]); other.id = 'screen_other'; other.nodes = []; doc.screens.push(other);
  return doc;
}
async function load(page: Page, initialExpanded = false) {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'collapse.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture(initialExpanded))) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
}
async function point(page: Page, x: number, y: number) {
  return page.getByTestId('canvas-host').evaluate((host, p) => {
    const r = host.getBoundingClientRect(), zoom = Number(host.getAttribute('data-zoom'));
    return { x: r.x + Number(host.getAttribute('data-origin-x')) + p.x * zoom, y: r.y + Number(host.getAttribute('data-origin-y')) + p.y * zoom };
  }, { x, y });
}
async function pixel(page: Page, x: number, y: number, offset = 0) {
  return page.getByTestId('canvas-host').evaluate((host, p) => {
    const canvas = host.querySelector<HTMLCanvasElement>('.konvajs-content canvas')!, zoom = Number(host.getAttribute('data-zoom'));
    const x = (Number(host.getAttribute('data-origin-x')) + (p.x + p.offset) * zoom) * canvas.width / canvas.clientWidth;
    const y = (Number(host.getAttribute('data-origin-y')) + p.y * zoom) * canvas.height / canvas.clientHeight;
    return Array.from(canvas.getContext('2d')!.getImageData(Math.floor(x), Math.floor(y), 1, 1).data).slice(0, 3);
  }, { x, y, offset });
}
const toggle = (page: Page) => page.locator('[data-design-collapse-toggle="collapse_1"]');

test('overlapping panels route header actions only to the visible foreground panel', async ({ page }) => {
  const doc = fixture(false), top = createNode('minecraft:collapsible-panel', 'collapse_top', { x: 170, y: 0 });
  if (top.type !== 'minecraft:collapsible-panel') throw Error('fixture');
  top.props.backgroundColor = '#FF654321';
  top.bounds = { x: 170, y: 0, w: 120, h: 120 }; doc.screens[0].nodes.push(top);
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'overlapping.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await expect(toggle(page)).toHaveCount(0);
  await expect.poll(() => pixel(page, 200, 30)).toEqual([101, 67, 33]);
  const coveredArrow = await point(page, 200, 30); await page.mouse.click(coveredArrow.x, coveredArrow.y);
  await expect(page.getByRole('button', { name: '选择 collapse_top', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-design-collapse-toggle="collapse_top"]').click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await toggle(page).click(); await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
});

for (const initial of [false, true]) test(`design expansion is independent of initialExpanded=${initial} and covers sibling input`, async ({ page }) => {
  await load(page, initial);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => pixel(page, 72, 92)).toEqual([18, 52, 86]);
  const p = await point(page, 90, 100); await page.mouse.click(p.x, p.y);
  await expect(page.getByRole('button', { name: '选择 collapse_1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await toggle(page).click(); await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  const collapsed = await pixel(page, 72, 92);
  expect(collapsed).not.toEqual([18, 52, 86]);
  const header = await point(page, 80, 30); await page.mouse.move(header.x, header.y); await page.mouse.down();
  // Sampling while the pointer is held catches the previous full-height gesture flash.
  await expect.poll(() => pixel(page, 72, 92)).toEqual(collapsed); await page.mouse.up();
  await page.getByRole('button', { name: '选择 child_1', exact: true }).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => pixel(page, 72, 92)).toEqual(collapsed);
  await toggle(page).click();
  await expect.poll(() => pixel(page, 72, 92)).toEqual([18, 52, 86]);
});

test('design expansion survives active and inactive Screen rendering and runtime reset', async ({ page }) => {
  await load(page, false); await page.getByLabel('Zoom', { exact: true }).selectOption('0.5');
  const before = await page.getByTestId('project-json').textContent();
  await page.getByLabel('当前画布', { exact: true }).selectOption('screen_other');
  await expect.poll(() => pixel(page, 74, 94, -380)).toEqual([18, 52, 86]);
  await page.getByLabel('当前画布', { exact: true }).selectOption('screen_main');
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await toggle(page).click();
  await page.getByLabel('当前画布', { exact: true }).selectOption('screen_other');
  expect(await pixel(page, 74, 94, -380)).not.toEqual([18, 52, 86]);
  await page.getByLabel('当前画布', { exact: true }).selectOption('screen_main');
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await toggle(page).click();
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.locator('[data-collapse-toggle="collapse_1"]')).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  expect(await page.getByTestId('project-json').textContent()).toBe(before);
});

test('catalog insertion into a collapsed selected panel remains a clipped child', async ({ page }) => {
  await load(page); await toggle(page).click();
  await page.getByRole('button', { name: '添加 Slider', exact: true }).click();
  const doc = JSON.parse((await page.getByTestId('project-json').textContent())!);
  const added = doc.screens[0].nodes.find((node: { type: string }) => node.type === 'minecraft:slider');
  expect(added.parentContainerId).toBe('collapse_1');
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await toggle(page).click();
  // Sample below the newly appended Slider, still inside the covered root Button.
  await expect.poll(() => pixel(page, 72, 105)).toEqual([18, 52, 86]);
  const p = await point(page, 30 + added.bounds.x + added.bounds.w / 2, 40 + added.bounds.y + added.bounds.h / 2);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByRole('button', { name: `选择 ${added.id}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
});
