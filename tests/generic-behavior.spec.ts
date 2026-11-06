import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { genericBehaviorProject } from './fixtures/genericBehaviorProject';
const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const load = async (page: Page, doc: unknown) => { await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({ name: 'B1.5.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }); await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功'); };
const editNumber = async (page: Page, block: Locator, value: string) => { await block.locator(':scope > .blocklyField').last().dblclick(); const input = page.locator('input.blocklyHtmlInput'); await input.fill(value); await input.press('Enter'); };

for (const kind of ['OptionId', 'Number'] as const) test(`B1.5 ${kind} uses generic typed blocks, real field editing and shared preview execution`, async ({ page }, info) => {
  await page.addInitScript(() => { const original = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download.endsWith('.zip')) (window as any).b15Zip = fetch(this.href).then(response => response.arrayBuffer()).then(bytes => Array.from(new Uint8Array(bytes))); return original.call(this); }; });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const doc = genericBehaviorProject();
  if (kind === 'OptionId') { const rule = doc.screens[0].behaviors[1]; if ('actions' in rule && rule.actions[0].type === 'if') { const leaf = rule.actions[0].thenActions[0]; if (leaf.type === 'set-status' && 'statusId' in leaf) leaf.statusId = 'status_stopped'; } }
  await load(page, doc); await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  const editor = page.getByTestId('blockly-editor'); await page.getByTestId('blockly-context-tools').getByLabel('Blockly 规则').selectOption(kind === 'Number' ? 'rule_generic_number' : 'rule_generic_option');
  const main = editor.locator('.blocklySvg .blocklyBlockCanvas');
  for (const type of ['gui_on_event', 'gui_compare', 'gui_if', 'gui_action', 'gui_event_value', 'gui_constant']) await expect(main.locator(`[data-block-type="${type}"]`).first()).toBeVisible();
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('连接与引用有效'); expect(await read(page)).toEqual(doc);
  const comparison = main.locator('[data-block-type="gui_compare"]'), threshold = comparison.locator('[data-block-type="gui_constant"]');
  if (kind === 'Number') await editNumber(page, threshold, '4');
  else {
    const actions = main.locator('[data-block-type="gui_action"]'); const ordered = await actions.evaluateAll(blocks => blocks.map(block => ({ id: block.getAttribute('data-block-id')!, y: block.getBoundingClientRect().y })).sort((a, b) => a.y - b.y));
    const thenAction = main.locator(`[data-block-id=${JSON.stringify(ordered[0].id)}]`), status = thenAction.locator('[data-block-type="gui_constant"]');
    await status.locator(':scope > .blocklyDropdownField').nth(1).click(); await page.getByRole('option', { name: '运行', exact: true }).click();
  }
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('未保存草稿');
  await page.getByRole('button', { name: 'GUI 设计模式' }).click(); expect(await read(page)).toEqual(doc); await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await editor.getByRole('button', { name: '保存积木规则', exact: true }).click(); const saved = await read(page);
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('与项目一致');
  const savedRule = saved.screens[0].behaviors[kind === 'Number' ? 2 : 1]; expect(savedRule.actions[0].condition).toMatchObject({ type: 'compare', valueType: kind });
  if (kind === 'Number') expect(savedRule.actions[0].condition.right.value).toBe(4); else expect(savedRule.actions[0].thenActions[0].statusId).toBe('status_running');
  await page.screenshot({ path: `outputs/B1.5/${kind}-${info.project.name}.png` });
  await page.getByRole('button', { name: 'GUI 设计模式' }).click(); await page.getByRole('button', { name: '行为', exact: true }).click(); await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const panel = page.getByTestId('behavior-panel'), preview = panel.getByTestId('behavior-preview'), log = panel.getByTestId('behavior-event-log');
  await expect(log).toContainText('最近 0/30');
  if (kind === 'OptionId') {
    await page.getByRole('radio', { name: '启动 (1/4)', exact: true }).click(); await expect(preview).toContainText('status_running'); await expect(log).toContainText('compare OptionId option_1 equals option_1 → true'); await expect(log).not.toContainText('/ status_warning 已执行');
    await page.getByRole('radio', { name: '其他 (2/4)', exact: true }).click(); await expect(preview).toContainText('status_warning'); await expect(log).toContainText('进入 else');
  } else {
    const slider = page.getByRole('slider', { name: '滑块 slider_source', exact: true }); await slider.focus(); await slider.press('ArrowRight'); await slider.press('ArrowRight'); await slider.press('ArrowRight');
    await expect(preview).toContainText('"progress_target":{"progressValue":3'); await expect(log).toContainText('compare Number 3 greater-than 4 → false');
    await slider.press('ArrowRight'); await slider.press('ArrowRight'); await slider.press('ArrowRight'); await expect(preview).toContainText('"progress_target":{"progressValue":60'); await expect(log).toContainText('compare Number 6 greater-than 4 → true'); await expect(log).toContainText('已更新为 60（normalize）');
  }
  expect(await read(page)).toEqual(saved); await panel.getByRole('button', { name: '重置预览', exact: true }).click(); await expect(preview).toHaveCount(0);
  if (kind === 'Number') {
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
    const bytes = Buffer.from(await page.evaluate(() => (window as any).b15Zip)); await writeFile(`outputs/B1.5/generic-${info.project.name}.zip`, bytes);
    const files = new Map<string, Buffer>(); let at = 0; while (bytes.readUInt32LE(at) === 0x04034b50) { const len = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28), size = bytes.readUInt32LE(at + 18), start = at + 30 + len + extra; files.set(bytes.subarray(at + 30, at + 30 + len).toString(), bytes.subarray(start, start + size)); at = start + size; }
    const manifest = JSON.parse(files.get([...files.keys()].find(name => name.endsWith('.manifest.json'))!)!.toString());
    expect(JSON.parse(files.get(manifest.authority.file)!.toString())).toEqual(saved);
    const spec = JSON.parse(files.get([...files.keys()].find(name => name.endsWith('.implementation.json'))!)!.toString());
    expect(spec.designIntent.conditionalBehaviors.map((item: any) => item.condition.valueType)).toEqual(['OptionId', 'Number']);
    expect(spec.designIntent.genericBehaviorContract.operators.Number).toContain('greater-than');
  }
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click(); await expect(main.locator('[data-block-type="gui_compare"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'GUI 设计模式' }).click(); await load(page, saved); expect(await read(page)).toEqual(saved); expect(errors).toEqual([]);
});

