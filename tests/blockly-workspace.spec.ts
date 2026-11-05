import { expect, test, type Page } from '@playwright/test';
import { blocklyProject, sharedStatusRule } from './fixtures/blocklyProject';
import { emptyProject } from '../src/domain/model';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const importProject = async (page: Page, project: unknown) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'blockly-workspace.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
};
const enterBlockly = async (page: Page) => {
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  const editor = page.getByTestId('blockly-editor'); await expect(editor).toBeVisible(); await expect(editor.locator('.blocklySvg')).toBeVisible(); return editor;
};

test('new empty Screen opens an untouched Blockly template without crashing or blocking GUI editing', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await importProject(page, emptyProject());
  await page.getByRole('button', { name: '新增画布' }).click();
  const before = await read(page), editor = await enterBlockly(page);
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('与项目一致');
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('暂无可配置的选择联动');
  await expect(editor.getByRole('button', { name: '保存积木规则' })).toBeDisabled();
  expect(await read(page)).toEqual(before);
  await page.getByRole('button', { name: 'GUI 设计模式' }).click();
  await page.getByRole('button', { name: '新增画布' }).click();
  await expect(page.getByLabel('当前画布', { exact: true }).locator('option')).toHaveCount(before.screens.length + 1);
  expect((await read(page)).screens.every((screen: any) => screen.behaviors.length === 0)).toBe(true);
  expect(errors).toEqual([]);
});

test('Blockly switches from a saved rule to an empty Screen and back without crashing or inventing dirty drafts', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const project = blocklyProject(); project.schemaVersion = '0.31.0'; project.screens[0].behaviors.push(sharedStatusRule());
  const empty = emptyProject().screens[0]; empty.id = 'screen_empty'; project.screens.push(empty);
  await importProject(page, project);
  const editor = await enterBlockly(page);
  await editor.getByLabel('Blockly 当前 Screen').selectOption(empty.id);
  await expect(editor.getByLabel('Blockly 当前 Screen')).toHaveValue(empty.id);
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('与项目一致');
  await expect(editor.getByRole('button', { name: '保存积木规则' })).toBeDisabled();
  await editor.getByLabel('Blockly 当前 Screen').selectOption(project.screens[0].id);
  await expect(editor.getByLabel('Blockly 规则')).toHaveValue('rule_shared');
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('与项目一致');
  expect(await read(page)).toEqual(project); expect(errors).toEqual([]);
});

test('Blockly mode preserves an unsaved real workspace draft across mode switches and keeps the GUI canvas unmounted while active', async ({ page }) => {
  const project = blocklyProject(); await importProject(page, project); const editor = await enterBlockly(page);
  await expect(page.locator('.workspace.blockly-mode > .studio')).toHaveCount(0);
  const before = await read(page), source = editor.locator('.blocklySvg .blocklyBlockCanvas [data-block-type="gui_selection_source"]');
  await source.click({ position: { x: 10, y: 8 } }); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  await expect(source).toHaveCount(2); await page.keyboard.press('Control+z'); await expect(source).toHaveCount(1);
  await source.locator('.blocklyDropdownField').click(); await page.getByRole('option', { name: /备用选择/ }).click();
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('未保存草稿');
  await page.getByRole('button', { name: 'GUI 设计模式' }).click(); await expect(editor).toBeHidden(); expect(await read(page)).toEqual(before);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click(); await expect(editor).toBeVisible();
  await expect(editor.getByTestId('blockly-semantic-preview')).toContainText('node_23');
  await editor.getByRole('button', { name: '保存积木规则' }).click();
  const saved = await read(page); expect(saved.screens[0].behaviors.some((rule: any) => rule.event?.sourceId === 'node_23')).toBe(true);
});

test('Screen switch preserves a stale Blockly draft, rejects saving it to the new Screen, and reloads only on explicit request', async ({ page }) => {
  const project = blocklyProject(); await importProject(page, project);
  await page.getByRole('button', { name: '新增画布' }).click();
  const beforeSwitch = await read(page), secondScreenId = beforeSwitch.screens[1].id;
  await page.getByLabel('当前画布', { exact: true }).selectOption(beforeSwitch.screens[0].id);
  const editor = await enterBlockly(page), source = editor.locator('.blocklySvg .blocklyBlockCanvas [data-block-type="gui_selection_source"]');
  await source.locator('.blocklyDropdownField').click(); await page.getByRole('option', { name: /备用选择/ }).click();
  await editor.getByLabel('Blockly 当前 Screen').selectOption(secondScreenId);
  await expect(editor.getByRole('alert')).toContainText(`保留在 ${beforeSwitch.screens[0].id} 草稿中`);
  await expect(editor.getByRole('button', { name: '保存积木规则' })).toBeDisabled(); expect(await read(page)).toEqual(beforeSwitch);
  await editor.getByRole('button', { name: '放弃草稿并重新载入' }).click();
  await expect(editor.getByLabel('Blockly 当前 Screen')).toHaveValue(secondScreenId);
  await expect(editor.getByTestId('blockly-semantic-preview')).not.toContainText('node_23');
  expect(await read(page)).toEqual(beforeSwitch);
});

test('mapping sidebar locates a referenced block, resizes and collapses, and opens as a narrow-window drawer', async ({ page }) => {
  const project = blocklyProject(); project.schemaVersion = '0.32.0';
  const map = { id: 'status_map_shared', name: '共享状态映射', mappings: [{ optionId: 'option_1', statusId: 'status_running' }] };
  project.screens[0].behaviorMaps = [map];
  project.screens[0].behaviors.push({ id: 'rule_map_ref', event: { type: 'selection-change', sourceId: 'node_22' }, actions: [{ type: 'set-status', targetId: 'node_26', mapRef: map.id }] });
  await importProject(page, project); const editor = await enterBlockly(page), sidebar = editor.getByTestId('blockly-sidebar');
  await expect(sidebar).toContainText('1 个引用');
  const host = editor.getByTestId('blockly-workspace'), initialHostWidth = (await host.boundingBox())!.width;
  const resizer = editor.getByRole('separator', { name: '调整共享映射面板宽度' }), resizerBox = (await resizer.boundingBox())!;
  await page.mouse.move(resizerBox.x + 2, resizerBox.y + 20); await page.mouse.down(); await page.mouse.move(resizerBox.x + 70, resizerBox.y + 20); await page.mouse.up();
  expect((await host.boundingBox())!.width).toBeGreaterThan(initialHostWidth);
  const reference = sidebar.getByRole('button', { name: /rule_map_ref · 动作 1/ }); await reference.click();
  await expect(sidebar.getByLabel('选中积木属性')).toContainText('设置指示器状态');
  await editor.getByRole('button', { name: '收起映射面板' }).click(); await expect(sidebar).toBeHidden();
  await editor.getByRole('button', { name: '共享映射', exact: true }).click(); await expect(sidebar).toBeVisible();
  await page.setViewportSize({ width: 768, height: 900 });
  await editor.getByRole('button', { name: '共享映射', exact: true }).click();
  await expect(editor.locator('.blockly-drawer-backdrop')).toBeVisible();
  await expect(editor.locator('.blockly-drawer-backdrop').getByTestId('blockly-sidebar')).toBeVisible();
  await editor.getByRole('button', { name: '关闭映射侧栏' }).last().click();
  await expect(editor.locator('.blockly-drawer-backdrop')).toBeHidden();
});
