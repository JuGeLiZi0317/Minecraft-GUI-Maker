import { expect, type Page } from '@playwright/test';

// A blank viewport point is intentionally outside the centered GUI in these
// fixtures. Verify deselection rather than assuming the click hit the canvas.
export async function showScreenControls(page: Page) {
  if (!(await page.locator('.selected-heading').isVisible())) return;
  await page.getByTestId('canvas-host').click({ position: { x: 60, y: 100 } });
  await expect(page.getByLabel('项目名称')).toBeVisible();
}
