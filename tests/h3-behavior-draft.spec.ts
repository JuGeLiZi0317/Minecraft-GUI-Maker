import { expect, test } from '@playwright/test';
test('Behavior draft blocks Screen switch and import until explicitly canceled', async ({page})=>{
 await page.goto('/'); await page.getByRole('button',{name:'新增画布'}).click();
 const screen=page.getByLabel('当前画布',{exact:true}); await screen.selectOption('screen_main');
 await page.getByRole('button',{name:'行为',exact:true}).click(); const panel=page.getByTestId('behavior-panel');
 await panel.getByRole('button',{name:'新增规则'}).click(); await expect(panel.getByRole('button',{name:'保存规则'})).toBeVisible();
 const project=(await page.getByTestId('project-json').textContent())!;
 await screen.selectOption('screen_1'); await expect(screen).toHaveValue('screen_main'); await expect(page.locator('.statusbar [role=alert]')).toContainText('行为面板有未保存草稿');
 await page.getByRole('button',{name:'导出规格',exact:true}).click(); await expect(page.locator('.statusbar [role=alert]')).toContainText('行为面板有未保存草稿');
 await page.getByLabel('导入项目文件').setInputFiles({name:'same.json',mimeType:'application/json',buffer:Buffer.from(project)});
 await expect(page.locator('.statusbar [role=alert]')).toContainText('行为面板有未保存草稿'); expect(await page.getByTestId('project-json').textContent()).toBe(project);
 await panel.getByRole('button',{name:'关闭行为',exact:true}).click(); await page.getByRole('button',{name:'行为',exact:true}).click();
 await expect(panel.getByRole('button',{name:'保存规则'})).toBeVisible(); await panel.getByRole('button',{name:'取消编辑'}).click();
 await screen.selectOption('screen_1'); await expect(screen).toHaveValue('screen_1');
});
