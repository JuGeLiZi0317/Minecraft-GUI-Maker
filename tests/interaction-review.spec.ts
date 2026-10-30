import { expect, test, type Page } from '@playwright/test';
import type { GuiProject } from '../src/domain/schema';

const documentOf = async (page: Page): Promise<GuiProject> => JSON.parse((await page.getByTestId('project-json').textContent())!);
async function point(page: Page, x: number, y: number) {
  const host = page.getByTestId('canvas-host'), box = (await host.boundingBox())!;
  return { x: box.x + Number(await host.getAttribute('data-origin-x')) + x * Number(await host.getAttribute('data-zoom')),
    y: box.y + Number(await host.getAttribute('data-origin-y')) + y * Number(await host.getAttribute('data-zoom')) };
}
async function doubleClickNode(page: Page) {
  const b = (await documentOf(page)).screens[0].nodes[0].bounds, p = await point(page, b.x + 10, b.y + 8);
  await page.mouse.dblclick(p.x, p.y); await expect(page.getByLabel('画布文字编辑')).toBeFocused();
}
async function pixel(page: Page, x: number, y: number) {
  const p = await point(page, x, y);
  return page.locator('canvas').first().evaluate((element, position) => {
    const canvas = element as HTMLCanvasElement, r = canvas.getBoundingClientRect();
    return [...canvas.getContext('2d')!.getImageData(Math.floor((position.x - r.left) * canvas.width / r.width),
      Math.floor((position.y - r.top) * canvas.height / r.height), 1, 1).data];
  }, p);
}
test.beforeEach(async ({ page }) => { await page.goto('/'); });

for (const label of ['Button', 'EditBox', 'StringWidget']) {
  test(`double-click ${label}: one text transaction, undo, cancel`, async ({ page }) => {
    await page.getByRole('button', { name: `添加 ${label}`, exact: true }).click();
    const before = await documentOf(page), history = parseInt((await page.getByTestId('history-count').textContent())!);
    await doubleClickNode(page); await page.getByLabel('画布文字编辑').fill('直接编辑'); await page.getByLabel('画布文字编辑').press('Enter');
    await expect(page.getByLabel('画布文字编辑')).toHaveCount(0);
    const node = (await documentOf(page)).screens[0].nodes[0];
    expect(node.props).toMatchObject(label === 'Button' ? { message: { kind: 'literal', value: '直接编辑' } }
      : label === 'EditBox' ? { value: '直接编辑' } : { text: { kind: 'literal', value: '直接编辑' } });
    expect(parseInt((await page.getByTestId('history-count').textContent())!)).toBe(history + 1);
    await page.locator('.studio-footer').click(); await page.keyboard.press('Control+z'); expect(await documentOf(page)).toEqual(before);
    await doubleClickNode(page); await page.getByLabel('画布文字编辑').fill('不保存'); await page.getByLabel('画布文字编辑').press('Escape');
    expect(await documentOf(page)).toEqual(before); expect(parseInt((await page.getByTestId('history-count').textContent())!)).toBe(history);
  });
}

test('translation label is plain language and inline edit preserves key; blur commits', async ({ page }) => {
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await page.getByLabel('按钮文字类型', { exact: true }).selectOption('translate');
  await expect(page.getByLabel('按钮文字预览文字', { exact: true })).toBeVisible();
  await expect(page.getByText('设计器用这段文字预览；游戏中的实际文字由翻译键对应的语言文件决定。').first()).toBeVisible();
  await doubleClickNode(page); await page.getByLabel('画布文字编辑').fill('本地化预览');
  await page.getByText('INSPECTOR', { exact: true }).click();
  await expect(page.getByLabel('画布文字编辑')).toHaveCount(0);
  expect((await documentOf(page)).screens[0].nodes[0].props).toMatchObject({ message: { kind: 'translate', key: 'gui.example', fallback: '本地化预览' } });
});

