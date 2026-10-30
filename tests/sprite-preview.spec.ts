import { expect, test } from '@playwright/test';
import { zipFixture } from './resource-fixtures';
import { GUI_SPRITES } from '../src/resources/layered';
import { createNode, emptyProject } from '../src/domain/model';
import { showScreenControls } from './workspace-helpers';

test('raster uses stretch, tile and asymmetric nine-slice without join darkening', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const mod = await (new Function('return import("/src/render/spritePreview.ts")')() as Promise<typeof import('../src/render/spritePreview')>);
    const input = document.createElement('canvas'); input.width = 8; input.height = 8; const c = input.getContext('2d')!;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = `rgb(${x * 30},${y * 30},60)`; c.fillRect(x, y, 1, 1); }
    const image = await createImageBitmap(input); const pixel = (canvas: HTMLCanvasElement, x: number, y: number) => Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data);
    const tile = mod.rasterSprite({ image, scaling: { type: 'tile', width: 8, height: 8 } }, 19, 11);
    const nine = mod.rasterSprite({ image, scaling: { type: 'nine_slice', width: 8, height: 8, border: { left: 2, right: 1, top: 1, bottom: 2 } } }, 19, 11);
    const small = mod.rasterSprite({ image, scaling: { type: 'nine_slice', width: 8, height: 8, border: { left: 2, right: 1, top: 1, bottom: 2 } } }, 3, 3);
    const stretch = mod.rasterSprite({ image, scaling: { type: 'stretch' } }, 16, 16);
    const cache = new mod.SpriteRasterCache(); const s = { image, scaling: { type: 'tile' as const, width: 8, height: 8 } };
    const a = cache.get('test', s, 19, 11), b = cache.get('test', s, 19, 11), d = cache.get('test', s, 20, 11); cache.clear(); image.close();
    return { tiled: [pixel(tile, 0, 0), pixel(tile, 8, 8), pixel(tile, 18, 10)], corners: [pixel(nine, 0, 0), pixel(nine, 18, 0), pixel(nine, 0, 10), pixel(nine, 18, 10)], small: pixel(small, 0, 0), stretch: pixel(stretch, 0, 0), reuse: a === b && a !== d };
  });
  expect(result.tiled).toEqual([[0,0,60,255],[0,0,60,255],[60,60,60,255]]);
  expect(result.corners).toEqual([[0,0,60,255],[210,0,60,255],[0,210,60,255],[210,210,60,255]]);
  expect(result.small).toEqual([0,0,60,255]); expect(result.stretch).toEqual([0,0,60,255]); expect(result.reuse).toBe(true);
});

