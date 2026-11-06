import {expect,test} from '@playwright/test';

test('header theme shortcut toggles, supports keyboard, persists and leaves design and geometry unchanged',async({page})=>{
 await page.goto('/');const button=page.locator('.app-header').getByRole('button',{name:'切换主题',exact:true});
 const doc=await page.getByTestId('project-json').textContent(),host=await page.getByTestId('canvas-host').boundingBox();
 await expect(button).toHaveAttribute('aria-pressed','true');await button.click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(button).toHaveAttribute('aria-pressed','false');
 await button.press('Enter');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await button.press('Space');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 expect(await page.getByTestId('project-json').textContent()).toBe(doc);expect(await page.getByTestId('canvas-host').boundingBox()).toEqual(host);
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(button).toHaveAttribute('aria-pressed','false');
});

test('shortcut flips the resolved system theme and remains accessible in Blockly and compact exported layouts',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});await page.goto('/');
 await page.getByRole('navigation',{name:'编辑器菜单'}).getByText('视图',{exact:true}).click();await page.getByRole('button',{name:'主题：跟随系统',exact:true}).click();
 const button=page.locator('.app-header').getByRole('button',{name:'切换主题',exact:true});await expect(button).toHaveAttribute('title',/跟随系统/);await button.click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');expect(await page.evaluate(()=>localStorage.getItem('minecraft-gui-maker.theme.v1'))).toBe('dark');
 await page.getByRole('button',{name:'Blockly 实验',exact:true}).click();await expect(page.getByTestId('blockly-workspace')).toBeVisible();await button.click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.getByTestId('blockly-workspace')).toBeVisible();
 await page.getByRole('button',{name:'GUI 设计模式',exact:true}).click();await page.getByRole('button',{name:'导出规格',exact:true}).click();await expect(page.locator('.export-links a')).toHaveCount(7);await page.getByRole('button',{name:'关闭导出结果',exact:true}).click();
 for(const width of [1440,1280,900,400]){await page.setViewportSize({width,height:1000});await expect(button).toBeInViewport();const r=(await button.boundingBox())!;expect(r.x+r.width).toBeLessThanOrEqual(width);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);}
});
