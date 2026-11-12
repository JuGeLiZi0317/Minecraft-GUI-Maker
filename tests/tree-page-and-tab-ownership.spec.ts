import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { pageTreeProject } from './fixtures/pageTreeProject';
import { tabOwnershipProject } from './fixtures/tabOwnershipProject';

const importProject = async (page: Page, project: unknown) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'page-tree.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
};

test('Q5-H tree can hide non-current Page controls without hiding tab switches', async ({ page }) => {
  await importProject(page, pageTreeProject());
  await mkdir('outputs/Q5H', { recursive: true });
  const before = await page.getByTestId('project-json').textContent();
  await expect(page.getByRole('button', { name: '选择 page_a_fill' })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择 page_b_fill' })).toBeVisible();
  await page.getByLabel('树中隐藏非当前 Page 控件').check();
  await expect(page.getByRole('button', { name: '选择 page_a_fill' })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择 page_b_fill' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '选择 page_tab_b' })).toBeVisible();
  await page.screenshot({ path: 'outputs/Q5H/tree-page-hidden.png' });
  await page.getByLabel('树中隐藏非当前 Page 控件').uncheck();
  await expect(page.getByRole('button', { name: '选择 page_b_fill' })).toBeVisible();
  expect(await page.getByTestId('project-json').textContent()).toBe(before);
});

test('Q5-H CreativeTab hides content already owned by a sibling tab until that tab is selected', async ({ page }) => {
  await importProject(page, tabOwnershipProject());
  await page.getByRole('button', { name: '选择 owner_tab_a' }).click();
  await expect(page.getByLabel('标签内容 owner_content_a')).toBeChecked();
  await expect(page.getByLabel('标签内容 owner_content_c')).toBeVisible();
  await expect(page.getByLabel('标签内容 owner_content_b')).toHaveCount(0);
  await page.screenshot({ path: 'outputs/Q5H/tab-ownership-a.png' });
  await page.getByRole('button', { name: '选择 owner_tab_b' }).click();
  await expect(page.getByLabel('标签内容 owner_content_b')).toBeChecked();
  await expect(page.getByLabel('标签内容 owner_content_c')).toBeVisible();
  await expect(page.getByLabel('标签内容 owner_content_a')).toHaveCount(0);
  expect((await page.getByTestId('project-json').textContent())).toContain('owner_content_a');
});
