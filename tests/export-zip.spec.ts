import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { emptyProject } from '../src/domain/model';
import { showScreenControls } from './workspace-helpers';
import { packFiles, zipFixture } from './resource-fixtures';

// Read stored entries from local headers; compare their exact bytes to the independent download links.
function unpack(bytes: Buffer) {
  const out = new Map<string, Buffer>(); let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    expect(bytes.readUInt16LE(at + 6) & 0x800).toBeTruthy(); expect(bytes.readUInt16LE(at + 8)).toBe(0);
    const size = bytes.readUInt32LE(at + 18), nameLength = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28);
    const name = bytes.subarray(at + 30, at + 30 + nameLength).toString('utf8'), start = at + 30 + nameLength + extra;
    expect(out.has(name)).toBe(false); expect(name).not.toMatch(/[\\/]/); out.set(name, bytes.subarray(start, start + size)); at = start + size;
  }
  expect(bytes.readUInt32LE(at)).toBe(0x02014b50); return out;
}
const doc = async (page: Page) => JSON.parse((await page.getByTestId('project-json').textContent())!);
const entries = async (page: Page) => page.locator('.export-links a').evaluateAll(async links => Promise.all(links.map(async link => ({
  name: (link as HTMLAnchorElement).download, bytes: Array.from(new Uint8Array(await (await fetch((link as HTMLAnchorElement).href)).arrayBuffer())),
}))));
async function idb(page: Page) { return page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('minecraft-gui-maker'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  try { const tx = db.transaction(['projects', 'workspace']); return await Promise.all(['projects', 'workspace'].map(name => new Promise<unknown[]>((resolve, reject) => { const req = tx.objectStore(name).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }))); } finally { db.close(); }
}); }

test('one click captures the current design and downloads ZIP directly', async ({ page }, info) => {
  await page.goto('/'); await page.getByLabel('项目名称').fill('直接导出');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP' }).click();
  const zip = await download; expect(zip.suggestedFilename()).toBe('直接导出.zip');
  await expect(page.locator('.export-links a')).toHaveCount(6);
  const path = info.outputPath('one-click.zip'); await zip.saveAs(path); const zipped = unpack(await readFile(path)), files = await entries(page);
  expect(zipped.size).toBe(files.length); for (const file of files) expect(zipped.get(file.name)).toEqual(Buffer.from(file.bytes));
  expect((await doc(page)).project.name).toBe('直接导出');
});

for (const panel of [false, true]) test(`named same-batch ZIP and individual downloads, panel=${panel}`, async ({ page }, info) => {
  await page.goto('/'); const old = emptyProject(); old.project.name = '旧设计';
  if (panel) { old.schemaVersion = '0.3.0'; old.screens[0].background = { kind: 'panel', style: 'supplied-panel-16' }; }
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByLabel('项目名称').fill('测试 GUI: 方案'); await page.getByLabel('项目名称').press('Enter');
  await expect(page.getByTestId('save-status')).toContainText('已保存');
  const before = await doc(page), history = await page.getByTestId('history-count').textContent(), stored = await idb(page);
  const jsonDownload = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON ↗' }).click();
  const json = await jsonDownload; expect(json.suggestedFilename()).toBe('测试 GUI_ 方案.json');
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(panel ? 7 : 6);
  const files = await entries(page); expect(files.every(f => f.name.startsWith('测试 GUI_ 方案.'))).toBe(true);
  const imageDownload = page.waitForEvent('download'); await page.locator('.export-links a').nth(1).click();
  const image = await imageDownload; expect(image.suggestedFilename()).toBe(files[1].name);
  const zipDownload = page.waitForEvent('download'); await page.getByTestId('export-panel').getByRole('button', { name: '导出 ZIP' }).click();
  const zip = await zipDownload; expect(zip.suggestedFilename()).toBe('测试 GUI_ 方案.zip');
  const path = info.outputPath('export.zip'); await zip.saveAs(path); const contents = unpack(await readFile(path));
  expect(contents.size).toBe(files.length); for (const file of files) expect(contents.get(file.name)).toEqual(Buffer.from(file.bytes));
  const manifest = JSON.parse(contents.get(files.at(-1)!.name)!.toString());
  expect(manifest.authority.file).toBe(files[0].name); expect(manifest.files.map((x: {name: string}) => x.name)).toEqual(files.slice(0, -1).map(x => x.name));
  expect(!!manifest.panelTexture).toBe(panel); expect(await doc(page)).toEqual(before); expect(await page.getByTestId('history-count').textContent()).toBe(history); expect(await idb(page)).toEqual(stored);
});

test('safe filename fallback for a legacy whitespace name and rejected empty editor name', async ({ page }) => {
  await page.goto('/'); const old = emptyProject(); old.project.name = '   ';
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'space.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON ↗' }).click();
  expect((await event).suggestedFilename()).toBe('minecraft-gui.json'); expect((await doc(page)).project.name).toBe('   ');
  await page.getByLabel('项目名称').fill(''); await page.getByLabel('项目名称').press('Enter');
  await expect(page.getByLabel('项目名称')).toHaveAttribute('aria-invalid', 'true'); expect((await doc(page)).project.name).toBe('   ');
});

test('special, reserved and long names only change download filenames', async ({ page }) => {
  await page.goto('/');
  for (const [name, expected] of [['CON.txt', '_CON.txt'], ['a/b\\c:*?<>|. ', 'a_b_c______'], ['界'.repeat(100), '界'.repeat(40)]]) {
    const project = emptyProject(); project.project.name = name;
    await page.getByLabel('导入项目文件').setInputFiles({ name: 'name.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
    await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
    const event = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON ↗' }).click();
    expect((await event).suggestedFilename()).toBe(`${expected}.json`); expect((await doc(page)).project.name).toBe(name);
  }
});

test('changing font while ZIP is packing cancels download', async ({ page }) => {
  await page.goto('/'); await showScreenControls(page); await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.export-links a')).toHaveCount(6);
  let downloads = 0; page.on('download', () => downloads++);
  await page.evaluate(() => { const zip = document.querySelector('[data-testid="export-panel"] button:not([aria-label])') as HTMLButtonElement; const font = [...document.querySelectorAll('button')].find(b => b.textContent === '使用系统字体')!; zip.click(); font.click(); });
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('字体选择已改变'); expect(downloads).toBe(0);
});

test('changing resources while ZIP is packing cancels download', async ({ page }) => {
  await page.goto('/'); await page.getByText('视图', { exact: true }).click(); await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover(); await page.getByRole('button', { name: '选择已有资源包' }).click();
  const panel = page.getByRole('region', { name: '资源包检查' });
  await panel.getByLabel('选择资源包 ZIP').setInputFiles({ name: 'synthetic.zip', mimeType: 'application/zip', buffer: zipFixture(packFiles()) });
  await expect(panel).toContainText('资源包已检查并载入本次会话');
  await page.getByRole('button', { name: '导出规格', exact: true }).click(); await expect(page.locator('.export-links a')).toHaveCount(6);
  let downloads = 0; page.on('download', () => downloads++);
  await page.evaluate(() => { const zip = document.querySelector('[data-testid="export-panel"] button:not([aria-label])') as HTMLButtonElement; const clear = [...document.querySelectorAll('button')].find(b => b.textContent === '清除会话')!; zip.click(); clear.click(); });
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('资源会话已改变'); expect(downloads).toBe(0);
});
