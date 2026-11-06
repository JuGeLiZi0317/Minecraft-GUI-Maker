import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const diagnosticsDir = process.env.BEHAVIOR_DIAGNOSTICS_CAPTURE_DIR ?? 'outputs/B1.6';
import { genericBehaviorProject } from './fixtures/genericBehaviorProject';
import { createNode, literal } from '../src/domain/model';
import { GUI_SPRITES, SLIDER_SPRITES } from '../src/resources/layered';
import { meta, zipFixture } from './resource-fixtures';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const project = () => {
  const doc = genericBehaviorProject(), screen = doc.screens[0], rule = screen.behaviors[1];
  if ('actions' in rule && rule.actions[0].type === 'if') { rule.actions[0].elseActions = []; rule.actions[0].thenActions.push({ type: 'set-status', targetId: 'node_26', mapRef: 'status_map_shared' }); }
  screen.behaviorMaps = [{ id: 'status_map_shared', name: '共享映射', mappings: [{ optionId: 'option_1', statusId: 'status_running' }] }];
  screen.behaviors.push({ id: 'rule_both', event: { type: 'button-click', sourceId: 'legacy_button' }, action: { type: 'set-visible', targetId: 'legacy_button', visible: false } });
  const other = structuredClone(screen), radio = createNode('minecraft:radio-group', 'radio_other'); other.id = 'screen_other'; other.behaviors = []; other.behaviorMaps = []; other.screenTargets = []; if (radio.type === 'minecraft:radio-group') radio.props.name = literal('主选择'); other.nodes = [radio]; doc.screens.push(other); return doc;
};
async function load(page: Page, doc: unknown) { await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({ name: 'B1.6.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }); await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功'); }
function unpack(bytes: Buffer) { const files = new Map<string, Buffer>(); let at = 0; while (bytes.readUInt32LE(at) === 0x04034b50) { const len = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28), size = bytes.readUInt32LE(at + 18), start = at + 30 + len + extra; files.set(bytes.subarray(at + 30, at + 30 + len).toString(), bytes.subarray(start, start + size)); at = start + size; } return files; }

test('B1.6 tree binding labels, related rule navigation and unsaved Blockly protection', async ({ page }, info) => {
  const doc = project(); await load(page, doc);
  await expect(page.getByRole('button', { name: '选择 node_22', exact: true })).toHaveAccessibleDescription('事件来源');
  await expect(page.getByTestId('binding-node_22')).toHaveText('事件来源'); await expect(page.getByTestId('binding-node_23')).toHaveText('事件未绑定');
  await expect(page.getByTestId('binding-node_26')).toHaveText('动作目标'); await expect(page.getByTestId('binding-legacy_button')).toHaveText('来源＋目标');
  await page.getByLabel('当前画布', { exact: true }).selectOption('screen_other'); await expect(page.getByTestId('binding-radio_other')).toHaveText('事件未绑定');
  await page.getByLabel('当前画布', { exact: true }).selectOption('screen_main'); await page.getByRole('button', { name: '选择 legacy_label', exact: true }).click(); await page.getByRole('button', { name: '查看关联行为', exact: true }).click();
  const panel = page.getByTestId('behavior-panel'), related = panel.getByTestId('behavior-related');
  await related.getByRole('button', { name: '定位 F2 规则 rule_legacy（Blockly 暂不支持）', exact: true }).click(); await expect(panel.locator('[data-behavior-rule-id=rule_legacy]')).toBeFocused();
  await page.getByRole('button', { name: '选择 node_22', exact: true }).click();
  await expect(related).toContainText('rule_generic_option · 事件来源'); await expect(related).toContainText('actions[0].thenActions[1]'); await expect(related).toContainText('status_map_shared'); await expect(related).toContainText('node_26');
  await page.screenshot({ path: `${diagnosticsDir}/tree-${info.project.name}.png` });
  await related.getByRole('button', { name: '在 Blockly 定位 rule_generic_option', exact: true }).click();
  const editor = page.getByTestId('blockly-editor'); await expect(page.getByTestId('blockly-context-tools').getByLabel('Blockly 规则')).toHaveValue('rule_generic_option');
  const constant = editor.locator('.blocklySvg .blocklyBlockCanvas [data-block-type="gui_compare"] [data-block-type="gui_constant"]');
  await constant.locator(':scope > .blocklyDropdownField').nth(1).click(); await page.getByRole('option', { name: '其他', exact: true }).click(); await expect(editor.getByTestId('blockly-diagnostic')).toContainText('未保存草稿');
  await page.getByRole('button', { name: 'GUI 设计模式' }).click(); await page.getByRole('button', { name: '选择 slider_source', exact: true }).click();
  await expect(panel.getByTestId('behavior-related')).toContainText('rule_generic_number'); await panel.getByTestId('behavior-related').getByRole('button', { name: '在 Blockly 定位 rule_generic_number' }).click();
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('未保存草稿'); expect(await read(page)).toEqual(doc);
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click(); await expect(page.getByTestId('blockly-context-tools').getByLabel('Blockly 规则')).toHaveValue('rule_generic_option'); await expect(editor.getByTestId('blockly-semantic-preview')).toContainText('option_2');
  await editor.getByRole('button', { name: '放弃草稿并重新载入', exact: true }).click(); expect(await read(page)).toEqual(doc);
});

