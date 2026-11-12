import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tabContentProject } from './fixtures/tabContentProject';

test('Q5-G CreativeTab selected content can be collapsed to show only unselected tags', async ({ page }) => {
  await page.goto('/');
  await mkdir('outputs/Q5G', { recursive: true });
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'tab-content.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tabContentProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '选择 tab_main' }).click();
  await expect(page.getByLabel('标签内容 content_a')).toBeChecked();
  await expect(page.getByLabel('标签内容 content_b')).toBeChecked();
  await expect(page.getByLabel('标签内容 content_c')).not.toBeChecked();
  await expect(page.getByLabel('标签内容 content_d')).not.toBeChecked();
  const toolbar = page.locator('.tab-content-toolbar');
  await expect(toolbar).toContainText('已选内容 2');
  await page.getByRole('button', { name: '折叠已选内容' }).click();
  await expect(page.getByLabel('标签内容 content_a')).toHaveCount(0);
  await expect(page.getByLabel('标签内容 content_b')).toHaveCount(0);
  await expect(page.getByLabel('标签内容 content_c')).toBeVisible();
  await expect(page.getByLabel('标签内容 content_d')).toBeVisible();
  await expect(page.getByRole('button', { name: '展开已选内容' })).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: 'outputs/Q5G/tab-content-collapsed.png' });
  const before = await page.getByTestId('project-json').textContent();
  await page.getByRole('button', { name: '展开已选内容' }).click();
  await expect(page.getByLabel('标签内容 content_a')).toBeVisible();
  await expect(page.getByLabel('标签内容 content_b')).toBeVisible();
  expect(await page.getByTestId('project-json').textContent()).toBe(before);
});
