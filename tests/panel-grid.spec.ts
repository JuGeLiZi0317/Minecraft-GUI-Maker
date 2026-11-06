import {expect,test,type Page} from '@playwright/test';
import {createNode,emptyProject} from '../src/domain/model';
import {CURRENT_PROJECT_SCHEMA_VERSION} from '../src/domain/schema';

async function pixel(page:Page,x:number,y:number){return page.getByTestId('canvas-host').evaluate((host,p)=>{const canvas=host.querySelector('canvas')!,dpr=canvas.width/canvas.getBoundingClientRect().width,z=Number(host.getAttribute('data-zoom')),ox=Number(host.getAttribute('data-origin-x')),oy=Number(host.getAttribute('data-origin-y'));return Array.from(canvas.getContext('2d')!.getImageData(Math.floor((ox+p.x*z)*dpr),Math.floor((oy+p.y*z)*dpr),1,1).data);},{x,y});}
async function pngPixels(page:Page){await page.getByRole('button',{name:'导出规格',exact:true}).click();await expect(page.locator('.export-links a').first()).toBeVisible();const data=await page.locator('.export-links a').evaluateAll(async links=>{const a=links.find(link=>(link as HTMLAnchorElement).download.endsWith('.png')) as HTMLAnchorElement;const image=await createImageBitmap(await(await fetch(a.href)).blob()),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);image.close();const bytes=ctx.getImageData(0,0,c.width,c.height).data;return {width:c.width,height:c.height,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer))).join(',')};});await page.getByRole('button',{name:'关闭导出结果',exact:true}).click();return data;}

for(const style of ['custom-bevel-1','supplied-panel-16'] as const)for(const partial of [false,true])test(`grid stays above ${style} ${partial?'offset':'full'} Panel and below widgets without changing PNG`,async({page})=>{
 const doc=emptyProject();doc.schemaVersion=CURRENT_PROJECT_SCHEMA_VERSION;doc.entryScreenId=doc.screens[0].id;doc.screenTabGroups=[];
 doc.screens[0].background={kind:'panel',style,...(partial?{bounds:{x:40,y:40,w:240,h:120}}:{})};
 const button=createNode('minecraft:button','grid_button');button.bounds={x:80,y:60,w:80,h:20};
 const fill=createNode('minecraft:fill','grid_fill');fill.bounds={x:180,y:90,w:30,h:20};if(fill.type==='minecraft:fill')fill.props.color='#FFFF0000';
 const tab=createNode('minecraft:creative-tab','grid_tab');tab.bounds={x:20,y:20,w:26,h:32};if(tab.type==='minecraft:creative-tab')tab.props.selected=false;
 doc.screens[0].nodes=[button,fill,tab];await page.goto('/');await page.getByLabel('导入项目文件').setInputFiles({name:'panel-grid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await expect(page.locator('.statusbar [role=status]')).toContainText('导入成功');
 await expect.poll(()=>pixel(page,60,65)).not.toEqual([28,38,52,255]);
 const initial=await page.getByTestId('project-json').textContent(),png=await pngPixels(page);
 for(const theme of ['dark','light']){
  if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:'切换主题',exact:true}).click();
  await page.getByLabel('显示网格',{exact:true}).uncheck();const panel=await pixel(page,60,65),widget=await pixel(page,90,65),red=await pixel(page,190,95),outside=await pixel(page,10,65),backTab=await pixel(page,30,25),tabAtPanelCorner=await pixel(page,40,40);
  await page.getByLabel('显示网格',{exact:true}).check();await expect.poll(()=>pixel(page,60,65)).not.toEqual(panel);
  const line=await pixel(page,60,65);expect(Math.max(...line.slice(0,3).map((value,index)=>Math.abs(value-panel[index])))).toBeGreaterThanOrEqual(35);
  expect(await pixel(page,90,65)).toEqual(widget);expect(await pixel(page,190,95)).toEqual(red);expect(red).toEqual([255,0,0,255]);
  if(partial){expect(await pixel(page,10,65)).not.toEqual(outside);expect(await pixel(page,30,25)).toEqual(backTab);expect(await pixel(page,40,40)).toEqual(tabAtPanelCorner);}
  expect(await pngPixels(page)).toEqual(png);expect(await page.getByTestId('project-json').textContent()).toBe(initial);
 }
});
