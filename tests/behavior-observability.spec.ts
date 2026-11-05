import { expect, test } from '@playwright/test';

test('Behavior panel explains F2 boundary and records then clears preview execution', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await page.getByRole('button', { name: '行为', exact: true }).click();
  const panel = page.getByTestId('behavior-panel');
  await expect(panel.getByTestId('behavior-capability')).toContainText('0 条 F2 规则');
  await expect(panel.getByTestId('behavior-capability')).toContainText('rectangle-click');
  await expect(panel.getByTestId('behavior-capability')).toContainText('未配置规则的 Slider 不会驱动任何目标');
  await expect(panel.getByTestId('behavior-capability')).toContainText('节点事件仍是未绑定意图');
  await panel.getByRole('button', { name: '新增规则' }).click();
  await panel.getByRole('button', { name: '保存规则' }).click();
  await expect(panel.getByTestId('behavior-capability')).toContainText('1 条 F2 规则');
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await panel.getByRole('button', { name: /模拟触发 node_1/ }).click();
  await expect(panel.getByTestId('behavior-event-log')).toContainText('button-click · node_1');
  await expect(panel.getByTestId('behavior-event-log')).toContainText('匹配：rule_1');
  await expect(panel.getByTestId('behavior-event-log')).toContainText('set-visible → node_1 已模拟执行');
  await panel.getByRole('button', { name: '重置预览' }).click();
  await expect(panel.getByTestId('behavior-event-log')).toHaveCount(0);
  await expect(page.getByTestId('project-json')).toContainText('button-click');
});
