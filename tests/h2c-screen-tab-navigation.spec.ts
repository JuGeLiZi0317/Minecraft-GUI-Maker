import { expect, test } from '@playwright/test';

test('three Screens share one editable CreativeTab navigation group with isolated preview navigation and export metadata', async ({ page }) => {
  await page.goto('/');
  const read = async () => JSON.parse((await page.getByTestId('project-json').textContent())!);
  await page.getByRole('button', { name: '添加 CreativeTab', exact: true }).click();
  const first = (await read()).screens[0].id;
  await page.getByRole('button', { name: '新增画布', exact: true }).click(); const second = (await read()).screens[1].id;
  await page.getByRole('button', { name: '新增画布', exact: true }).click(); const third = (await read()).screens[2].id;
  await page.getByLabel('项目入口 Screen').selectOption(first);
  await page.getByLabel('当前画布', { exact: true }).selectOption(first);

  await page.getByRole('button', { name: '选择 node_1' }).click();
  await page.getByLabel('CreativeTab 模式').selectOption('screen-navigation');
  await expect(page.locator('.statusbar [role="status"]')).toContainText('已创建项目级导航组');
  const groupId = (await read()).screenTabGroups[0].id;
  await page.getByRole('button', { name: '添加导航标签' }).click();
  await page.getByLabel('导航标签名称 navtab_2').fill('选项');
  await page.getByLabel('导航目标 Screen navtab_2').selectOption(second);
  await page.getByRole('button', { name: '添加导航标签' }).click();
  await page.getByLabel('导航标签名称 navtab_3').fill('关于');
  await page.getByLabel('导航目标 Screen navtab_3').selectOption(third);
  await page.getByRole('button', { name: '保存项目级标签组' }).click();

  for (const screenId of [first, second, third]) {
    await page.getByLabel('当前画布', { exact: true }).selectOption(screenId);
    const existing = (await read()).screens.find((screen: any) => screen.id === screenId).nodes.filter((node: any) => node.type === 'minecraft:creative-tab');
    const required = screenId === first ? 3 : 3;
    for (let index = existing.length; index < required; index++) {
      await page.getByRole('button', { name: '添加 CreativeTab', exact: true }).click();
      const nodeId = (await read()).screens.find((screen: any) => screen.id === screenId).nodes.at(-1).id;
      await page.getByLabel('CreativeTab 模式').selectOption('screen-navigation');
      await page.getByLabel('CreativeTab 导航标签').selectOption(index === 0 ? 'navtab_1' : index === 1 ? 'navtab_2' : 'navtab_3');
      await expect(page.getByTestId('project-json')).toContainText(nodeId);
    }
    // Existing and newly placed visual instances all refer to exactly one shared project group.
    for (const tabId of ['navtab_1', 'navtab_2', 'navtab_3']) {
      const current = (await read()).screens.find((screen: any) => screen.id === screenId).nodes.find((node: any) => node.type === 'minecraft:creative-tab' && node.props.navigationTabId === tabId);
      if (!current && screenId === first) throw new Error(`Missing ${tabId} instance on entry Screen`);
    }
  }
  const committed = await read(); expect(committed.schemaVersion).toBe('0.14.0'); expect(committed.screenTabGroups).toHaveLength(1);
  expect(committed.screenTabGroups[0].tabs.map((tab: any) => tab.targetScreenId)).toEqual([first, second, third]);
  for (const screen of committed.screens) expect(screen.nodes.filter((node: any) => node.props.tabMode === 'screen-navigation')).toHaveLength(3);
  const tabPixel = (nodeId: string) => page.getByTestId('canvas-host').evaluate((host, id) => {
    const doc = JSON.parse(document.querySelector('[data-testid="project-json"]')!.textContent!), activeId = (document.querySelector('[aria-label="当前画布"]') as HTMLSelectElement).value, screen = doc.screens.find((item: any) => item.id === activeId);
    const node = screen?.nodes.find((item: any) => item.id === id); if (!node) throw new Error(`Missing ${id}`);
    const canvas = host.querySelector('canvas')!, ctx = canvas.getContext('2d')!, zoom = Number(host.getAttribute('data-zoom')), dpr = devicePixelRatio;
    return Array.from(ctx.getImageData(Math.floor((Number(host.getAttribute('data-origin-x')) + (node.bounds.x + 5) * zoom) * dpr), Math.floor((Number(host.getAttribute('data-origin-y')) + (node.bounds.y + 10) * zoom) * dpr), 1, 1).data);
  }, nodeId);
  const clickTab = async (nodeId: string) => {
    const point = await page.getByTestId('canvas-host').evaluate((host, id) => { const doc = JSON.parse(document.querySelector('[data-testid="project-json"]')!.textContent!), activeId = (document.querySelector('[aria-label="当前画布"]') as HTMLSelectElement).value, node = doc.screens.find((item: any) => item.id === activeId)?.nodes.find((item: any) => item.id === id), rect = host.getBoundingClientRect(), zoom = Number(host.getAttribute('data-zoom')); if (!node) throw new Error(`Missing ${id}`); return { x: rect.x + Number(host.getAttribute('data-origin-x')) + (node.bounds.x + 13) * zoom, y: rect.y + Number(host.getAttribute('data-origin-y')) + (node.bounds.y + 16) * zoom }; }, nodeId);
    await page.mouse.click(point.x, point.y);
  };

  await page.getByRole('button', { name: '行为', exact: true }).click();
  let behavior = page.getByTestId('behavior-panel'); await page.getByRole('button', { name: '交互预览', exact: true }).click();
  await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(first);
  const firstSelectedPixel = await tabPixel('node_1');
  await clickTab('node_2');
  await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(second); behavior = page.getByTestId('behavior-panel');
  const firstUnselectedPixel = await tabPixel('node_4'), secondSelectedPixel = await tabPixel('node_5');
  expect(firstUnselectedPixel).not.toEqual(firstSelectedPixel); expect(secondSelectedPixel).toEqual(firstSelectedPixel);
  await clickTab('node_6');
  await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(third); behavior = page.getByTestId('behavior-panel');
  await clickTab('node_7');
  await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(first);
  await behavior.getByRole('button', { name: '重置预览' }).click();
  expect(await read()).toEqual(committed); await expect(page.getByLabel('当前画布', { exact: true })).toHaveValue(first);

  await expect(page.getByTestId('save-status')).toContainText('已保存');
  await page.reload(); await expect(page.getByTestId('save-status')).toContainText('已保存'); expect(await read()).toEqual(committed);
  await page.getByRole('button', { name: '行为', exact: true }).click(); await page.getByTestId('behavior-panel').getByRole('button', { name: '关闭行为' }).click();
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(page.locator('.export-links a')).toHaveCount(10);
  const exported = await page.locator('.export-links a').evaluateAll(async links => {
    const read = async (suffix: string) => { const a = links.find(link => (link as HTMLAnchorElement).download.endsWith(suffix)) as HTMLAnchorElement; return await (await fetch(a.href)).json(); };
    return { manifest: await read('.manifest.json'), spec: await read('.implementation.json'), prompt: await (await fetch((links.find(link => (link as HTMLAnchorElement).download.endsWith('.prompt.md')) as HTMLAnchorElement).href)).text() };
  });
  expect(exported.manifest.versions.projectSchema).toBe('0.14.0'); expect(exported.manifest.screenTabGroups).toEqual(committed.screenTabGroups);
  expect(exported.manifest.screens.every((screen: any) => screen.tabGroups.length === 3 && screen.tabGroups.every((tab: any) => tab.mode === 'screen-navigation'))).toBe(true);
  expect(exported.spec.designIntent.screenTabGroups).toEqual(committed.screenTabGroups);
  expect(exported.prompt).toContain('Screen-navigation CreativeTabs'); expect(exported.prompt).toContain(groupId);
  const download = page.waitForEvent('download'); await page.getByTestId('export-panel').getByRole('button', { name: /导出 ZIP/ }).click(); await download;
});