test('B1.5 generic template preserves incomplete typed drafts and upgrades only when explicitly saved', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const doc = genericBehaviorProject(false); await load(page, doc); await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  const editor = page.getByTestId('blockly-editor'); await editor.locator('.blockly-create-tools > summary').click(); await editor.getByLabel('通用规则事件').selectOption('slider-change'); await editor.getByRole('button', { name: '新建通用规则', exact: true }).click();
  const main = editor.locator('.blocklySvg .blocklyBlockCanvas'), threshold = main.locator('[data-block-type="gui_compare"] [data-block-type="gui_constant"]');
  expect(await read(page)).toEqual(doc); await threshold.locator(':scope > .blocklyField').last().click(); await page.keyboard.press('Escape');
  await threshold.click({ position: { x: 8, y: 8 } }); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  await expect(editor.getByTestId('blockly-diagnostic')).toContainText('游离积木'); await expect(editor.getByRole('button', { name: '保存积木规则', exact: true })).toBeDisabled(); expect(await read(page)).toEqual(doc);
  await editor.getByRole('button', { name: '撤销积木', exact: true }).click(); await expect(editor.getByTestId('blockly-diagnostic')).toContainText('连接与引用有效');
  await editNumber(page, threshold, '5'); await editor.getByRole('button', { name: '保存积木规则', exact: true }).click(); expect((await read(page)).schemaVersion).toBe('0.35.0'); expect(errors).toEqual([]);
});
