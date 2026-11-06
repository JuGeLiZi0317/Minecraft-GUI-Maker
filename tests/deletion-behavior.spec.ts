import { expect, test, type Page } from '@playwright/test';
import { deletionProject } from './fixtures/deletionProject';
import { createNode } from '../src/domain/model';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
async function setup(page: Page, project = deletionProject()) {
  await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({ name: 'delete.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
}

test('deleting an unbound widget does not ask for confirmation', async ({ page }) => {
  const project = deletionProject(); project.screens[0].nodes.push(createNode('minecraft:checkbox', 'unbound_checkbox'));
  await setup(page, project);
  let dialogs = 0; page.on('dialog', dialog => { dialogs++; void dialog.accept(); });
  await page.getByRole('button', { name: '选择 unbound_checkbox', exact: true }).click();
  await page.getByRole('button', { name: '删除组件', exact: true }).click();
  expect(dialogs).toBe(0);
  expect((await read(page)).screens[0].nodes.some((node: any) => node.id === 'unbound_checkbox')).toBe(false);
});

test('cancel preserves dirty Blockly draft; confirm deletes shared and conditional bindings with clean reload and one undo', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await setup(page);
  const before = await read(page), history = await page.getByTestId('history-count').innerText();
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  const editor = page.getByTestId('blockly-editor');
  await editor.locator('.blocklySvg .blocklyBlockCanvas').getByRole('button', { name: /dropdown: 主选择.*node_22/ }).click(); await page.getByRole('option', { name: /备用选择.*node_23/ }).click();
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('未保存草稿');
  await page.getByRole('button', { name: 'GUI 设计模式' }).click(); await page.getByRole('button', { name: '选择 node_26', exact: true }).click();
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('rule_shared'); expect(dialog.message()).toContain('rule_condition'); await dialog.dismiss(); });
  await page.getByRole('button', { name: '删除组件', exact: true }).click(); expect(await read(page)).toEqual(before); expect(await page.getByTestId('history-count').innerText()).toBe(history);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click(); await expect(editor.getByTestId('blockly-diagnostic')).toContainText('未保存草稿');
  await page.getByRole('button', { name: 'GUI 设计模式' }).click();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '删除组件', exact: true }).click();
  const after = await read(page); expect(after.screens[0].behaviors.map((rule: any) => rule.id)).toEqual(['rule_legacy', 'rule_to_other']);
  expect(after.screens[0].nodes.some((node: any) => node.id === 'node_26')).toBe(false);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('与项目一致'); await expect(editor.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.statusbar [role="alert"]')).toHaveCount(0);
  // A deletion marker must not disable protection for later, newly edited drafts.
  await editor.locator('.blocklySvg .blocklyBlockCanvas').getByRole('button', { name: /dropdown: 主选择.*node_22/ }).click(); await page.getByRole('option', { name: /备用选择.*node_23/ }).click();
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('未保存草稿');
  await page.getByTestId('blockly-context-tools').getByLabel('Blockly 当前 Screen').selectOption('screen_other'); await expect(editor.getByRole('alert')).toContainText('草稿');
  await editor.getByRole('button', { name: '放弃草稿并重新载入' }).click(); await expect(editor.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'GUI 设计模式' }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await read(page)).toEqual(before);
  await page.getByRole('button', { name: '重做', exact: true }).click(); expect(await read(page)).toEqual(after);
  expect(errors).toEqual([]);
});

test('F2 draft clears when its bound widget is confirmed deleted and surviving rules have no diagnostics', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: '行为', exact: true }).click(); const panel = page.getByTestId('behavior-panel');
  await panel.getByRole('button', { name: '编辑 rule_legacy', exact: true }).click(); await expect(panel.getByRole('button', { name: '取消编辑' })).toBeVisible();
  await page.getByRole('button', { name: '选择 legacy_label', exact: true }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('rule_legacy'); await dialog.accept(); });
  await page.keyboard.press('Delete');
  await expect(panel.getByRole('button', { name: '取消编辑' })).toHaveCount(0);
  await expect(panel).not.toContainText('有待处理诊断'); await expect(panel).not.toContainText('来源不可用');
  expect((await read(page)).screens[0].behaviors.some((rule: any) => rule.id === 'rule_legacy')).toBe(false);
  await expect(page.locator('.statusbar [role="alert"]')).toHaveCount(0);
});

test('confirmed Screen deletion removes incoming navigation, replaces entry and reloads Blockly without stale warnings', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await setup(page); const before = await read(page);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click(); await page.getByRole('button', { name: 'GUI 设计模式' }).click();
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('rule_to_main'); expect(dialog.message()).toContain('项目入口改为 screen_other'); await dialog.accept(); });
  await page.getByRole('button', { name: '删除当前画布', exact: true }).click();
  const after = await read(page); expect(after.screens).toHaveLength(1); expect(after.entryScreenId).toBe('screen_other');
  expect(after.screens[0].screenTargets).toEqual([]); expect(after.screens[0].behaviors.map((rule: any) => rule.id)).toEqual(['rule_other']);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click(); const editor = page.getByTestId('blockly-editor');
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('与项目一致'); await expect(editor.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'GUI 设计模式' }).click(); await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await read(page)).toEqual(before);
  expect(errors).toEqual([]);
});
