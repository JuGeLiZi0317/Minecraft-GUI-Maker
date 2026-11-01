import { expect, test } from '@playwright/test';

test('Panel geometry on a non-entry Screen preserves the 0.14.0 project contract', async ({ page }) => {
  await page.goto('/');
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  await page.getByRole('button', { name: '添加 CreativeTab', exact: true }).click();
  const entry = (await read()).screens[0].id;
  await page.getByRole('button', { name: '新增画布', exact: true }).click();
  const second = (await read()).screens[1].id;
  await page.getByLabel('项目入口 Screen').selectOption(entry);
  await page.getByLabel('当前画布', { exact: true }).selectOption(entry);
  await page.getByRole('button', { name: '选择 node_1' }).click();
  await page.getByLabel('CreativeTab 模式').selectOption('screen-navigation');
  const before = await read();
  expect(before.schemaVersion).toBe('0.14.0');

  await page.getByLabel('当前画布', { exact: true }).selectOption(second);
  await page.locator('.screen-settings summary').click();
  await page.getByLabel('设计区底板').selectOption('supplied-panel-16');
  for (const [name, value] of [['X', '10'], ['Y', '28'], ['W', '300'], ['H', '140']]) {
    await page.getByLabel(`Panel ${name}`).fill(value);
  }
  await page.getByRole('button', { name: '应用 Panel 几何' }).click();

  const saved = await read();
  expect(saved.schemaVersion).toBe('0.14.0');
  expect(saved.entryScreenId).toBe(entry);
  expect(saved.screenTabGroups).toEqual(before.screenTabGroups);
  expect(saved.screens.find((screen: any) => screen.id === second).background.bounds).toEqual({ x: 10, y: 28, w: 300, h: 140 });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await read()).schemaVersion).toBe('0.14.0');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect(await read()).toEqual(saved);
});
