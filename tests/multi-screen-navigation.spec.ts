import { expect, test } from '@playwright/test';

test('a bound F2 open_screen switches real screens only inside behavior preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  const sourceId = await page.getByLabel('当前 Screen').inputValue();
  await page.getByRole('button', { name: '新增 Screen', exact: true }).click();
  const destinationId = await page.getByLabel('当前 Screen').inputValue();
  expect(destinationId).not.toBe(sourceId);
  await page.getByLabel('当前 Screen').selectOption(sourceId);

  await page.getByRole('button', { name: '行为', exact: true }).click();
  let panel = page.getByTestId('behavior-panel');
  await panel.getByRole('button', { name: '新增 Screen 目标' }).click();
  await panel.getByLabel('Screen 目标名称').fill('设置页');
  await panel.getByLabel('绑定真实 Screen').selectOption(destinationId);
  await panel.getByRole('button', { name: '保存 Screen 目标' }).click();
  await panel.getByRole('button', { name: '新增规则' }).click();
  await panel.getByLabel('行为动作').selectOption('open_screen');
  await panel.getByRole('button', { name: '保存规则' }).click();

  const jsonBefore = await page.getByTestId('project-json').textContent();
  const historyBefore = await page.getByTestId('history-count').textContent();
  await panel.getByRole('button', { name: '开始画布行为测试' }).click();
  await panel.getByRole('button', { name: '模拟触发 node_1' }).click();
  await expect(page.getByLabel('当前 Screen')).toHaveValue(destinationId);
  panel = page.getByTestId('behavior-panel');
  await expect(panel.getByTestId('behavior-preview')).toBeVisible();
  expect(await page.getByTestId('project-json').textContent()).toBe(jsonBefore);
  expect(await page.getByTestId('history-count').textContent()).toBe(historyBefore);

  await panel.getByRole('button', { name: '重置预览' }).click();
  await expect(page.getByLabel('当前 Screen')).toHaveValue(sourceId);
  await expect(page.getByTestId('behavior-preview')).toHaveCount(0);
  expect(await page.getByTestId('project-json').textContent()).toBe(jsonBefore);
});
