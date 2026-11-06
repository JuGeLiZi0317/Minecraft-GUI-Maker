import { type Page } from '@playwright/test';

// H4-A: precision controls are intentionally behind an explicit secondary entry.
export async function fillViewSetting(page: Page, name: 'Pan X' | 'Pan Y' | '网格间距', value: string, keepOpen = false) {
  const settings = page.locator('.workspace-settings');
  const wasOpen = await settings.evaluate((element: HTMLDetailsElement) => element.open);
  if (!wasOpen) await settings.locator('summary').click();
  await page.getByLabel(name, { exact: true }).fill(value);
  if (!wasOpen && !keepOpen) await settings.locator('summary').click();
}
