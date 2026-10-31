import { expect, test } from '@playwright/test';

test('drag snaps a component to another component, creates one history item and persists editor preferences', async ({ page }) => {
  await page.goto('/');
  const host = page.getByTestId('canvas-host');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  const xField = page.getByLabel('X', { exact: true });
  await xField.fill('160'); await xField.press('Enter');
  const readBounds = async () => JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].nodes.map((n: any) => n.bounds);
  await expect.poll(async () => (await readBounds())[1].x).toBe(160);
  const bounds = await readBounds(), box = (await host.boundingBox())!;
  const originX = Number(await host.getAttribute('data-origin-x')), originY = Number(await host.getAttribute('data-origin-y'));
  const zoom = Number(await host.getAttribute('data-zoom'));
  const fromX = box.x + originX + (bounds[1].x + bounds[1].w / 2) * zoom;
  const fromY = box.y + originY + (bounds[1].y + bounds[1].h / 2) * zoom;
  // Place the dragged left edge 2 GUI px from the first Button's left edge.
  const targetX = box.x + originX + (bounds[0].x + 2 + bounds[1].w / 2) * zoom;
  await page.mouse.move(fromX, fromY); await page.mouse.down(); await page.mouse.move(targetX, fromY, { steps: 8 });
  await expect(host).toHaveAttribute('data-alignment-x', String(bounds[0].x));
  await page.mouse.up();
  await expect.poll(async () => (await readBounds())[1].x).toBe(bounds[0].x);
  await expect(page.getByTestId('history-count')).toHaveText('4 undo / 0 redo');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(async () => (await readBounds())[1].x).toBe(160);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect.poll(async () => (await readBounds())[1].x).toBe(bounds[0].x);

  await page.getByText('视图', { exact: true }).click();
  await page.getByRole('button', { name: '智能参考线：开' }).click();
  await page.getByText('视图', { exact: true }).click();
  await page.getByRole('button', { name: '智能吸附：开' }).click();
  await expect(host).toHaveAttribute('data-smart-guides', 'false');
  await expect(host).toHaveAttribute('data-smart-snap', 'false');
  await page.reload();
  await expect(host).toHaveAttribute('data-smart-guides', 'false');
  await expect(host).toHaveAttribute('data-smart-snap', 'false');
});
