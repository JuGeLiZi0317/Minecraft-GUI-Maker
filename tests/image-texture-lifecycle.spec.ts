import { expect, test, type Page } from '@playwright/test';

const jar = process.env.GUI_CLIENT_JAR;
async function loadResources(page: Page) {
  await page.getByRole('button', { name: '资源包检查', exact: true }).click();
  const panel = page.getByRole('region', { name: '资源包检查' });
  await panel.getByLabel('选择客户端 JAR').setInputFiles(jar!);
  await expect(panel).toContainText('客户端自报版本符合', { timeout: 60_000 });
  await panel.getByRole('button', { name: '关闭资源包检查' }).click();
  await expect(page.locator('.sprite-diagnostics').filter({ hasText: '正在解码' })).toHaveCount(0, { timeout: 30_000 });
}
async function imageColors(page: Page) {
  return page.getByTestId('canvas-host').evaluate(host => {
    const canvas = host.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
    const doc = JSON.parse(document.querySelector('[data-testid="project-json"]')!.textContent!);
    const node = doc.screens[0].nodes[0], zoom = Number(host.getAttribute('data-zoom'));
    const ratio = canvas.width / host.clientWidth;
    const x = Number(host.getAttribute('data-origin-x')) + (node.bounds.x + 4) * zoom;
    const y = Number(host.getAttribute('data-origin-y')) + (node.bounds.y + 4) * zoom;
    const data = ctx.getImageData(Math.round(x * ratio), Math.round(y * ratio), Math.round(48 * zoom * ratio), Math.round(48 * zoom * ratio)).data;
    const colors = new Set<string>();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return colors.size;
  });
}
async function path(page: Page, value: string) {
  await page.getByLabel('Texture ResourceLocation', { exact: true }).fill(value);
  await page.getByLabel('Texture ResourceLocation', { exact: true }).press('Enter');
  await expect(page.locator('.sprite-diagnostics').filter({ hasText: '正在解码' })).toHaveCount(0, { timeout: 30_000 });
}

test('Texture remains visible after independent Sprite loading, repeated path edits, drag and resource reload', async ({ page }) => {
  test.skip(!jar, 'Requires explicitly selected Minecraft 1.21.1 client JAR');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  // Force the Texture to finish before built-in GUI Sprites. Sprite completion
  // used to delete image entries, leaving only the design background behind.
  await page.addInitScript(() => {
    const original = window.createImageBitmap.bind(window);
    window.createImageBitmap = (async (source: ImageBitmapSource, options?: ImageBitmapOptions) => {
      const bitmap = await original(source, options);
      if (bitmap.width !== 16 || bitmap.height !== 16) await new Promise(resolve => setTimeout(resolve, 80));
      return bitmap;
    }) as typeof createImageBitmap;
  });
  await page.goto('/');
  await page.getByRole('button', { name: '添加 Image / Sprite', exact: true }).click();
  await path(page, 'minecraft:textures/block/stone.png');
  await loadResources(page);
  await expect.poll(() => imageColors(page)).toBeGreaterThan(2);
  for (const resourceId of ['minecraft:textures/block/dirt.png', 'minecraft:textures/block/stone.png', 'minecraft:textures/block/dirt.png']) {
    await path(page, resourceId);
    await expect.poll(() => imageColors(page)).toBeGreaterThan(2);
  }
  await page.getByLabel('图像来源', { exact: true }).selectOption('sprite');
  await page.getByLabel('图像来源', { exact: true }).selectOption('texture');
  await expect(page.getByLabel('Texture ResourceLocation', { exact: true })).toHaveValue('minecraft:textures/block/dirt.png');
  await expect.poll(() => imageColors(page)).toBeGreaterThan(2);
  const position = await page.getByTestId('canvas-host').evaluate(host => {
    const box = host.getBoundingClientRect(), zoom = Number(host.getAttribute('data-zoom'));
    return { x: box.x + Number(host.getAttribute('data-origin-x')) + 40 * zoom, y: box.y + Number(host.getAttribute('data-origin-y')) + 40 * zoom, zoom };
  });
  await page.mouse.move(position.x, position.y); await page.mouse.down();
  await page.mouse.move(position.x + 30 * position.zoom, position.y + 20 * position.zoom, { steps: 6 }); await page.mouse.up();
  await expect(page.getByLabel('X', { exact: true })).not.toHaveValue('16');
  await expect.poll(() => imageColors(page)).toBeGreaterThan(2);
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload(); await loadResources(page);
  await expect.poll(() => imageColors(page)).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});
