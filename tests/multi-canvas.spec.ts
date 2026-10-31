import {test, expect} from '@playwright/test';
test('multiple screen canvases select and move without changing the project', async ({page}) => {
 await page.goto('/'); await expect(page.getByTestId('save-status')).toContainText('本地已保存');
 await page.getByRole('button',{name:'添加 Button',exact:true}).click();
 await page.getByRole('button',{name:'新增 Screen',exact:true}).click();
 await page.getByRole('button',{name:'添加 Rectangle',exact:true}).click();
 const host=page.getByTestId('canvas-host'); const json=async()=>JSON.parse((await page.getByTestId('project-json').textContent())!);
 const before=await json(), history=await page.getByTestId('history-count').textContent();
 const box=(await host.boundingBox())!, ox=Number(await host.getAttribute('data-origin-x')), oy=Number(await host.getAttribute('data-origin-y')), z=Number(await host.getAttribute('data-zoom'));
 expect(z).toBe(0.5); const left=box.x+ox-380*z, top=box.y+oy;
 await page.mouse.move(left+30,top-10); await page.mouse.down(); await page.mouse.move(left+70,top-10,{steps:6}); await page.mouse.up();
 expect(await json()).toEqual(before); expect(await page.getByTestId('history-count').textContent()).toBe(history);
 await page.mouse.click(left+70,top+35);
 await expect(page.getByLabel('当前 Screen')).toHaveValue(before.screens[0].id);
 expect(await json()).toEqual(before); expect(await page.getByTestId('history-count').textContent()).toBe(history);
});
