import { expect, test, type Page } from '@playwright/test';

const readProject = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);

async function newProject(page: Page) {
  await page.goto('/');
  await page.getByText('文件', { exact: true }).click();
  await page.getByRole('button', { name: '新的GUI项目' }).click();
  await expect(page.locator('.statusbar [role="status"]')).toContainText('已新建 GUI 项目');
}

async function resize(page: Page, width: number, height: number) {
  const size = (await readProject(page)).screens.at(-1).designSize;
  if (size.width === width && size.height === height) return;
  await page.getByLabel('设计区宽', { exact: true }).fill(String(width));
  await page.getByLabel('设计区高', { exact: true }).fill(String(height));
  await page.getByRole('button', { name: '应用设计区尺寸' }).click();
  await expect.poll(async () => (await readProject(page)).screens.at(-1).designSize).toEqual({ width, height, unit: 'gui-px' });
}

async function centerAt110Percent(page: Page, width: number, height: number) {
  await page.getByLabel('Zoom', { exact: true }).selectOption('2');
  const host = page.getByTestId('canvas-host');
  await expect(host).toHaveAttribute('data-zoom', '2');
  await host.hover({ position: { x: 40, y: 60 } });
  // Chrome's CDP wheel distance is in device pixels under simulated DPR.
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  await page.mouse.wheel(0, Math.log(2 / 1.1) / 0.002 * dpr);
  await expect(host).toHaveAttribute('data-zoom', '1.1');
  const delta = await host.evaluate((element, size) => ({
    x: (element.clientWidth - size.width * 1.1) / 2 - Number(element.getAttribute('data-origin-x')),
    y: (element.clientHeight - size.height * 1.1) / 2 - Number(element.getAttribute('data-origin-y')),
  }), { width, height });
  const panX = page.getByLabel('Pan X', { exact: true }), panY = page.getByLabel('Pan Y', { exact: true });
  await panX.fill(String(Number(await panX.inputValue()) + delta.x));
  await panY.fill(String(Number(await panY.inputValue()) + delta.y));
}

const cases = [
  { width: 40, height: 32 }, { width: 120, height: 64 },
  { width: 320, height: 180 }, { width: 512, height: 512 },
  { width: 768, height: 512 }, { width: 8192, height: 8192 },
  { width: 320, height: 180, previousScrollText: true },
  { width: 512, height: 512, previousScrollText: true },
];

for (const { width, height, previousScrollText = false } of cases) {
  test(`new ${width}×${height} Screen at Zoom 110% supports click and drag, previous W1-G=${previousScrollText}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await newProject(page);
    if (previousScrollText) {
      await page.getByRole('button', { name: '添加 ReadOnlyScrollText', exact: true }).click();
      await page.getByRole('button', { name: '新增画布', exact: true }).click();
    }
    await resize(page, width, height);
    await centerAt110Percent(page, width, height);
    const before = await readProject(page), index = before.screens.length - 1;
    const source = page.getByRole('button', { name: '添加 Scrollable Panel', exact: true });
    await source.click();
    await expect.poll(async () => (await readProject(page)).screens[index].nodes.length).toBe(1);
    expect((await readProject(page)).schemaVersion).toBe('0.26.0');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    expect(await readProject(page)).toEqual(before);
    const target = await page.getByTestId('canvas-host').evaluate(element => ({ x: element.clientWidth / 2, y: element.clientHeight / 2 }));
    await source.dragTo(page.getByTestId('canvas-host'), { targetPosition: target });
    await expect.poll(async () => (await readProject(page)).screens[index].nodes.length).toBe(1);
    const after = await readProject(page), panel = after.screens[index].nodes[0];
    expect(panel.type).toBe('minecraft:scrollable-panel');
    expect(panel.bounds.x).toBeGreaterThanOrEqual(0); expect(panel.bounds.y).toBeGreaterThanOrEqual(0);
    expect(panel.bounds.x + panel.bounds.w).toBeLessThanOrEqual(width);
    expect(panel.bounds.y + panel.bounds.h).toBeLessThanOrEqual(height);
    if (previousScrollText) expect(after.screens[0]).toEqual(before.screens[0]);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    expect(await readProject(page)).toEqual(before);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    expect(await readProject(page)).toEqual(after);
    expect(errors).toEqual([]);
  });
}

test('a smaller-than-minimum canvas reports the reason for click, quick action and drag without changing the project', async ({ page }) => {
  await newProject(page); await resize(page, 39, 32);
  const before = await readProject(page), source = page.getByRole('button', { name: '添加 Scrollable Panel', exact: true });
  await source.click();
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('至少需要 40×32');
  await page.getByRole('button', { name: '新建 Scrollable Panel', exact: true }).click();
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('至少需要 40×32');
  await source.dragTo(page.getByTestId('canvas-host'));
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('至少需要 40×32');
  expect(await readProject(page)).toEqual(before);
});
