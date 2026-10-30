import { expect, test } from '@playwright/test';

test('workspace menus, automatic sidebars and preferences preserve the design', async ({ page }) => {
  await page.goto('/'); const host=page.getByTestId('canvas-host'); const read=async()=>JSON.parse((await page.getByTestId('project-json').textContent())!);
  for (const label of ['文件','编辑','视图','模式','工具','帮助']) await expect(page.getByText(label,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'添加 Button',exact:true}).click(); const before=await read(), history=await page.getByTestId('history-count').textContent();
  await expect(page.getByLabel('显示网格')).toBeVisible(); await expect(page.getByLabel('Zoom',{exact:true})).toBeVisible(); await expect(page.getByRole('button',{name:'资源包检查'})).toBeVisible();
  await page.getByText('视图',{exact:true}).click(); await page.getByRole('button',{name:'左侧自动隐藏：关'}).click();
  await expect(page.locator('.workspace')).toHaveClass(/auto-left/); const width=(await host.boundingBox())!.width;
  await page.getByRole('button',{name:'展开组件栏'}).hover(); await expect(page.getByRole('button',{name:'固定组件栏'})).toBeVisible(); expect((await host.boundingBox())!.width).toBe(width);
  await page.getByRole('button',{name:'固定组件栏'}).click(); await expect(page.locator('.workspace')).not.toHaveClass(/auto-left/);
  await page.getByText('视图',{exact:true}).click(); await page.getByRole('button',{name:'右侧自动隐藏：关'}).click(); await expect(page.locator('.workspace')).toHaveClass(/auto-right/); const wide=(await host.boundingBox())!.width;
  await page.getByRole('button',{name:'展开属性栏'}).hover(); await expect(page.getByRole('button',{name:'固定属性栏'})).toBeVisible(); expect((await host.boundingBox())!.width).toBe(wide); await page.getByRole('button',{name:'固定属性栏'}).click();
  const split=page.getByRole('separator',{name:'调整项目结构区域高度'}), box=(await split.boundingBox())!; await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await page.mouse.move(box.x+box.width/2,box.y+box.height/2+45); await page.mouse.up();
  const pref=await page.evaluate(()=>JSON.parse(localStorage.getItem('minecraft-gui-maker.workspace-preferences.v1')!)); expect(pref.treeRatio).not.toBe(0.48); expect(await read()).toEqual(before); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await page.reload(); await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('minecraft-gui-maker.workspace-preferences.v1')!).treeRatio)).toBe(pref.treeRatio); expect(await read()).toEqual(before);
  await page.getByText('文件',{exact:true}).click(); await page.getByRole('button',{name:'生成 PNG 和单项导出'}).click(); await expect(page.locator('.export-links a')).toHaveCount(6);
});

test('narrow workspace, drag threshold and auto-hide respect focus and pointer gestures', async ({ page }) => {
  await page.setViewportSize({width:850,height:650}); await page.goto('/'); const host=page.getByTestId('canvas-host'); expect((await host.boundingBox())!.width).toBeGreaterThan(250);
  const left=page.getByRole('separator',{name:'调整组件栏宽度'}), box=(await left.boundingBox())!; const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('minecraft-gui-maker.workspace-preferences.v1')!).left.width);
  await page.mouse.move(box.x+4,box.y+80); await page.mouse.down(); await page.mouse.move(box.x-160,box.y+80); await page.mouse.up(); await expect(page.getByRole('button',{name:'展开组件栏'})).toBeVisible();
  const pref=await page.evaluate(()=>JSON.parse(localStorage.getItem('minecraft-gui-maker.workspace-preferences.v1')!)); expect(pref.left.mode).toBe('collapsed'); expect(pref.left.width).toBe(original);
  await page.getByRole('button',{name:'展开组件栏'}).click(); await page.getByText('视图',{exact:true}).click(); await page.getByRole('button',{name:'左侧自动隐藏：关'}).click();
  const toggle=page.getByRole('button',{name:'展开组件栏'}), t=(await toggle.boundingBox())!, h=(await host.boundingBox())!;
  await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(t.x+t.width/2,t.y+t.height/2); await expect(page.locator('.workspace')).not.toHaveClass(/peek-left/); await page.mouse.up();
  await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await toggle.hover(); await expect(page.getByRole('button',{name:'固定组件栏'})).toBeVisible(); await page.getByRole('button',{name:'固定组件栏'}).click();
  await page.getByText('视图',{exact:true}).click(); await page.getByRole('button',{name:'右侧自动隐藏：关'}).click(); await page.getByRole('button',{name:'展开属性栏'}).hover(); await expect(page.getByLabel('设计区宽',{exact:true})).toBeVisible(); await page.getByLabel('设计区宽',{exact:true}).focus(); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.waitForTimeout(500); await expect(page.getByLabel('设计区宽',{exact:true})).toBeVisible(); await page.getByRole('button',{name:'固定属性栏'}).click();
  await page.evaluate(()=>localStorage.setItem('minecraft-gui-maker.workspace-preferences.v1','{invalid')); await page.reload(); await expect(host).toBeVisible(); await expect(page.getByRole('button',{name:'收起组件栏'})).toBeVisible();
});

test('file menu generates JSON, PNG and ZIP from the same committed design', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button',{name:'添加 Rectangle'}).click();
  const before=JSON.parse((await page.getByTestId('project-json').textContent())!);
  await page.evaluate(() => { const original=URL.createObjectURL; URL.createObjectURL=function(value) { if(value instanceof Blob && (value.type==='application/json'||value.type==='application/zip')) (window as any)[value.type==='application/zip'?'zip':'json']=value.arrayBuffer().then(b=>Array.from(new Uint8Array(b))); return original.call(this,value); }; });
  await page.getByText('文件',{exact:true}).click(); const json=page.waitForEvent('download'); await page.getByRole('button',{name:'下载设计 JSON'}).click(); await json; expect(JSON.parse(Buffer.from(await page.evaluate(()=>(window as any).json)).toString())).toEqual(before);
  await page.getByText('文件',{exact:true}).click(); await page.getByRole('button',{name:'生成 PNG 和单项导出'}).click(); await expect(page.locator('.export-links a')).toHaveCount(6);
  const files=await page.locator('.export-links a').evaluateAll(async links=>Promise.all(links.map(async a=>({name:(a as HTMLAnchorElement).download,bytes:Array.from(new Uint8Array(await(await fetch((a as HTMLAnchorElement).href)).arrayBuffer()))})))); expect(Buffer.from(files[1].bytes).readUInt32BE(16)).toBe(320);
  await page.getByRole('button',{name:'关闭导出结果'}).click(); await page.getByText('文件',{exact:true}).click(); const zip=page.waitForEvent('download'); await page.getByRole('button',{name:'打包 ZIP'}).click(); await zip;
  const data=Buffer.from(await page.evaluate(()=>(window as any).zip)), entries=new Map<string,Buffer>(); for(let at=0;data.readUInt32LE(at)===0x04034b50;){const n=data.readUInt16LE(at+26),e=data.readUInt16LE(at+28),size=data.readUInt32LE(at+18),start=at+30+n+e;entries.set(data.subarray(at+30,at+30+n).toString(),data.subarray(start,start+size));at=start+size;}
  const project=[...entries].find(([name])=>name.endsWith('.json')&&!name.includes('implementation')&&!name.includes('manifest')); expect(project).toBeTruthy(); expect(JSON.parse(project![1].toString())).toEqual(before); expect(entries.size).toBe(6);
});
