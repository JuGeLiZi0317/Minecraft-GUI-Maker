import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { emptyProject, createNode } from '../src/domain/model';
import type { GuiProject } from '../src/domain/schema';

async function documentOf(page: Page): Promise<GuiProject> {
  return JSON.parse((await page.getByTestId('project-json').textContent())!);
}
async function point(page: Page, x: number, y: number) {
  const host = page.getByTestId('canvas-host'), box = (await host.boundingBox())!;
  const ox = Number(await host.getAttribute('data-origin-x')), oy = Number(await host.getAttribute('data-origin-y')), zoom = Number(await host.getAttribute('data-zoom'));
  return { x: box.x + ox + x * zoom, y: box.y + oy + y * zoom };
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, cancel = false) {
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 12 });
  if (cancel) await page.keyboard.press('Escape'); await page.mouse.up();
}
async function edit(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value); await page.getByLabel(label, { exact: true }).press('Enter');
}
async function importFile(page: Page, json: string) {
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(json) });
}
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible(); });

test('four types add/move/resize/export/import/recover in one history transaction per operation', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const labels = ['Button', 'EditBox', 'StringWidget', 'Rectangle'];
  for (let i = 0; i < labels.length; i++) {
    await page.getByRole('button', { name: `添加 ${labels[i]}`, exact: true }).click();
    await edit(page, 'X', '20'); await edit(page, 'Y', String(20 + i * 36));
    const before = await documentOf(page), b = before.screens[0].nodes[i].bounds;
    const history = await page.getByTestId('history-count').textContent();
    await drag(page, await point(page, b.x + 5, b.y + 5), await point(page, b.x + 15, b.y + 9));
    let moved = (await documentOf(page)).screens[0].nodes[i].bounds;
    expect(moved).toEqual({ ...b, x: b.x + 10, y: b.y + 4 });
    expect(parseInt((await page.getByTestId('history-count').textContent())!)).toBe(parseInt(history!) + 1);
    await page.locator('.studio-footer').click(); await page.keyboard.press('Control+z'); expect((await documentOf(page)).screens[0].nodes[i].bounds).toEqual(b);
    await page.keyboard.press('Control+Shift+z');
    await drag(page, await point(page, moved.x + moved.w, moved.y + moved.h), await point(page, moved.x + moved.w + 12, moved.y + moved.h + 6));
    moved = (await documentOf(page)).screens[0].nodes[i].bounds;
    expect(moved).toEqual({ x: b.x + 10, y: b.y + 4, w: b.w + 12, h: b.h + 6 });
  }
  const expected = await documentOf(page);
  expect(expected.screens[0].nodes).toHaveLength(4);
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON' }).click();
  const download = await downloadEvent, file = info.outputPath('roundtrip.json'); await download.saveAs(file);
  const exported = await readFile(file, 'utf8'); expect(JSON.parse(exported)).toEqual(expected);
  await page.getByRole('button', { name: '删除组件' }).click(); const beforeImport = await documentOf(page);
  const history = parseInt((await page.getByTestId('history-count').textContent())!);
  await importFile(page, exported); await expect(page.getByRole('status')).toContainText('导入成功');
  expect(await documentOf(page)).toEqual(expected); expect(parseInt((await page.getByTestId('history-count').textContent())!)).toBe(history + 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await documentOf(page)).toEqual(beforeImport);
  await page.getByRole('button', { name: '重做', exact: true }).click(); expect(await documentOf(page)).toEqual(expected);
  await page.screenshot({ path: info.outputPath('four-components.png'), fullPage: true });
  expect(errors).toEqual([]);
});

