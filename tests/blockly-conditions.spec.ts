import { expect, test } from '@playwright/test';
import { blocklyProject } from './fixtures/blocklyProject';

test('B1.3 finite conditions load in Blockly and execute only the selected branch in preview', async ({ page }) => {
  const doc = blocklyProject(); doc.schemaVersion = '0.33.0';
  doc.screens[0].behaviors.push({ id: 'rule_condition', event: { type: 'selection-change', sourceId: 'node_22' }, actions: [
    { type: 'if', condition: { type: 'event-option', operator: 'equals', optionId: 'option_1' }, thenActions: [{ type: 'set-status', targetId: 'node_26', optionMappings: [{ optionId: 'option_1', statusId: 'status_running' }] }], elseActions: [{ type: 'set-status', targetId: 'node_26', optionMappings: [{ optionId: 'option_2', statusId: 'status_warning' }] }] },
    { type: 'if', condition: { type: 'event-option', operator: 'not-equals', optionId: 'option_1' }, thenActions: [{ type: 'set-status', targetId: 'node_26', optionMappings: [{ optionId: 'option_2', statusId: 'status_stopped' }] }], elseActions: [] },
  ] });
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'B1.3.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  const editor = page.getByTestId('blockly-editor');
  await expect(editor.locator('.blocklySvg .blocklyBlockCanvas [data-block-type="gui_if"]')).toHaveCount(2);
  await expect(editor.locator('.blocklySvg .blocklyBlockCanvas [data-block-type="gui_if_option"]')).toHaveCount(2);
  await expect(editor.getByTestId('blockly-semantic-preview')).toContainText('not-equals');
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('连接与引用有效');
  await page.getByRole('button', { name: 'GUI 设计模式' }).click();
  await page.getByRole('button', { name: '行为', exact: true }).click();
  const panel = page.getByTestId('behavior-panel');
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const preview = panel.getByTestId('behavior-preview'), log = panel.getByTestId('behavior-event-log');
  await page.getByRole('radio', { name: '相同名称 (2/4)', exact: true }).click();
  await expect(preview).toContainText('status_stopped');
  await expect(log).toContainText('equals option_1 → false，进入 else');
  await expect(log).toContainText('not-equals option_1 → true，进入 then');
  await expect(log).toContainText('未选分支跳过 1 个动作');
  const afterSecond = await log.innerText();
  expect(afterSecond).not.toContain('未选分支跳过 0 个动作');
  await page.getByRole('radio', { name: '相同名称 (1/4)', exact: true }).click();
  await expect(preview).toContainText('status_running');
  await expect(log).toContainText('not-equals option_1 → false，进入 else');
  await expect(log).toContainText('set-status → node_26 / status_running 已执行');
  await expect(page.getByTestId('project-json')).toContainText('"initialStatusId": "status_stopped"');
  await panel.getByRole('button', { name: '重置预览', exact: true }).click();
  await expect(preview).toHaveCount(0);
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].behaviors[1]).toEqual(doc.screens[0].behaviors[1]);
});
