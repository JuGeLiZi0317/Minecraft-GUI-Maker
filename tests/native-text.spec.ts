import { expect, test, type Page } from '@playwright/test';
import { repeatableListProject } from './fixtures/repeatableListProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);

test('Q5-A native style hides color controls; NeoForge mode exposes and persists the ARGB color', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q5a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(repeatableListProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '选择 material_up' }).click();
  const mode = page.getByLabel('文字颜色来源');
  await expect(mode).toHaveValue('native');
  await expect(page.getByLabel('颜色 ARGB')).toHaveCount(0);

  await mode.selectOption('neoforge');
  await expect(page.getByLabel('颜色 ARGB')).toBeVisible();
  await page.getByLabel('颜色 ARGB').fill('#FF112233');
  await page.getByLabel('颜色 ARGB').blur();
  const custom = await read(page);
  const customButton = custom.screens[0].nodes.find((node: { id: string }) => node.id === 'material_up');
  expect(custom.screens[0].nodes.find((node: { id: string }) => node.id === 'material_up')).toMatchObject({ props: { colorMode: 'neoforge', color: '#FF112233' } });
  expect(custom.schemaVersion).toBe('0.52.0');

  await mode.selectOption('native');
  await expect(page.getByLabel('颜色 ARGB')).toHaveCount(0);
  const native = await read(page);
  expect(native.screens[0].nodes.find((node: { id: string }) => node.id === 'material_up')).toMatchObject({ props: { colorMode: 'native', color: customButton.props.color } });
});
