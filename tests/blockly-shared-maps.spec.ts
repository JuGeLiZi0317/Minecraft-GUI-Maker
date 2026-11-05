import { expect, test, type Page } from '@playwright/test';
import { blocklyProject } from './fixtures/blocklyProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);

test('B1.1 shared maps are edited once, referenced from real Blockly blocks, and remain independent after copy', async ({ page }) => {
  const project = blocklyProject(); project.schemaVersion = '0.32.0';
  const map = { id: 'status_map_main', name: '主状态映射', mappings: [{ optionId: 'option_1', statusId: 'status_running' }, { optionId: 'option_2', statusId: 'status_warning' }] };
  project.screens[0].behaviorMaps = [map];
  project.screens[0].behaviors.push({ id: 'rule_shared_map', event: { type: 'selection-change', sourceId: 'node_22' }, actions: [
    { type: 'set-status', targetId: 'node_26', mapRef: map.id }, { type: 'set-status', targetId: 'node_26', mapRef: map.id },
  ] });
  await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({ name: 'shared-map.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click(); const editor = page.getByTestId('blockly-editor');
  await expect(editor.locator('.blocklySvg .blocklyBlockCanvas [data-block-type="gui_shared_status_map"]')).toHaveCount(2);
  const mapRow = editor.getByTestId('blockly-maps').locator('.blockly-map-row').filter({ hasText: 'status_map_main' });
  await expect(mapRow).toContainText('rule_shared_map · 动作 1'); await expect(mapRow).toContainText('rule_shared_map · 动作 2');
  await mapRow.getByRole('button', { name: '编辑' }).click();
  await editor.getByLabel('共享映射状态 1').selectOption('status_warning');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'blocked-replacement.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(blocklyProject())) });
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('Blockly 有未保存草稿'); expect(await read(page)).toEqual(project);
  await editor.getByRole('button', { name: '保存映射定义' }).click();
  let saved = await read(page);
  expect(saved.schemaVersion).toBe('0.32.0'); expect(saved.screens[0].behaviorMaps[0].mappings[0].statusId).toBe('status_warning');
  expect(saved.screens[0].behaviors[1].actions.map((action: { mapRef: string }) => action.mapRef)).toEqual([map.id, map.id]);
  await expect(mapRow).toContainText('rule_shared_map · 动作 2');

  await editor.getByRole('button', { name: '新建共享映射' }).click(); await editor.getByLabel('共享映射名称').fill('新建独立映射');
  await editor.getByRole('button', { name: '添加映射项' }).click(); await editor.getByRole('button', { name: '保存映射定义' }).click();
  saved = await read(page); expect(saved.screens[0].behaviorMaps.some((entry: { name: string; mappings: unknown[] }) => entry.name === '新建独立映射' && entry.mappings.length === 1)).toBe(true);

  await mapRow.getByRole('button', { name: '复制', exact: true }).click();
  await editor.getByLabel('共享映射名称').fill('独立状态映射');
  await editor.getByLabel('共享映射状态 1').selectOption('status_stopped');
  await editor.getByRole('button', { name: '保存映射定义' }).click();
  saved = await read(page); const copy = saved.screens[0].behaviorMaps.find((entry: { name: string }) => entry.name === '独立状态映射');
  expect(copy).toBeTruthy(); expect(copy.id).not.toBe(map.id); expect(copy.mappings).toEqual([{ optionId: 'option_1', statusId: 'status_stopped' }, { optionId: 'option_2', statusId: 'status_warning' }]);
  expect(saved.screens[0].behaviorMaps.find((entry: { id: string }) => entry.id === map.id).mappings[0].statusId).toBe('status_warning');

  const sharedBlocks = editor.locator('.blocklySvg .blocklyBlockCanvas [data-block-type="gui_shared_status_map"]');
  await sharedBlocks.nth(0).locator('.blocklyDropdownField').click(); await page.getByRole('option', { name: new RegExp(`独立状态映射.*${copy.id}`) }).click();
  await expect(editor.getByTestId('blockly-semantic-preview')).toContainText(copy.id);
  await editor.getByRole('button', { name: '保存积木规则' }).click(); saved = await read(page);
  expect(saved.screens[0].behaviors[1].actions.map((action: { mapRef: string }) => action.mapRef)).toEqual([copy.id, map.id]);
  await page.getByRole('button', { name: 'GUI 设计模式' }).click();

  await page.getByRole('button', { name: '行为', exact: true }).click(); await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑 rule_shared_map' })).toBeDisabled();
  await page.getByRole('radio', { name: '相同名称 (2/4)', exact: true }).click();
  await expect(page.getByTestId('behavior-preview')).toContainText('status_warning');
  await page.getByRole('radio', { name: '相同名称 (1/4)', exact: true }).click();
  await expect(page.getByTestId('behavior-event-log')).toContainText('set-status → node_26 / status_stopped 已执行');
  await expect(page.getByTestId('behavior-event-log')).toContainText('set-status → node_26 / status_warning 已执行');
  expect(await read(page)).toEqual(saved);
});
