import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { nestedTreeProject } from './fixtures/nestedTreeProject';

test('Q5-J locking a tree node blocks selection and inherits to descendants until unlocked', async ({ page }) => {
  await page.goto('/');
  await mkdir('outputs/Q5J', { recursive: true });
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'lock.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(nestedTreeProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  const before = await page.getByTestId('project-json').textContent();
  await page.getByRole('button', { name: '选择 deep_button' }).click();
  await expect(page.getByRole('button', { name: '选择 deep_button' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '锁定 outer_panel' }).click();
  await expect(page.getByRole('button', { name: '解锁 outer_panel' })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择 outer_panel' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '选择 inner_panel' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '选择 deep_button' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '随 outer_panel 锁定 inner_panel' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '随 outer_panel 锁定 deep_button' })).toBeDisabled();
  await expect(page.getByText('未选择组件')).toBeVisible();
  await page.screenshot({ path: 'outputs/Q5J/tree-locked.png' });
  expect(await page.getByTestId('project-json').textContent()).toBe(before);

  await page.getByRole('button', { name: '解锁 outer_panel' }).click();
  await expect(page.getByRole('button', { name: '选择 deep_button' })).toBeEnabled();
  await page.getByRole('button', { name: '选择 deep_button' }).click();
  await page.getByRole('button', { name: '锁定 inner_panel' }).click();
  await expect(page.getByRole('button', { name: '选择 outer_panel' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '选择 deep_button' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '随 inner_panel 锁定 deep_button' })).toBeDisabled();
  await page.getByRole('button', { name: '解锁 inner_panel' }).click();
  await expect(page.getByRole('button', { name: '选择 deep_button' })).toBeEnabled();
  expect(await page.getByTestId('project-json').textContent()).toBe(before);
  await page.reload();
  await expect(page.getByRole('button', { name: '选择 outer_panel' })).toBeEnabled();
});
