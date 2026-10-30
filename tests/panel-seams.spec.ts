import { test, expect } from '@playwright/test';

test('panel boundaries match a single logical raster under transformed drawing', async ({ page }, info) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const mod = await (new Function('return import("/src/render/panelTexture.ts")')() as Promise<typeof import('../src/render/panelTexture')>);
    const image = await mod.getPanelImage('supplied-panel-16');
    const cases = [] as Array<{ size: number[]; zoom: number; pan: number; mismatch: number; dark: number; first: number[] | null }>;
    for (const [w, h] of [[37, 29], [320, 180]]) for (const zoom of [0.5, 1, 2, 1.37]) for (const pan of [0, 0.37]) {
      const dpr = devicePixelRatio, width = Math.ceil((w * zoom + 30) * dpr), height = Math.ceil((h * zoom + 30) * dpr);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#1c2634'; ctx.fillRect(0, 0, width, height);
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, (10 + pan) * dpr, (10 + pan) * dpr);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(mod.panelPreviewRaster(image, w, h)!, 0, 0);
      const actual = ctx.getImageData(0, 0, width, height).data;
      const logical = document.createElement('canvas'); logical.width = w; logical.height = h;
      mod.drawNativePanel(logical.getContext('2d')!, image, w, h);
      const expectedCanvas = document.createElement('canvas'); expectedCanvas.width = width; expectedCanvas.height = height;
      const ec = expectedCanvas.getContext('2d')!; ec.fillStyle = '#1c2634'; ec.fillRect(0, 0, width, height);
      ec.setTransform(dpr * zoom, 0, 0, dpr * zoom, (10 + pan) * dpr, (10 + pan) * dpr); ec.imageSmoothingEnabled = false; ec.drawImage(logical, 0, 0);
      const expected = ec.getImageData(0, 0, width, height).data;
      let mismatch = 0, dark = 0; let first: number[] | null = null;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if ([0, 1, 2, 3].some(c => actual[i + c] !== expected[i + c])) {
          mismatch++; if (!first) first = [x, y, ...actual.slice(i, i + 4), ...expected.slice(i, i + 4)];
          if (actual[i] + actual[i + 1] + actual[i + 2] < expected[i] + expected[i + 1] + expected[i + 2] - 10) dark++;
        }
      }
      cases.push({ size: [w, h], zoom, pan, mismatch, dark, first });
    }
    return cases;
  });
  await info.attach('pixel-comparison.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  console.log(JSON.stringify({ project: info.project.name, results }));
  for (const result of results) expect(result.mismatch, JSON.stringify(result)).toBe(0);
});

test('real editor and GUI Scale preview render the same panel raster at slice boundaries', async ({ page }) => {
  await page.goto('/');
  await page.locator('.screen-settings summary').click();
  await page.getByLabel('设计区底板').selectOption('supplied-panel-16');
  await page.locator('.screen-settings summary').click();
  const host = page.getByTestId('canvas-host');
  const check = async () => {
    await expect.poll(async () => host.evaluate(async el => {
      const mod = await (new Function('return import("/src/render/panelTexture.ts")')() as Promise<typeof import('../src/render/panelTexture')>);
      const image = await mod.getPanelImage('supplied-panel-16');
      const canvas = el.querySelector('canvas')!, context = canvas.getContext('2d')!;
      const dpr = canvas.width / canvas.getBoundingClientRect().width;
      const zoom = Number(el.getAttribute('data-zoom')), ox = Number(el.getAttribute('data-origin-x')), oy = Number(el.getAttribute('data-origin-y'));
      const expected = document.createElement('canvas'); expected.width = canvas.width; expected.height = canvas.height;
      const ec = expected.getContext('2d')!; ec.setTransform(dpr * zoom, 0, 0, dpr * zoom, ox * dpr, oy * dpr);
      ec.fillStyle = '#1c2634'; ec.fillRect(0, 0, 320, 180);
      const raster = document.createElement('canvas'); raster.width = 320; raster.height = 180;
      mod.drawNativePanel(raster.getContext('2d')!, image, 320, 180);
      ec.imageSmoothingEnabled = false; ec.drawImage(raster, 0, 0);
      const a = context.getImageData(0, 0, canvas.width, canvas.height).data, b = ec.getImageData(0, 0, canvas.width, canvas.height).data;
      let mismatches = 0, checked = 0;
      // Internal vertical/horizontal joins, away from outer edge and the empty-state overlay.
      for (let y = Math.max(0, Math.ceil((oy + 2 * zoom) * dpr)); y < Math.min(canvas.height, Math.floor((oy + 170 * zoom) * dpr)); y++)
        for (let x = Math.max(0, Math.ceil((ox + 2 * zoom) * dpr)); x < Math.min(canvas.width, Math.floor((ox + 310 * zoom) * dpr)); x++) {
          const lx = (x / dpr - ox) / zoom, ly = (y / dpr - oy) / zoom;
          if (Math.abs(lx - 4) > 2 / zoom / dpr && Math.abs(ly - 4) > 2 / zoom / dpr && Math.abs(lx - 316) > 2 / zoom / dpr && Math.abs(ly - 176) > 2 / zoom / dpr) continue;
          const i = (y * canvas.width + x) * 4; checked++;
          if ([0, 1, 2, 3].some(c => a[i + c] !== b[i + c])) mismatches++;
        }
      return mismatches + (checked === 0 ? 1_000_000 : 0);
    }), { timeout: 10000 }).toBe(0);
  };
  for (const zoom of ['0.5', '1', '2']) for (const pan of ['0', '0.37']) {
    await page.getByLabel('Zoom', { exact: true }).selectOption(zoom);
    await page.getByLabel('Pan X', { exact: true }).fill(pan); await page.getByLabel('Pan Y', { exact: true }).fill(pan);
    await check();
  }
  await page.locator('.screen-settings summary').click();
  await page.getByRole('button', { name: '预览游戏缩放', exact: true }).click();
  await expect(host).toHaveAttribute('data-preview', 'true'); await check();
});

