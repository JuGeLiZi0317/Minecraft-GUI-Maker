import { expect, test } from '@playwright/test';

test('screen controls, project name and draggable sidebars preserve editor state', async ({ page }) => {
  await page.goto('/'); const host=page.getByTestId('canvas-host'); const initial=(await host.boundingBox())!;
  await expect(page.getByLabel('项目名称')).toHaveValue('Untitled interface');
  await page.getByLabel('项目名称').fill('Example GUI'); await page.getByLabel('项目名称').press('Enter');
  await expect(page.getByTestId('history-count')).toHaveText('1 undo / 0 redo');
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!).project.name).toBe('Example GUI');
  await page.getByRole('button',{name:'撤销',exact:true}).click(); await expect(page.getByLabel('项目名称')).toHaveValue('Untitled interface');
  await page.getByRole('button',{name:'重做',exact:true}).click(); await expect(page.getByLabel('项目名称')).toHaveValue('Example GUI');
  await page.getByRole('button',{name:'添加 Button',exact:true}).click(); await expect(page.getByLabel('项目名称')).toBeVisible();
  await expect(page.getByLabel('X',{exact:true})).toBeVisible(); expect((await host.boundingBox())!.height).toBe(initial.height);
  const left=await page.getByRole('separator',{name:'调整组件栏宽度'}).boundingBox(); expect(left).not.toBeNull();
  await page.mouse.move(left!.x+4,left!.y+100);await page.mouse.down();await page.mouse.move(left!.x+54,left!.y+100);await page.mouse.up();
  await expect.poll(async ()=>(await host.boundingBox())!.width).toBeLessThan(initial.width-30);
  const afterLeft=(await host.boundingBox())!;const right=await page.getByRole('separator',{name:'调整属性栏宽度'}).boundingBox();expect(right).not.toBeNull();
  await page.mouse.move(right!.x+4,right!.y+100);await page.mouse.down();await page.mouse.move(right!.x-46,right!.y+100);await page.mouse.up();
  await expect.poll(async ()=>(await host.boundingBox())!.width).toBeLessThan(afterLeft.width-30);
  await page.getByRole('button',{name:'收起属性栏'}).click();await page.getByRole('button',{name:'展开属性栏'}).click();
  await expect(page.getByLabel('X',{exact:true})).toBeVisible();
  await host.click({position:{x:20,y:100}});await expect(page.getByLabel('项目名称')).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('已保存'); await page.reload(); await expect(page.getByLabel('项目名称')).toHaveValue('Example GUI');
});

test('project name commits on blur and invalid draft blocks export', async ({ page }) => {
  await page.goto('/');
  const name = page.getByLabel('项目名称');
  await name.fill('Blur saved');
  await name.blur();
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!).project.name).toBe('Blur saved');
  await name.fill('   ');
  await page.getByRole('button', { name: '导出规格', exact: true }).click();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('项目名称不能为空').first()).toBeVisible();
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!).project.name).toBe('Blur saved');
  await expect(page.locator('.export-links a')).toHaveCount(0);
});
