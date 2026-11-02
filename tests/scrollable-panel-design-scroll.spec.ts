import { expect, test } from '@playwright/test';
import { createNode, emptyProject } from '../src/domain/model';

test('design scrollbar reveals and edits children without writing scroll state into the project', async ({ page }) => {
  const project = emptyProject(); project.schemaVersion = '0.26.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  const panel = createNode('minecraft:scrollable-panel', 'panel_1', { x: 20, y: 20 });
  if (panel.type !== 'minecraft:scrollable-panel') throw new Error('panel fixture');
  panel.props.contentHeight = 240;
  const child = createNode('minecraft:button', 'button_1', { x: 10, y: 160 });
  child.bounds = { x: 10, y: 160, w: 120, h: 20 }; child.parentContainerId = panel.id;
  project.screens[0].nodes.push(panel, child);
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'design-scroll.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  const before = await read(), history = await page.getByTestId('history-count').textContent();
  const host = page.getByTestId('canvas-host');
  const point = async (x: number, y: number) => host.evaluate((element, p) => {
    const r = element.getBoundingClientRect(), zoom = Number(element.getAttribute('data-zoom'));
    return { x: r.x + Number(element.getAttribute('data-origin-x')) + p.x * zoom, y: r.y + Number(element.getAttribute('data-origin-y')) + p.y * zoom, zoom };
  }, { x, y });

  // The thumb keeps receiving the pointer after it leaves the viewport.
  const thumb = await point(193, 24 + (88 * 88 / 240) / 2);
  await page.mouse.move(thumb.x, thumb.y); await page.mouse.down();
  await page.mouse.move(thumb.x + 70 * thumb.zoom, thumb.y + 90 * thumb.zoom, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => JSON.parse((await host.getAttribute('data-scroll-offsets'))!).panel_1).toBe(152);
  expect(await read()).toEqual(before);
  expect(await page.getByTestId('history-count').textContent()).toBe(history);

  // The formerly hidden child is hit at its scrolled screen position; moving
  // it changes content-local coordinates by the pointer delta, not the offset.
  const middle = await point(24 + 10 + 60, 24 + 160 - 152 + 10);
  await page.mouse.click(middle.x, middle.y);
  await expect(page.getByRole('button', { name: '选择 button_1' })).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(middle.x, middle.y); await page.mouse.down();
  await page.mouse.move(middle.x + 10 * middle.zoom, middle.y + 12 * middle.zoom, { steps: 4 }); await page.mouse.up();
  const moved = (await read()).screens[0].nodes.find((node: { id: string }) => node.id === 'button_1');
  expect(moved.bounds.x).toBeGreaterThan(10); expect(moved.bounds.y).toBeGreaterThan(160);
  expect(moved.bounds.y).toBeLessThan(200);

  const bottomRight = await point(24 + moved.bounds.x + moved.bounds.w, 24 + moved.bounds.y - 152 + moved.bounds.h);
  await page.mouse.move(bottomRight.x, bottomRight.y); await page.mouse.down();
  await page.mouse.move(bottomRight.x + 8 * bottomRight.zoom, bottomRight.y + 6 * bottomRight.zoom, { steps: 4 }); await page.mouse.up();
  const resized = (await read()).screens[0].nodes.find((node: { id: string }) => node.id === 'button_1');
  expect(resized.bounds.w).toBeGreaterThan(moved.bounds.w); expect(resized.bounds.h).toBeGreaterThan(moved.bounds.h);
  expect(resized.bounds.x).toBe(moved.bounds.x); expect(resized.bounds.y).toBe(moved.bounds.y);

  const textPoint = await point(24 + resized.bounds.x + 20, 24 + resized.bounds.y - 152 + 8);
  await page.mouse.dblclick(textPoint.x, textPoint.y);
  const editor = page.getByLabel('画布文字编辑'); await expect(editor).toBeVisible();
  const editorBox = await editor.boundingBox(), childTopLeft = await point(24 + resized.bounds.x, 24 + resized.bounds.y - 152);
  expect(Math.abs(editorBox!.x - childTopLeft.x)).toBeLessThan(2);
  expect(Math.abs(editorBox!.y - childTopLeft.y)).toBeLessThan(2);
  await editor.press('Escape');

  const after = await read();
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect.poll(async () => JSON.parse((await host.getAttribute('data-scroll-offsets'))!).panel_1 ?? 0).toBe(0);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  expect(await read()).toEqual(after);
});
