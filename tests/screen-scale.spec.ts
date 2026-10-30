import { expect, test, type Page } from '@playwright/test';
import { showScreenControls } from './workspace-helpers';
import type { GuiProject } from '../src/domain/schema';
const doc = async (page: Page): Promise<GuiProject> => JSON.parse((await page.getByTestId('project-json').textContent())!);
async function point(page: Page, x: number, y: number) {
  const host = page.getByTestId('canvas-host'), rect = (await host.boundingBox())!, z = Number(await host.getAttribute('data-zoom'));
  return { x: rect.x + Number(await host.getAttribute('data-origin-x')) + x * z,
    y: rect.y + Number(await host.getAttribute('data-origin-y')) + y * z };
}
test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('screen dimensions apply atomically, undo/redo, reject component clipping and persist in JSON', async ({ page }) => {
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await showScreenControls(page); await page.getByText('设计区与游戏 GUI Scale', { exact: false }).first().click();
  await page.getByLabel('设计区宽', { exact: true }).fill('640'); await page.getByLabel('设计区高', { exact: true }).fill('360');
  await page.getByRole('button', { name: '应用设计区尺寸', exact: true }).click();
  expect((await doc(page)).screens[0].designSize).toEqual({ width: 640, height: 360, unit: 'gui-px' });
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect((await doc(page)).screens[0].designSize.width).toBe(320);
  await page.getByRole('button', { name: '重做', exact: true }).click(); const before = await doc(page);
  await page.locator('.screen-settings summary').click();
  await page.getByLabel('设计区宽', { exact: true }).fill('100'); await page.getByRole('button', { name: '应用设计区尺寸', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('超出设计区'); expect(await doc(page)).toEqual(before);
  // D freezes the input barrier: an invalid pending size must block export rather than silently use the old size.
  await page.getByRole('button', { name: '导出 JSON' }).click();
  await expect(page.getByRole('alert')).toContainText('超出设计区'); expect(await doc(page)).toEqual(before);
  await page.locator('.screen-settings summary').click();
  await page.getByLabel('设计区宽', { exact: true }).fill(String(before.screens[0].designSize.width));
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON' }).click();
  const download = await event, stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString()).screens[0].designSize).toEqual(before.screens[0].designSize);
});

test('GUI Scale preview follows framebuffer, ceil and Unicode rules without editing the document', async ({ page }, info) => {
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); const before = await doc(page);
  const history = await page.getByTestId('history-count').textContent();
  await showScreenControls(page); await page.getByText('设计区与游戏 GUI Scale', { exact: false }).first().click();
  await expect(page.getByTestId('gui-scale-info')).toContainText('实际倍率 4× · 可用 GUI 480 × 270');
  await page.getByRole('button', { name: '预览游戏缩放', exact: true }).click();
  const host = page.getByTestId('canvas-host'); await expect(host).toHaveAttribute('data-preview', 'true');
  let previous = 0;
  for (const [level, width, height] of [[1, 1920, 1080], [2, 960, 540], [3, 640, 360], [4, 480, 270]]) {
    await page.getByLabel('游戏 GUI Scale', { exact: true }).selectOption(String(level));
    await expect(host).toHaveAttribute('data-gui-scale', String(level));
    await expect(host).toHaveAttribute('data-gui-width', String(width)); await expect(host).toHaveAttribute('data-gui-height', String(height));
    const z = Number(await host.getAttribute('data-zoom')); expect(z).toBeGreaterThan(previous); previous = z;
    expect(await doc(page)).toEqual(before);
  }
  await page.getByLabel('游戏帧缓冲', { exact: true }).selectOption('1280x720');
  await expect(host).toHaveAttribute('data-gui-width', '427'); await expect(host).toHaveAttribute('data-gui-scale', '3');
  await page.getByLabel('强制 Unicode 偶数倍率', { exact: true }).check();
  await expect(host).toHaveAttribute('data-gui-scale', '4'); await expect(host).toHaveAttribute('data-gui-height', '180');
  await expect(page.getByRole('button', { name: '添加 Button', exact: true })).toBeDisabled();
  const p = await point(page, 25, 25); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 20, p.y + 10); await page.mouse.up();
  expect(await doc(page)).toEqual(before); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await page.screenshot({ path: info.outputPath('gui-scale-preview.png'), fullPage: true });
  if (!(await page.locator('.screen-settings').evaluate(element => (element as HTMLDetailsElement).open))) await page.locator('.screen-settings summary').click();
  await page.getByRole('button', { name: '返回设计模式', exact: true }).click(); await expect(host).toHaveAttribute('data-preview', 'false');
});

for (const type of ['Button', 'EditBox', 'StringWidget']) {
  test(`outside clicks save ${type} before canvas selection, drag, layers and export`, async ({ page }) => {
    await page.getByRole('button', { name: `添加 ${type}`, exact: true }).click();
    await page.getByRole('button', { name: '添加 Rectangle', exact: true }).click();
    for (const destination of ['blank', 'node', 'layer', 'export']) {
      await page.getByRole('button', { name: '选择 node_1', exact: true }).click();
      const b = (await doc(page)).screens[0].nodes[0].bounds, start = await point(page, b.x + 10, b.y + 8);
      await page.mouse.dblclick(start.x, start.y); const input = page.getByLabel('画布文字编辑'); await expect(input).toBeFocused();
      await input.fill(`点击保存-${destination}`);
      const history = parseInt((await page.getByTestId('history-count').textContent())!);
      if (destination === 'blank') { const p = await point(page, 280, 140); await page.mouse.click(p.x, p.y); }
      else if (destination === 'node') {
        const b2 = (await doc(page)).screens[0].nodes[1].bounds, p = await point(page, b2.x + 10, b2.y + 8);
        await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 10, p.y + 8); await page.mouse.up();
      } else if (destination === 'layer') await page.getByRole('button', { name: '选择 node_2', exact: true }).click();
      else { const ev = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON' }).click(); await ev; }
      const n = (await doc(page)).screens[0].nodes[0];
      expect(n.props).toMatchObject(type === 'Button' ? { message: { value: `点击保存-${destination}` } }
        : type === 'EditBox' ? { value: `点击保存-${destination}` } : { text: { value: `点击保存-${destination}` } });
      expect(parseInt((await page.getByTestId('history-count').textContent())!)).toBe(history + (destination === 'node' ? 2 : 1));
      await expect(input).toHaveCount(0);
    }
  });
}
