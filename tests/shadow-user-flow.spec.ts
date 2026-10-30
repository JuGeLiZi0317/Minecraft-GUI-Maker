import { expect, test } from '@playwright/test';
import { emptyProject, createNode } from '../src/domain/model';
import { showScreenControls } from './workspace-helpers';

test('shadow user workflow: five controls, preview, export, history and persistence', async ({ page }) => {
  await page.goto('/');
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  const old = emptyProject(); old.screens[0].nodes.push(createNode('minecraft:string-widget', 'legacy'));
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  expect(await read()).toEqual(old);
  await page.getByRole('button', { name: '选择 legacy' }).click(); await expect(page.getByLabel('文字阴影')).not.toBeChecked();
  await page.getByLabel('文字阴影').check(); expect((await read()).schemaVersion).toBe('0.5.0');
  await showScreenControls(page); await page.keyboard.press('Control+z'); expect(await read()).toEqual(old);
  await page.keyboard.press('Control+Shift+z'); expect((await read()).screens[0].nodes[0].props.textShadow).toBe(true);
  const bad = await read(); bad.schemaVersion = '0.1.0';
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('导入失败'); expect((await read()).schemaVersion).toBe('0.5.0');
  for (const name of ['Button', 'EditBox', 'StringWidget', 'Checkbox', 'CycleButton']) {
    await page.getByRole('button', { name: `添加 ${name}`, exact: true }).click();
    const toggle = page.getByLabel('文字阴影'); await expect(toggle).not.toBeChecked();
    const before = await page.getByTestId('canvas-host').screenshot();
    await toggle.check(); await expect(toggle).toBeChecked();
    const after = await page.getByTestId('canvas-host').screenshot(); expect(after.equals(before)).toBe(false);
    await toggle.uncheck(); await expect(toggle).not.toBeChecked(); await toggle.check();
  }
  const saved = await read(); expect(saved.screens[0].nodes.slice(1).every((n: {props: {textShadow: boolean}}) => n.props.textShadow)).toBe(true);
  expect(saved.screens[0].nodes.find((n: {type: string}) => n.type === 'minecraft:string-widget').props.color).toBe('#FF404040');
  await showScreenControls(page); await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload(); expect(await read()).toEqual(saved);
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(6);
  const files = await page.locator('.export-links a').evaluateAll(async links => Promise.all(links.map(async a => Array.from(new Uint8Array(await (await fetch((a as HTMLAnchorElement).href)).arrayBuffer())))));
  expect(JSON.parse(Buffer.from(files[0]).toString())).toEqual(saved);
  const spec = JSON.parse(Buffer.from(files[2]).toString()); expect(spec.designIntent.nodes.every((n: {textShadow: boolean}) => n.textShadow)).toBe(true);
  expect(Buffer.from(files[3]).toString()).toContain('setTextShadow(boolean)');
  await page.getByRole('button', { name: '关闭导出结果' }).click();
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(files[0]) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功'); expect(await read()).toEqual(saved);
});

test('each text component changes PNG when shadow is switched', async ({ page }) => {
  await page.goto('/');
  for (const [i, type] of (['minecraft:button', 'minecraft:edit-box', 'minecraft:string-widget', 'minecraft:checkbox', 'minecraft:cycle-button'] as const).entries()) {
    const doc = emptyProject(); doc.schemaVersion = type === 'minecraft:checkbox' || type === 'minecraft:cycle-button' ? '0.4.0' : '0.1.0';
    doc.screens[0].nodes = [createNode(type, `node_${i}`)];
    await page.getByLabel('导入项目文件').setInputFiles({ name: 'test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
    await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
    await page.getByRole('button', { name: `选择 node_${i}` }).click();
    const png = async () => {
      await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(6);
      const bytes = await page.locator('.export-links a').nth(1).evaluate(async a => {
        const bitmap = await createImageBitmap(await (await fetch((a as HTMLAnchorElement).href)).blob());
        const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height;
        const ctx = c.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close(); return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
      });
      await page.getByRole('button', { name: '关闭导出结果' }).click(); return bytes;
    };
    const without = await png(); await page.getByLabel('文字阴影').check(); const withShadow = await png();
    expect(withShadow).not.toEqual(without);
  }
});

test('font change cancels an in-flight shadow export', async ({ page }) => {
  await page.addInitScript(() => {
    const load = FontFace.prototype.load;
    FontFace.prototype.load = function () { return new Promise(resolve => setTimeout(resolve, 1500)).then(() => load.call(this)); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await page.getByLabel('文字阴影').check();
  await showScreenControls(page);
  await page.getByLabel('选择预览字体').setInputFiles('C:/Windows/Fonts/arial.ttf');
  await expect(page.getByTestId('font-status')).toContainText('正在加载');
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await page.getByRole('button', { name: '使用系统字体' }).click();
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('字体选择已改变');
  await expect(page.locator('.export-links a')).toHaveCount(0);
});
