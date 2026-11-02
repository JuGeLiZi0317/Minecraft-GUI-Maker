import { expect, test, type Page } from '@playwright/test';
import { createNode, emptyProject } from '../src/domain/model';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
async function point(page: Page, x: number, y: number) {
  return page.getByTestId('canvas-host').evaluate((host, p) => {
    const rect = host.getBoundingClientRect(), zoom = Number(host.getAttribute('data-zoom'));
    return { x: rect.x + Number(host.getAttribute('data-origin-x')) + p.x * zoom, y: rect.y + Number(host.getAttribute('data-origin-y')) + p.y * zoom, zoom };
  }, { x, y });
}
async function importProject(page: Page, project: ReturnType<typeof emptyProject>) {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'container-layout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
}
function panelFixture() {
  const project = emptyProject(); project.schemaVersion = '0.26.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  const panel = createNode('minecraft:scrollable-panel', 'panel_1', { x: 80, y: 40 });
  if (panel.type !== 'minecraft:scrollable-panel') throw Error('panel fixture');
  panel.props.contentHeight = 240; project.screens[0].nodes.push(panel);
  return { project, panel };
}
function child(id: string, parentId: string, x: number, y: number, w: number) {
  const node = createNode('minecraft:button', id, { x, y }); node.bounds = { x, y, w, h: 20 }; node.parentContainerId = parentId; return node;
}
async function canvasPixel(page: Page, x: number, y: number, screenOffsetX = 0) {
  return page.getByTestId('canvas-host').evaluate((host, p) => {
    const zoom = Number(host.getAttribute('data-zoom')), ox = Number(host.getAttribute('data-origin-x')), oy = Number(host.getAttribute('data-origin-y'));
    const canvas = host.querySelector<HTMLCanvasElement>('.konvajs-content canvas')!;
    const px = Math.floor((ox + (p.x + p.screenOffsetX) * zoom) * canvas.width / canvas.clientWidth), py = Math.floor((oy + p.y * zoom) * canvas.height / canvas.clientHeight);
    return Array.from(canvas.getContext('2d')!.getImageData(px, py, 1, 1).data);
  }, { x, y, screenOffsetX });
}
async function hasGuidePixel(page: Page, x: number, y: number, color: 'green' | 'gold') {
  return page.getByTestId('canvas-host').evaluate((host, p) => {
    const zoom = Number(host.getAttribute('data-zoom')), ox = Number(host.getAttribute('data-origin-x')), oy = Number(host.getAttribute('data-origin-y'));
    return [...host.querySelectorAll<HTMLCanvasElement>('.konvajs-content canvas')].some(canvas => {
      const scaleX = canvas.width / canvas.clientWidth, scaleY = canvas.height / canvas.clientHeight;
      const centerX = Math.round((ox + p.x * zoom) * scaleX), centerY = Math.round((oy + p.y * zoom) * scaleY);
      const width = Math.max(1, Math.ceil(2 * scaleX)), height = Math.max(1, Math.ceil(2 * scaleY));
      const startX = Math.max(0, centerX - width), startY = Math.max(0, centerY - height);
      const region = canvas.getContext('2d')!.getImageData(startX, startY, Math.min(canvas.width - startX, width * 2 + 1), Math.min(canvas.height - startY, height * 2 + 1)).data;
      for (let i = 0; i < region.length; i += 4) {
        const [r, g, b, a] = region.slice(i, i + 4);
        if (a > 100 && (p.color === 'green' ? g > 180 && b > 145 && r < 140 : r > 200 && g > 125 && b < 140)) return true;
      }
      return false;
    });
  }, { x, y, color });
}
async function scrollToBottom(page: Page) {
  const thumb = await point(page, 253, 44 + (88 * 88 / 240) / 2);
  await page.mouse.move(thumb.x, thumb.y); await page.mouse.down();
  await page.mouse.move(thumb.x, thumb.y + 90 * thumb.zoom, { steps: 4 }); await page.mouse.up();
  await expect.poll(async () => JSON.parse((await page.getByTestId('canvas-host').getAttribute('data-scroll-offsets'))!).panel_1).toBe(152);
}

test('inactive Screen preserves container child coordinates and viewport clipping', async ({ page }) => {
  const { project, panel } = panelFixture();
  project.screens[0].nodes.push(child('visible_1', panel.id, 10, 10, 60), child('hidden_1', panel.id, 10, 120, 60));
  const other = structuredClone(project.screens[0]); other.id = 'screen_other'; other.nodes = []; project.screens.push(other);
  await importProject(page, project);
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.5');
  await page.mouse.move(10, 10);
  const before = await read(page), activeVisible = await canvasPixel(page, 99, 59), activeOutside = await canvasPixel(page, 15, 125);
  expect(activeVisible.slice(0, 3)).not.toEqual(activeOutside.slice(0, 3));
  await page.getByLabel('当前画布', { exact: true }).selectOption('screen_other'); await page.mouse.move(10, 10);
  await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue('screen_other');
  // The second Screen is 320 + 60 GUI px to the right of the first.
  expect(await canvasPixel(page, 99, 59, -380)).toEqual(activeVisible);
  expect(await canvasPixel(page, 15, 125, -380)).toEqual(activeOutside);
  expect(await read(page)).toEqual(before);
});

