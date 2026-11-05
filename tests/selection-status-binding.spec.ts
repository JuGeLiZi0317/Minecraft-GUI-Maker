import { IMPLEMENTATION_SPEC_VERSION } from '../src/exports/versions';
import { expect, test } from '@playwright/test';
import { createEditorStore } from '../src/editor/store';
import { literal } from '../src/domain/model';
import { isSelectionNode } from '../src/domain/selection';
import { isStatusNode } from '../src/domain/statusIndicator';

function fixture() {
  const store = createEditorStore();
  store.getState().add('minecraft:radio-group'); const radioId = store.getState().selected!;
  store.getState().updateNode(radioId, node => { node.bounds = { x: 10, y: 18, w: 120, h: 80 }; if (isSelectionNode(node)) { node.props.name = literal('Mode'); node.props.options = [
    { id: 'radio_alpha', label: literal('Twin'), disabled: false },
    { id: 'radio_beta', label: literal('Twin'), disabled: false },
    { id: 'radio_gamma', label: literal('Twin'), disabled: false },
    { id: 'radio_locked', label: literal('Locked'), disabled: true },
  ]; node.props.initialSelectedOptionId = 'radio_alpha'; } return node; });
  store.getState().add('minecraft:dropdown'); const dropdownId = store.getState().selected!;
  store.getState().updateNode(dropdownId, node => { node.bounds = { x: 155, y: 22, w: 140, h: 20 }; if (node.type === 'minecraft:dropdown') { node.props.name = literal('Quality'); node.props.options = [
    { id: 'drop_alpha', label: literal('Twin'), disabled: false },
    { id: 'drop_beta', label: literal('Twin'), disabled: false },
    { id: 'drop_gamma', label: literal('Unmapped'), disabled: false },
    { id: 'drop_locked', label: literal('Locked'), disabled: true },
  ]; node.props.initialSelectedOptionId = 'drop_alpha'; node.props.visibleRows = 4; } return node; });
  store.getState().add('minecraft:status-indicator'); const statusId = store.getState().selected!;
  store.getState().updateNode(statusId, node => { node.bounds = { x: 155, y: 75, w: 120, h: 24 }; if (isStatusNode(node)) node.props.initialStatusId = 'status_stopped'; return node; });
  return { doc: store.getState().doc, radioId, dropdownId, statusId };
}

