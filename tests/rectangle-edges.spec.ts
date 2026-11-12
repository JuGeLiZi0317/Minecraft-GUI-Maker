import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { repeatableCardProject } from './fixtures/repeatableCardProject';

const read = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const captureZip = (page: Page) => page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) {
  if (blob instanceof Blob && blob.type === 'application/zip') (window as unknown as { __zip: Promise<number[]> }).__zip = blob.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)));
  return original.call(this, blob);
}; return true; });
const readZipFiles = async (page: Page) => {
  const zip = Buffer.from(await page.evaluate(() => (window as unknown as { __zip: Promise<number[]> }).__zip));
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    files.set(zip.subarray(offset + 30, offset + 30 + nameLength).toString(), zip.subarray(start, start + size)); offset = start + size;
  }
  const manifest = JSON.parse([...files].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  const spec = JSON.parse([...files].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  return { zip, manifest, spec };
};

test('plain Rectangle supports four independent inward edges and warns native per-edge API is unavailable', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'edges.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(repeatableCardProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: '选择 card_background' }).click();
  const style = page.getByRole('region', { name: 'Rectangle 静态样式' });
  await expect(style.getByLabel('上边颜色 ARGB')).toHaveValue('#FF202A36');
  await expect(style.getByLabel('上边宽')).toHaveValue('1');
  await expect(style.locator('.field-note').filter({ hasText: '默认四边' })).toContainText('Static Bake');

  await style.getByLabel('上边颜色 ARGB').fill('#FFFF0000');
  await style.getByLabel('上边颜色 ARGB').blur();
  await style.getByLabel('上边宽').fill('2');
  await style.getByLabel('上边宽').blur();
  const edited = (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'card_background');
  expect(edited.props).toMatchObject({ edgeTopColor: '#FFFF0000', edgeTopWidth: 2 });
  expect((await read(page)).schemaVersion).toBe('0.54.0');

  await style.getByLabel('上边宽').fill('30');
  await style.getByLabel('上边宽').blur();
  await style.getByLabel('下边宽').fill('40');
  await style.getByLabel('下边宽').blur();
  await expect(style.getByLabel('下边宽')).toHaveAttribute('aria-invalid', 'true');
  expect((await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'card_background').props.edgeBottomWidth).toBeUndefined();
  await style.getByLabel('下边宽').fill('1');
  await style.getByLabel('下边宽').blur();

  await mkdir('outputs/RectangleEdges', { recursive: true });
  await captureZip(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  await download;
  const { zip, manifest, spec } = await readZipFiles(page);
  expect(manifest.rectangleEdgeBorderContract).toMatchObject({ nativeSupport: false });
  expect(manifest.rectangleEdgeBorderContract.recommendation).toContain('Static Bake');
  expect(manifest.screens[0].staticRectangles.find((item: any) => item.nodeId === 'card_background').edgeBorder.top).toEqual({ color: '#FFFF0000', width: 30 });
  expect(spec.designIntent.rectangleEdgeBorderContract.nativeSupport).toBe(false);
  await writeFile('outputs/RectangleEdges/RectangleEdges.zip', zip);
  await page.getByRole('button', { name: '关闭导出结果', exact: true }).click();

  await style.getByRole('button', { name: /恢复默认四边/ }).click();
  const reset = (await read(page)).screens[0].nodes.find((node: { id: string }) => node.id === 'card_background');
  expect(reset.props.edgeTopColor).toBeUndefined();
  expect(reset.props.edgeTopWidth).toBeUndefined();
});
