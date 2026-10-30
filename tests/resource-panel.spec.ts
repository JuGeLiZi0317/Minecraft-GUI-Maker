import { expect, test } from '@playwright/test';
import { showScreenControls } from './workspace-helpers';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { meta, packFiles, zipFixture } from './resource-fixtures';
import { GUI_SPRITES } from '../src/resources/layered';

test('resource panel loads ZIP and folder, queries, and keeps the current session on failure', async ({ page }, info) => {
  await page.goto('/');
  const project = await page.getByTestId('project-json').textContent();
  const history = await page.getByTestId('history-count').textContent();
  await page.getByText('视图', { exact: true }).click(); await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover(); await page.getByRole('button', { name: '选择已有资源包' }).click();
  const panel = page.getByRole('region', { name: '资源包检查' });
  await panel.getByLabel('选择资源包 ZIP').setInputFiles({ name: 'synthetic.zip', mimeType: 'application/zip', buffer: zipFixture(packFiles()) });
  await expect(panel).toContainText('资源包已检查并载入本次会话');
  await panel.getByLabel('资源路径').fill('assets/example/test.txt'); await panel.getByRole('button', { name: '查询资源' }).click();
  await expect(panel.getByTestId('resource-query-result')).toContainText('来源 覆盖：synthetic.zip');
  await panel.getByLabel('选择资源包 ZIP').setInputFiles({ name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from('bad') });
  await expect(panel.getByRole('alert')).toContainText('原有会话保留');
  await panel.getByRole('button', { name: '查询资源' }).click(); await expect(panel.getByTestId('resource-query-result')).toContainText('synthetic.zip');
  const root = info.outputPath('pack'); await mkdir(join(root, 'assets', 'example'), { recursive: true });
  await writeFile(join(root, 'pack.mcmeta'), meta); await writeFile(join(root, 'assets', 'example', 'folder.txt'), 'folder');
  await panel.getByLabel('选择资源包文件夹').setInputFiles(root);
  await expect(panel).toContainText('当前资源层：pack');
  await panel.getByLabel('资源路径').fill('assets/example/folder.txt'); await panel.getByRole('button', { name: '查询资源' }).click();
  await expect(panel.getByTestId('resource-query-result')).toContainText('6 字节');
  await panel.getByLabel('已载入的资源包').selectOption('0'); await expect(panel).toContainText('当前资源层：synthetic.zip');
  await panel.getByLabel('资源路径').fill('assets/example/test.txt'); await panel.getByRole('button', { name: '查询资源' }).click(); await expect(panel.getByTestId('resource-query-result')).toContainText('synthetic.zip');
  await panel.getByLabel('已载入的资源包').selectOption('1');
  expect(await page.getByTestId('project-json').textContent()).toBe(project); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await expect(panel).toBeHidden(); await showScreenControls(page); await page.getByText('视图', { exact: true }).click(); await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover(); await page.getByRole('button', { name: '选择已有资源包' }).click(); await expect(panel).toContainText('当前资源层：pack');
  await panel.getByRole('button', { name: '清除会话' }).click(); await expect(panel).toContainText('当前资源层：无');
  expect(project).toBeTruthy(); expect(history).toBe('0 undo / 0 redo');
  const doc = JSON.parse((await page.getByTestId('project-json').textContent())!); expect(doc.screens[0].nodes).toHaveLength(1);
  expect(await page.getByTestId('history-count').textContent()).toBe('1 undo / 0 redo');
});

test('client JAR and override metadata resolve from distinct layers in the panel', async ({ page }) => {
  const png = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.writeUInt32BE(13, 8); png.write('IHDR', 12); png.writeUInt32BE(200, 16); png.writeUInt32BE(20, 20);
  const path = (id: string) => `assets/minecraft/textures/gui/sprites/${id.slice('minecraft:'.length)}.png`;
  const jar = zipFixture([{ name: 'version.json', data: JSON.stringify({ id: '1.21.1', pack_version: { resource: 34 } }), descriptor: true },
    { name: 'assets/minecraft/atlases/gui.json', data: JSON.stringify({ sources: [{ type: 'directory', source: 'gui/sprites', prefix: '' }] }), descriptor: true },
    ...GUI_SPRITES.map(id => ({ name: path(id), data: png, descriptor: true }))]);
  const metadata = JSON.stringify({ gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: 3 } } });
  const upper = zipFixture([{ name: 'pack.mcmeta', data: meta }, { name: path(GUI_SPRITES[0]) + '.mcmeta', data: metadata }]);
  await page.goto('/'); const before = await page.getByTestId('project-json').textContent();
  await page.getByText('视图', { exact: true }).click(); await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover(); await page.getByRole('button', { name: '选择已有资源包' }).click(); const panel = page.getByRole('region', { name: '资源包检查' });
  await panel.getByLabel('选择客户端 JAR').setInputFiles({ name: 'client.jar', mimeType: 'application/java-archive', buffer: jar });
  await expect(panel).toContainText('客户端自报版本符合'); await panel.getByLabel('选择资源包 ZIP').setInputFiles({ name: 'overlay.zip', mimeType: 'application/zip', buffer: upper });
  await expect(panel).toContainText('当前资源层：overlay.zip'); await panel.getByRole('button', { name: '查询 Sprite' }).click();
  await expect(panel.getByTestId('sprite-result')).toContainText('图片 基础：client.jar'); await expect(panel.getByTestId('sprite-result')).toContainText('元数据 覆盖：overlay.zip');
  await expect(panel.getByTestId('sprite-result')).toContainText('"left":3'); expect(await page.getByTestId('project-json').textContent()).toBe(before);
});