test('decoded sprite states update the real editor without changing its document', async ({ page }) => {
  await page.goto('/');
  const colors = ['#f00000', '#00ee00', '#0000ee', '#eeee00', '#ee00ee'];
  const images = await page.evaluate(async colors => Promise.all(colors.map(async color => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8; const ctx = c.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 8, 8);
    return c.toDataURL('image/png').split(',')[1];
  })), colors);
  const pngPath = (id: string) => `assets/minecraft/textures/gui/sprites/${id.slice(10)}.png`;
  const jar = zipFixture([{ name: 'version.json', data: JSON.stringify({ id:'1.21.1', pack_version:{ resource:34 } }) },
    { name:'assets/minecraft/atlases/gui.json', data:JSON.stringify({ sources:[{ type:'directory', source:'gui/sprites', prefix:'' }] }) },
    ...GUI_SPRITES.flatMap((id, i) => [{ name: pngPath(id), data: Buffer.from(images[i], 'base64') }, { name: pngPath(id) + '.mcmeta', data: JSON.stringify({gui:{scaling:{type:'nine_slice',width:8,height:8,border:2}}}) }])]);
  const doc = emptyProject(), button = createNode('minecraft:button', 'button', { x: 20, y: 20 }), edit = createNode('minecraft:edit-box', 'edit', { x: 20, y: 60 });
  doc.screens[0].nodes.push(button, edit);
  await page.getByLabel('导入项目文件').setInputFiles({ name:'project.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(doc)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  const before = await page.getByTestId('project-json').textContent(), history = await page.getByTestId('history-count').textContent();
  await page.getByText('视图', { exact: true }).click(); await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover(); await page.getByRole('button', { name: '选择已有资源包' }).click(); const panel = page.getByRole('region', { name:'资源包检查' });
  await panel.getByLabel('选择客户端 JAR').setInputFiles({ name:'synthetic.jar', mimeType:'application/java-archive', buffer:jar });
  await expect(panel).toContainText('客户端自报版本符合'); await page.getByRole('button', { name:'关闭资源包检查' }).click();
  const host = page.getByTestId('canvas-host');
  const sample = (x:number,y:number) => host.evaluate((el, {x,y}) => { const canvas = el.querySelector('canvas')!, dpr = canvas.width / canvas.getBoundingClientRect().width, zoom = Number(el.getAttribute('data-zoom'));
    return Array.from(canvas.getContext('2d')!.getImageData(Math.floor((Number(el.getAttribute('data-origin-x')) + (x + .5) * zoom) * dpr), Math.floor((Number(el.getAttribute('data-origin-y')) + (y + .5) * zoom) * dpr), 1, 1).data); }, {x,y});
  const move = async (x:number,y:number) => { const box = (await host.boundingBox())!, ox = Number(await host.getAttribute('data-origin-x')), oy = Number(await host.getAttribute('data-origin-y')), z = Number(await host.getAttribute('data-zoom')); await page.mouse.move(box.x + ox + x * z, box.y + oy + y * z); };
  await page.mouse.move(0, 0); await expect.poll(() => sample(22,22)).toEqual([240,0,0,255]); await expect.poll(() => sample(22,62)).toEqual([238,238,0,255]);
  for (const zoom of ['0.5', '1', '2']) {
    await page.getByLabel('Zoom', { exact: true }).selectOption(zoom); await page.getByLabel('Pan X', { exact: true }).fill('0.37'); await page.getByLabel('Pan Y', { exact: true }).fill('0.37');
    await expect.poll(() => sample(24,24)).toEqual([240,0,0,255]);
    for (const x of [21, 22, 23, 25, 166, 167, 168]) await expect.poll(() => sample(x,22)).toEqual([240,0,0,255]);
  }
  await page.getByLabel('Pan X', { exact: true }).fill('0'); await page.getByLabel('Pan Y', { exact: true }).fill('0');
  await page.locator('.screen-settings summary').click(); await page.getByRole('button', { name:'预览游戏缩放' }).click();
  await expect(host).toHaveAttribute('data-preview', 'true'); await expect.poll(() => sample(24,24)).toEqual([240,0,0,255]);
  await page.getByRole('button', { name:'返回设计模式' }).click(); await page.locator('.screen-settings summary').click();
  await move(24,24); await expect.poll(() => sample(22,22)).toEqual([0,238,0,255]);
  await move(24,64); await expect.poll(() => sample(22,62)).toEqual([238,238,0,255]);
  expect(await page.getByTestId('project-json').textContent()).toBe(before); expect(await page.getByTestId('history-count').textContent()).toBe(history);
  await page.mouse.dblclick(...await (async () => { const box=(await host.boundingBox())!, ox=Number(await host.getAttribute('data-origin-x')), oy=Number(await host.getAttribute('data-origin-y')), z=Number(await host.getAttribute('data-zoom')); return [box.x+ox+30*z,box.y+oy+66*z] as [number,number]; })());
  await expect.poll(() => sample(22,62)).toEqual([238,0,238,255]);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name:'选择 button' }).click(); await page.getByLabel('启用初态').uncheck();
  await expect.poll(() => sample(22,22)).toEqual([0,0,238,255]);
  await page.getByRole('button', { name:'选择 edit' }).click(); await page.getByLabel('显示边框').uncheck();
  await expect.poll(() => sample(22,62)).toEqual([28,38,52,255]);
  const docBeforeSwitch = await page.getByTestId('project-json').textContent(), historyBeforeSwitch = await page.getByTestId('history-count').textContent();
  const override = zipFixture([{ name:'pack.mcmeta', data:JSON.stringify({pack:{pack_format:34,description:'synthetic'}}) }, { name:pngPath(GUI_SPRITES[2]), data:Buffer.from(images[0], 'base64') }]);
  await showScreenControls(page); await page.getByText('视图', { exact: true }).click(); await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover(); await page.getByRole('button', { name: '选择已有资源包' }).click(); await panel.getByLabel('选择资源包 ZIP').setInputFiles({name:'new.zip',mimeType:'application/zip',buffer:override});
  await expect(panel).toContainText('当前资源层：new.zip'); await expect.poll(() => sample(22,22)).toEqual([240,0,0,255]);
  expect(await page.getByTestId('project-json').textContent()).toBe(docBeforeSwitch); expect(await page.getByTestId('history-count').textContent()).toBe(historyBeforeSwitch);
  await panel.getByRole('button', { name:'清除会话' }).click();
  await expect(host).toContainText('中性近似预览');
});

test('invalid PNG decoding is visible and preserves editing', async ({ page }) => {
  await page.goto('/');
  const header = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(header); header.writeUInt32BE(13, 8); header.write('IHDR', 12); header.writeUInt32BE(8, 16); header.writeUInt32BE(8, 20);
  const jar = zipFixture([{ name:'version.json', data:JSON.stringify({ id:'1.21.1', pack_version:{ resource:34 } }) },
    { name:'assets/minecraft/atlases/gui.json', data:JSON.stringify({ sources:[{ type:'directory', source:'gui/sprites', prefix:'' }] }) },
    ...GUI_SPRITES.map(id => ({ name:`assets/minecraft/textures/gui/sprites/${id.slice(10)}.png`, data:header }))]);
  await page.getByText('视图', { exact: true }).click(); await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover(); await page.getByRole('button', { name: '选择已有资源包' }).click();
  await page.getByLabel('选择客户端 JAR').setInputFiles({ name:'broken.jar', mimeType:'application/java-archive', buffer:jar });
  await expect(page.locator('.sprite-diagnostics')).toContainText('PNG 解码失败');
  await page.getByRole('button', { name:'添加 Button', exact:true }).click();
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].nodes).toHaveLength(1);
});

