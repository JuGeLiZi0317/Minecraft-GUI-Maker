import { test, expect } from '@playwright/test';

test('user-selected 1.21.1 client JAR GUI sprites (local optional experiment)', async ({ page }, info) => {
  const jar = process.env.GUI_CLIENT_JAR; test.skip(!jar, 'GUI_CLIENT_JAR 未提供'); test.setTimeout(180_000);
  await page.goto('/'); await page.getByText('视图', { exact: true }).click(); await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover(); await page.getByRole('button', { name: '选择已有资源包' }).click();
  const panel = page.getByRole('region', { name: '资源包检查' });
  const memoryBefore = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
  const start = Date.now(); await panel.getByLabel('选择客户端 JAR').setInputFiles(jar!);
  await expect.poll(async () => await panel.locator('[role="alert"], [role="status"]').first().textContent(), { timeout: 60_000 }).toMatch(/客户端自报版本符合|读取失败/);
  await expect(panel).toContainText('客户端自报版本符合');
  const loadMs = Date.now() - start;
  const samples: string[] = [];
  const ids = ['minecraft:widget/button', 'minecraft:widget/button_highlighted', 'minecraft:widget/button_disabled', 'minecraft:widget/text_field', 'minecraft:widget/text_field_highlighted'];
  for (const [index, id] of ids.entries()) {
    await panel.getByLabel('GUI Sprite').selectOption(id); await panel.getByRole('button', { name: '查询 Sprite' }).click();
    const result = panel.getByTestId('sprite-result'); await expect(result).toContainText(id); await expect(result).toContainText('200 × 20');
    await expect(result).toContainText(`"left":${index < 2 ? 3 : 1}`);
    samples.push((await result.textContent())!);
  }
  await page.getByRole('button', { name: '关闭资源包检查' }).click();
  await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await page.getByRole('button', { name: '添加 EditBox', exact: true }).click();
  await expect(page.getByTestId('canvas-host')).toContainText('用户资源纹理预览');
  await expect(page.locator('.sprite-diagnostics')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('client-sprite-preview.png') });
  await page.mouse.move(0, 0);
  const actual = await page.getByTestId('canvas-host').evaluate(el => { const c=el.querySelector('canvas')!, d=c.width/c.getBoundingClientRect().width, z=Number(el.getAttribute('data-zoom'));
    return Array.from(c.getContext('2d')!.getImageData(Math.floor((Number(el.getAttribute('data-origin-x'))+20.5*z)*d),Math.floor((Number(el.getAttribute('data-origin-y'))+20.5*z)*d),1,1).data); });
  await page.getByRole('button',{name:'导出规格',exact:true}).click();await expect(page.locator('.export-links a')).toHaveCount(6);
  const exported=await page.locator('.export-links a').nth(1).evaluate(async el=>{const b=await createImageBitmap(await(await fetch((el as HTMLAnchorElement).href)).blob());const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d')!;x.drawImage(b,0,0);b.close();return Array.from(x.getImageData(20,20,1,1).data);});
  expect(exported).toEqual(actual);
  const memoryAfter = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
  console.log(JSON.stringify({ project: info.project.name, loadMs, memoryBefore, memoryAfter, samples }));
  await info.attach('client-jar-summary.json', { body: JSON.stringify({ loadMs, memoryBefore, memoryAfter, samples }), contentType: 'application/json' });
});
