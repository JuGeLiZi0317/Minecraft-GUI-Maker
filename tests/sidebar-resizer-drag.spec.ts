import { expect, test, type Page } from '@playwright/test';

/** Real-mouse drag coverage for the GUI-mode sidebar resizers (BENTO-4R).
 *  No state/localStorage/CSS shortcuts: only physical pointer paths. */

async function dragResizer(page: Page, side: 'left' | 'right', dx: number) {
  const resizer = page.locator(`.sidebar-resizer-${side}`);
  await expect(resizer).toHaveCount(1);
  const box = (await resizer.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + Math.min(300, box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 12 });
  await page.mouse.up();
}

async function widths(page: Page) {
  return page.evaluate(() => ({
    library: document.querySelector('.library')?.getBoundingClientRect().width ?? 0,
    inspector: document.querySelector('.inspector')?.getBoundingClientRect().width ?? 0,
    canvas: document.querySelector('[data-testid="canvas-host"]')?.getBoundingClientRect().width ?? 0,
  }));
}

test('left and right sidebar resizers drag with real mouse, persist, collapse and stay theme-neutral', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();

  // Hit target: the physical point over the resizer must resolve to the resizer itself.
  const leftBox = (await page.locator('.sidebar-resizer-left').boundingBox())!;
  const hit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el ? `${el.className}` : 'null';
  }, [leftBox.x + leftBox.width / 2, leftBox.y + 300]);
  expect(hit).toContain('sidebar-resizer-left');

  // Cursor affordance on hover.
  await page.mouse.move(leftBox.x + leftBox.width / 2, leftBox.y + 300);
  const cursor = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el ? getComputedStyle(el).cursor : '';
  }, [leftBox.x + leftBox.width / 2, leftBox.y + 300]);
  expect(cursor).toBe('col-resize');

  const before = await widths(page);
  expect(before.library).toBeGreaterThan(200);

  // Drag left resizer right by 80: library grows, canvas shrinks in sync.
  await dragResizer(page, 'left', 80);
  const afterLeft = await widths(page);
  expect(afterLeft.library).toBe(Math.round(before.library) + 80);
  expect(afterLeft.canvas).toBe(Math.round(before.canvas) - 80);

  // Drag right resizer left by 60: inspector grows, canvas shrinks in sync.
  await dragResizer(page, 'right', -60);
  const afterRight = await widths(page);
  expect(afterRight.inspector).toBe(Math.round(before.inspector) + 60);
  expect(afterRight.canvas).toBe(Math.round(afterLeft.canvas) - 60);

  // Preference persistence across reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  const restored = await widths(page);
  expect(restored.library).toBe(afterLeft.library);
  expect(restored.inspector).toBe(afterRight.inspector);

  // Drag below the collapse threshold collapses; expanding restores the stored width.
  await dragResizer(page, 'left', -400);
  await expect(page.getByRole('button', { name: '展开组件栏' })).toBeVisible();
  await page.getByRole('button', { name: '展开组件栏' }).click();
  const reopened = await widths(page);
  expect(reopened.library).toBe(afterLeft.library);
});

test('resizer drag works in light theme and at narrower representative viewport', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('minecraft-gui-maker.theme.v1', 'light'));
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minecraft GUI Maker' })).toBeVisible();
  const before = await widths(page);
  await dragResizer(page, 'left', 60);
  const after = await widths(page);
  expect(after.library).toBe(Math.round(before.library) + 60);
  expect(after.canvas).toBe(Math.round(before.canvas) - 60);
  await dragResizer(page, 'right', -40);
  const after2 = await widths(page);
  expect(after2.inspector).toBe(Math.round(before.inspector) + 40);
});
