import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { emptyProject } from '../src/domain/model';

for (const resolution of [16, 32] as const) {
  test(`supplied ${resolution}× panel is tiled using mcmeta and exported on a transparent square`, async ({ page }) => {
    await page.goto('/'); await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
    if (resolution === 32) {
      const legacy = emptyProject(); legacy.schemaVersion = '0.3.0'; legacy.screens[0].background = { kind: 'panel', style: 'supplied-panel-32' };
      await page.getByLabel('导入项目文件').setInputFiles({ name: 'legacy32.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
      await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
      await page.locator('.screen-settings summary').click(); await expect(page.getByLabel('设计区底板')).toHaveValue('supplied-panel-32');
      await expect(page.locator('option[value="supplied-panel-32"]')).toHaveAttribute('disabled', '');
    } else { await page.locator('.screen-settings summary').click(); await page.getByLabel('设计区底板').selectOption('supplied-panel-16'); }
    await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(7);
    const files = await page.locator('.export-links a').evaluateAll(async links => Promise.all(links.map(async el => ({ name: (el as HTMLAnchorElement).download, bytes: Array.from(new Uint8Array(await (await fetch((el as HTMLAnchorElement).href)).arrayBuffer())) }))));
    const json = (index: number) => JSON.parse(Buffer.from(files[index].bytes).toString());
    const doc = json(0), spec = json(2), manifest = json(6), png = Buffer.from(files[5].bytes);
    expect(doc.schemaVersion).toBe('0.3.0'); expect(doc.screens[0].background).toEqual({ kind: 'panel', style: `supplied-panel-${resolution}` });
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([512, 512]);
    expect(manifest.panelTexture).toMatchObject({ width: 512, height: 512, contentWidth: 320, contentHeight: 180, origin: [0, 0], padding: 'transparent', source: 'user-supplied-minecraft-dispenser-derived' });
    expect(spec.designIntent.panelTexture).toMatchObject({ width: 512, height: 512, contentWidth: 320, contentHeight: 180, style: `supplied-panel-${resolution}` });
    expect(spec.designIntent.panelTexture.provenance).toMatchObject({ baseResource: 'minecraft:textures/gui/container/dispenser.png', baseMinecraft: '1.21.1', baseImageSha256: '901d26f1aac7e7a9724ab2f7f4bf00ae4a8e3907c4274565020aa3093925feaa' });
    expect(spec.designIntent.panelTexture.provenance.imageSha256).toBe(createHash('sha256').update(await readFile(`src/gui/panel_${resolution}x.png`)).digest('hex'));
    expect(manifest.files[5].sha256).toBe(createHash('sha256').update(png).digest('hex'));
    expect(Buffer.from(files[3].bytes).toString()).toContain('实际textureWidth/textureHeight');
    const sourceBytes = Array.from(await readFile(`src/gui/panel_${resolution}x.png`));
    const samples = await page.locator('.export-links a').nth(5).evaluate(async (link, args) => {
      const image = await createImageBitmap(await (await fetch((link as HTMLAnchorElement).href)).blob());
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); image.close();
      const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
      const src = await createImageBitmap(new Blob([Uint8Array.from(args.bytes)], { type: 'image/png' }));
      const tile = document.createElement('canvas'); tile.width = 16; tile.height = 16;
      const tc = tile.getContext('2d')!; tc.imageSmoothingEnabled = false; tc.drawImage(src, 0, 0, 16, 16); src.close();
      const positions = [[0, 0], [3, 3], [4, 4], [10, 10], [12, 4], [20, 4], [319, 179], [318, 4], [4, 179], [123, 71]];
      const tileCoord = (v: number, limit: number) => v < 4 ? v : v >= limit - 4 ? 16 - (limit - v) : 4 + (v - 4) % 8;
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let nontransparentPadding = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if ((x >= 320 || y >= 180) && rgba[(y * canvas.width + x) * 4 + 3] !== 0) nontransparentPadding++;
      return { nontransparentPadding, padding: [pixel(320, 20), pixel(20, 180), pixel(511, 511)], pairs: positions.map(([x, y]) => ({ x, y, actual: pixel(x, y), expected: Array.from(tc.getImageData(tileCoord(x, 320), tileCoord(y, 180), 1, 1).data) })) };
    }, { bytes: sourceBytes });
    expect(samples.padding).toEqual([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    expect(samples.nontransparentPadding).toBe(0);
    for (const pair of samples.pairs) expect(pair.actual, `${pair.x},${pair.y}`).toEqual(pair.expected);
    const center = samples.pairs.find(pair => pair.x === 10 && pair.y === 10)!.actual;
    await expect.poll(() => page.getByTestId('canvas-host').evaluate(host => {
      const canvas = host.querySelector('canvas')!, rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / rect.width, zoom = Number(host.getAttribute('data-zoom'));
      const x = Math.floor((Number(host.getAttribute('data-origin-x')) + 10.5 * zoom) * dpr);
      const y = Math.floor((Number(host.getAttribute('data-origin-y')) + 10.5 * zoom) * dpr);
      return Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data);
    })).toEqual(center);
    await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload();
    await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
    expect(JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].background.style).toBe(`supplied-panel-${resolution}`);
  });
}

test('background sheets use 768 and 1024 buckets and reject oversized designs without losing JSON', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  await page.locator('.screen-settings summary').click(); await page.getByLabel('设计区底板').selectOption('supplied-panel-16');
  for (const [width, expected] of [[513, 768], [769, 1024]]) {
    await page.getByLabel('设计区宽', { exact: true }).fill(String(width));
    await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(7);
    const result = await page.locator('.export-links a').nth(5).evaluate(async (el, contentWidth) => {
      const bitmap = await createImageBitmap(await (await fetch((el as HTMLAnchorElement).href)).blob());
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let nontransparentPadding = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if ((x >= contentWidth || y >= 180) && rgba[(y * canvas.width + x) * 4 + 3] !== 0) nontransparentPadding++;
      return { width: canvas.width, height: canvas.height, nontransparentPadding };
    }, width);
    expect(result).toEqual({ width: expected, height: expected, nontransparentPadding: 0 }); await page.getByRole('button', { name: '关闭导出结果' }).click(); await page.locator('.screen-settings summary').click();
  }
  await page.getByLabel('设计区宽', { exact: true }).fill('1025');
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('超过 1024');
  await expect(page.locator('.export-links a')).toHaveCount(0);
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].designSize.width).toBe(1025);
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON' }).click(); await event;
});

test('modified supplied texture is rejected without publishing any files or changing the design', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (input, init) => {
      const url = String(input);
      return url.includes('/src/gui/panel_16x.png') || url.startsWith('data:image/png')
        ? Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png' } }))
        : original(input, init);
    };
  });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  await page.locator('.screen-settings summary').click(); await page.getByLabel('设计区底板').selectOption('supplied-panel-16');
  const before = await page.getByTestId('project-json').textContent(), history = await page.getByTestId('history-count').textContent();
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('摘要不符'); await expect(page.locator('.export-links a')).toHaveCount(0);
  expect(await page.getByTestId('project-json').textContent()).toBe(before); expect(await page.getByTestId('history-count').textContent()).toBe(history);
});
