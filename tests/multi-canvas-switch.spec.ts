import { test, expect } from '@playwright/test';
test('switching screens preserves one stable workspace and canvas coordinates', async ({page}) => {
  await page.goto('/'); await expect(page.getByTestId('save-status')).toContainText('本地已保存');
  await page.getByRole('button',{name:'新增 Screen',exact:true}).click();
  const host=page.getByTestId('canvas-host'); await expect(host).toHaveCount(1);
  await page.evaluate(() => { const w=window as any; w.maxHosts=0; const update=()=>{w.maxHosts=Math.max(w.maxHosts,document.querySelectorAll('[data-testid="canvas-host"]').length)}; new MutationObserver(update).observe(document.querySelector('.studio')!,{childList:true,subtree:true}); update(); });
  const before=JSON.parse((await page.getByTestId('project-json').textContent())!), hist=await page.getByTestId('history-count').textContent();
  const box=(await host.boundingBox())!, ox=Number(await host.getAttribute('data-origin-x')), oy=Number(await host.getAttribute('data-origin-y')), z=Number(await host.getAttribute('data-zoom'));
  const firstX=box.x+ox-380*z, firstY=box.y+oy;
  await page.mouse.click(firstX+30,firstY+20); await expect(page.getByLabel('当前 Screen')).toHaveValue(before.screens[0].id);
  await expect(host).toHaveCount(1); expect(await page.evaluate(()=>(window as any).maxHosts)).toBe(1);
  const nextBox=(await host.boundingBox())!, nextX=nextBox.x+Number(await host.getAttribute('data-origin-x')), nextY=nextBox.y+Number(await host.getAttribute('data-origin-y'));
  expect(Math.abs(nextX-firstX)).toBeLessThan(2); expect(Math.abs(nextY-firstY)).toBeLessThan(2);
  await page.getByRole('button',{name:'行为',exact:true}).click();
  await page.getByRole('button',{name:'新增 Screen 目标'}).click();
  await page.getByLabel('Screen 目标名称').fill('目标');
  await page.getByRole('button',{name:'保存 Screen 目标'}).click();
  await expect(host).toHaveCount(1);
  const saved=JSON.parse((await page.getByTestId('project-json').textContent())!), savedHistory=await page.getByTestId('history-count').textContent();
  await page.getByRole('button',{name:'关闭行为'}).click();
  for (let i=0;i<3;i++) {
    await page.mouse.click(firstX+380*z+30,firstY+20); await expect(page.getByLabel('当前 Screen')).toHaveValue(saved.screens[1].id);
    await expect(host).toHaveCount(1);
    expect(Math.abs((await host.boundingBox())!.x+Number(await host.getAttribute('data-origin-x'))-(firstX+380*z))).toBeLessThan(2);
    await page.mouse.click(firstX+30,firstY+20); await expect(page.getByLabel('当前 Screen')).toHaveValue(saved.screens[0].id);
  }
  expect(await page.evaluate(()=>(window as any).maxHosts)).toBe(1);
  await page.mouse.click(firstX+380*z+30,firstY+20); await expect(page.getByLabel('当前 Screen')).toHaveValue(saved.screens[1].id);
  const wheelX=firstX+380*z+35, wheelY=firstY+25, oldOriginX=(await host.boundingBox())!.x+Number(await host.getAttribute('data-origin-x')), oldOriginY=(await host.boundingBox())!.y+Number(await host.getAttribute('data-origin-y'));
  const logicalX=(wheelX-oldOriginX)/z, logicalY=(wheelY-oldOriginY)/z;
  await page.mouse.move(wheelX,wheelY); await page.mouse.wheel(0,-120);
  await expect.poll(async()=>Number(await host.getAttribute('data-zoom'))).not.toBe(z);
  const afterZoom=Number(await host.getAttribute('data-zoom')), newOriginX=(await host.boundingBox())!.x+Number(await host.getAttribute('data-origin-x')), newOriginY=(await host.boundingBox())!.y+Number(await host.getAttribute('data-origin-y'));
  expect(Math.abs((wheelX-newOriginX)/afterZoom-logicalX)).toBeLessThan(0.1); expect(Math.abs((wheelY-newOriginY)/afterZoom-logicalY)).toBeLessThan(0.1);
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!)).toEqual(saved); expect(await page.getByTestId('history-count').textContent()).toBe(savedHistory);
  expect(saved.screens.length).toBe(before.screens.length); expect(savedHistory).not.toBe(hist);
});
