import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { emptyProject, createNode, literal } from '../src/domain/model';
import { tooltipProject } from './fixtures/tooltipProject';
import { showScreenControls } from './workspace-helpers';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const point = async (page: Page, x: number, y: number) => {
  const host = page.getByTestId('canvas-host'), rect = (await host.boundingBox())!, zoom = Number(await host.getAttribute('data-zoom'));
  return { x: rect.x + Number(await host.getAttribute('data-origin-x')) + x * zoom, y: rect.y + Number(await host.getAttribute('data-origin-y')) + y * zoom };
};
const hover = async (page: Page, x: number, y: number) => { const p = await point(page, x, y); await page.mouse.move(p.x, p.y); };
const clickAt = async (page: Page, x: number, y: number) => { const p = await point(page, x, y); await page.mouse.click(p.x, p.y); };
const tooltip = (page: Page) => page.getByTestId('runtime-tooltip');
const nodeOf = async (page: Page, id: string) => (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === id);
const captureZip = (page: Page) => page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) {
  if (blob instanceof Blob && blob.type === 'application/zip') (window as unknown as { __zip: Promise<number[]> }).__zip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
  return original.call(this, blob);
}; return true; });
const readZipFiles = async (page: Page) => {
  const zip = Buffer.from(await page.evaluate(() => (window as unknown as { __zip: Promise<number[]> }).__zip));
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    files.set(zip.subarray(offset + 30, offset + 30 + nameLength).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  const authority = JSON.parse([...files].find(([name]) => name.endsWith('.json') && !name.endsWith('.manifest.json') && !name.endsWith('.implementation.json') && !name.endsWith('-diagnostics.json'))![1].toString());
  const manifest = JSON.parse([...files].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  const spec = JSON.parse([...files].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  return { zip, authority, manifest, spec };
};

test('Inspector enables, edits, disables and restores control-level tooltips without rewriting old projects', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加 CycleButton', exact: true }).click();
  await page.getByTestId('tooltip-fields').locator('summary').click();
  await page.getByLabel('启用 Tooltip', { exact: true }).check();
  expect((await read(page)).schemaVersion).toBe('0.49.0');
  expect((await nodeOf(page, 'node_1')).props.tooltip).toEqual({ kind: 'literal', value: 'CycleButton' });

  const literalField = page.getByLabel('Tooltip', { exact: true });
  await literalField.fill('提交提示'); await literalField.press('Enter');
  expect((await nodeOf(page, 'node_1')).props.tooltip.value).toBe('提交提示');
  await page.getByLabel('Tooltip类型', { exact: true }).selectOption('translate');
  await page.getByLabel('Tooltip翻译键', { exact: true }).fill('gui.customdim.submit.tooltip'); await page.getByLabel('Tooltip翻译键', { exact: true }).press('Enter');
  await page.getByLabel('Tooltip预览文字', { exact: true }).fill('提交'); await page.getByLabel('Tooltip预览文字', { exact: true }).press('Enter');
  const saved = await read(page);
  expect((await nodeOf(page, 'node_1')).props.tooltip).toEqual({ kind: 'translate', key: 'gui.customdim.submit.tooltip', fallback: '提交' });
  await expect(page.getByTestId('tooltip-preview')).toContainText('提交');
  await expect(page.getByTestId('tooltip-preview')).toContainText('gui.customdim.submit.tooltip');

  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await nodeOf(page, 'node_1')).props.tooltip.fallback).toBe('提交提示');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect(await read(page)).toEqual(saved);

  await page.getByLabel('启用 Tooltip', { exact: true }).uncheck();
  expect((await nodeOf(page, 'node_1')).props).not.toHaveProperty('tooltip');
  expect((await read(page)).schemaVersion).toBe('0.49.0');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect(await read(page)).toEqual(saved);

  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  await expect.poll(() => read(page)).toEqual(saved);

  // A 0.48.0 project with no tooltip keeps its version when unrelated fields change.
  const legacy = emptyProject(); legacy.schemaVersion = '0.48.0'; legacy.entryScreenId = 'screen_main'; legacy.screenTabGroups = [];
  const legacyButton = createNode('minecraft:button', 'legacy_button'); if (legacyButton.type === 'minecraft:button') legacyButton.props.message = literal('旧按钮');
  legacy.screens[0].nodes.push(legacyButton);
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'tooltip-legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '选择 legacy_button', exact: true }).click();
  const message = page.getByLabel('按钮文字', { exact: true });
  await message.fill('修改后的旧按钮'); await message.press('Enter');
  expect((await read(page)).schemaVersion).toBe('0.48.0');
  expect((await nodeOf(page, 'legacy_button')).props).not.toHaveProperty('tooltip');
});

