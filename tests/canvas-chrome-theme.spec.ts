import { expect, test, type Page } from '@playwright/test';

/** Konva editor chrome must follow the resolved theme; Minecraft design pixels must not. */
const DARK = { handle: [131, 168, 214], ruler: [23, 28, 36] } as const;
const LIGHT = { handle: [95, 124, 155], ruler: [243, 245, 248] } as const;
const DESIGN_MATTE = [28, 38, 52] as const;

async function openViewMenu(page: Page) {
  await page.getByRole('navigation', { name: '编辑器菜单' }).getByText('视图', { exact: true }).click();
  await expect(page.getByRole('button', { name: '主题：浅色', exact: true })).toBeVisible();
}

async function setThemeMode(page: Page, mode: '浅色' | '深色' | '跟随系统') {
  await openViewMenu(page);
  await page.getByRole('button', { name: `主题：${mode}`, exact: true }).click();
  await openViewMenu(page);
  await expect(page.getByRole('button', { name: `主题：${mode}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('navigation', { name: '编辑器菜单' }).getByText('视图', { exact: true }).click();
}

async function sample(page: Page, which: 'main' | 'ruler', x: number, y: number) {
  return page.evaluate(([which, x, y]) => {
    const list = document.querySelectorAll<HTMLCanvasElement>('.canvas-host canvas');
    const canvas = which === 'ruler' ? list[list.length - 1] : list[0];
    const data = canvas.getContext('2d')!.getImageData(Math.round(x * devicePixelRatio), Math.round(y * devicePixelRatio), 1, 1).data;
    return [data[0], data[1], data[2]];
  }, [which, x, y] as const);
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-testid="canvas-host"]')!;
    return { originX: Number(host.getAttribute('data-origin-x')), originY: Number(host.getAttribute('data-origin-y')), zoom: Number(host.getAttribute('data-zoom')) };
  });
}

test('konva chrome follows light/dark/system while design pixels stay fixed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await expect(page.getByTestId('history-count')).toHaveText('1 undo / 0 redo');
  const geo = await geometry(page);
  const handleX = Math.round(geo.originX + 16 * geo.zoom), handleY = Math.round(geo.originY + 16 * geo.zoom);
  const centerX = Math.round(geo.originX + 160 * geo.zoom), centerY = Math.round(geo.originY + 90 * geo.zoom);

  // Dark (default): chrome accent handle + ruler background.
  expect(await sample(page, 'main', handleX, handleY)).toEqual([...DARK.handle]);
  expect(await sample(page, 'ruler', 5, 5)).toEqual([...DARK.ruler]);
  expect(await sample(page, 'main', centerX, centerY)).toEqual([...DESIGN_MATTE]);

  await setThemeMode(page, '浅色');
  expect(await sample(page, 'main', handleX, handleY)).toEqual([...LIGHT.handle]);
  expect(await sample(page, 'ruler', 5, 5)).toEqual([...LIGHT.ruler]);
  expect(await sample(page, 'main', centerX, centerY)).toEqual([...DESIGN_MATTE]);

  // System mode tracks the OS; chrome repaints, design matte does not.
  await page.emulateMedia({ colorScheme: 'dark' });
  await setThemeMode(page, '跟随系统');
  expect(await sample(page, 'main', handleX, handleY)).toEqual([...DARK.handle]);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => sample(page, 'main', handleX, handleY)).toEqual([...LIGHT.handle]);
  await expect.poll(() => sample(page, 'ruler', 5, 5)).toEqual([...LIGHT.ruler]);
  expect(await sample(page, 'main', centerX, centerY)).toEqual([...DESIGN_MATTE]);

  // Theme switching never touches business state or canvas geometry.
  const geoAfter = await geometry(page);
  expect(geoAfter).toEqual(geo);
  expect(await page.locator('.revision-chip').textContent()).toBe('REV 1');
  expect(await page.getByTestId('history-count')).toHaveText('1 undo / 0 redo');
  await expect(page.locator('.statusbar div[role="alert"]')).toHaveCount(0);
});

test('grid is perceivable in both themes, hides when off, and never tints Minecraft widgets', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  const geo = await geometry(page);
  const lineX = Math.round(geo.originX + 80 * geo.zoom);
  const midY = Math.round(geo.originY + 90 * geo.zoom);
  const buttonCenter: [number, number] = [Math.round(geo.originX + 91 * geo.zoom), Math.round(geo.originY + 26 * geo.zoom)];
  const matte = await sample(page, 'main', lineX, midY);
  expect(matte).toEqual([...DESIGN_MATTE]);
  const buttonPixel = await sample(page, 'main', ...buttonCenter);
  expect(buttonPixel).toEqual([49, 67, 84]); // minecraft:button neutral fallback, grid must not tint it

  const gridSamples = () => Promise.all([lineX - 1, lineX, lineX + 1].map(x => sample(page, 'main', x, midY)));
  const gridStrength = (samples: number[][]) => Math.max(...samples.map(s => s[2])) - matte[2];

  await page.getByLabel('显示网格').check();
  const darkOn = await gridSamples();
  const darkDelta = gridStrength(darkOn);
  expect(darkDelta).toBeGreaterThanOrEqual(15);
  expect(darkDelta).toBeLessThanOrEqual(70);
  expect(await sample(page, 'main', ...buttonCenter)).toEqual(buttonPixel); // widget pixels untouched by grid

  await setThemeMode(page, '浅色');
  const lightOn = await gridSamples();
  const lightDelta = gridStrength(lightOn);
  expect(lightDelta).toBeGreaterThanOrEqual(20);
  expect(lightDelta).toBeLessThanOrEqual(90);
  expect(lightOn).not.toEqual(darkOn);
  expect(await sample(page, 'main', ...buttonCenter)).toEqual(buttonPixel);

  // System mode updates the grid colour live.
  await page.emulateMedia({ colorScheme: 'dark' });
  await setThemeMode(page, '跟随系统');
  expect(await gridSamples()).toEqual(darkOn);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => gridSamples()).toEqual(lightOn);

  await page.getByLabel('显示网格').uncheck();
  for (const x of [lineX - 1, lineX, lineX + 1]) expect(await sample(page, 'main', x, midY)).toEqual([...DESIGN_MATTE]);
});

test('bento-3 acceptance screenshots (grid + selection, inspector + overlay)', async ({ page }) => {
  test.skip(!process.env.BENTO3_SHOTS, 'set BENTO3_SHOTS=<dir> to capture evidence screenshots');
  const dir = process.env.BENTO3_SHOTS!;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await page.getByLabel('显示网格').check();
  await setThemeMode(page, '深色');
  await page.screenshot({ path: `${dir}/bento3-dark-grid.png` });
  await setThemeMode(page, '浅色');
  await page.screenshot({ path: `${dir}/bento3-light-grid.png` });
  await page.locator('.screen-settings > summary').click();
  await expect(page.getByLabel('设计区宽', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${dir}/bento3-light-overlay.png` });
  await setThemeMode(page, '深色');
  await page.screenshot({ path: `${dir}/bento3-dark-overlay.png` });
});
