import { expect, test, type Page } from '@playwright/test';

const THEME_KEY = 'minecraft-gui-maker.theme.v1';

async function openViewMenu(page: Page) {
  await page.getByRole('navigation', { name: '编辑器菜单' }).getByText('视图', { exact: true }).click();
  await expect(page.getByRole('button', { name: '主题：浅色', exact: true })).toBeVisible();
}

async function setThemeMode(page: Page, mode: '浅色' | '深色' | '跟随系统') {
  await openViewMenu(page);
  await page.getByRole('button', { name: `主题：${mode}`, exact: true }).click();
  // Clicking a menu button auto-closes the <details> menu (existing editor-menu behavior);
  // reopen it to verify the pressed state, then close it again.
  await openViewMenu(page);
  await expect(page.getByRole('button', { name: `主题：${mode}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('navigation', { name: '编辑器菜单' }).getByText('视图', { exact: true }).click();
  await expect(page.getByRole('button', { name: `主题：${mode}`, exact: true })).toBeHidden();
}

async function resolvedTheme(page: Page) {
  return page.evaluate(() => document.documentElement.dataset.theme);
}

test('default is dark, manual light persists across reload, pre-paint script resolves stored mode', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  expect(await resolvedTheme(page)).toBe('dark');
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe('dark');

  await setThemeMode(page, '浅色');
  expect(await resolvedTheme(page)).toBe('light');
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe('light');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  expect(await resolvedTheme(page)).toBe('light');

  // The inline head script must resolve the stored mode before React hydrates.
  await page.goto('/', { waitUntil: 'commit' });
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});

test('legacy stored values light/dark stay valid', async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.setItem(key, 'light'), [THEME_KEY]);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  expect(await resolvedTheme(page)).toBe('light');
  await openViewMenu(page);
  await expect(page.getByRole('button', { name: '主题：浅色', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('system mode follows OS color scheme live; manual mode ignores it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();

  await setThemeMode(page, '跟随系统');
  expect(await resolvedTheme(page)).toBe('light');
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe('system');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => resolvedTheme(page)).toBe('dark');

  // System mode survives reload and keeps following the OS.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  expect(await resolvedTheme(page)).toBe('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => resolvedTheme(page)).toBe('light');

  // Manual dark is immune to system changes.
  await setThemeMode(page, '深色');
  expect(await resolvedTheme(page)).toBe('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(200);
  expect(await resolvedTheme(page)).toBe('dark');
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe('dark');
});

test('theme switching does not touch revision, project JSON, canvas geometry or layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  const host = page.getByTestId('canvas-host');
  const revisionBefore = await page.locator('.revision-chip').textContent();
  const jsonBefore = await page.getByTestId('project-json').textContent();
  const hostBefore = (await host.boundingBox())!;
  const libraryBefore = (await page.locator('.library').boundingBox())!;

  await setThemeMode(page, '浅色');
  await setThemeMode(page, '深色');
  await setThemeMode(page, '跟随系统');

  expect(await page.locator('.revision-chip').textContent()).toBe(revisionBefore);
  expect(await page.getByTestId('project-json').textContent()).toBe(jsonBefore);
  const hostAfter = (await host.boundingBox())!;
  expect(hostAfter.width).toBe(hostBefore.width);
  expect(hostAfter.height).toBe(hostBefore.height);
  const libraryAfter = (await page.locator('.library').boundingBox())!;
  expect(libraryAfter.width).toBe(libraryBefore.width);
  await expect(page.locator('.statusbar div[role="alert"]')).toHaveCount(0);
});

test('theme screenshot evidence', async ({ page }) => {
  test.skip(!process.env.BENTO1_SHOTS, 'set BENTO1_SHOTS=<dir> to capture evidence screenshots');
  const dir = process.env.BENTO1_SHOTS!;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await expect(page.getByTestId('history-count')).toHaveText('1 undo / 0 redo');
  await setThemeMode(page, '深色');
  await page.screenshot({ path: `${dir}/bento1-dark.png` });
  await setThemeMode(page, '浅色');
  await page.screenshot({ path: `${dir}/bento1-light.png` });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
});
