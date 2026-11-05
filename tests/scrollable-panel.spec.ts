import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createNode, emptyProject } from '../src/domain/model';
import { contentViewport } from '../src/domain/scrollablePanel';
import type { GuiProject } from '../src/domain/schema';

function unpackStoredZip(bytes: Buffer) {
  const entries = new Map<string, Buffer>(); let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8), size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    expect(method).toBe(0);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8'), start = offset + 30 + nameLength + extraLength;
    expect(entries.has(name)).toBe(false); entries.set(name, bytes.subarray(start, start + size)); offset = start + size;
  }
  expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
  return entries;
}

const projectJson = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);

function fixture(): GuiProject {
  const project = emptyProject(); project.schemaVersion = '0.26.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  const panel = createNode('minecraft:scrollable-panel', 'scroll_panel_1', { x: 20, y: 20 });
  if (panel.type !== 'minecraft:scrollable-panel') throw new Error('panel fixture');
  panel.props.contentHeight = 240;
  const number = createNode('minecraft:numeric-input', 'number_1', { x: 10, y: 160 });
  number.bounds = { x: 10, y: 160, w: 120, h: 24 }; number.parentContainerId = panel.id;
  project.screens[0].nodes.push(panel, number);
  return project;
}

test('can place a root Scrollable Panel on a 786×512 design canvas from a legacy project', async ({ page }) => {
  const project = emptyProject();
  project.screens[0].designSize = { width: 786, height: 512, unit: 'gui-px' };
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: '786x512.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  const target = await page.getByTestId('canvas-host').evaluate(host => {
    const zoom = Number(host.getAttribute('data-zoom'));
    return { x: Number(host.getAttribute('data-origin-x')) + 393 * zoom, y: Number(host.getAttribute('data-origin-y')) + 256 * zoom };
  });
  await page.getByRole('button', { name: '添加 Scrollable Panel' }).dragTo(page.getByTestId('canvas-host'), { targetPosition: target });
  await expect.poll(async () => (await projectJson(page)).screens[0].nodes.filter((node: { type: string }) => node.type === 'minecraft:scrollable-panel').length).toBe(1);
  const panel = (await projectJson(page)).screens[0].nodes.find((node: { type: string }) => node.type === 'minecraft:scrollable-panel');
  expect(panel.bounds).toMatchObject({ x: 393, y: 256, w: 180, h: 96 });
  expect(panel.bounds.x + panel.bounds.w).toBeLessThanOrEqual(786);
  expect(panel.bounds.y + panel.bounds.h).toBeLessThanOrEqual(512);
  expect((await projectJson(page)).schemaVersion).toBe('0.26.0');
});

test('empty-canvas quick actions can create a Scrollable Panel on a 786×512 design canvas', async ({ page }) => {
  const project = emptyProject(); project.screens[0].designSize = { width: 786, height: 512, unit: 'gui-px' };
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'empty-786x512.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '新建 Scrollable Panel' }).click();
  const panel = (await projectJson(page)).screens[0].nodes.find((node: { type: string }) => node.type === 'minecraft:scrollable-panel');
  expect(panel?.bounds).toMatchObject({ x: 16, y: 16, w: 180, h: 96 });
});

test('W2-A behavior preview scrolls child coordinates within the clipped viewport without editing the project', async ({ page }) => {
  const project = fixture();
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'scroll-panel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  const before = await projectJson(page);
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  const input = page.getByLabel('数值输入 number_1', { exact: true });
  await expect(input).toHaveCount(1);
  await expect(input).toBeHidden();
  await expect.poll(() => input.evaluate(element => document.activeElement !== element)).toBe(true);
  const point = await page.getByTestId('canvas-host').evaluate(host => {
    const r = host.getBoundingClientRect(), zoom = Number(host.getAttribute('data-zoom'));
    const originY = r.y + Number(host.getAttribute('data-origin-y'));
    return { x: r.x + Number(host.getAttribute('data-origin-x')) + (20 + 4 + 40) * zoom, y: originY + (20 + 4 + 40) * zoom, viewportBottom: originY + (20 + 4 + 88) * zoom };
  });
  await page.mouse.move(point.x, point.y);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 100);
  await expect.poll(async () => JSON.parse((await page.getByTestId('canvas-host').getAttribute('data-scroll-offsets'))!).scroll_panel_1).toBeGreaterThan(0);
  await expect(input).toBeVisible();
  const movedTop = await input.evaluate(element => Number.parseFloat((element.parentElement as HTMLElement).style.top));
  expect(movedTop).toBeLessThan(point.viewportBottom);
  const thumb = await page.getByTestId('canvas-host').evaluate(host => {
    const r = host.getBoundingClientRect(), zoom = Number(host.getAttribute('data-zoom')), originX = r.x + Number(host.getAttribute('data-origin-x')), originY = r.y + Number(host.getAttribute('data-origin-y'));
    const offset = JSON.parse(host.getAttribute('data-scroll-offsets')!).scroll_panel_1, max = 152, track = 88, thumbHeight = Math.max(8, track * track / 240), thumbY = 20 + 4 + (track - thumbHeight) * offset / max;
    return { x: originX + (20 + 4 + 164 + 2 + 3) * zoom, y: originY + (thumbY + thumbHeight / 2) * zoom, zoom, offset };
  });
  await page.mouse.move(thumb.x, thumb.y); await page.mouse.down(); await page.mouse.move(thumb.x + 80 * thumb.zoom, thumb.y + 32 * thumb.zoom, { steps: 3 }); await page.mouse.up();
  await expect.poll(async () => JSON.parse((await page.getByTestId('canvas-host').getAttribute('data-scroll-offsets'))!).scroll_panel_1).toBeGreaterThan(thumb.offset);
  expect(await projectJson(page)).toEqual(before);
  const viewport = contentViewport(project.screens[0].nodes[0] as Extract<GuiProject['screens'][number]['nodes'][number], { type: 'minecraft:scrollable-panel' }>);
  expect(viewport.h).toBe(88);
  await page.screenshot({ path: 'test-results/W2A-scrollable-panel-preview.png' });
});