test('Interaction preview resolves tooltip hit regions, clipping, Dropdown priority, hiding, GUI scale and ZIP contracts', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'tooltip-demo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tooltipProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByTestId('canvas-host')).toHaveAttribute('data-runtime-preview-active', 'true');

  await hover(page, 68, 18);
  await expect(tooltip(page)).toBeVisible(); await expect(tooltip(page)).toHaveAttribute('data-tooltip-node', 'demo_button');
  await expect(tooltip(page)).toContainText('提交按钮');
  await mkdir('outputs/Q4D', { recursive: true });
  await page.screenshot({ path: 'outputs/Q4D/TooltipDemo.png' });

  await hover(page, 68, 46);
  await expect(tooltip(page)).toHaveAttribute('data-tooltip-node', 'demo_cycle');
  await expect(tooltip(page)).toContainText('设置维度的昼夜行为');
  await expect(tooltip(page)).toContainText('gui.customdim.time.tooltip');
  // A normal click still cycles the control while the tooltip is visible.
  const before = (await page.getByTestId('canvas-host').screenshot()).toString('base64');
  await clickAt(page, 68, 46);
  await expect.poll(async () => (await page.getByTestId('canvas-host').screenshot()).toString('base64')).not.toBe(before);
  await expect(tooltip(page)).toBeVisible();

  // Dropdown overlay owns the pointer; the trigger tooltip is suppressed while open.
  await hover(page, 68, 74);
  await expect(tooltip(page)).toHaveAttribute('data-tooltip-node', 'demo_dropdown');
  await clickAt(page, 68, 74);
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(tooltip(page)).toBeHidden();
  await page.getByRole('option', { name: '夜晚 (2/2)', exact: true }).click();
  await expect(page.getByTestId('selection-preview-events')).toHaveAttribute('data-events', /"optionId":"night"/);
  await hover(page, 68, 74);
  await expect(tooltip(page)).toHaveAttribute('data-tooltip-node', 'demo_dropdown');

  // The clipped child only appears after scrolling; the panel itself remains a separate hit target.
  await hover(page, 222, 134);
  await expect(tooltip(page)).toHaveAttribute('data-tooltip-node', 'demo_scroll');
  await page.mouse.move((await point(page, 220, 70)).x, (await point(page, 220, 70)).y);
  await page.mouse.wheel(0, 100);
  await hover(page, 222, 120);
  await expect(tooltip(page)).toHaveAttribute('data-tooltip-node', 'demo_scroll_clipped');
  await expect(tooltip(page)).toContainText('滚动后可见');

  // Hidden and non-active Page controls never produce a tooltip.
  await hover(page, 68, 130);
  await expect(tooltip(page)).toBeHidden();
  await hover(page, 250, 150);
  await expect(tooltip(page)).toBeHidden();

  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  // GUI Scale preview keeps the same tooltip contract but recomputes positions.
  await showScreenControls(page);
  await page.locator('.screen-settings > summary').click();
  await page.getByRole('button', { name: '预览游戏缩放', exact: true }).click();
  await expect(page.getByTestId('canvas-host')).toHaveAttribute('data-preview', 'true');
  await page.getByRole('button', { name: '关闭设计区与游戏 GUI Scale 设置' }).click();
  await hover(page, 68, 18);
  await expect(tooltip(page)).toHaveAttribute('data-tooltip-node', 'demo_button');
  const first = (await tooltip(page).boundingBox())!;
  await page.locator('.screen-settings > summary').click();
  await page.getByLabel('游戏 GUI Scale', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: '关闭设计区与游戏 GUI Scale 设置' }).click();
  await hover(page, 68, 18);
  await expect(tooltip(page)).toBeVisible();
  const second = (await tooltip(page).boundingBox())!;
  expect([first.x, first.y, first.width, first.height]).not.toEqual([second.x, second.y, second.width, second.height]);
  await page.locator('.screen-settings > summary').click();
  await page.getByRole('button', { name: '返回设计模式', exact: true }).click();

  await captureZip(page);
  await writeFile('outputs/Q4D/TooltipDemo.project.json', JSON.stringify(await read(page), null, 2));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  await download;
  const { zip, authority, manifest, spec } = await readZipFiles(page);
  const exported = authority.screens[0].nodes.filter((node: { props: { tooltip?: unknown } }) => node.props.tooltip);
  expect(exported.map((node: { id: string }) => node.id)).toEqual(['demo_button', 'demo_cycle', 'demo_dropdown', 'demo_scroll', 'demo_scroll_button', 'demo_scroll_clipped', 'demo_hidden', 'demo_page_button']);
  expect(manifest.tooltipContract.version).toBe('1.1.0');
  expect(manifest.screens[0].tooltips.find((item: { nodeId: string }) => item.nodeId === 'demo_dropdown')).toMatchObject({ access: 'custom-trigger', hitRegion: 'trigger-bounds' });
  expect(spec.tooltipContract.itemStack).toContain('never overrides');
  expect(spec.implementationRequirements.join(' ')).toContain('native AbstractWidget tooltip');
  await writeFile('outputs/Q4D/TooltipDemo.zip', zip);
});
