import { expect, test, type Page } from '@playwright/test';
import { zipFixture } from './resource-fixtures';
import { GUI_SPRITES } from '../src/resources/layered';
import { createNode, emptyProject } from '../src/domain/model';
import { showScreenControls } from './workspace-helpers';

async function setup(page: Page, small = false) {
  await page.goto('/');
  const images = await page.evaluate(() => ['#f00000','#00ee00','#0000ee','#eeee00','#ee00ee'].map(color => { const c=document.createElement('canvas'); c.width=8;c.height=8; const x=c.getContext('2d')!;x.fillStyle=color;x.fillRect(0,0,8,8); return c.toDataURL('image/png').split(',')[1]; }));
  const path = (id: string) => `assets/minecraft/textures/gui/sprites/${id.slice(10)}.png`;
  const jar = zipFixture([{ name:'version.json',data:JSON.stringify({id:'1.21.1',pack_version:{resource:34}}) },
    { name:'assets/minecraft/atlases/gui.json',data:JSON.stringify({sources:[{type:'directory',source:'gui/sprites',prefix:''}]}) },
    ...GUI_SPRITES.flatMap((id,i)=>[{name:path(id),data:Buffer.from(images[i],'base64')},{name:path(id)+'.mcmeta',data:JSON.stringify({gui:{scaling:{type:'nine_slice',width:8,height:8,border:2}}})}])]);
  const doc=emptyProject(), button=createNode('minecraft:button','button',{x:20,y:20}), edit=createNode('minecraft:edit-box','edit',{x:20,y:60}), disabled=createNode('minecraft:button','disabled',{x:20,y:100});
  if (small && button.type === 'minecraft:button') { button.bounds.w = 9; button.bounds.h = 9; button.props.message = { kind:'literal', value:'' }; }
  if(disabled.type==='minecraft:button')disabled.state.enabled=false; doc.screens[0].nodes.push(button,edit,disabled);
  await page.getByLabel('导入项目文件').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  return { jar, images, path };
}
async function exportPixels(page: Page) {
  await page.getByRole('button',{name:'导出规格',exact:true}).click(); await expect(page.locator('.export-links a')).toHaveCount(6);
  return page.locator('.export-links a').nth(1).evaluate(async el => {
    const bitmap=await createImageBitmap(await (await fetch((el as HTMLAnchorElement).href)).blob()); const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;
    const x=c.getContext('2d')!;x.drawImage(bitmap,0,0);bitmap.close(); const p=(x0:number,y:number)=>Array.from(x.getImageData(x0,y,1,1).data);
    return { size:[c.width,c.height],button:p(22,22),edit:p(22,62),disabled:p(22,102),outside:p(2,2) };
  });
}
async function canvasPixel(page:Page,x:number,y:number) { return page.getByTestId('canvas-host').evaluate((el,{x,y})=>{const c=el.querySelector('canvas')!,d=c.width/c.getBoundingClientRect().width,z=Number(el.getAttribute('data-zoom'));
  return Array.from(c.getContext('2d')!.getImageData(Math.floor((Number(el.getAttribute('data-origin-x'))+(x+.5)*z)*d),Math.floor((Number(el.getAttribute('data-origin-y'))+(y+.5)*z)*d),1,1).data);},{x,y}); }
async function persisted(page: Page) { return page.evaluate(() => new Promise<unknown>((resolve,reject)=>{const request=indexedDB.open('minecraft-gui-maker');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction(['projects','workspace']),rows=tx.objectStore('projects').getAll(),workspace=tx.objectStore('workspace').get('active');tx.oncomplete=()=>{resolve({rows:rows.result,workspace:workspace.result});db.close();};tx.onerror=()=>reject(tx.error);};})); }