test('inline EditBox validation and IME composition do not corrupt document or history', async ({ page }) => {
  await page.getByRole('button', { name: '添加 EditBox', exact: true }).click();
  const before = await documentOf(page), history = await page.getByTestId('history-count').textContent();
  await doubleClickNode(page); const input = page.getByLabel('画布文字编辑');
  await input.fill('x'.repeat(33)); await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('maxLength');
  expect(await documentOf(page)).toEqual(before); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await input.fill('中文');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
  await expect(input).toBeVisible(); expect(await documentOf(page)).toEqual(before);
  await input.press('Escape'); expect(await documentOf(page)).toEqual(before);
});

test('rectangle ARGB updates actual canvas pixels, including alpha; undo restores', async ({ page }) => {
  await page.getByRole('button', { name: '添加 Rectangle', exact: true }).click();
  const initial = await pixel(page, 30, 30);
  const input = page.getByLabel('颜色 ARGB', { exact: true });
  await input.fill('#FFFF0000'); await input.press('Enter');
  await expect.poll(() => pixel(page, 30, 30)).toEqual([255, 0, 0, 255]);
  await input.fill('#FF0000FF'); await input.press('Tab');
  await expect.poll(() => pixel(page, 30, 30)).toEqual([0, 0, 255, 255]);
  await input.fill('#8000FF00'); await input.press('Enter');
  await expect.poll(() => pixel(page, 30, 30)).toEqual([14, 147, 26, 255]);
  await page.locator('.studio-footer').click(); await page.keyboard.press('Control+z');
  await expect.poll(() => pixel(page, 30, 30)).toEqual([0, 0, 255, 255]);
  expect(initial).not.toEqual([255, 0, 0, 255]);
});

test('wheel zooms only canvas around cursor, right drag pans, left drag moves', async ({ page }) => {
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  const doc = await documentOf(page), history = await page.getByTestId('history-count').textContent();
  const anchor = await point(page, 100, 80), host = page.getByTestId('canvas-host');
  const viewportBefore = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio, scale: visualViewport?.scale }));
  await page.mouse.move(anchor.x, anchor.y); await page.mouse.wheel(0, -120);
  await expect.poll(async () => Number(await host.getAttribute('data-zoom'))).toBeGreaterThan(2);
  const anchored = await point(page, 100, 80);
  expect(anchored.x).toBeCloseTo(anchor.x, 5); expect(anchored.y).toBeCloseTo(anchor.y, 5);
  expect(await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio, scale: visualViewport?.scale }))).toEqual(viewportBefore);
  expect(await documentOf(page)).toEqual(doc); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  // An outside wheel event is not intercepted by the canvas listener.
  const outside = await page.getByRole('heading', { name: '构建你的界面' }).evaluate(el => {
    const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }); el.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(outside).toBe(false);
  const oldZoom = await host.getAttribute('data-zoom');
  const modified = await host.evaluate(el => { const event = new WheelEvent('wheel', { altKey: true, deltaY: 120, bubbles: true, cancelable: true }); el.dispatchEvent(event); return event.defaultPrevented; });
  expect(modified).toBe(false); expect(await host.getAttribute('data-zoom')).toBe(oldZoom);
  const b = doc.screens[0].nodes[0].bounds, start = await point(page, b.x + 10, b.y + 8);
  const panX = Number(await page.getByLabel('Pan X', { exact: true }).inputValue());
  await page.mouse.move(start.x, start.y); await page.mouse.down({ button: 'right' }); await page.mouse.move(start.x + 30, start.y + 20, { steps: 8 }); await page.mouse.up({ button: 'right' });
  await expect(page.getByLabel('Pan X', { exact: true })).toHaveValue(String(panX + 30));
  expect(await documentOf(page)).toEqual(doc); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  const movedStart = await point(page, b.x + 10, b.y + 8), zoom = Number(await host.getAttribute('data-zoom'));
  await page.mouse.move(movedStart.x, movedStart.y); await page.mouse.down(); await page.mouse.move(movedStart.x + 10 * zoom, movedStart.y + 5 * zoom, { steps: 8 }); await page.mouse.up();
  expect((await documentOf(page)).screens[0].nodes[0].bounds).toEqual({ ...b, x: b.x + 10, y: b.y + 5 });
});
