import { expect, test, type Page } from '@playwright/test';
import { createNode, emptyProject } from '../src/domain/model';

async function setup(page: Page, root = true, enabled = true) {
  const project = emptyProject(); project.schemaVersion = '0.26.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  const panel = createNode('minecraft:scrollable-panel', 'panel_1', { x: 20, y: 20 });
  if (panel.type !== 'minecraft:scrollable-panel') throw new Error('panel fixture');
  panel.props.contentHeight = 240; panel.state.enabled = enabled; project.screens[0].nodes.push(panel);
  if (root) { const button = createNode('minecraft:button', 'button_1', { x: 34, y: 130 }); button.bounds.w = 120; project.screens[0].nodes.push(button); }
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'parent-drop.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
}
const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const offset = async (page: Page) => JSON.parse((await page.getByTestId('canvas-host').getAttribute('data-scroll-offsets'))!).panel_1 ?? 0;
async function point(page: Page, x: number, y: number) {
  return page.getByTestId('canvas-host').evaluate((host, p) => {
    const rect = host.getBoundingClientRect(), zoom = Number(host.getAttribute('data-zoom'));
    return { x: rect.x + Number(host.getAttribute('data-origin-x')) + p.x * zoom, y: rect.y + Number(host.getAttribute('data-origin-y')) + p.y * zoom, zoom };
  }, { x, y });
}
async function scroll(page: Page, toBottom: boolean) {
  const thumbHeight = 88 * 88 / 240, thumbY = 24 + (toBottom ? 0 : 88 - thumbHeight) + thumbHeight / 2;
  const thumb = await point(page, 193, thumbY);
  await page.mouse.move(thumb.x, thumb.y); await page.mouse.down();
  await page.mouse.move(thumb.x, thumb.y + (toBottom ? 90 : -90) * thumb.zoom, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => offset(page)).toBe(toBottom ? 152 : 0);
}

for (const { initiallyScrolled, zoom110 } of [{ initiallyScrolled: false, zoom110: false }, { initiallyScrolled: true, zoom110: false }, { initiallyScrolled: true, zoom110: true }]) test(`existing node becomes a child when dragged into ${initiallyScrolled ? 'scrolled' : 'top'} container, zoom110=${zoom110}`, async ({ page }) => {
  await setup(page);
  if (zoom110) {
    await page.getByLabel('Zoom', { exact: true }).selectOption('1');
    const host = page.getByTestId('canvas-host'); await host.hover({ position: { x: 40, y: 60 } });
    await page.mouse.wheel(0, -Math.log(1.1) / 0.002 * await page.evaluate(() => window.devicePixelRatio));
    await expect(host).toHaveAttribute('data-zoom', '1.1');
  }
  if (initiallyScrolled) await scroll(page, true);
  const before = await read(page), history = await page.getByTestId('history-count').textContent(), start = await point(page, 94, 140), finish = await point(page, 94, 64);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(finish.x, finish.y, { steps: 8 }); await page.mouse.up();
  const after = await read(page), child = after.screens[0].nodes.find((node: { id: string }) => node.id === 'button_1');
  expect(child.parentContainerId).toBe('panel_1');
  const expectedOffset = initiallyScrolled ? 152 : 0;
  expect(Math.abs(24 + child.bounds.x + child.bounds.w / 2 - 94)).toBeLessThanOrEqual(5);
  expect(Math.abs(24 + child.bounds.y - expectedOffset + child.bounds.h / 2 - 64)).toBeLessThanOrEqual(5);
  expect((await page.getByRole('button', { name: '选择 button_1' }).textContent())).toContain('子节点');
  expect(await page.getByTestId('history-count').textContent()).not.toBe(history);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await read(page)).toEqual(before);
  await page.getByRole('button', { name: '重做', exact: true }).click(); expect(await read(page)).toEqual(after);
  await page.getByRole('button', { name: '选择 panel_1' }).click();
  await scroll(page, !initiallyScrolled);
  await page.mouse.click(finish.x, finish.y);
  await expect(page.getByRole('button', { name: '选择 button_1' })).toHaveAttribute('aria-pressed', 'false');
  expect(await read(page)).toEqual(after);
});

test('palette drop into a scrolled container uses content-local coordinates and a single history entry', async ({ page }) => {
  await setup(page, false); await scroll(page, true);
  const before = await read(page), host = page.getByTestId('canvas-host');
  const target = await host.evaluate(element => ({ x: Number(element.getAttribute('data-origin-x')) + 106 * Number(element.getAttribute('data-zoom')), y: Number(element.getAttribute('data-origin-y')) + 64 * Number(element.getAttribute('data-zoom')) }));
  await page.getByRole('button', { name: '添加 Button', exact: true }).dragTo(host, { targetPosition: target });
  const after = await read(page), child = after.screens[0].nodes.find((node: { type: string }) => node.type === 'minecraft:button');
  expect(child.parentContainerId).toBe('panel_1'); expect(child.bounds).toEqual({ x: 7, y: 182, w: 150, h: 20 });
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await read(page)).toEqual(before);
  await page.getByRole('button', { name: '重做', exact: true }).click(); expect(await read(page)).toEqual(after);
});

test('Inspector preserves the visible position when moving in and out of a scrolled container', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '选择 button_1' }).click();
  await page.getByLabel('Y', { exact: true }).fill('54'); await page.getByLabel('Y', { exact: true }).press('Enter');
  await scroll(page, true);
  const before = await read(page), original = before.screens[0].nodes.find((node: { id: string }) => node.id === 'button_1');
  await page.getByLabel('父容器').selectOption('panel_1');
  const inside = await read(page), child = inside.screens[0].nodes.find((node: { id: string }) => node.id === 'button_1');
  expect(child.parentContainerId).toBe('panel_1'); expect(child.bounds).toEqual({ ...original.bounds, x: original.bounds.x - 24, y: original.bounds.y - 24 + 152 });
  await page.getByLabel('父容器').selectOption('');
  const root = (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'button_1');
  expect(root.parentContainerId).toBeUndefined(); expect(root.bounds).toEqual(original.bounds);
});

test('an inactive container still accepts a child during design', async ({ page }) => {
  await setup(page, true, false);
  const start = await point(page, 94, 140), finish = await point(page, 94, 64);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(finish.x, finish.y, { steps: 6 }); await page.mouse.up();
  const child = (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'button_1');
  expect(child.parentContainerId).toBe('panel_1');
});

test('a child that cannot fit is rejected without moving the original node', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '选择 button_1' }).click();
  await page.getByLabel('W', { exact: true }).fill('170'); await page.getByLabel('W', { exact: true }).press('Enter');
  const before = await read(page), history = await page.getByTestId('history-count').textContent();
  const start = await point(page, 119, 140), finish = await point(page, 106, 64);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(finish.x, finish.y, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('无法完整放入');
  expect(await read(page)).toEqual(before); expect(await page.getByTestId('history-count').textContent()).toBe(history);
});