test('B1.6 preview labels expected skip, success and unmatched events distinctly', async ({ page }) => {
  const doc = project(); await load(page, doc); await page.getByRole('button', { name: '行为', exact: true }).click(); await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const log = page.getByTestId('behavior-event-log'), preview = page.getByTestId('behavior-preview');
  await page.getByRole('radio', { name: '启动 (1/4)', exact: true }).click(); await expect(preview).toContainText('status_running'); await expect(log.locator('[data-diagnostic-kind="action-success"]').first()).toBeVisible();
  await page.getByRole('radio', { name: '其他 (2/4)', exact: true }).click(); const skip = log.locator('[data-diagnostic-kind="expected-skip"]').filter({ hasText: 'else 为空' }); await expect(skip).toHaveAttribute('data-severity', 'info'); await expect(preview).toContainText('status_running');
  const trigger = page.getByRole('button', { name: '备用选择: 其他', exact: true }); await trigger.focus(); await trigger.press('Enter'); const list = page.getByRole('listbox', { name: '备用选择', exact: true }); await list.press('Home'); await list.press('Enter');
  await expect(log.locator('[data-diagnostic-kind="no-matching-rule"]')).toBeVisible(); expect(await read(page)).toEqual(doc);
});

test('B1.6 actual ZIP keeps nonempty layered resources, diagnostics, manifest hashes and authority in one snapshot', async ({ page }) => {
  await page.addInitScript(() => { const original = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download.endsWith('.zip')) (window as any).b16Zip = fetch(this.href).then(response => response.arrayBuffer()).then(bytes => Array.from(new Uint8Array(bytes))); return original.call(this); }; });
  const doc = project(); doc.screens[0].background = { kind: 'panel', style: 'supplied-panel-16' }; await load(page, doc);
  const image = Buffer.from(await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#cc3366'; ctx.fillRect(0, 0, 8, 8); return canvas.toDataURL('image/png').split(',')[1]; }), 'base64');
  const spritePath = (id: string) => `assets/minecraft/textures/gui/sprites/${id.slice('minecraft:'.length)}.png`;
  const atlas = JSON.stringify({ sources: [{ type: 'directory', source: 'gui/sprites', prefix: '' }] });
  const spriteIds = [...new Set([...GUI_SPRITES, ...SLIDER_SPRITES])];
  const jar = zipFixture([{ name: 'version.json', data: JSON.stringify({ id: '1.21.1', pack_version: { resource: 34 } }) }, { name: 'assets/minecraft/atlases/gui.json', data: atlas }, ...spriteIds.map(id => ({ name: spritePath(id), data: image }))]);
  const overlay = zipFixture([{ name: 'pack.mcmeta', data: meta }, ...spriteIds.map(id => ({ name: spritePath(id), data: image }))]);
  await page.getByText('视图', { exact: true }).click(); await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover(); await page.getByRole('button', { name: '选择已有资源包' }).click();
  const resources = page.getByRole('region', { name: '资源包检查' }); await resources.getByLabel('选择客户端 JAR').setInputFiles({ name: 'synthetic-client.jar', mimeType: 'application/java-archive', buffer: jar }); await expect(resources).toContainText('客户端资源已检查');
  await resources.getByLabel('选择资源包 ZIP').setInputFiles({ name: 'synthetic-overlay.zip', mimeType: 'application/zip', buffer: overlay }); await expect(resources).toContainText('资源包已检查'); await resources.getByRole('button', { name: '关闭资源包检查' }).click();
  const before = await read(page), download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click(); await download;
  const bytes = Buffer.from(await page.evaluate(() => (window as any).b16Zip)); await mkdir(diagnosticsDir, { recursive: true }); await writeFile(`${diagnosticsDir}/resource-export.zip`, bytes); const files = unpack(bytes);
  const manifest = JSON.parse(files.get([...files.keys()].find(name => name.endsWith('.manifest.json'))!)!.toString()); const spec = JSON.parse(files.get([...files.keys()].find(name => name.endsWith('.implementation.json'))!)!.toString());
  expect(JSON.parse(files.get(manifest.authority.file)!.toString())).toEqual(before); const diagnostic = JSON.parse(files.get(manifest.behaviorDiagnostics.name)!.toString());
  expect(diagnostic.reference.documentSha256).toBe(manifest.authority.sha256); expect(diagnostic.screens.map((screen: any) => screen.screenId)).toEqual(['screen_main', 'screen_other']); expect(spec.behaviorDiagnostics).toMatchObject({ file: manifest.behaviorDiagnostics.name, bytes: manifest.behaviorDiagnostics.bytes, sha256: manifest.behaviorDiagnostics.sha256 });
  for (const entry of manifest.files) { const content = files.get(entry.name)!; expect(content.length).toBe(entry.bytes); expect(createHash('sha256').update(content).digest('hex')).toBe(entry.sha256); }
  const panel = manifest.screens[0].panelTexture; expect(files.get(panel.file)!.length).toBeGreaterThan(0); expect(createHash('sha256').update(files.get(panel.file)!).digest('hex')).toBe(panel.sha256);
  const sprites = Object.values(manifest.visualResources.sprites) as any[]; expect(sprites.some(sprite => sprite.status === 'valid' && sprite.imageLayer.endsWith('synthetic-overlay.zip') && sprite.sha256 === createHash('sha256').update(image).digest('hex'))).toBe(true);
  expect([...files.keys()].some(name => name.endsWith('.jar'))).toBe(false); expect(await read(page)).toEqual(before);
});
