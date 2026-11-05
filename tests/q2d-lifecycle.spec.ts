import { expect, test, type Page } from '@playwright/test';
import { createEditorStore } from '../src/editor/store';
import type { GuiProject } from '../src/domain/schema';

const read = async (page: Page): Promise<GuiProject> => JSON.parse((await page.getByTestId('project-json').textContent())!);

function lifecycleFixture() {
  const store = createEditorStore();
  store.getState().add('minecraft:scrollable-panel', { x: 20, y: 20 });
  const panelId = store.getState().selected!;
  store.getState().add('minecraft:tree-view', { x: 0, y: 0 });
  const treeId = store.getState().selected!;
  store.getState().add('minecraft:numeric-input', { x: 0, y: 0 });
  const numericId = store.getState().selected!;
  store.getState().add('minecraft:slider', { x: 0, y: 0 });
  const sliderId = store.getState().selected!;
  store.getState().updateNode(panelId, node => {
    if (node.type === 'minecraft:scrollable-panel') { node.bounds = { x: 20, y: 20, w: 220, h: 110 }; node.props.contentHeight = 320; }
    return node;
  });
  store.getState().updateNode(treeId, node => {
    // Tree View is intentionally not in the Scrollable Panel child allowlist.
    // Keep it as a Screen node so the other lifecycle cases can share the fixture.
    if (node.type === 'minecraft:tree-view') node.bounds = { x: 160, y: 136, w: 140, h: 40 };
    return node;
  });
  store.getState().updateNode(numericId, node => {
    if (node.type === 'minecraft:numeric-input') {
      node.bounds = { x: 6, y: 62, w: 100, h: 20 }; node.parentContainerId = panelId;
      node.props = { ...node.props, min: 0, max: 10, step: 1, initialValue: 5, numericType: 'integer', format: { decimals: 0, unit: '' } };
    }
    return node;
  });
  store.getState().updateNode(sliderId, node => {
    if (node.type === 'minecraft:slider') { node.bounds = { x: 6, y: 150, w: 120, h: 20 }; node.parentContainerId = panelId; }
    return node;
  });
  return store.getState().doc;
}

async function importFixture(page: Page) {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'q2d-lifecycle.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lifecycleFixture())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
}

async function wheelContainer(page: Page, count: number, direction: -1 | 1) {
  const host = page.getByTestId('canvas-host');
  const box = (await host.boundingBox())!;
  const x = box.x + Number(await host.getAttribute('data-origin-x')) + 20 + 4 + 160 * Number(await host.getAttribute('data-zoom'));
  const y = box.y + Number(await host.getAttribute('data-origin-y')) + 20 + 45 * Number(await host.getAttribute('data-zoom'));
  await page.mouse.move(x, y);
  for (let index = 0; index < count; index++) await page.mouse.wheel(0, direction * 120);
}

test('Q2-D keeps Tree View selection and expansion across its own scrolling, then resets on preview restart', async ({ page }) => {
  await importFixture(page);
  const authority = await read(page);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const tree = page.getByRole('tree', { name: 'Tree View', exact: true });
  await expect(tree).toBeVisible();
  await page.getByRole('button', { name: 'Root，收起', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Root，展开', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Root，展开', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Leaf B' }).click();
  await tree.hover();
  await page.mouse.wheel(0, 120);
  await page.mouse.wheel(0, -120);
  await expect(page.getByRole('treeitem', { name: 'Leaf B' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Root，收起', exact: true })).toBeVisible();
  expect(await read(page)).toEqual(authority);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Root，收起', exact: true })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Leaf A' })).toHaveAttribute('aria-selected', 'true');
});

test('Q2-D scrolling a focused Numeric Input offscreen preserves its draft without committing', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const input = page.getByRole('textbox', { name: '数值输入 node_3' });
  await expect(input).toBeVisible();
  await input.fill('9');
  await wheelContainer(page, 5, 1);
  await expect(input).toBeHidden();
  await wheelContainer(page, 5, -1);
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('9');
  const events = JSON.parse((await page.getByTestId('numeric-preview-events').getAttribute('data-events'))!);
  expect(events).toEqual([]);
  // Leaving the viewport is an interrupted blur, so the draft is retained but
  // focus is not restored automatically when the container scrolls back.
  await input.click();
  await page.locator('.studio-footer').click();
  await expect.poll(async () => JSON.parse((await page.getByTestId('numeric-preview-events').getAttribute('data-events'))!).length).toBe(1);
  const after = JSON.parse((await page.getByTestId('numeric-preview-events').getAttribute('data-events'))!);
  expect(after[0]).toMatchObject({ type: 'numeric-commit', nodeId: 'node_3', value: 9 });
  expect((await read(page)).screens[0].nodes.find(node => node.id === 'node_3')?.type).toBe('minecraft:numeric-input');
});

test('Q2-D cancels Slider pointer capture when its Scrollable Panel moves it out of view', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await wheelContainer(page, 3, 1);
  const slider = page.locator('.numeric-live-slider[aria-label="滑块 node_4"]');
  await expect(slider).toBeVisible();
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2, { steps: 4 });
  const beforeHide = JSON.parse((await page.getByTestId('numeric-preview-events').getAttribute('data-events'))!);
  expect(beforeHide.length).toBeGreaterThan(0);
  // Each wheel notch advances the container by a bounded logical distance;
  // move far enough to put the slider's full bounds outside the viewport.
  await wheelContainer(page, 10, 1);
  await expect(slider).toBeHidden();
  await expect(slider).not.toHaveAttribute('data-pointer-id', /.+/);
  const afterCancel = JSON.parse((await page.getByTestId('numeric-preview-events').getAttribute('data-events'))!);
  await page.mouse.up();
  await expect(page.getByTestId('numeric-preview-events')).toHaveAttribute('data-events', JSON.stringify(afterCancel));
});