test('child alignment guides use scrolled container coordinates and are clipped to its viewport', async ({ page }) => {
  const { project, panel } = panelFixture();
  project.screens[0].nodes.push(child('moving_1', panel.id, 10, 160, 30), child('peer_1', panel.id, 60, 190, 30));
  await importProject(page, project); await scrollToBottom(page);
  const start = await point(page, 84 + 10 + 15, 44 + 160 - 152 + 10);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 50 * start.zoom, start.y + 30 * start.zoom, { steps: 7 });
  const host = page.getByTestId('canvas-host');
  await expect(host).toHaveAttribute('data-alignment-x', '60'); await expect(host).toHaveAttribute('data-alignment-y', '190');
  await expect.poll(() => hasGuidePixel(page, 84 + 60, 44 + 4, 'green')).toBe(true);
  await expect.poll(() => hasGuidePixel(page, 84 + 4, 44 + 190 - 152, 'green')).toBe(true);
  expect(await hasGuidePixel(page, 84 + 60, 44 - 5, 'green')).toBe(false);
  expect(await hasGuidePixel(page, 84 - 5, 44 + 190 - 152, 'green')).toBe(false);
  await page.mouse.up();
  const moved = (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'moving_1');
  expect(moved.bounds).toEqual({ x: 60, y: 190, w: 30, h: 20 });
});

test('equal-spacing marks are drawn at scrolled content coordinates', async ({ page }) => {
  const { project, panel } = panelFixture();
  project.screens[0].nodes.push(child('first_1', panel.id, 10, 160, 20), child('second_1', panel.id, 50, 180, 20), child('moving_1', panel.id, 100, 200, 20));
  await importProject(page, project); await scrollToBottom(page);
  const start = await point(page, 84 + 100 + 10, 44 + 200 - 152 + 10);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x - 10 * start.zoom, start.y, { steps: 6 });
  const host = page.getByTestId('canvas-host');
  await expect(host).toHaveAttribute('data-spacing-axis', 'x'); await expect(host).toHaveAttribute('data-spacing-gap', '20');
  await expect.poll(() => hasGuidePixel(page, 84 + 40, 44 + 155 - 152, 'gold')).toBe(true);
  expect(await hasGuidePixel(page, 84 + 40, 44 - 5, 'gold')).toBe(false);
  await page.mouse.up();
  const moved = (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'moving_1');
  expect(moved.bounds.x).toBe(90);
});

test('Resize guide uses the scrolled container coordinate space', async ({ page }) => {
  const { project, panel } = panelFixture();
  project.screens[0].nodes.push(child('moving_1', panel.id, 10, 160, 30), child('peer_1', panel.id, 60, 190, 30));
  await importProject(page, project); await scrollToBottom(page);
  const center = await point(page, 84 + 10 + 15, 44 + 160 - 152 + 10);
  await page.mouse.click(center.x, center.y);
  const edge = await point(page, 84 + 10 + 30, 44 + 160 - 152 + 10);
  await page.mouse.move(edge.x, edge.y); await page.mouse.down();
  await page.mouse.move(edge.x + 20 * edge.zoom, edge.y, { steps: 6 });
  await expect(page.getByTestId('canvas-host')).toHaveAttribute('data-alignment-x', '60');
  await expect.poll(() => hasGuidePixel(page, 84 + 60, 44 + 4, 'green')).toBe(true);
  await page.mouse.up();
  const resized = (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'moving_1');
  expect(resized.bounds).toEqual({ x: 10, y: 160, w: 50, h: 20 });
});

test('vertical equal-spacing marks are drawn at scrolled content coordinates', async ({ page }) => {
  const { project, panel } = panelFixture();
  project.screens[0].nodes.push(child('first_1', panel.id, 30, 150, 20), child('second_1', panel.id, 60, 210, 20), child('moving_1', panel.id, 100, 176, 20));
  await importProject(page, project); await scrollToBottom(page);
  const start = await point(page, 84 + 100 + 10, 44 + 176 - 152 + 10);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x, start.y + 4 * start.zoom, { steps: 6 });
  const host = page.getByTestId('canvas-host');
  await expect(host).toHaveAttribute('data-spacing-axis', 'y'); await expect(host).toHaveAttribute('data-spacing-gap', '10');
  await expect.poll(() => hasGuidePixel(page, 84 + 25, 44 + 175 - 152, 'gold')).toBe(true);
  expect(await hasGuidePixel(page, 84 - 5, 44 + 175 - 152, 'gold')).toBe(false);
  await page.mouse.up();
  const moved = (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'moving_1');
  expect(moved.bounds.y).toBe(180);
});
