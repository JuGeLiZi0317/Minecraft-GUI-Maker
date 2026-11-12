import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { customDimProject } from './fixtures/customDimProject';

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
  const authority = JSON.parse([...files].find(([name]) => name.endsWith('.json') && !name.endsWith('.manifest.json') && !name.endsWith('.implementation.json') && !name.endsWith('-diagnostics.json'))![1].toString());
  const manifest = JSON.parse([...files].find(([name]) => name.endsWith('.manifest.json'))![1].toString());
  const spec = JSON.parse([...files].find(([name]) => name.endsWith('.implementation.json'))![1].toString());
  return { zip, files, authority, manifest, spec };
};
const downloadText = async (page: Page, locale: string) => {
  const download = page.waitForEvent('download');
  await page.locator('.localization-language').filter({ hasText: locale }).getByRole('button', { name: '下载 JSON', exact: true }).click();
  const stream = await (await download).createReadStream(); const chunks = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
};

test('CustomDim localization collection, conflicts, source seeding, translation editing, undo/reload and JSON downloads', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'customdim.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(customDimProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  const before = await read(page);
  await page.getByRole('button', { name: 'Bake / Assets 工作区' }).click();
  const panel = page.getByRole('region', { name: 'Localization Resources' });
  await expect(panel).toBeVisible();
  for (const key of ['gui.customdim.time.always_day', 'gui.customdim.status.running', 'gui.customdim.tooltip.button', 'gui.customdim.structures.title', 'gui.customdim.page_b', 'gui.customdim.mapping.day', 'gui.customdim.mapping.fallback', 'gui.customdim.behavior.result', 'gui.customdim.shared']) {
    await expect(panel.locator(`[data-testid="localization-row"][data-key="${key}"]`)).toBeVisible();
  }
  await expect(panel.getByRole('alert')).toContainText('gui.customdim.shared');
  await expect(page.getByTestId('localization-summary')).toContainText('zh_cn 缺失');

  await panel.getByLabel('本地化 Mod ID').fill('customdim');
  await panel.getByLabel('自定义语言代码').fill('fr_fr');
  await panel.getByRole('button', { name: '添加语言', exact: true }).click();
  await panel.getByLabel('本地化源语言').selectOption('fr_fr');
  await panel.getByLabel('本地化源语言').selectOption('zh_cn');
  await expect(panel.getByLabel('翻译 zh_cn gui.customdim.time.always_day')).toHaveValue('永昼');
  await expect(panel.getByLabel('翻译 en_us gui.customdim.time.always_day')).toHaveValue('');
  await panel.getByLabel('翻译 zh_cn gui.customdim.apply').fill('应用（手写）');
  await panel.getByLabel('本地化源语言').selectOption('fr_fr');
  await panel.getByLabel('本地化源语言').selectOption('zh_cn');
  await expect(panel.getByLabel('翻译 zh_cn gui.customdim.apply')).toHaveValue('应用（手写）');
  await panel.locator('.localization-language').filter({ hasText: 'fr_fr' }).getByRole('button', { name: '移除', exact: true }).click();
  await panel.getByRole('button', { name: '应用本地化资源', exact: true }).click();
  const applied = await read(page);
  expect(applied.schemaVersion).toBe('0.50.0');
  expect(applied.project.modId).toBe('customdim');
  expect(applied.localization).toMatchObject({ sourceLocale: 'zh_cn', includeInZip: true });
  expect(applied.localization.locales.map((locale: { locale: string }) => locale.locale)).toEqual(['zh_cn', 'en_us']);
  expect(applied.screens[0].nodes).toEqual(before.screens[0].nodes);
  expect(applied.screens[0].textMappings).toEqual(before.screens[0].textMappings);
  expect(applied.screens[0].behaviors).toEqual(before.screens[0].behaviors);

  // Undo removes localization but leaves control TextSpecs untouched; redo restores it.
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await read(page)).localization).toBeUndefined();
  expect((await read(page)).schemaVersion).toBe('0.49.0');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await read(page)).localization).toBeDefined();

  // Add only two English translations; the rest stay explicitly missing.
  await panel.getByLabel('翻译 en_us gui.customdim.time.always_day').fill('Always Day');
  await panel.getByLabel('翻译 en_us gui.customdim.time.always_night').fill('Always Night');
  await panel.getByRole('button', { name: '应用本地化资源', exact: true }).click();
  const partial = await read(page);
  expect(partial.localization.locales.find((locale: { locale: string }) => locale.locale === 'en_us').entries).toEqual([
    { key: 'gui.customdim.time.always_day', text: 'Always Day' },
    { key: 'gui.customdim.time.always_night', text: 'Always Night' },
  ]);
  await expect(page.getByTestId('localization-summary')).toContainText('en_us 缺失');
  await mkdir('outputs/Q4E', { recursive: true });
  await page.screenshot({ path: 'outputs/Q4E/CustomDimLocalization.png' });

  const zhText = await downloadText(page, 'zh_cn'), enText = await downloadText(page, 'en_us');
  const zh = JSON.parse(zhText), en = JSON.parse(enText);
  expect(Object.keys(zh)).toEqual([...Object.keys(zh)].sort());
  expect(zh['gui.customdim.apply']).toBe('应用（手写）');
  expect(zh['gui.customdim.page_b']).toBe('第二页仅在设计资源中');
  expect(zh['gui.customdim.mapping.day']).toBe('白天');
  expect(zh['gui.customdim.behavior.result']).toBe('已应用');
  expect(en).toEqual({ 'gui.customdim.time.always_day': 'Always Day', 'gui.customdim.time.always_night': 'Always Night' });
  expect(zhText).not.toContain('//');
  expect(zhText).not.toContain('schemaVersion');

  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload();
  await expect.poll(() => read(page)).toEqual(partial);
});

