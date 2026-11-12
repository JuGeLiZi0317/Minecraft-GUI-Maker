import { expect, test } from '@playwright/test';

const read = async (page: import('@playwright/test').Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);

test('local copy deletion and cache clearing leave exported projects untouched', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加 Checkbox', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('本地已保存');
  await page.getByText('文件', { exact: true }).click();
  await page.getByRole('button', { name: '新的GUI项目' }).click();
  await expect.poll(async () => (await read(page)).screens[0].nodes.length).toBe(0);
  await expect(page.getByTestId('save-status')).toContainText('本地已保存');

  await page.getByRole('button', { name: '本地保存状态和副本' }).click();
  const copies = page.getByLabel('本地副本', { exact: true });
  await expect(copies.locator('option')).toHaveCount(2);
  const current = await copies.inputValue();
  const old = await copies.locator('option').evaluateAll((options, value) => (options as HTMLOptionElement[]).find(option => option.value !== value)?.value, current);
  await copies.selectOption(old!);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '删除副本', exact: true }).click();
  await expect(copies.locator('option')).toHaveCount(1);

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '清除缓存', exact: true }).click();
  await expect.poll(async () => (await read(page)).screens[0].nodes.length).toBe(0);
  await expect(page.getByTestId('save-status')).toContainText('本地缓存已清除');
  await expect(copies.locator('option')).toHaveCount(1);
});
