import { expect, test } from '@playwright/test';
import { blocklyProject, sharedStatusRule } from './fixtures/blocklyProject';

test('aliases update Inspector, structure and Blockly and survive reload without changing game text', async ({ page }) => {
  const doc = blocklyProject(); doc.schemaVersion = '0.31.0'; doc.screens[0].behaviors.push(sharedStatusRule());
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'aliases.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '选择 node_22', exact: true }).click();
  const input = page.getByRole('textbox', { name: '控件别名', exact: true });
  await input.fill('运行模式选择'); await input.press('Enter');
  await expect(page.locator('.selected-heading h2')).toHaveText('运行模式选择');
  await expect(page.getByRole('button', { name: '选择 node_22', exact: true })).toContainText('运行模式选择');
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  const saved = await read(); expect(saved.screens[0].nodes[0]).toEqual({ ...doc.screens[0].nodes[0], alias: '运行模式选择' });
  expect(saved.screens[0].behaviors).toEqual(doc.screens[0].behaviors);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await page.getByLabel('Blockly 规则', { exact: true }).selectOption('rule_shared');
  await expect(page.locator('.blocklyWorkspace .blocklyText').filter({ hasText: '运行模式选择' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'GUI 设计模式', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '选择 node_22', exact: true })).toContainText('运行模式选择');
  await page.getByRole('button', { name: '选择 node_22', exact: true }).click();
  await page.getByRole('textbox', { name: '控件别名', exact: true }).fill('');
  await page.getByRole('textbox', { name: '控件别名', exact: true }).press('Enter');
  await expect(page.locator('.selected-heading h2')).not.toHaveText('运行模式选择');
  expect((await read()).screens[0].nodes[0].alias).toBeUndefined();
});