test('diagnose boundary pixels and sample rendering cost', async ({ page }, info) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const m = await (new Function('return import("/src/render/panelTexture.ts")')() as Promise<typeof import('../src/render/panelTexture')>);
    const image = await m.getPanelImage('supplied-panel-16');
    const source = document.createElement('canvas'); source.width = 16; source.height = 16;
    const sc = source.getContext('2d')!; sc.drawImage(image, 0, 0);
    const src = sc.getImageData(0, 0, 16, 16).data;
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 500; const ctx = canvas.getContext('2d')!;
    const raster = m.panelPreviewRaster(image, 320, 180)!;
    const render = (old: boolean) => {
      ctx.resetTransform(); ctx.fillStyle = '#1c2634'; ctx.fillRect(0, 0, 800, 500);
      ctx.setTransform(2, 0, 0, 2, 20.37, 20.37); ctx.imageSmoothingEnabled = false;
      if (old) m.drawNativePanel(ctx, image, 320, 180); else ctx.drawImage(raster, 0, 0);
    };
    render(true); const oldPixels = ctx.getImageData(0, 0, 800, 500).data;
    render(false); const newPixels = ctx.getImageData(0, 0, 800, 500).data;
    const vertical: number[][] = [], horizontal: number[][] = [];
    for (let y = 25; y < 360; y++) for (let x = 25; x < 660; x++) {
      const i = (y * 800 + x) * 4;
      if (oldPixels[i] + oldPixels[i + 1] + oldPixels[i + 2] < newPixels[i] + newPixels[i + 1] + newPixels[i + 2] - 10) {
        const value = [x, y, ...oldPixels.slice(i, i + 3), ...newPixels.slice(i, i + 3)];
        if (Math.abs(x - (20.37 + 8)) < 2) vertical.push(value);
        if (Math.abs(y - (20.37 + 8)) < 2) horizontal.push(value);
      }
    }
    const samples = (old: boolean) => {
      const times: number[] = [];
      for (let pass = 0; pass < 5; pass++) {
        const start = performance.now();
        for (let n = 0; n < 100; n++) {
          render(old); ctx.resetTransform(); ctx.fillStyle = '#fff';
          for (let i = 0; i < 300; i++) ctx.fillRect((i % 25) * 12, Math.floor(i / 25) * 12, 8, 8);
        }
        times.push(performance.now() - start);
      }
      return times;
    };
    return { dpr: devicePixelRatio, transparentSourcePixels: Array.from({ length: 256 }, (_, i) => src[i * 4 + 3]).filter(a => a === 0).length,
      verticalCount: vertical.length, verticalFirst: vertical[0], horizontalCount: horizontal.length, horizontalFirst: horizontal[0],
      oldMs100Frames: samples(true), newMs100Frames: samples(false) };
  });
  console.log(JSON.stringify(result));
  await info.attach('boundary-and-performance.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.verticalCount).toBeGreaterThan(0); expect(result.horizontalCount).toBeGreaterThan(0);
});

test('preview cache replaces dimensions and reuses a bounded raster', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const m = await (new Function('return import("/src/render/panelTexture.ts")')() as Promise<typeof import('../src/render/panelTexture')>);
    const image = await m.getPanelImage('supplied-panel-16');
    const a = m.panelPreviewRaster(image, 320, 180), b = m.panelPreviewRaster(image, 320, 180), c = m.panelPreviewRaster(image, 321, 180);
    return [a === b, a !== c, c?.width, m.panelPreviewRaster(image, 8193, 180) === null];
  });
  expect(result).toEqual([true, true, 321, true]);
});
