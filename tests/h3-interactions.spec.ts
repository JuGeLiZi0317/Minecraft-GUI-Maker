import {expect,test} from '@playwright/test';
test('real move, resize and pan cannot activate Peek while crossing its circle',async({page})=>{
 await page.goto('/'); await page.getByRole('button',{name:'添加 Button',exact:true}).click();
 const read=async()=>JSON.parse((await page.getByTestId('project-json').textContent())!);
 const bounds=(await read()).screens[0].nodes[0].bounds;
 await page.getByRole('button',{name:'启用侧栏自动隐藏'}).click();
 const anchor=page.getByTestId('hover-peek-trigger'), r=(await anchor.boundingBox())!, target={x:r.x+r.width/2,y:r.y+r.height/2};
 const host=page.getByTestId('canvas-host');
 const point=async(x:number,y:number)=>host.evaluate((e,pt)=>{const r=e.getBoundingClientRect(), z=Number(e.getAttribute('data-zoom'));return {x:r.x+Number(e.getAttribute('data-origin-x'))+pt.x*z,y:r.y+Number(e.getAttribute('data-origin-y'))+pt.y*z}}, {x,y});
 for(const start of [await point(bounds.x+8,bounds.y+8),await point(bounds.x+bounds.w,bounds.y+bounds.h)]){
  const before=await read(); await page.mouse.move(start.x,start.y); await page.mouse.down(); await page.mouse.move(start.x+8,start.y+8,{steps:3}); await page.mouse.move(target.x,target.y,{steps:8}); await page.waitForTimeout(300);
  await expect(page.getByLabel('模块侧栏')).toBeHidden(); await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1}))); await page.mouse.up(); expect(await read()).toEqual(before);
 }
 await page.getByRole('button',{name:'平移工具'}).click(); const rect=(await host.boundingBox())!; await page.mouse.move(rect.x+60,rect.y+100);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:8});await page.waitForTimeout(300);await expect(page.getByLabel('模块侧栏')).toBeHidden(); await page.mouse.up();
 await page.mouse.move(target.x+400,target.y); await page.mouse.move(target.x,target.y); await expect(page.getByLabel('模块侧栏')).toBeVisible();
});

test('canceling a real component drag preserves project and allows a later Peek',async({page})=>{
 await page.goto('/'); await page.getByRole('button',{name:'启用侧栏自动隐藏'}).click();
 const anchor=page.getByTestId('hover-peek-trigger'),r=(await anchor.boundingBox())!,x=r.x+r.width/2,y=r.y+r.height/2;
 await page.mouse.move(x+400,y); await page.mouse.move(x,y); await expect(page.getByLabel('模块侧栏')).toBeVisible();
 const source=page.getByRole('button',{name:'添加 Button',exact:true});await source.scrollIntoViewIfNeeded();const box=(await source.boundingBox())!, before=await page.getByTestId('project-json').textContent();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2+5,{steps:5});
 await page.mouse.move(x+400,y,{steps:8}); await page.keyboard.press('Escape'); await page.mouse.up();
 expect(await page.getByTestId('project-json').textContent()).toBe(before); await page.mouse.move(x+400,y);await page.mouse.move(x,y);await expect(page.getByLabel('模块侧栏')).toBeVisible();
});

test('middle button and window blur clear hover suppression without accidental activation',async({page})=>{
 await page.goto('/'); await page.getByRole('button',{name:'启用侧栏自动隐藏'}).click();
 const a=page.getByTestId('hover-peek-trigger'),r=(await a.boundingBox())!,x=r.x+r.width/2,y=r.y+r.height/2;
 await page.mouse.move(x+400,y);await page.mouse.down({button:'middle'});await page.mouse.move(x,y);await page.waitForTimeout(300);await expect(page.getByLabel('模块侧栏')).toBeHidden();
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up({button:'middle'});await page.waitForTimeout(300);await expect(page.getByLabel('模块侧栏')).toBeHidden();
 await page.mouse.move(x+400,y);await page.mouse.move(x,y);await expect(page.getByLabel('模块侧栏')).toBeVisible();
});
