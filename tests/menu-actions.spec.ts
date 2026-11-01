import { test, expect } from '@playwright/test';

test('new project preserves the previous local copy and menu modes remain isolated', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Checkbox', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('本地已保存');
  const before = JSON.parse((await page.getByTestId('project-json').textContent())!);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!)).toEqual(before);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await page.getByText('视图', { exact: true }).click(); await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover(); await page.getByRole('button', { name: '选择已有资源包' }).click(); await expect(page.getByRole('region', { name: '资源包检查' })).toBeVisible();
  await page.getByRole('button', { name: '关闭资源包检查' }).click();
  await page.getByText('文件', { exact: true }).click(); await page.getByRole('button', { name: '新的GUI项目' }).click();
  await expect.poll(async () => JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].nodes.length).toBe(0);
  await expect(page.getByTestId('save-status')).toContainText('本地已保存'); await page.reload();
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].nodes).toHaveLength(0);
  await page.getByRole('button', { name: '本地保存状态和副本' }).click(); const copies = page.getByLabel('本地副本'); await expect(copies.locator('option')).toHaveCount(2);
  const current = await copies.inputValue(); const old = await copies.locator('option').evaluateAll((options, value) => (options as HTMLOptionElement[]).find(option => option.value !== value)?.value, current); await copies.selectOption(old!); await page.getByRole('button', { name: '打开本地副本' }).click();
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!)).toEqual(before);
});
