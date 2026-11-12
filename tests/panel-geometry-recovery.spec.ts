import { expect, test } from '@playwright/test';
import { emptyProject } from '../src/domain/model';

test('rejected shrink can be repaired with matching Panel draft and never locks Screen creation', async ({ page }) => {
  await page.goto('/');
  const project = emptyProject(); project.schemaVersion = '0.38.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  project.screens[0].background = { kind: 'panel', style: 'custom-bevel-1', bounds: { x: 10, y: 10, w: 300, h: 160 } };
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'panel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  const history = await page.getByTestId('history-count').textContent();
  await page.getByLabel('设计区宽', { exact: true }).fill('200');
  await page.getByLabel('设计区高', { exact: true }).fill('120');
  await page.getByRole('button', { name: '应用设计区尺寸', exact: true }).click();
  await expect(page.locator('.screen-size-controls [role="alert"]')).toContainText('配套调整');
  expect(await read()).toEqual(project); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await page.getByLabel('Panel W', { exact: true }).fill('180'); await page.getByLabel('Panel H', { exact: true }).fill('100');
  await page.getByRole('button', { name: '应用 Panel 几何', exact: true }).click();
  let saved = await read(); expect(saved.schemaVersion).toBe('0.38.0');
  expect(saved.screens[0].designSize).toMatchObject({ width: 200, height: 120 });
  expect(saved.screens[0].background.bounds).toEqual({ x: 10, y: 10, w: 180, h: 100 });
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await read()).toEqual(project);
  await page.getByRole('button', { name: '重做', exact: true }).click(); expect(await read()).toEqual(saved);
  // Cancel deliberately invalid drafts, then add a real Screen without abandoning the project.
  await page.getByLabel('设计区宽', { exact: true }).fill('50');
  await page.getByRole('button', { name: '应用设计区尺寸', exact: true }).click();
  await page.getByRole('button', { name: '取消几何草稿', exact: true }).click();
  await page.getByRole('button', { name: '新增画布', exact: true }).click();
  await expect.poll(async () => (await read()).screens.length).toBe(2);
  saved = await read(); await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload(); await expect.poll(read).toEqual(saved);
});

test('pending matching geometry is committed once before creating a Screen; invalid draft can be cancelled before new project', async ({ page }) => {
  await page.goto('/');
  const project = emptyProject(); project.schemaVersion = '0.9.0'; project.screens[0].background = { kind: 'panel', style: 'custom-bevel-1', bounds: { x: 0, y: 0, w: 320, h: 180 } };
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'panel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByLabel('设计区宽', { exact: true }).fill('240'); await page.getByLabel('Panel W', { exact: true }).fill('220');
  await page.getByRole('button', { name: '新增画布', exact: true }).click();
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  await expect.poll(async () => (await read()).screens.length).toBe(2);
  expect((await read()).screens[0].background.bounds.w).toBe(220);
  expect((await read()).screens[0].designSize.width).toBe(240);
  await page.getByLabel('设计区宽', { exact: true }).fill('0');
  await page.getByRole('button', { name: '应用设计区尺寸', exact: true }).click();
  await page.getByRole('button', { name: '取消几何草稿', exact: true }).click();
  await page.locator('.editor-menu summary').filter({ hasText: '文件' }).click();
  await page.getByRole('button', { name: '新的GUI项目', exact: true }).click();
  await expect(page.locator('.statusbar [role="status"]')).toContainText('已新建 GUI 项目');
  expect((await read()).screens).toHaveLength(1);
});