for (const zoom of [0.5, 1, 2]) {
  test(`logical coordinates at zoom ${zoom} with pan, fractional drag and cancellation`, async ({ page }) => {
    await page.getByLabel('Zoom', { exact: true }).selectOption(String(zoom));
    await page.getByLabel('Pan X', { exact: true }).fill('31'); await page.getByLabel('Pan Y', { exact: true }).fill('-17');
    await page.getByRole('button', { name: '添加 Button', exact: true }).click();
    const before = await documentOf(page), b = before.screens[0].nodes[0].bounds;
    await drag(page, await point(page, b.x + 10, b.y + 10), await point(page, b.x + 30.4, b.y + 20.2));
    const moved = await documentOf(page); expect(moved.screens[0].nodes[0].bounds).toEqual({ ...b, x: b.x + 20, y: b.y + 10 });
    const b2 = moved.screens[0].nodes[0].bounds;
    await drag(page, await point(page, b2.x + b2.w, b2.y + b2.h), await point(page, b2.x + b2.w + 9, b2.y + b2.h + 7));
    expect((await documentOf(page)).screens[0].nodes[0].bounds).toEqual({ ...b2, w: b2.w + 9, h: b2.h + 7 });
    const stable = await documentOf(page), history = await page.getByTestId('history-count').textContent();
    await drag(page, await point(page, b2.x + 5, b2.y + 5), await point(page, b2.x + 40, b2.y + 20), true);
    expect(await documentOf(page)).toEqual(stable); expect(await page.getByTestId('history-count').textContent()).toBe(history);
    const dpr = test.info().project.name.endsWith('dpr2') ? 2 : 1;
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(dpr);
    const backing = await page.locator('canvas').first().evaluate(canvas => ({ width: (canvas as HTMLCanvasElement).width, cssWidth: canvas.getBoundingClientRect().width }));
    expect(backing.width).toBe(Math.round(backing.cssWidth * dpr));
    const resized = stable.screens[0].nodes[0].bounds;
    await drag(page, await point(page, resized.x + resized.w, resized.y + resized.h), await point(page, resized.x + resized.w + 10, resized.y + resized.h + 10), true);
    expect(await documentOf(page)).toEqual(stable); expect(await page.getByTestId('history-count').textContent()).toBe(history);
    // Real pan gesture changes view only.
    await page.getByTestId('canvas-host').click({position:{x:60,y:100}});
    await page.getByRole('button', { name: '平移工具' }).click();
    const host = (await page.getByTestId('canvas-host').boundingBox())!;
    await drag(page, { x: host.x + 60, y: host.y + 100 }, { x: host.x + 80, y: host.y + 115 });
    expect(await documentOf(page)).toEqual(stable); await expect(page.getByLabel('Pan X', { exact: true })).toHaveValue('51');
  });
}

test('invalid JSON/schema/source/references do not replace document, selection or history', async ({ page }) => {
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  const doc = await documentOf(page), history = await page.getByTestId('history-count').textContent();
  const cases = ['{broken', JSON.stringify({ ...doc, schemaVersion: '99.0.0' })];
  const source = structuredClone(doc); source.screens[0].nodes[0].source.className = 'unverified.Widget'; cases.push(JSON.stringify(source));
  const dangling = structuredClone(doc); dangling.screens[0].nodes[0].events = { press: 'missing' }; cases.push(JSON.stringify(dangling));
  const unknown = structuredClone(doc) as any; unknown.screens[0].nodes[0].type = 'minecraft:radio'; cases.push(JSON.stringify(unknown));
  for (const json of cases) {
    await importFile(page, json); await expect(page.getByRole('alert')).toContainText('导入失败');
    expect(await documentOf(page)).toEqual(doc); expect(await page.getByTestId('history-count').textContent()).toBe(history);
    await expect(page.getByRole('button', { name: '选择 node_1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
});

test('palette drag/drop, exact properties, invalid bounds and pointer cancellation', async ({ page }) => {
  const target = await point(page, 40, 50);
  const hostBox = (await page.getByTestId('canvas-host').boundingBox())!;
  await page.getByRole('button', { name: '添加 EditBox', exact: true }).dragTo(page.getByTestId('canvas-host'), {
    targetPosition: { x: target.x - hostBox.x, y: target.y - hostBox.y },
  });
  expect((await documentOf(page)).screens[0].nodes[0].bounds).toEqual({ x: 40, y: 50, w: 120, h: 20 });
  await edit(page, '输入初值', 'Hello'); expect((await documentOf(page)).screens[0].nodes[0].props).toMatchObject({ value: 'Hello' });
  const before = await documentOf(page); await edit(page, 'W', '0'); await expect(page.getByRole('alert')).toBeVisible(); expect(await documentOf(page)).toEqual(before);
  await page.getByLabel('W', { exact: true }).fill('120'); await page.getByLabel('W', { exact: true }).press('Enter');
  const start = await point(page, 45, 55); await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 30, start.y + 20);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }))); await page.mouse.up();
  expect(await documentOf(page)).toEqual(before);
});