test('W2-A keeps a child Dropdown popup in the Screen overlay layer outside the container clip', async ({ page }) => {
  const project = fixture();
  const panel = project.screens[0].nodes[0];
  const dropdown = createNode('minecraft:dropdown', 'dropdown_1', { x: 10, y: 50 });
  dropdown.bounds = { x: 10, y: 50, w: 120, h: 20 }; dropdown.parentContainerId = panel.id;
  if (dropdown.type === 'minecraft:dropdown') dropdown.props.visibleRows = 2;
  project.screens[0].nodes.push(dropdown);
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'dropdown-panel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await page.getByRole('button', { name: 'Choice: One', exact: true }).click();
  const list = page.getByRole('listbox', { name: 'Choice', exact: true });
  await expect(list).toBeVisible();
  const listBox = await list.boundingBox();
  const canvas = await page.getByTestId('canvas-host').evaluate(host => { const r = host.getBoundingClientRect(), zoom = Number(host.getAttribute('data-zoom')), originY = r.y + Number(host.getAttribute('data-origin-y')); return { viewportBottom: originY + (20 + 4 + 88) * zoom }; });
  expect(listBox!.y + listBox!.height).toBeGreaterThan(canvas.viewportBottom);
  const host = page.getByTestId('canvas-host');
  await list.hover();
  await page.mouse.wheel(0, 100);
  expect(JSON.parse((await host.getAttribute('data-scroll-offsets'))!).scroll_panel_1 ?? 0).toBe(0);
  await list.getByRole('option', { name: /Two/ }).click();
  await expect(list).toHaveCount(0);
  expect((await projectJson(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'dropdown_1').props.initialSelectedOptionId).toBe('option_1');
});

test('W2-A multi-Screen ZIP keeps the authoritative parent-child graph and matching derived artifacts', async ({ page }, info) => {
  const project = fixture();
  project.project.name = 'W2A-container-export';
  const second = structuredClone(project.screens[0]);
  second.id = 'screen_settings'; second.title = { kind: 'literal', value: 'Settings' };
  second.nodes = second.nodes.map(node => ({ ...node, id: node.id === 'scroll_panel_1' ? 'scroll_panel_2' : 'number_2', ...(node.parentContainerId ? { parentContainerId: 'scroll_panel_2' } : {}) }));
  project.screens.push(second);

  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'w2a-multiscreen.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  const before = await projectJson(page), history = await page.getByTestId('history-count').textContent();
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.export-links a')).toHaveCount(8);
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob && object.type === 'application/zip') (window as Window & { __w2aZip?: Blob }).__w2aZip = object;
      return original(object);
    };
  });
  await page.getByTestId('export-panel').getByRole('button', { name: '导出 ZIP' }).click();
  await expect(page.locator('.statusbar [role="status"]')).toContainText('ZIP 已生成并下载');
  const bytes = await page.evaluate(async () => {
    const zip = (window as unknown as { __w2aZip?: Blob }).__w2aZip;
    if (!zip) throw new Error('没有捕获到应用生成的 ZIP Blob');
    return Array.from(new Uint8Array(await zip.arrayBuffer()));
  });
  const path = info.outputPath('W2A-multiscreen.zip'); await writeFile(path, Buffer.from(bytes));
  const entries = unpackStoredZip(await readFile(path));
  const authority = JSON.parse(entries.get('W2A-container-export.json')!.toString());
  const manifest = JSON.parse([...entries.entries()].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  const specification = JSON.parse([...entries.entries()].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  expect(authority).toEqual(before);
  expect(manifest.authority.file).toBe('W2A-container-export.json');
  expect(manifest.screens.map((screen: { screenId: string }) => screen.screenId)).toEqual(['screen_main', 'screen_settings']);
  expect(manifest.screens.map((screen: { scrollablePanels: { nodeId: string; children: { nodeId: string; localBounds: { y: number } }[] }[] }) => screen.scrollablePanels[0].children[0])).toEqual([
    { nodeId: 'number_1', type: 'minecraft:numeric-input', localBounds: { x: 10, y: 160, w: 120, h: 24 }, coordinateSpace: 'container-content-local' },
    { nodeId: 'number_2', type: 'minecraft:numeric-input', localBounds: { x: 10, y: 160, w: 120, h: 24 }, coordinateSpace: 'container-content-local' },
  ]);
  expect(specification.designIntent.screens.map((screen: { nodes: { nodeId: string; parentContainerId: string | null; coordinateSpace: string }[] }) => screen.nodes.find(node => node.nodeId.startsWith('number_')))).toEqual([
    expect.objectContaining({ nodeId: 'number_1', parentContainerId: 'scroll_panel_1', coordinateSpace: 'container-content-local' }),
    expect.objectContaining({ nodeId: 'number_2', parentContainerId: 'scroll_panel_2', coordinateSpace: 'container-content-local' }),
  ]);
  for (const item of manifest.screens) {
    const design = entries.get(item.designImage.name)!;
    expect(design.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(item.designImage.sha256).toBeTruthy();
  }
  expect(await projectJson(page)).toEqual(before);
  expect(await page.getByTestId('history-count').textContent()).toBe(history);
});
