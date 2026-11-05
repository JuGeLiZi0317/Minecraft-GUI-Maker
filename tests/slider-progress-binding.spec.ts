import { expect, test, type Page } from '@playwright/test';

async function position(page: Page, x: number, y: number) {
  for (const [label, value] of [['X', x], ['Y', y]] as const) { const field = page.getByLabel(label, { exact: true }); await field.fill(String(value)); await field.press('Enter'); }
}

test('Slider changes drive only an explicitly bound Progress Bar in behavior preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加 Slider', exact: true }).click(); await position(page, 32, 30);
  await page.getByRole('button', { name: '添加 Progress Bar', exact: true }).click(); await position(page, 32, 78);
  const panelButton = page.getByRole('button', { name: '行为', exact: true }); await panelButton.click();
  const panel = page.getByTestId('behavior-panel'); await panel.getByRole('button', { name: '新增规则' }).click();
  await panel.getByLabel('行为事件').selectOption('slider-change');
  await panel.getByLabel('触发组件').selectOption('node_1');
  await panel.getByLabel('目标组件').selectOption('node_2');
  await panel.getByLabel('Progress Bar 映射').selectOption('normalize');
  await panel.getByRole('button', { name: '保存规则' }).click();
  const authorityBefore = JSON.parse((await page.getByTestId('project-json').textContent())!);
  expect(authorityBefore.schemaVersion).toBe('0.29.0');
  expect(authorityBefore.screens[0].behaviors[0]).toMatchObject({ event: { type: 'slider-change', sourceId: 'node_1' }, action: { type: 'set-progress-value', targetId: 'node_2', mapping: 'normalize' } });

  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const slider = page.getByRole('slider', { name: '滑块 node_1' }); await expect(slider).toBeVisible();
  const box = await slider.boundingBox(); if (!box) throw new Error('Slider 没有可见边界');
  await page.mouse.move(box.x + 5, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2, { steps: 4 }); await page.mouse.up();
  await expect(panel.getByTestId('behavior-preview')).toContainText('"node_2":{"progressValue":100');
  await expect(panel.getByTestId('behavior-event-log')).toContainText('slider-change · node_1');
  await expect(panel.getByTestId('behavior-event-log')).toContainText('匹配：rule_1');
  await expect(panel.getByTestId('behavior-event-log')).toContainText('已更新为 100（normalize）');
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!)).toEqual(authorityBefore);
  await panel.getByRole('button', { name: '重置预览' }).click();
  await expect(panel.getByTestId('behavior-preview')).toHaveCount(0);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByRole('slider', { name: '滑块 node_1' })).toHaveAttribute('aria-valuenow', '50');
});