test('Radio and Dropdown confirmed selection map stable option IDs into session-only Status values', async ({ page }) => {
  const f = fixture(); await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'selection-status.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(f.doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '行为', exact: true }).click();
  const panel = page.getByTestId('behavior-panel');
  const createRule = async (sourceId: string, mappings: Record<string, string>) => {
    await panel.getByRole('button', { name: '新增规则' }).click();
    await panel.getByLabel('行为事件').selectOption('selection-change');
    await panel.getByLabel('触发组件').selectOption(sourceId);
    await panel.getByLabel('目标组件').selectOption(f.statusId);
    for (const [optionId, statusId] of Object.entries(mappings)) await panel.getByLabel(`${optionId} 对应状态`).selectOption(statusId);
    await panel.getByRole('button', { name: '保存规则' }).click();
  };
  await createRule(f.radioId, { radio_alpha: 'status_running', radio_beta: 'status_warning' });
  await createRule(f.dropdownId, { drop_alpha: 'status_stopped', drop_beta: 'status_warning' });
  await createRule(f.dropdownId, { drop_beta: 'status_running' });
  const authority = JSON.parse((await page.getByTestId('project-json').textContent())!);
  expect(authority.schemaVersion).toBe('0.30.0');
  expect(authority.screens[0].behaviors.map((rule: any) => rule.event.type)).toEqual(['selection-change', 'selection-change', 'selection-change']);
  expect(authority.screens[0].behaviors[0].action.optionMappings).toEqual([{ optionId: 'radio_alpha', statusId: 'status_running' }, { optionId: 'radio_beta', statusId: 'status_warning' }]);

  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const radioBeta = page.getByRole('radio', { name: 'Twin (2/4)', exact: true }); await radioBeta.click();
  await expect(panel.getByTestId('behavior-preview')).toContainText(`"${f.statusId}":{"statusId":"status_warning"`);
  await expect(panel.getByTestId('behavior-event-log')).toContainText(`selection-change · ${f.radioId} · optionId radio_beta`);
  await expect(panel.getByTestId('behavior-event-log')).toContainText('匹配：rule_1');

  const radioGamma = page.getByRole('radio', { name: 'Twin (3/4)', exact: true }); await radioGamma.click();
  await expect(panel.getByTestId('behavior-event-log')).toContainText(`optionId radio_gamma 未映射到 ${f.statusId}；状态保持不变`);
  await expect(panel.getByTestId('behavior-preview')).toContainText('"statusId":"status_warning"');
  await expect(page.getByRole('radio', { name: 'Locked (4/4)', exact: true })).toBeDisabled();
  await expect(panel.getByTestId('behavior-event-log')).not.toContainText('optionId radio_locked');

  const trigger = page.getByRole('button', { name: 'Quality: Twin', exact: true }); await trigger.focus(); await trigger.press('Enter');
  const list = page.getByRole('listbox', { name: 'Quality', exact: true }); await expect(list).toBeVisible();
  await list.press('ArrowDown'); await expect(list).toHaveAttribute('aria-activedescendant', `choice-${f.dropdownId}-drop_beta`);
  await expect(panel.getByTestId('behavior-event-log')).not.toContainText(`selection-change · ${f.dropdownId}`);
  await expect(page.locator(`[data-choice-option="drop_locked"]`)).toHaveAttribute('aria-disabled', 'true');
  await list.press('ArrowDown'); await expect(list).toHaveAttribute('aria-activedescendant', `choice-${f.dropdownId}-drop_gamma`);
  await list.press('ArrowDown'); await expect(list).toHaveAttribute('aria-activedescendant', `choice-${f.dropdownId}-drop_alpha`);
  await expect(panel.getByTestId('behavior-event-log')).not.toContainText(`selection-change · ${f.dropdownId}`);
  await list.press('ArrowDown'); await expect(list).toHaveAttribute('aria-activedescendant', `choice-${f.dropdownId}-drop_beta`);
  await list.press('Enter');
  await expect(panel.getByTestId('behavior-event-log')).toContainText(`selection-change · ${f.dropdownId} · optionId drop_beta`);
  await expect(panel.getByTestId('behavior-event-log')).toContainText('匹配：rule_2、rule_3');
  await expect(panel.getByTestId('behavior-preview')).toContainText(`"statusId":"status_running"`);
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!)).toEqual(authority);

  await panel.getByRole('button', { name: '重置预览' }).click();
  await expect(panel.getByTestId('behavior-event-log')).toHaveCount(0);
  await expect(panel.getByTestId('behavior-preview')).toHaveCount(0);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Quality: Twin', exact: true })).toBeVisible();
  await expect(page.getByTestId('behavior-event-log')).toContainText('最近 0/30');
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.export-links a')).toHaveCount(7);
  const specBytes = await page.locator('.export-links a[download$=".implementation.json"]').evaluate(async anchor => new Uint8Array(await (await fetch((anchor as HTMLAnchorElement).href)).arrayBuffer()));
  const spec = JSON.parse(Buffer.from(specBytes).toString());
  expect(spec.version).toBe(IMPLEMENTATION_SPEC_VERSION); expect(spec.designIntent.selectionStatusBindings).toHaveLength(3);
  expect(spec.designIntent.selectionStatusBindings[0].optionMappings[0]).toMatchObject({ optionId: 'radio_alpha', statusId: 'status_running' });
  await page.getByRole('button', { name: '关闭导出结果' }).click();
  await panel.getByRole('button', { name: '重置预览' }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].behaviors).toHaveLength(2);
  await page.getByRole('button', { name: '重做', exact: true }).click(); expect(JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].behaviors).toHaveLength(3);
});
