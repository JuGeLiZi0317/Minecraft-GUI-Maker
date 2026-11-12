import { expect, test, type Page } from '@playwright/test';
import { repeatableCardProject } from './fixtures/repeatableCardProject';
import { nestedTreeProject } from './fixtures/nestedTreeProject';

const importProject = async (page: Page, project: unknown) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'wheel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
};
const hoverDesign = async (page: Page, x: number, y: number) => {
  const host = page.getByTestId('canvas-host'), box = (await host.boundingBox())!;
  const originX = Number(await host.getAttribute('data-origin-x')), originY = Number(await host.getAttribute('data-origin-y')), zoom = Number(await host.getAttribute('data-zoom'));
  await page.mouse.move(box.x + originX + x * zoom, box.y + originY + y * zoom);
};
const zoom = (page: Page) => page.getByLabel('Zoom').inputValue();

test('hidden Repeatable List does not consume wheel zoom', async ({ page }) => {
  await importProject(page, repeatableCardProject());
  expect(await zoom(page)).toBe('2');
  await page.getByRole('button', { name: '编辑态隐藏 material_layers' }).click();
  await hoverDesign(page, 160, 105);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => zoom(page)).not.toBe('2');
});

test('visible Scrollable/Collapsible containers do not block editor wheel zoom', async ({ page }) => {
  await importProject(page, nestedTreeProject());
  expect(await zoom(page)).toBe('2');
  await hoverDesign(page, 80, 80);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => zoom(page)).not.toBe('2');
  await page.getByLabel('Zoom').selectOption('2');
  await page.getByRole('button', { name: '编辑态隐藏 outer_panel' }).click();
  await hoverDesign(page, 80, 80);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => zoom(page)).not.toBe('2');
});

test('inactive-Page and outline-only Repeatable List do not consume wheel zoom', async ({ page }) => {
  const { pageRepeatableProject } = await import('./fixtures/pageRepeatableProject');
  await importProject(page, pageRepeatableProject());
  await page.getByLabel('设计态 Page 显示').selectOption('outline');
  await hoverDesign(page, 70, 70);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => zoom(page)).not.toBe('2');
  await page.getByLabel('设计态 Page 显示').selectOption('current');
  await hoverDesign(page, 70, 70);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => zoom(page)).not.toBe('2');
});
