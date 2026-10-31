import { test, expect } from '@playwright/test';

test('right drag over an inactive Screen pans without selecting it', async ({page}) => {
 await page.goto('/'); await expect(page.getByTestId('save-status')).toContainText('本地已保存');
 await page.getByRole('button',{name:'新增 Screen',exact:true}).click();
 const doc=JSON.parse((await page.getByTestId('project-json').textContent())!), history=await page.getByTestId('history-count').textContent();
 const select=page.getByLabel('当前 Screen'); await expect(select).toHaveValue(doc.screens[1].id);
 const host=page.getByTestId('canvas-host'), box=(await host.boundingBox())!, zoom=Number(await host.getAttribute('data-zoom'));
 let originX=box.x+Number(await host.getAttribute('data-origin-x'))-380*zoom, originY=box.y+Number(await host.getAttribute('data-origin-y'));
 for (const offset of [20, -10]) {
   const y=originY+offset;
   const oldPan=Number(await page.getByLabel('Pan X').inputValue());
   await page.mouse.move(originX+30,y); await page.mouse.down({button:'right'}); await page.mouse.move(originX+70,y+15,{steps:5}); await page.mouse.up({button:'right'});
   await expect(select).toHaveValue(doc.screens[1].id); await expect.poll(async()=>Number(await page.getByLabel('Pan X').inputValue())).toBeCloseTo(oldPan+40,0);
   originX+=40; originY+=15;
 }
 expect(JSON.parse((await page.getByTestId('project-json').textContent())!)).toEqual(doc); expect(await page.getByTestId('history-count').textContent()).toBe(history);
 await page.getByRole('button',{name:'平移工具'}).click();
 const oldPan=Number(await page.getByLabel('Pan X').inputValue());
 await page.mouse.move(originX+30,originY-10); await page.mouse.down(); await page.mouse.move(originX+60,originY-10,{steps:5}); await page.mouse.up();
 await expect(select).toHaveValue(doc.screens[1].id); await expect.poll(async()=>Number(await page.getByLabel('Pan X').inputValue())).toBeCloseTo(oldPan+30,0); originX+=30;
 await page.getByRole('button',{name:'选择工具'}).click();
 await page.mouse.click(originX+30,originY+20); await expect(select).toHaveValue(doc.screens[0].id);
});
