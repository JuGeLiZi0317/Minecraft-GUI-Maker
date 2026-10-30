import { expect, test } from '@playwright/test';

test('canvas size is visible and editable directly from the inspector', async ({ page }) => {
  await page.goto('/');
  const width = page.getByLabel('设计区宽', { exact: true }), height = page.getByLabel('设计区高', { exact: true });
  await expect(width).toBeVisible(); await expect(height).toBeVisible();
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await expect(width).toBeVisible(); await width.fill('480'); await height.fill('240');
  await page.getByRole('button', { name: '应用设计区尺寸' }).click();
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  expect((await read()).screens[0].designSize).toEqual({ width: 480, height: 240, unit: 'gui-px' });
  await page.locator('.studio-footer').click(); await page.keyboard.press('Control+z'); expect((await read()).screens[0].designSize.width).toBe(320);
  await page.keyboard.press('Control+Shift+z'); expect((await read()).screens[0].designSize.width).toBe(480);
  await page.getByTestId('canvas-host').click({ position: { x: 60, y: 100 } });
  await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload();
  await expect(width).toHaveValue('480'); await expect(height).toHaveValue('240');
  await width.fill('0'); await page.getByRole('button', { name: '应用设计区尺寸' }).click();
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('设计区宽高'); expect((await read()).screens[0].designSize.width).toBe(480);
});
