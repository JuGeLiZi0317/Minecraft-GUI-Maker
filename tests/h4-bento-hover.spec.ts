import {expect,test} from '@playwright/test';

const anchor = (page:import('@playwright/test').Page)=>page.getByTestId('hover-peek-trigger');
async function auto(page:import('@playwright/test').Page) {await page.goto('/');await page.getByRole('button',{name:'启用侧栏自动隐藏'}).click();await expect(anchor(page)).toBeVisible();const r=(await anchor(page).boundingBox())!;return {x:r.x+r.width/2,y:r.y+r.height/2};}

test('H4-B circle follows the real Canvas outside edge without covering rulers, buttons or stealing canvas input',async({page})=>{
 const point=await auto(page);const rail=(await page.getByLabel('工作区模块').boundingBox())!;
 for(const [width,height] of [[1440,1000],[900,800],[400,650],[1920,1000]]){
  await page.setViewportSize({width,height});
  await expect.poll(async()=>{const a=(await anchor(page).boundingBox())!,s=(await page.locator('.studio').boundingBox())!;return Math.abs(a.x+a.width/2+36-s.x)}).toBeLessThan(1);
  const marker=(await page.getByTestId('hover-peek-marker').boundingBox())!,host=(await page.getByTestId('canvas-host').boundingBox())!;
  expect(marker.y).toBeGreaterThanOrEqual(host.y);expect(marker.y+marker.height).toBeLessThanOrEqual(host.y+host.height);
  const r=(await anchor(page).boundingBox())!;
  for(const b of await page.getByLabel('工作区模块').getByRole('button').all()){
   const p=(await b.boundingBox())!;expect(r.x+r.width<=p.x||r.x>=p.x+p.width||r.y+r.height<=p.y||r.y>=p.y+p.height).toBe(true);
  }
  expect(await page.getByTestId('hover-peek-marker').evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
  const hit=await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('[data-testid="canvas-host"]'),{x:host.x+24,y:host.y+host.height/2});expect(hit).toBe(true);
 }
 await page.setViewportSize({width:1440,height:1000});expect((await page.getByLabel('工作区模块').boundingBox())!.width).toBe(rail.width);
 expect(point.x).toBeLessThan(60);
});

test('H4-B immediate entry, continuous bridge and panel keep-area, bounded exit and stable Canvas',async({page})=>{
 const p=await auto(page),side=page.getByTestId('hybrid-sidebar'),host=page.getByTestId('canvas-host'),before=await host.boundingBox();
 await page.mouse.move(p.x+500,p.y);
 await page.evaluate(()=>{
  const w=window as any; w.__enter=null;w.__entered=null;
  window.addEventListener('pointermove',e=>{const a=document.querySelector('[data-testid="hover-peek-trigger"]')!.getBoundingClientRect();if(w.__enter===null&&Math.hypot(e.clientX-a.x-a.width/2,e.clientY-a.y-a.height/2)<=36)w.__enter=performance.now();});
  new MutationObserver(()=>{if(document.querySelector('[data-testid="hybrid-sidebar"]')?.getAttribute('data-peek')==='true'&&w.__entered===null)w.__entered=performance.now();}).observe(document.querySelector('[data-testid="hybrid-sidebar"]')!,{attributes:true,attributeFilter:['data-peek']});
 });
 await page.mouse.move(p.x,p.y);expect(await side.getAttribute('data-peek')).toBe('true');
 const timing=await page.evaluate(()=>({start:(window as any).__enter,end:(window as any).__entered}));
 expect(typeof timing.start).toBe('number');expect(typeof timing.end).toBe('number');expect(timing.end-timing.start).toBeLessThan(100);
 const panel=page.getByLabel('模块侧栏'),r=(await panel.boundingBox())!;
 await page.mouse.move(r.x+24,p.y,{steps:12});await page.waitForTimeout(260);await expect(panel).toBeVisible();await expect(side).toHaveAttribute('data-peek','true');expect(await host.boundingBox()).toEqual(before);
 await page.mouse.move(p.x+600,p.y);await expect(side).toHaveAttribute('data-peek','false',{timeout:250});await expect(panel).toHaveCSS('pointer-events','none');await expect(panel).toBeHidden();expect(await host.boundingBox()).toEqual(before);
 for(let i=0;i<5;i++){await page.mouse.move(p.x,p.y);await page.mouse.move(p.x+600,p.y);}
 await expect(side).toHaveAttribute('data-peek','false');await expect(page.getByLabel('模块侧栏')).toHaveCount(1);expect(await host.boundingBox()).toEqual(before);
});

test('H4-B circle keyboard toggle, explicit close suppression and pinned exclusivity',async({page})=>{
 const p=await auto(page),side=page.getByTestId('hybrid-sidebar');
 await anchor(page).focus();await page.keyboard.press('Enter');await expect(side).toHaveAttribute('data-peek','true');
 await page.keyboard.press('Space');await expect(side).toHaveAttribute('data-peek','false');
 await page.mouse.move(p.x,p.y);await expect(side).toHaveAttribute('data-peek','false');
 await page.mouse.move(p.x+500,p.y);await page.mouse.move(p.x,p.y);await expect(side).toHaveAttribute('data-peek','true');
 await page.getByRole('button',{name:'固定侧栏'}).click();await expect(anchor(page)).toHaveCount(0);await expect(side).toHaveAttribute('data-peek','false');await expect(page.getByLabel('模块侧栏')).toBeVisible();
 await page.mouse.move(p.x+500,p.y);await page.mouse.move(p.x,p.y);await expect(side).toHaveAttribute('data-peek','false');await expect(page.getByLabel('模块侧栏')).toHaveCount(1);
});

test('H4-B circular boundary and real popup activity preserve intent without ordinary-button focus latching',async({page})=>{
 const p=await auto(page),side=page.getByTestId('hybrid-sidebar');
 await page.mouse.move(p.x+500,p.y);await page.mouse.move(p.x+30,p.y+30);expect(await side.getAttribute('data-peek')).toBe('false');
 await page.mouse.move(p.x,p.y);await expect(side).toHaveAttribute('data-peek','true');
 await page.getByRole('button',{name:'资源包检查',exact:true}).click();await expect(page.getByRole('region',{name:'资源包检查',exact:true})).toBeVisible();
 await page.mouse.move(p.x+600,p.y);await page.waitForTimeout(120);await expect(side).toHaveAttribute('data-peek','true');
 await page.getByRole('button',{name:'关闭资源包检查'}).click();await page.mouse.move(p.x+600,p.y);await expect(side).toHaveAttribute('data-peek','false',{timeout:250});
 await page.mouse.move(p.x,p.y);await expect(side).toHaveAttribute('data-peek','true');
 await page.getByRole('button',{name:'选择工具',exact:true}).click();await page.mouse.move(p.x+600,p.y);await expect(side).toHaveAttribute('data-peek','false',{timeout:250});
});