test('actual PNG uses the initial-state resource snapshot, reflects overrides and excludes editor aids', async ({page})=>{
  const {jar,images,path}=await setup(page), before=await page.getByTestId('project-json').textContent(), history=await page.getByTestId('history-count').textContent();
  await expect(page.getByTestId('save-status')).toContainText('已保存'); const saved=await persisted(page);
  await page.mouse.move(0,0); const neutralCanvas=await canvasPixel(page,22,22), neutral=await exportPixels(page);
  expect(neutral.size).toEqual([320,180]); expect(neutral.button.slice(0,3)).toEqual(neutralCanvas.slice(0,3)); expect(neutral.outside).toEqual([0,0,0,0]);
  await page.getByRole('button',{name:'关闭导出结果'}).click(); await page.getByRole('button',{name:'资源包检查'}).click(); const panel=page.getByRole('region',{name:'资源包检查'});
  await panel.getByLabel('选择客户端 JAR').setInputFiles({name:'base.jar',mimeType:'application/java-archive',buffer:jar});await expect(panel).toContainText('客户端自报版本符合'); await panel.getByRole('button',{name:'关闭资源包检查'}).click();
  await page.mouse.move(0,0); await expect.poll(()=>canvasPixel(page,22,22)).toEqual([240,0,0,255]);
  await page.getByLabel('显示网格').check(); await page.getByRole('button',{name:'选择 button'}).click();
  const png=await exportPixels(page); expect(png).toEqual({size:[320,180],button:[240,0,0,255],edit:[238,238,0,255],disabled:[0,0,238,255],outside:[0,0,0,0]});
  const manifest=await page.locator('.export-links a').last().evaluate(async a=>await(await fetch((a as HTMLAnchorElement).href)).json());
  expect(manifest.reference.revision).toBe(JSON.parse(before!).project.revision); expect(manifest.visualResources.state).toBe('initial'); expect(manifest.visualResources.sprites['minecraft:widget/button'].imageLayer).toBe('基础：base.jar');
  await page.getByRole('button',{name:'关闭导出结果'}).click();
  await showScreenControls(page);
  for (const zoom of ['0.5','1','2']) {
    await page.getByLabel('Zoom',{exact:true}).selectOption(zoom); await page.getByLabel('Pan X',{exact:true}).fill('0.37'); await page.getByLabel('Pan Y',{exact:true}).fill('0.37');
    const scaled=await exportPixels(page); expect(scaled.button).toEqual([240,0,0,255]); expect(scaled.size).toEqual([320,180]); await page.getByRole('button',{name:'关闭导出结果'}).click();
  }
  await page.getByRole('button',{name:'资源包检查'}).click();
  const override=zipFixture([{name:'pack.mcmeta',data:JSON.stringify({pack:{pack_format:34,description:'synthetic'}})},{name:path(GUI_SPRITES[0]),data:Buffer.from(images[4],'base64')}]);
  await panel.getByLabel('选择资源包 ZIP').setInputFiles({name:'override.zip',mimeType:'application/zip',buffer:override});await expect(panel).toContainText('当前资源层：override.zip'); await panel.getByRole('button',{name:'关闭资源包检查'}).click();
  await page.getByRole('button',{name:'查看导出结果'}).click();await expect(page.getByTestId('export-panel')).toContainText('当前资源会话已改变');await page.getByRole('button',{name:'关闭导出结果'}).click();
  await page.getByLabel('显示网格').uncheck(); await page.mouse.move(0,0); await expect.poll(()=>canvasPixel(page,22,22)).toEqual([238,0,238,255]);
  const updated=await exportPixels(page); expect(updated.button).toEqual([238,0,238,255]); expect(updated.edit).toEqual([238,238,0,255]);
  expect(await page.getByTestId('project-json').textContent()).toBe(before); expect(await page.getByTestId('history-count').textContent()).toBe(history);expect(await persisted(page)).toEqual(saved);
});

test('resource change during asynchronous export cancels the entire batch', async ({page})=>{
  await page.addInitScript(()=>{const original=window.createImageBitmap.bind(window);window.createImageBitmap=((...args:Parameters<typeof createImageBitmap>)=>{const slow=(window as unknown as {slowExport?:boolean}).slowExport;const task=original(...args);return slow?task.then(async image=>{await new Promise(r=>setTimeout(r,600));return image;}):task;}) as typeof createImageBitmap;});
  const {jar}=await setup(page); await page.getByRole('button',{name:'资源包检查'}).click(); const panel=page.getByRole('region',{name:'资源包检查'});
  await panel.getByLabel('选择客户端 JAR').setInputFiles({name:'base.jar',mimeType:'application/java-archive',buffer:jar});await expect(panel).toContainText('客户端自报版本符合'); await panel.getByRole('button',{name:'关闭资源包检查'}).click();
  await page.waitForTimeout(200); await page.evaluate(()=>{(window as unknown as {slowExport:boolean}).slowExport=true;});
  await page.getByRole('button',{name:'导出规格',exact:true}).click(); await page.waitForTimeout(100);
  await page.getByRole('button',{name:'资源包检查'}).click(); await panel.getByRole('button',{name:'清除会话'}).click();
  await expect(page.locator('.statusbar [role="alert"]')).toContainText('资源会话已改变'); await expect(page.locator('.export-links a')).toHaveCount(0);
});