test('sample cached texture draw cost for 300 synthetic nodes', async ({ page }, info) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const mod = await (new Function('return import("/src/render/spritePreview.ts")')() as Promise<typeof import('../src/render/spritePreview')>);
    const original = document.createElement('canvas'); original.width = 16; original.height = 16; original.getContext('2d')!.fillRect(0,0,16,16);
    const blob = await new Promise<Blob>(resolve => original.toBlob(value => resolve(value!), 'image/png'));
    const decodeStart = performance.now(); const image = await createImageBitmap(blob); const decodeMs = performance.now() - decodeStart;
    const sprite = { image, scaling:{type:'nine_slice' as const,width:16,height:16,border:{left:2,right:2,top:2,bottom:2}} };
    const cache = new mod.SpriteRasterCache(), canvas=document.createElement('canvas'); canvas.width=800; canvas.height=600; const ctx=canvas.getContext('2d')!;
    const start=performance.now(); const raster=cache.get('sample',sprite,24,16); const creationMs=performance.now()-start; const samples:number[]=[];
    for(let pass=0;pass<5;pass++){ const t=performance.now(); for(let frame=0;frame<20;frame++){ctx.clearRect(0,0,800,600); for(let i=0;i<300;i++)ctx.drawImage(cache.get('sample',sprite,24,16),(i%25)*28,Math.floor(i/25)*20); } samples.push(performance.now()-t); }
    const reused = raster === cache.get('sample',sprite,24,16); cache.clear(); image.close(); return { decodeMs, creationMs, msPer20Frames:samples, reused };
  });
  console.log(JSON.stringify(result)); await info.attach('sprite-performance.json', { body:JSON.stringify(result), contentType:'application/json' }); expect(result.reused).toBe(true);
});

test('late PNG decode cannot replace textures from a newer resource session', async ({ page }) => {
  await page.addInitScript(() => {
    const decode = window.createImageBitmap.bind(window);
    window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => {
      const delayed = (window as unknown as { slowDecode?: boolean }).slowDecode;
      const result = decode(...args);
      return delayed ? result.then(async bitmap => { await new Promise(resolve => setTimeout(resolve, 500)); return bitmap; }) : result;
    }) as typeof createImageBitmap;
  });
  await page.goto('/');
  const images = await page.evaluate(() => ['#f00000','#0000ee'].map(color => { const c=document.createElement('canvas'); c.width=8;c.height=8; const x=c.getContext('2d')!;x.fillStyle=color;x.fillRect(0,0,8,8); return c.toDataURL('image/png').split(',')[1]; }));
  const make = (index:number) => zipFixture([{ name:'version.json',data:JSON.stringify({id:'1.21.1',pack_version:{resource:34}}) },
    { name:'assets/minecraft/atlases/gui.json',data:JSON.stringify({sources:[{type:'directory',source:'gui/sprites',prefix:''}]}) },
    ...GUI_SPRITES.map(id=>({name:`assets/minecraft/textures/gui/sprites/${id.slice(10)}.png`,data:Buffer.from(images[index],'base64')}))]);
  await page.getByRole('button', {name:'添加 Button',exact:true}).click(); await showScreenControls(page); await page.getByText('视图', { exact: true }).click(); await page.getByLabel('编辑器菜单').getByText('资源包检查', { exact: true }).hover(); await page.getByRole('button', { name: '选择已有资源包' }).click();
  const panel=page.getByRole('region',{name:'资源包检查'});
  await page.evaluate(() => { (window as unknown as { slowDecode: boolean }).slowDecode = true; });
  await panel.getByLabel('选择客户端 JAR').setInputFiles({name:'old.jar',mimeType:'application/java-archive',buffer:make(0)}); await expect(panel).toContainText('基础资源：old.jar');
  await page.waitForTimeout(100); await page.evaluate(() => { (window as unknown as { slowDecode: boolean }).slowDecode = false; });
  await panel.getByLabel('选择客户端 JAR').setInputFiles({name:'new.jar',mimeType:'application/java-archive',buffer:make(1)}); await expect(panel).toContainText('基础资源：new.jar');
  await panel.getByRole('button',{name:'关闭资源包检查'}).click(); await page.mouse.move(0,0);
  const host=page.getByTestId('canvas-host'); const sample=() => host.evaluate(el=>{const c=el.querySelector('canvas')!,d=c.width/c.getBoundingClientRect().width,z=Number(el.getAttribute('data-zoom'));
    return Array.from(c.getContext('2d')!.getImageData(Math.floor((Number(el.getAttribute('data-origin-x'))+18.5*z)*d),Math.floor((Number(el.getAttribute('data-origin-y'))+18.5*z)*d),1,1).data);});
  await expect.poll(sample).toEqual([0,0,238,255]); await page.waitForTimeout(700); expect(await sample()).toEqual([0,0,238,255]);
});