test('@performance 300 nodes real pointer drag and frame sampling', async ({ page, browser }, info) => {
  test.setTimeout(60_000);
  const doc = emptyProject();
  doc.screens[0].nodes = Array.from({ length: 300 }, (_, i) => {
    const node = createNode('minecraft:fill', `node_${i + 1}`);
    node.bounds = { x: (i % 25) * 12, y: Math.floor(i / 25) * 12, w: 10, h: 10 }; return node;
  });
  await importFile(page, JSON.stringify(doc)); await expect(page.getByRole('status')).toContainText('导入成功');
  await page.getByLabel('Zoom', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '选择 node_300', exact: true }).click();
  const samples = [];
  for (let round = 0; round < 3; round++) {
    const currentDoc = await documentOf(page), b = currentDoc.screens[0].nodes[299].bounds;
    await page.evaluate(() => {
      const w = window as any; w.__perf = { frames: [] as number[], active: true, last: performance.now(), moves: 0 };
      const sample = (now: number) => { if (!w.__perf.active) return; w.__perf.frames.push(now - w.__perf.last); w.__perf.last = now; requestAnimationFrame(sample); };
      requestAnimationFrame(sample);
      w.__moveListener = () => w.__perf.moves++;
      window.addEventListener('pointermove', w.__moveListener);
    });
    const start = await point(page, b.x + 3, b.y + 3);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    const wallStart = Date.now();
    for (let i = 1; i <= 60; i++) {
      await page.mouse.move(start.x + Math.sin(i / 10) * 60, start.y + (i % 20) * 0.5);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    const timing = await page.evaluate(() => {
      const w = window as any; w.__perf.active = false; window.removeEventListener('pointermove', w.__moveListener);
      const frames: number[] = w.__perf.frames.filter((n: number) => n > 0).sort((a: number, b: number) => a - b);
      const sum = frames.reduce((a, b) => a + b, 0);
      return { frames: frames.length, meanFrameMs: sum / frames.length, p50FrameMs: frames[Math.floor(frames.length * .5)],
        p95FrameMs: frames[Math.floor(frames.length * .95)], maxFrameMs: frames.at(-1), pointerMoves: w.__perf.moves,
        dpr: window.devicePixelRatio, userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], hardwareConcurrency: navigator.hardwareConcurrency };
    });
    samples.push({ round: round + 1, wallDurationMs: Date.now() - wallStart, ...timing });
    expect(timing.frames).toBeGreaterThan(0); expect(timing.pointerMoves).toBeGreaterThanOrEqual(60);
    expect((await documentOf(page)).screens[0].nodes).toHaveLength(300);
  }
  const output = { project: info.project.name, browserVersion: browser.version(), browserChannel: process.env.GUI_BROWSER_CHANNEL || 'bundled-chromium',
    environment: { node: process.version, platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryGiB: Math.round(os.totalmem() / 2**30) },
    nodeCount: 300, zoom: 2, pan: [0, 0], samples,
    method: 'requestAnimationFrame intervals during 60 real mouse moves per round, 16ms requested delay, 3 rounds; no FPS pass threshold' };
  await writeFile(info.outputPath('performance.json'), JSON.stringify(output, null, 2));
  await info.attach('performance', { body: Buffer.from(JSON.stringify(output, null, 2)), contentType: 'application/json' });
});
