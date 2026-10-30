import { expect, test } from '@playwright/test';
import { createNode, emptyProject } from '../src/domain/model';

test('a noninitial tab can be edited without changing its initial selection', async ({ page }) => {
 const doc=emptyProject(); doc.schemaVersion='0.11.0'; const a=createNode('minecraft:creative-tab','tab_a',{x:10,y:10}),b=createNode('minecraft:creative-tab','tab_b',{x:50,y:10}); if(a.type!=='minecraft:creative-tab'||b.type!=='minecraft:creative-tab') throw Error();
 a.props.groupId='tabs';a.props.contentIds=['content_a'];a.props.selected=true; b.props.groupId='tabs';b.props.contentIds=['content_b'];b.props.selected=false;
 doc.screens[0].nodes=[a,b,createNode('minecraft:fill','content_a',{x:10,y:80}),createNode('minecraft:fill','content_b',{x:140,y:80})];
 await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))}); await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
 const view=page.getByLabel('标签编辑视图'), button=view.getByRole('button',{name:/编辑 CreativeTab · tab_b/}); await button.click(); await expect(button).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'选择 content_b'}).click(); await expect(page.getByLabel('标签内容归属')).toContainText('tab_b'); await page.getByLabel('X',{exact:true}).fill('150'); await page.getByLabel('X',{exact:true}).press('Enter');
 const read=async()=>JSON.parse((await page.getByTestId('project-json').textContent())!); expect((await read()).screens[0].nodes[3].bounds.x).toBe(150); expect((await read()).screens[0].nodes[0].props.selected).toBe(true); await expect(button).toHaveAttribute('aria-pressed','true');
 await page.locator('.studio-footer').click(); await page.keyboard.press('Control+z'); expect(await read()).toEqual(doc); await expect(button).toHaveAttribute('aria-pressed','true');
});
