import { test, expect } from '@playwright/test';

test('local client font definitions and bitmap can be read by existing resource index', async ({ page }, info) => {
  const jar=process.env.GUI_CLIENT_JAR;test.skip(!jar,'需要本机客户端 JAR');
  await page.goto('/'); await page.evaluate(()=>{const input=document.createElement('input');input.id='font-client';input.type='file';document.body.appendChild(input);});
  await page.locator('#font-client').setInputFiles(jar!);
  const result=await page.evaluate(async()=>{
    const core=await(new Function('return import("/src/resources/core.ts")')() as Promise<typeof import('../src/resources/core')>);
    const file=(document.querySelector('#font-client') as HTMLInputElement).files![0],session=await core.prepareClient(file,'local');
    const definition=JSON.parse(new TextDecoder().decode(await session.read('assets/minecraft/font/default.json')));
    const fallback=JSON.parse(new TextDecoder().decode(await session.read('assets/minecraft/font/include/unifont.json')));
    const bytes=await session.read('assets/minecraft/textures/font/ascii.png'),bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
    const output={providers:definition.providers.map((p:{type:string;id?:string;filter?:unknown})=>({type:p.type,id:p.id,filter:p.filter})),unifontProviders:fallback.providers.length,ascii:[bitmap.width,bitmap.height],asciiBytes:bytes.length,
      missing:session.query('assets/minecraft/font/unifont.zip').status};bitmap.close();session.close();return output;
  });
  console.log(JSON.stringify(result));await info.attach('font-resource-summary.json',{body:JSON.stringify(result),contentType:'application/json'});
  expect(result.providers.map((p:{id:string})=>p.id)).toEqual(['minecraft:include/space','minecraft:include/default','minecraft:include/unifont']);
  expect(result.unifontProviders).toBe(0); expect(result.ascii).toEqual([128,128]);expect(result.missing).toBe('missing');
});