test('invalid PNG reports a visible fallback and exports that fallback', async ({page})=>{
  const {jar,path}=await setup(page); await page.getByRole('button',{name:'资源包检查'}).click(); const panel=page.getByRole('region',{name:'资源包检查'});
  await panel.getByLabel('选择客户端 JAR').setInputFiles({name:'base.jar',mimeType:'application/java-archive',buffer:jar});await expect(panel).toContainText('客户端自报版本符合');
  const invalid=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(invalid);invalid.writeUInt32BE(13,8);invalid.write('IHDR',12);invalid.writeUInt32BE(8,16);invalid.writeUInt32BE(8,20);
  const broken=zipFixture([{name:'pack.mcmeta',data:JSON.stringify({pack:{pack_format:34,description:'synthetic'}})},{name:path(GUI_SPRITES[0]),data:invalid}]);
  await panel.getByLabel('选择资源包 ZIP').setInputFiles({name:'broken.zip',mimeType:'application/zip',buffer:broken});await expect(panel).toContainText('当前资源层：broken.zip');
  await expect(page.locator('.sprite-diagnostics')).toContainText('PNG 解码失败');await panel.getByRole('button',{name:'关闭资源包检查'}).click(); await page.mouse.move(0,0);
  const canvas=await canvasPixel(page,80,22);await exportPixels(page);
  const pixel=await page.locator('.export-links a').nth(1).evaluate(async a=>{const b=await createImageBitmap(await(await fetch((a as HTMLAnchorElement).href)).blob());const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d')!;x.drawImage(b,0,0);b.close();return Array.from(x.getImageData(80,22,1,1).data);});
  expect(pixel.slice(0,3)).toEqual([49,67,84]);expect(canvas.slice(0,3)).toEqual([49,67,84]);
  await expect(page.getByTestId('export-visual-diagnostics')).toContainText('invalid：PNG 解码失败');
});

test('actual PNG samples reflect stretch, tile and asymmetric nine-slice metadata', async ({page})=>{
  const {jar,path}=await setup(page); const gradient=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=8;c.height=8;const x=c.getContext('2d')!;for(let y=0;y<8;y++)for(let i=0;i<8;i++){x.fillStyle=`rgb(${i*30},${y*30},60)`;x.fillRect(i,y,1,1);}return c.toDataURL('image/png').split(',')[1];});
  await page.getByRole('button',{name:'资源包检查'}).click();const panel=page.getByRole('region',{name:'资源包检查'});
  await panel.getByLabel('选择客户端 JAR').setInputFiles({name:'base.jar',mimeType:'application/java-archive',buffer:jar});await expect(panel).toContainText('客户端自报版本符合');
  const variants=[{type:'stretch'},{type:'tile',width:8,height:8},{type:'nine_slice',width:8,height:8,border:{left:2,right:1,top:1,bottom:2}}];
  const samples:number[][]=[];
  for(const [index,scaling] of variants.entries()){
    const upper=zipFixture([{name:'pack.mcmeta',data:JSON.stringify({pack:{pack_format:34,description:'synthetic'}})},{name:path(GUI_SPRITES[0]),data:Buffer.from(gradient,'base64')},{name:path(GUI_SPRITES[0])+'.mcmeta',data:JSON.stringify({gui:{scaling}})}]);
    await panel.getByLabel('选择资源包 ZIP').setInputFiles({name:`${scaling.type}.zip`,mimeType:'application/zip',buffer:upper});await expect(panel).toContainText(`当前资源层：${scaling.type}.zip`);await panel.getByRole('button',{name:'关闭资源包检查'}).click();await page.mouse.move(0,0);
    await expect.poll(()=>canvasPixel(page,28,22)).toEqual([[0,0,60,255],[0,60,60,255],[90,60,60,255]][index]);
    await exportPixels(page);
    const p=await page.locator('.export-links a').nth(1).evaluate(async a=>{const b=await createImageBitmap(await(await fetch((a as HTMLAnchorElement).href)).blob());const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d')!;x.drawImage(b,0,0);b.close();return Array.from(x.getImageData(28,22,1,1).data);});samples.push(p);
    await page.getByRole('button',{name:'关闭导出结果'}).click();await page.getByRole('button',{name:'资源包检查'}).click();
  }
  expect(samples).toEqual([[0,0,60,255],[0,60,60,255],[90,60,60,255]]);
});

test('actual PNG preserves a 9×9 asymmetric nine-slice corner', async ({page})=>{
  const {jar,path}=await setup(page,true);const gradient=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=8;c.height=8;const x=c.getContext('2d')!;for(let y=0;y<8;y++)for(let i=0;i<8;i++){x.fillStyle=`rgb(${i*30},${y*30},60)`;x.fillRect(i,y,1,1);}return c.toDataURL('image/png').split(',')[1];});
  await page.getByRole('button',{name:'资源包检查'}).click();const panel=page.getByRole('region',{name:'资源包检查'});
  await panel.getByLabel('选择客户端 JAR').setInputFiles({name:'base.jar',mimeType:'application/java-archive',buffer:jar});await expect(panel).toContainText('客户端自报版本符合');
  const upper=zipFixture([{name:'pack.mcmeta',data:JSON.stringify({pack:{pack_format:34,description:'synthetic'}})},{name:path(GUI_SPRITES[0]),data:Buffer.from(gradient,'base64')},{name:path(GUI_SPRITES[0])+'.mcmeta',data:JSON.stringify({gui:{scaling:{type:'nine_slice',width:8,height:8,border:{left:2,right:1,top:1,bottom:2}}}})}]);
  await panel.getByLabel('选择资源包 ZIP').setInputFiles({name:'small.zip',mimeType:'application/zip',buffer:upper});await expect(panel).toContainText('当前资源层：small.zip');await panel.getByRole('button',{name:'关闭资源包检查'}).click();await page.mouse.move(0,0);
  await expect.poll(()=>canvasPixel(page,28,28)).toEqual([210,210,60,255]);await exportPixels(page);
  const p=await page.locator('.export-links a').nth(1).evaluate(async a=>{const b=await createImageBitmap(await(await fetch((a as HTMLAnchorElement).href)).blob());const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d')!;x.drawImage(b,0,0);b.close();return Array.from(x.getImageData(28,28,1,1).data);});
  expect(p).toEqual([210,210,60,255]);
});

test('unsupported atlas is reported and both canvas and PNG use the fallback', async ({page})=>{
  const {jar}=await setup(page); await page.getByRole('button',{name:'资源包检查'}).click();const panel=page.getByRole('region',{name:'资源包检查'});
  await panel.getByLabel('选择客户端 JAR').setInputFiles({name:'base.jar',mimeType:'application/java-archive',buffer:jar});await expect(panel).toContainText('客户端自报版本符合');
  const upper=zipFixture([{name:'pack.mcmeta',data:JSON.stringify({pack:{pack_format:34,description:'synthetic'}})},{name:'assets/minecraft/atlases/gui.json',data:'{}'}]);
  await panel.getByLabel('选择资源包 ZIP').setInputFiles({name:'atlas.zip',mimeType:'application/zip',buffer:upper});await expect(page.locator('.sprite-diagnostics')).toContainText('unsupported');
  await panel.getByRole('button',{name:'关闭资源包检查'}).click();await page.mouse.move(0,0);const canvas=await canvasPixel(page,80,22);await exportPixels(page);
  const png=await page.locator('.export-links a').nth(1).evaluate(async a=>{const b=await createImageBitmap(await(await fetch((a as HTMLAnchorElement).href)).blob());const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d')!;x.drawImage(b,0,0);b.close();return Array.from(x.getImageData(80,22,1,1).data);});
  expect(canvas).toEqual([49,67,84,255]);expect(png).toEqual(canvas);await expect(page.getByTestId('export-visual-diagnostics')).toContainText('unsupported');
});
