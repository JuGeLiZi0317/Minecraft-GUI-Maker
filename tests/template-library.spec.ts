import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { repeatableCardProject } from './fixtures/repeatableCardProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const nodeCount = async (page: Page) => (await read(page)).screens[0].nodes.length;
const openLibrary = async (page: Page) => { await page.getByRole('button', { name: '模板库', exact: true }).click(); await expect(page.getByTestId('templates-panel')).toBeVisible(); };

test('Q5-E1 personal template save, insert, relative layout, IDs, undo, rename, persistence, export/import and delete', async ({ page }) => {
  await page.goto('/');
  await mkdir('outputs/Q5E', { recursive: true });
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q5e.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(repeatableCardProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '选择 material_layers' }).click();
  const source = await read(page); expect(JSON.stringify(source)).not.toContain('templateVersion'); const sourceRoot = source.screens[0].nodes.find((node: any) => node.id === 'material_layers'), sourceChildren = source.screens[0].nodes.filter((node: any) => node.parentContainerId === 'material_layers');

  await openLibrary(page);
  await page.getByLabel('模板名称').fill('卡片列表模板');
  await page.getByLabel('模板说明').fill('跨 Screen 复用的行模板组合');
  await page.getByRole('button', { name: '保存当前选择为模板' }).click();
  const row = page.locator('[data-testid^="template-row-"]').first();
  await expect(row).toContainText('卡片列表模板');
  const templateId = (await row.getAttribute('data-testid'))!.replace('template-row-', '');
  expect(await row).toContainText(`${sourceChildren.length + 1} 节点`);
  await row.locator('.template-name').click();
  await page.screenshot({ path: 'outputs/Q5E/template-library.png' });

  // Invalid target: a template whose root is a Repeatable List cannot be inserted into one.
  await page.getByRole('button', { name: '关闭模板库' }).click();
  await page.getByRole('button', { name: '选择 card_name' }).click();
  await openLibrary(page);
  const before = await nodeCount(page);
  await page.getByRole('button', { name: `插入模板 ${templateId}` }).click();
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('Row Template');
  expect(await nodeCount(page)).toBe(before);
  await page.getByRole('button', { name: '关闭模板库' }).click();

  // Insert into a fresh Screen: new IDs, relative layout, one atomic transaction, undo.
  await page.getByRole('button', { name: '新增画布' }).click();
  await openLibrary(page);
  await page.getByRole('button', { name: `插入模板 ${templateId}` }).click();
  const inserted = await read(page), root = inserted.screens.at(-1).nodes.find((node: any) => node.type === 'minecraft:repeatable-list');
  expect(root).toBeTruthy();
  expect(root.id).not.toBe(sourceRoot.id);
  expect(root.bounds).toMatchObject({ w: sourceRoot.bounds.w, h: sourceRoot.bounds.h });
  const insertedChildren = inserted.screens.at(-1).nodes.filter((node: any) => node.parentContainerId === root.id);
  expect(insertedChildren).toHaveLength(sourceChildren.length);
  expect(insertedChildren.map((node: any) => node.id)).not.toEqual(sourceChildren.map((node: any) => node.id));
  expect(insertedChildren.map((node: any) => node.bounds)).toEqual(sourceChildren.map((node: any) => node.bounds));
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await read(page)).screens.at(-1).nodes).toHaveLength(0);
  await page.getByRole('button', { name: '重做', exact: true }).click();

  await page.getByLabel(`模板名称 ${templateId}`).fill('卡片列表模板 v2');
  await page.getByRole('button', { name: `重命名模板 ${templateId}` }).click();
  await expect(page.locator('[data-testid^="template-row-"]').first()).toContainText('卡片列表模板 v2');

  await page.getByRole('button', { name: '关闭模板库' }).click();
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  await openLibrary(page);
  await expect(page.locator('[data-testid^="template-row-"]').first()).toContainText('卡片列表模板 v2');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: `导出模板 ${templateId}` }).click();
  const download = await downloadPromise, path = await download.path();
  const exported = JSON.parse(await readFile(path!, 'utf8'));
  expect(exported.format).toBe('minecraft-gui-maker-template');
  expect(exported.nodes.length).toBe(sourceChildren.length + 1);
  const rowsBefore = await page.locator('[data-testid^="template-row-"]').count();
  await page.getByLabel('导入模板文件').setInputFiles({ name: 'imported.template.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await expect.poll(async () => page.locator('[data-testid^="template-row-"]').count()).toBe(rowsBefore + 1);

  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: `删除模板 ${templateId}` }).click();
  await expect(page.locator('[data-testid^="template-row-"]')).toHaveCount(1);
});
