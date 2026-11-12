import { expect, test } from '@playwright/test';
import { bakeProject } from './fixtures/bakeProject';

test('Bake workspace preserves uncommitted member selection across Design and Blockly, then edits the authoritative document', async ({ page }) => {
  await page.goto('/');
  const project = bakeProject();
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q3c3.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await expect(page.getByRole('region', { name: 'Static Bake Groups' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Bake / Assets 工作区' }).click();
  const workspace = page.getByLabel('Bake Workspace');
  await expect(workspace).toBeVisible();
  const panel = workspace.getByRole('region', { name: 'Static Bake Groups' });
  await panel.locator('summary').filter({ hasText: '新建 / 选择成员' }).click();
  await panel.getByLabel('Bake成员 persistent_fill_1', { exact: true }).check();
  await panel.getByLabel('Bake成员 persistent_fill_2', { exact: true }).check();

  await page.getByRole('button', { name: 'GUI 设计模式' }).click();
  await page.getByRole('button', { name: 'Blockly 实验' }).click();
  await expect(page.locator('.blockly-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Bake / Assets 工作区' }).click();
  await expect(panel.getByLabel('Bake成员 persistent_fill_1', { exact: true })).toBeChecked();
  await expect(panel.getByLabel('Bake成员 persistent_fill_2', { exact: true })).toBeChecked();

  await panel.getByRole('button', { name: '创建 Bake Group (2)' }).click();
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  await expect.poll(async () => (await read()).screens[0].bakeGroups?.length).toBe(1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(async () => (await read()).screens[0].bakeGroups?.length ?? 0).toBe(0);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect.poll(async () => (await read()).screens[0].bakeGroups?.length).toBe(1);
});

test('Bake workspace scopes groups to the selected Screen without moving document groups', async ({ page }) => {
  await page.goto('/');
  const project = bakeProject();
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q3c3-screens.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: 'Bake / Assets 工作区' }).click();
  const panel = page.getByRole('region', { name: 'Static Bake Groups' });
  await panel.locator('summary').filter({ hasText: '新建 / 选择成员' }).click();
  for (const id of ['persistent_fill_1', 'persistent_fill_2']) await panel.getByLabel(`Bake成员 ${id}`, { exact: true }).check();
  await panel.getByRole('button', { name: '创建 Bake Group (2)' }).click();
  await expect(panel).toContainText('1 组');

  await page.getByRole('button', { name: 'GUI 设计模式' }).click();
  await page.getByRole('button', { name: '新增画布', exact: true }).click();
  await page.getByRole('button', { name: 'Bake / Assets 工作区' }).click();
  const selector = page.getByLabel('Bake 当前 Screen');
  await selector.selectOption({ index: 1 });
  await expect(panel).toContainText('0 组');
  const secondScreenId = (await page.getByTestId('project-json').textContent()) && JSON.parse((await page.getByTestId('project-json').textContent())!).screens[1].id;
  await expect(selector).toHaveValue(secondScreenId);
  await selector.selectOption('screen_main');
  await expect(panel).toContainText('1 组');
});
