import { expect, test } from '@playwright/test';
import { createNode, emptyProject } from '../src/domain/model';

test('shared text preview and PNG, user font, fallback and delayed load', async ({ page }) => {
  await page.addInitScript(() => {
    const original = FontFace.prototype.load;
    FontFace.prototype.load = function () { return new Promise(resolve => setTimeout(resolve, 500)).then(() => original.call(this)); };
  });
  await page.goto('/');
  const doc = emptyProject();
  for (const [i, type] of (['minecraft:button', 'minecraft:edit-box', 'minecraft:string-widget'] as const).entries()) {
    const n = createNode(type, `n${i}`, { x: 20, y: 20 + 35 * i });
    if (n.type === 'minecraft:button') n.props.message = { kind: 'literal', value: 'Hello 123! 中文' };
    if (n.type === 'minecraft:edit-box') n.props.value = 'ABC 123 中文';
    if (n.type === 'minecraft:string-widget') { n.props.text = { kind: 'literal', value: '中 English 42.' }; n.props.color = '#FFE5E7EB'; }
    doc.screens[0].nodes.push(n);
  }
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  // Compare at one physical pixel per GUI unit in both browser contexts.
  // Separate font-diagnostics.spec.ts retains the cross-scale visual evidence.
  const dpr = await page.evaluate(() => devicePixelRatio);
  await page.getByLabel('Zoom', { exact: true }).selectOption(String(1 / dpr));
  await page.getByLabel('选择预览字体').setInputFiles('C:/Windows/Fonts/arial.ttf');
  await expect(page.getByTestId('font-status')).toContainText('正在加载');
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.getByTestId('font-status')).toContainText('用户字体');
  await expect(page.locator('.export-links a')).toHaveCount(6);
  const comparison = await page.evaluate(async () => {
    const host = document.querySelector('[data-testid=canvas-host]') as HTMLElement;
    const stage = host.querySelector('canvas')!, dpr = stage.width / stage.getBoundingClientRect().width;
    const bitmap = await createImageBitmap(await (await fetch((document.querySelectorAll('.export-links a')[1] as HTMLAnchorElement).href)).blob());
    const out = document.createElement('canvas'); out.width = bitmap.width; out.height = bitmap.height;
    const x = out.getContext('2d')!; x.fillStyle = '#1c2634'; x.fillRect(0, 0, out.width, out.height); x.drawImage(bitmap, 0, 0); bitmap.close();
    const source = stage.getContext('2d')!;
    const ox = Number(host.dataset.originX), oy = Number(host.dataset.originY);
    // Compare the central region of each component, excluding edges and editing aids.
    let difference = 0, ink = 0;
    for (const y0 of [20, 55, 90]) for (let y = y0 + 4; y < y0 + 16; y++) for (let x0 = 24; x0 < 90; x0++) {
      const a = source.getImageData(Math.floor(ox * dpr + x0), Math.floor(oy * dpr + y), 1, 1).data;
      const b = x.getImageData(x0, y, 1, 1).data;
      if (b[0] > 170 && b[1] > 170 && b[2] > 170) ink++;
      const bright = (p: Uint8ClampedArray) => p[0] > 150 && p[1] > 150 && p[2] > 150 && p[3] > 100;
      if (bright(a) !== bright(b)) difference++;
    }
    return { difference, ink };
  });
  expect(comparison.ink).toBeGreaterThan(10);
  expect(comparison.difference).toBeLessThan(200);
  await page.getByRole('button', { name: '关闭导出结果' }).click();
  await page.getByLabel('选择预览字体').setInputFiles({ name: 'broken.ttf', mimeType: 'font/ttf', buffer: Buffer.from('invalid font') });
  await expect(page.getByTestId('font-status')).toContainText('加载失败');
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.export-links a')).toHaveCount(6);
});