test('CustomDim ZIP packages locale JSON with manifest hashes and implementation contract', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'customdim.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(customDimProject())) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: 'Bake / Assets 工作区' }).click();
  const panel = page.getByRole('region', { name: 'Localization Resources' });
  await panel.getByLabel('本地化 Mod ID').fill('customdim');
  await panel.getByLabel('自定义语言代码').fill('fr_fr');
  await panel.getByRole('button', { name: '添加语言', exact: true }).click();
  await panel.getByLabel('本地化源语言').selectOption('fr_fr');
  await panel.getByLabel('本地化源语言').selectOption('zh_cn');
  await expect(panel.getByLabel('翻译 zh_cn gui.customdim.time.always_day')).toHaveValue('永昼');
  await panel.locator('.localization-language').filter({ hasText: 'fr_fr' }).getByRole('button', { name: '移除', exact: true }).click();
  await panel.getByRole('button', { name: '应用本地化资源', exact: true }).click();
  await panel.getByLabel('翻译 en_us gui.customdim.time.always_day').fill('Always Day');
  await panel.getByRole('button', { name: '应用本地化资源', exact: true }).click();

  await captureZip(page);
  await mkdir('outputs/Q4E', { recursive: true });
  await writeFile('outputs/Q4E/CustomDimLocalization.project.json', JSON.stringify(await read(page), null, 2));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 ZIP', exact: true }).click();
  await download;
  const { zip, files, authority, manifest, spec } = await readZipFiles(page);
  expect(files.has('assets/customdim/lang/zh_cn.json')).toBe(true);
  expect(files.has('assets/customdim/lang/en_us.json')).toBe(true);
  const zh = JSON.parse(files.get('assets/customdim/lang/zh_cn.json')!.toString());
  expect(zh['gui.customdim.tooltip.button']).toBe('应用当前设置');
  expect(authority.localization.sourceLocale).toBe('zh_cn');
  expect(manifest.localization).toMatchObject({ modId: 'customdim', sourceLocale: 'zh_cn', includeInZip: true });
  const zhManifest = manifest.localization.languageFiles.find((file: { locale: string }) => file.locale === 'zh_cn');
  expect(zhManifest).toMatchObject({ path: 'assets/customdim/lang/zh_cn.json', packaged: true });
  expect(zhManifest.bytes).toBe(files.get('assets/customdim/lang/zh_cn.json')!.byteLength);
  expect(zhManifest.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(spec.localizationResourceContract).toMatchObject({ modId: 'customdim', sourceLocale: 'zh_cn', includeInZip: true });
  expect(spec.designIntent.localization.missing.en_us.length).toBeGreaterThan(0);
  expect(spec.implementationRequirements.join(' ')).toContain('assets/customdim/lang');
  await writeFile('outputs/Q4E/CustomDimLocalization.zip', zip);
});
