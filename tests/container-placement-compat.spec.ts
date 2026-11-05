import { expect, test, type Page } from '@playwright/test';
import { createNode, emptyProject } from '../src/domain/model';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
async function point(page: Page, x: number, y: number) {
  return page.getByTestId('canvas-host').evaluate((host, p) => {
    const r = host.getBoundingClientRect(), zoom = Number(host.getAttribute('data-zoom'));
    return { x: r.x + Number(host.getAttribute('data-origin-x')) + p.x * zoom, y: r.y + Number(host.getAttribute('data-origin-y')) + p.y * zoom };
  }, { x, y });
}
async function load(page: Page, width = 320, height = 180) {
  const doc = emptyProject(); doc.schemaVersion = '0.27.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
  doc.screens[0].designSize = { ...doc.screens[0].designSize, width, height };
  const panel = createNode('minecraft:collapsible-panel', 'collapse_main', { x: 30, y: 20 }); panel.bounds = { x: 30, y: 20, w: 180, h: 120 };
  doc.screens[0].nodes = [panel];
  const other = structuredClone(doc.screens[0]); other.id = 'screen_other'; other.nodes[0].id = 'collapse_other'; doc.screens.push(other);
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'old-canvases.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByLabel('Zoom', { exact: true }).selectOption('2');
  await page.getByTestId('canvas-host').hover({ position: { x: 40, y: 60 } });
  const dpr = await page.evaluate(() => devicePixelRatio);
  await page.mouse.wheel(0, Math.log(2 / 1.1) / 0.002 * dpr);
  await expect(page.getByTestId('canvas-host')).toHaveAttribute('data-zoom', '1.1');
  return doc;
}
for (const [width, height] of [[320, 180], [512, 512]]) test(`old ${width}x${height} canvas moves a root Collapsible Panel without self nesting at Zoom 110%`, async ({ page }) => {
  const before = await load(page, width, height);
  const start = await point(page, 80, 30), end = await point(page, 130, 50);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => (await read(page)).screens[0].nodes[0].bounds.x).not.toBe(30);
  const after = await read(page);
  expect(after.screens[0].nodes[0].parentContainerId).toBeUndefined();
  expect(after.screens[1]).toEqual(before.screens[1]);
  await expect(page.locator('.statusbar [role="status"]')).not.toContainText('不能形成自引用');
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await read(page)).toEqual(before);
  await page.getByRole('button', { name: '重做', exact: true }).click(); expect(await read(page)).toEqual(after);
});

test('new widget drop upgrades old multi-Screen project containing Collapsible Panels without losing them', async ({ page }) => {
  const before = await load(page);
  const target = await point(page, 270, 160);
  const host = page.getByTestId('canvas-host'), box = (await host.boundingBox())!;
  await page.getByRole('button', { name: '添加 Tree View', exact: true }).dragTo(host, { targetPosition: { x: target.x - box.x, y: target.y - box.y } });
  await expect.poll(async () => (await read(page)).schemaVersion).toBe('0.28.0');
  const after = await read(page);
  expect(after.screens[0].nodes[0]).toEqual(before.screens[0].nodes[0]); expect(after.screens[1]).toEqual(before.screens[1]);
  expect(after.screens[0].nodes.at(-1).type).toBe('minecraft:tree-view');
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await read(page)).toEqual(before);
  await page.getByRole('button', { name: '重做', exact: true }).click(); expect(await read(page)).toEqual(after);
});

test('Catalog creates new containers and unsupported child types at Screen root when a panel is selected', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: '选择 collapse_main', exact: true }).click();
  await page.getByRole('button', { name: '添加 Collapsible Panel', exact: true }).click();
  await expect.poll(async () => (await read(page)).screens[0].nodes.length).toBe(2);
  expect((await read(page)).screens[0].nodes[1].parentContainerId).toBeUndefined();
  await page.getByRole('button', { name: '添加 Tree View', exact: true }).click();
  await expect.poll(async () => (await read(page)).schemaVersion).toBe('0.28.0');
  const tree = (await read(page)).screens[0].nodes.at(-1);
  expect(tree.type).toBe('minecraft:tree-view'); expect(tree.parentContainerId).toBeUndefined();
});
