import { expect, test } from '@playwright/test';

test('entry transaction survives history/reload; preview starts at entry and directed navigation resets target', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  const first = await page.getByLabel('当前画布', { exact: true }).inputValue();
  await page.getByRole('button', { name: '新增画布', exact: true }).click();
  const second = await page.getByLabel('当前画布', { exact: true }).inputValue();
  await page.getByRole('button', { name: '添加 Checkbox', exact: true }).click();
  await page.getByLabel('项目入口 Screen').selectOption(second);
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  expect((await read()).entryScreenId).toBe(second); expect((await read()).schemaVersion).toBe('0.17.0');
  await page.getByText('编辑', { exact: true }).click(); await page.getByRole('button', { name: '撤销操作', exact: true }).click(); expect((await read()).entryScreenId).toBe(first);
  await page.getByText('编辑', { exact: true }).click(); await page.getByRole('button', { name: '重做操作', exact: true }).click(); expect((await read()).entryScreenId).toBe(second);
  await page.getByLabel('项目入口 Screen').selectOption(first);
  await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload(); expect((await read()).entryScreenId).toBe(first);
  await page.getByLabel('当前画布', { exact: true }).selectOption(first);
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('项目入口改为'); await dialog.dismiss(); }); await page.getByRole('button', { name: '删除当前画布', exact: true }).click(); expect((await read()).entryScreenId).toBe(first);
  await page.getByRole('button', { name: '行为', exact: true }).click(); const panel = page.getByTestId('behavior-panel');
  await panel.getByRole('button', { name: '新增 Screen 目标' }).click(); await panel.getByLabel('Screen 目标名称').fill('Next'); await panel.getByLabel('绑定真实 Screen').selectOption(second); await panel.getByRole('button', { name: '保存 Screen 目标' }).click();
  await panel.getByRole('button', { name: '新增规则' }).click(); await panel.getByLabel('行为动作').selectOption('open_screen'); await panel.getByRole('button', { name: '保存规则' }).click();
  await page.getByLabel('当前画布', { exact: true }).selectOption(second);
  await panel.getByRole('button', { name: '新增 Screen 目标' }).click(); await panel.getByLabel('Screen 目标名称').fill('Reopen'); await panel.getByLabel('绑定真实 Screen').selectOption(second); await panel.getByRole('button', { name: '保存 Screen 目标' }).click();
  await panel.getByRole('button', { name: '新增规则' }).click(); await panel.getByLabel('行为动作').selectOption('open_screen'); await panel.getByRole('button', { name: '保存规则' }).click();
  const before = await read(); await page.getByRole('button', { name: '交互预览', exact: true }).click(); await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(first);
  await panel.getByRole('button', { name: '模拟触发 node_1' }).click(); await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(second);
  await expect(panel.getByTestId('behavior-preview')).toHaveText('预览中：{}'); expect(await read()).toEqual(before);
  await panel.getByRole('button', { name: /模拟触发 node_2/ }).click();
  await expect(panel.getByTestId('behavior-preview')).toContainText('预览中：{}');
  await expect(panel.getByRole('button', { name: /模拟触发 node_2/ })).toContainText('未勾选');
  // Ending interaction mode returns to the editor Screen that was active before preview started.
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(second);
  // Restarting preview still begins at the configured entry, and Reset keeps its existing entry-reset semantics.
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(first);
  await panel.getByRole('button', { name: '重置预览' }).click(); expect(await read()).toEqual(before);
});
