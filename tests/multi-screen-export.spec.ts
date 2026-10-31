import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function unzipStored(bytes: Buffer) {
  const entries = new Map<string, Buffer>();
  for (let at = 0; at + 30 <= bytes.length && bytes.readUInt32LE(at) === 0x04034b50;) {
    const size = bytes.readUInt32LE(at + 18), nameLength = bytes.readUInt16LE(at + 26), extraLength = bytes.readUInt16LE(at + 28);
    const name = bytes.subarray(at + 30, at + 30 + nameLength).toString('utf8'), start = at + 30 + nameLength + extraLength;
    entries.set(name, bytes.subarray(start, start + size)); at = start + size;
  }
  return entries;
}

test('three real Screens export one authoritative project and complete same-snapshot ZIP', async ({ page }, info) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  const first = await page.getByLabel('当前 Screen').inputValue();
  await page.getByRole('button', { name: '新增 Screen', exact: true }).click(); const second = await page.getByLabel('当前 Screen').inputValue();
  await page.getByLabel('Screen 名称').fill('同名'); await page.getByRole('button', { name: '重命名 Screen' }).click();
  await page.getByRole('button', { name: '添加 StringWidget', exact: true }).click();
  await page.locator('.screen-settings summary').click(); await page.getByLabel('设计区底板').selectOption('supplied-panel-16');
  await page.getByRole('button', { name: '新增 Screen', exact: true }).click(); const third = await page.getByLabel('当前 Screen').inputValue();
  await page.getByLabel('Screen 名称').fill('同名'); await page.getByRole('button', { name: '重命名 Screen' }).click();
  await page.getByRole('button', { name: '添加 Rectangle', exact: true }).click();
  await page.getByLabel('当前 Screen').selectOption(first);
  await page.getByRole('button', { name: '行为', exact: true }).click(); const behavior = page.getByTestId('behavior-panel');
  await behavior.getByRole('button', { name: '新增 Screen 目标' }).click(); await behavior.getByLabel('Screen 目标名称').fill('设置'); await behavior.getByLabel('绑定真实 Screen').selectOption(second); await behavior.getByRole('button', { name: '保存 Screen 目标' }).click();
  await behavior.getByRole('button', { name: '新增 Screen 目标' }).click(); await behavior.getByLabel('Screen 目标名称').fill('尚未实现'); await behavior.getByRole('button', { name: '保存 Screen 目标' }).click();
  await behavior.getByRole('button', { name: '关闭行为' }).click();
  await page.getByLabel('项目入口 Screen').selectOption(second);
  const before = await page.getByTestId('project-json').textContent(), history = await page.getByTestId('history-count').textContent();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '一键导出 ZIP' }).click(); const zip = await download;
  const path = info.outputPath('multi-screen.zip'); await zip.saveAs(path); const entries = unzipStored(await readFile(path));
  expect([...entries.keys()].filter(name => name.endsWith('.json') && !name.endsWith('.implementation.json') && !name.endsWith('.manifest.json'))).toHaveLength(1);
  expect([...entries.keys()].filter(name => /--screen_[A-Za-z0-9_-]+\.png$/.test(name))).toHaveLength(3);
  expect([...entries.keys()].filter(name => name.endsWith('.reference.png'))).toHaveLength(3);
  expect([...entries.keys()].filter(name => name.endsWith('.background.png'))).toHaveLength(1);
  const manifestName = [...entries.keys()].find(name => name.endsWith('.manifest.json'))!, manifest = JSON.parse(entries.get(manifestName)!.toString());
  expect(manifest.version).toBe('0.8.0'); expect(manifest.screens.map((item: { screenId: string }) => item.screenId)).toEqual([first, second, third]);
  expect(manifest.entryScreenId).toBe(second); expect(manifest.reference.schemaVersion).toBe('0.13.0');
  expect(manifest.navigationLifecycle.historyStack).toBe('none');
  const specName = [...entries.keys()].find(name => name.endsWith('.implementation.json'))!, spec = JSON.parse(entries.get(specName)!.toString());
  expect(spec.designIntent.entryScreenId).toBe(second); expect(spec.designIntent.screens[1].panelTexture.offsetBakedIntoPixels).toBe(true);
  expect(spec.designIntent.screens[1].panelTexture.drawOffset).toEqual([0, 0]);
  expect(manifest.screens[0].behavior.screenTargets).toEqual(expect.arrayContaining([expect.objectContaining({ boundScreenId: second, bindingStatus: 'bound' }), expect.objectContaining({ bindingStatus: 'unbound' })]));
  for (const file of manifest.files) expect(createHash('sha256').update(entries.get(file.name)!).digest('hex')).toBe(file.sha256);
  const promptName = [...entries.keys()].find(name => name.endsWith('.prompt.md'))!, prompt = entries.get(promptName)!.toString();
  expect(prompt).toContain(`Screen ${first}`); expect(prompt).toContain(`Screen ${second}`); expect(prompt).toContain('boundScreenId'); expect(prompt).toContain('不得按名称推断');
  expect(prompt).toContain(`项目入口 Screen：${second}`); expect(prompt.match(new RegExp(`### Screen ${first}`, 'g'))).toHaveLength(1);
  expect(await page.getByTestId('project-json').textContent()).toBe(before); expect(await page.getByTestId('history-count').textContent()).toBe(history); await expect(page.getByLabel('当前 Screen')).toHaveValue(first);
});
