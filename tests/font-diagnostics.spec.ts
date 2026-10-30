import { test, expect } from '@playwright/test';
import { emptyProject, createNode } from '../src/domain/model';
import { writeFile } from 'node:fs/promises';

test('diagnose preview and PNG text at zoom and DPR', async ({page}, info) => {
  await page.goto('/');
  const doc=emptyProject(), node=createNode('minecraft:string-widget','sample',{x:30,y:30});
  if(node.type!=='minecraft:string-widget') throw new Error('wrong node');
  node.bounds={x:30,y:30,w:200,h:24};
  node.props.text={kind:'literal',value:'Hello 123! 中文 Ab.'}; node.props.align='center'; node.props.color='#FFE5E7EB';
  doc.screens[0].nodes.push(node);
  await page.getByLabel('导入项目文件').setInputFiles({name:'doc.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
  await page.getByLabel('选择预览字体').setInputFiles('C:/Windows/Fonts/arial.ttf');
  await expect(page.getByTestId('font-status')).toContainText('用户字体');
  await page.getByRole('button',{name:'导出规格',exact:true}).click();
  await expect(page.locator('.export-links a')).toHaveCount(6);
  const png=await page.locator('.export-links a').nth(1).evaluate(async a => Array.from(new Uint8Array(await (await fetch((a as HTMLAnchorElement).href)).arrayBuffer())));
  await writeFile(info.outputPath('design.png'),Buffer.from(png));
  await page.getByRole('button',{name:'关闭导出结果'}).click();
  for(const zoom of [0.5,1,2]) {
    await page.getByLabel('Zoom',{exact:true}).selectOption(String(zoom));
    await page.mouse.move(1,1); await page.waitForTimeout(100);
    const result=await page.evaluate(async ({png,zoom})=>{
      const host=document.querySelector('[data-testid=canvas-host]') as HTMLElement, c=host.querySelector('canvas')!, dpr=c.width/c.getBoundingClientRect().width;
      const bitmap=await createImageBitmap(new Blob([new Uint8Array(png)],{type:'image/png'}));
      const w=200,h=24, px=Math.round(w*zoom*dpr),py=Math.round(h*zoom*dpr);
      const a=document.createElement('canvas');a.width=px;a.height=py;const ac=a.getContext('2d')!;
      ac.drawImage(c,(Number(host.dataset.originX)+30*zoom)*dpr,(Number(host.dataset.originY)+30*zoom)*dpr,px,py,0,0,px,py);
      const b=document.createElement('canvas');b.width=px;b.height=py;const bc=b.getContext('2d')!;
      bc.fillStyle='#1c2634';bc.fillRect(0,0,px,py);bc.imageSmoothingEnabled=false;bc.drawImage(bitmap,30,30,w,h,0,0,px,py);bitmap.close();
      const ad=ac.getImageData(0,0,px,py).data,bd=bc.getImageData(0,0,px,py).data;
      const mask=(data:Uint8ClampedArray,x:number,y:number)=>{const k=(y*px+x)*4;return Math.max(data[k],data[k+1],data[k+2])>130};
      const box=(data:Uint8ClampedArray)=>{let minx=px,miny=py,maxx=-1,maxy=-1,count=0;for(let y=0;y<py;y++)for(let x=0;x<px;x++)if(mask(data,x,y)){minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);count++}return {minx,miny,maxx,maxy,count}};
      let best={dx:0,dy:0,mismatch:Infinity},same=0;const diff=document.createElement('canvas');diff.width=px;diff.height=py;const dc=diff.getContext('2d')!,im=dc.createImageData(px,py);
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){let mismatch=0;for(let y=0;y<py;y++)for(let x=0;x<px;x++){const xx=x+dx,yy=y+dy,aa=mask(ad,x,y),bb=xx>=0&&yy>=0&&xx<px&&yy<py&&mask(bd,xx,yy);if(aa!==bb)mismatch++;if(!dx&&!dy){const k=(y*px+x)*4;im.data[k]=aa&&!bb?255:0;im.data[k+1]=aa&&bb?255:0;im.data[k+2]=bb&&!aa?255:0;im.data[k+3]=255}}if(!dx&&!dy)same=mismatch;if(mismatch<best.mismatch)best={dx,dy,mismatch}}
      dc.putImageData(im,0,0);return {dpr,zoom,canvas:box(ad),png:box(bd),same,best,preview:a.toDataURL(),reference:b.toDataURL(),diff:diff.toDataURL()};
    },{png,zoom});
    for(const kind of ['preview','reference','diff'] as const) await writeFile(info.outputPath(`${zoom}-${kind}.png`),Buffer.from(result[kind].split(',')[1],'base64'));
    expect(result.canvas.count).toBeGreaterThan(0); expect(result.png.count).toBeGreaterThan(0);
    console.log(JSON.stringify({...result,preview:undefined,reference:undefined,diff:undefined}));
  }
});
