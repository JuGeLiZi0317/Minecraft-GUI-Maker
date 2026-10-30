import { expect, test, type Page } from '@playwright/test';

const project = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const canvasPixel = async (page: Page, x: number, y: number) => page.getByTestId('canvas-host').evaluate((host, at) => {
  const canvas = host.querySelector('canvas')!, bounds = canvas.getBoundingClientRect();
  const dpr = canvas.width / bounds.width, zoom = Number(host.getAttribute('data-zoom'));
  const px = Math.floor((Number(host.getAttribute('data-origin-x')) + at.x * zoom) * dpr);
  const py = Math.floor((Number(host.getAttribute('data-origin-y')) + at.y * zoom) * dpr);
  return Array.from(canvas.getContext('2d')!.getImageData(px, py, 1, 1).data);
}, { x, y });
async function exportedPixels(page: Page) {
  const link = page.locator('.export-links a').nth(1);
  return link.evaluate(async element => {
    const bitmap = await createImageBitmap(await (await fetch((element as HTMLAnchorElement).href)).blob());
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer)), v => v.toString(16).padStart(2, '0')).join('');
  });
}
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible(); });

test('outside clicks close all three panels, preserve pending sizes and allow reopening the same export', async ({ page }) => {
  const screen = page.locator('.screen-settings'), heading = page.getByText('Untitled interface', { exact: true });
  await screen.locator('summary').click(); await page.getByLabel('设计区宽', { exact: true }).fill('360');
  await page.getByLabel('设计区高', { exact: true }).fill('200'); await heading.click();
  await expect(screen).not.toHaveAttribute('open', ''); expect((await project(page)).screens[0].designSize.width).toBe(320);
  await screen.locator('summary').click(); await expect(page.getByLabel('设计区宽', { exact: true })).toHaveValue('360');
  await heading.click(); await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.export-links a')).toHaveCount(6); expect((await project(page)).screens[0].designSize.width).toBe(360);
  const ref = await page.getByTestId('export-reference').textContent();
  await page.getByTestId('export-reference').click(); await expect(page.getByTestId('export-panel')).toBeVisible();
  await heading.click(); await expect(page.getByTestId('export-panel')).toHaveCount(0);
  await page.getByRole('button', { name: '查看导出结果' }).click(); await expect(page.getByTestId('export-reference')).toHaveText(ref!);
  await heading.click();
  await page.getByRole('button', { name: '本地保存状态和副本' }).click(); await expect(page.locator('#local-save-menu')).toBeVisible();
  await page.locator('#local-save-menu .save-detail').click(); await expect(page.locator('#local-save-menu')).toBeVisible();
  await heading.click(); await expect(page.locator('#local-save-menu')).toBeHidden();
  await screen.locator('summary').click(); await page.keyboard.press('Escape'); await expect(screen).not.toHaveAttribute('open', '');
});

test('grid spacing and zoom are view-only, actual grid pixels show, PNG ignores grid', async ({ page }) => {
  const host = page.getByTestId('canvas-host'), history = await page.getByTestId('history-count').textContent(), initial = await project(page);
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(6);
  const baseline = await exportedPixels(page); await page.getByRole('button', { name: '关闭导出结果' }).click();
  const offPixel = await canvasPixel(page, 10, 5);
  await page.getByLabel('显示网格').check(); await expect(host).toHaveAttribute('data-grid-visible', 'true');
  await expect.poll(() => canvasPixel(page, 10, 5)).not.toEqual(offPixel);
  const spacing = page.getByLabel('网格间距');
  await spacing.fill('1'); await expect(host).toHaveAttribute('data-grid-spacing', '1');
  await spacing.fill('200'); await expect(host).toHaveAttribute('data-grid-spacing', '200');
  await spacing.fill('201'); await expect(spacing).toHaveAttribute('aria-invalid', 'true'); await spacing.blur(); await expect(spacing).toHaveValue('200');
  await spacing.fill('0'); await expect(spacing).toHaveAttribute('aria-invalid', 'true'); await spacing.blur(); await expect(spacing).toHaveValue('200');
  await page.getByLabel('Zoom', { exact: true }).selectOption('16'); await expect(host).toHaveAttribute('data-zoom', '16');
  const box = (await host.boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -1000); await expect(host).toHaveAttribute('data-zoom', '16');
  await page.mouse.wheel(0, 120); await expect.poll(async () => Number(await host.getAttribute('data-zoom'))).toBeLessThan(16);
  expect(await project(page)).toEqual(initial); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(6);
  expect(await exportedPixels(page)).toBe(baseline); expect(await project(page)).toEqual(initial);
});

test('new designs expose two panel choices and legacy options remain readable without being selectable', async ({ page }) => {
  await page.locator('.screen-settings summary').click(); const select = page.getByLabel('设计区底板');
  await expect(select.locator('option')).toHaveCount(2);
  await select.selectOption('supplied-panel-16');
  expect((await project(page)).screens[0].background.style).toBe('supplied-panel-16');
});

test('an invalid hidden size draft is retained and blocks export until corrected', async ({ page }) => {
  const initial = await project(page), history = await page.getByTestId('history-count').textContent();
  await page.locator('.screen-settings summary').click(); await page.getByLabel('设计区宽', { exact: true }).fill('0');
  await page.getByText('Untitled interface', { exact: true }).click();
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('设计区宽高'); await expect(page.locator('.export-links a')).toHaveCount(0);
  expect(await project(page)).toEqual(initial); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await page.locator('.screen-settings summary').click(); await expect(page.getByLabel('设计区宽', { exact: true })).toHaveValue('0');
  await page.getByLabel('设计区宽', { exact: true }).fill('320'); await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.export-links a')).toHaveCount(6);
});
