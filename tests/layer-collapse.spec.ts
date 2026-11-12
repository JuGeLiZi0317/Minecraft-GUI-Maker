import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { nestedTreeProject } from './fixtures/nestedTreeProject';
import { repeatableCardProject } from './fixtures/repeatableCardProject';

const importProject = async (page: Page, project: unknown) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'tree.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
};

test('Q5-F tree roots and nested containers collapse their descendants without changing the document', async ({ page }) => {
  await importProject(page, nestedTreeProject());
  await mkdir('outputs/Q5F', { recursive: true });
  const outer = page.getByRole('button', { name: '折叠 outer_panel' });
  await expect(outer).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: '选择 inner_panel' })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择 deep_button' })).toBeVisible();
  await outer.click();
  await expect(page.getByRole('button', { name: '展开 outer_panel' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: '选择 inner_panel' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '选择 deep_button' })).toHaveCount(0);
  await page.screenshot({ path: 'outputs/Q5F/tree-root-collapsed.png' });
  await page.getByRole('button', { name: '展开 outer_panel' }).click();
  await page.getByRole('button', { name: '折叠 inner_panel' }).click();
  await expect(page.getByRole('button', { name: '选择 deep_button' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '选择 inner_panel' })).toBeVisible();
  await page.getByRole('button', { name: '展开 inner_panel' }).click();
});

test('Q5-F collapsing a Repeatable List hides its template children and resets after reload', async ({ page }) => {
  await importProject(page, repeatableCardProject());
  await page.getByRole('button', { name: '折叠 material_layers' }).click();
  await expect(page.getByRole('button', { name: '选择 card_name' })).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  await expect(page.getByRole('button', { name: '选择 material_layers' })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择 card_name' })).toBeVisible();
});
