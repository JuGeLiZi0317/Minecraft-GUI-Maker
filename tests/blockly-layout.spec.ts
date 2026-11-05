import { expect, test } from '@playwright/test';
import { blocklyProject, sharedStatusRule } from './fixtures/blocklyProject';

test('saved rule layout persists across reload without changing project JSON; corrupt cache falls back', async ({ page }) => {
  const project = blocklyProject(); project.schemaVersion = '0.31.0'; project.screens[0].behaviors.push(sharedStatusRule());
  await page.goto('/');
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  const editor = page.getByTestId('blockly-editor');
  await editor.getByLabel('Blockly 规则').selectOption('rule_shared');
  const id = await page.evaluate(async()=>{const path=performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('/blockly_core.js?'))!;const b=await import(path);return b.common.getMainWorkspace().getTopBlocks(false)[0].id as string});
  const root = editor.locator(`[data-block-id="${id}"]`);
  await expect(root).toBeVisible();
  const before = await page.getByTestId('project-json').textContent();
  await page.evaluate(async()=>{const path=performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('/blockly_core.js?'))!;const b=await import(path);b.common.getMainWorkspace().getTopBlocks(false)[0].moveBy(120,80)});
  await expect(editor.getByRole('button', { name: '保存积木规则' })).toBeDisabled();
  expect(await page.getByTestId('project-json').textContent()).toBe(before);
  await expect.poll(async () => page.evaluate(async () => { const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('minecraft-gui-maker-blockly-layouts'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); return await new Promise<number>((resolve) => { const r=db.transaction('layouts').objectStore('layouts').count(); r.onsuccess=()=>resolve(r.result); }); })).toBeGreaterThan(0);
  const transform = await root.getAttribute('transform');
  await page.reload(); await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await editor.getByLabel('Blockly 规则').selectOption('rule_shared');
  await expect(editor).toContainText('已恢复本机 Blockly 布局');
  await expect(root).toHaveAttribute('transform', transform!);
  await page.evaluate(async () => { const db=await new Promise<IDBDatabase>(resolve=>{ const r=indexedDB.open('minecraft-gui-maker-blockly-layouts'); r.onsuccess=()=>resolve(r.result); }); await new Promise<void>(resolve=>{ const tx=db.transaction('layouts','readwrite'); const store=tx.objectStore('layouts'); const req=store.openCursor(); req.onsuccess=()=>{ const c=req.result; if(c){ c.update({broken:true}); c.continue(); } }; tx.oncomplete=()=>resolve(); }); });
  await page.reload(); await page.getByRole('button', { name: 'Blockly 实验', exact: true }).click();
  await editor.getByLabel('Blockly 规则').selectOption('rule_shared');
  await expect(editor).toContainText('布局快照无效或不兼容');
  expect(await page.getByTestId('project-json').textContent()).toBe(before);
});

test('comments and collapsed state restore and changed rule invalidates layout', async ({ page }) => {
  const project = blocklyProject(); project.schemaVersion = '0.31.0'; project.screens[0].behaviors.push(sharedStatusRule());
  await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({ name:'project.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功');
  await page.getByRole('button', { name:'Blockly 实验', exact:true }).click();
  const editor=page.getByTestId('blockly-editor'); await editor.getByLabel('Blockly 规则').selectOption('rule_shared');
  await page.evaluate(async () => { const path=performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('/blockly_core.js?'))!; const b=await import(path); const ws=b.common.getMainWorkspace(); const block=ws.getTopBlocks(false)[0]; block.setCommentText('保存的注释'); block.setCollapsed(true); });
  await expect(editor.getByRole('button', { name:'保存积木规则' })).toBeDisabled();
  await expect.poll(async () => page.evaluate(async () => { const path=performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('/blockly_core.js?'))!; const b=await import(path); return b.serialization.workspaces.save(b.common.getMainWorkspace()).blocks.blocks[0].collapsed; })).toBe(true);
  await page.waitForTimeout(500); await page.reload(); await page.getByRole('button', { name:'Blockly 实验', exact:true }).click();
  await editor.getByLabel('Blockly 规则').selectOption('rule_shared'); await expect(editor).toContainText('已恢复本机 Blockly 布局');
  const block = await page.evaluate(async () => { const path=performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('/blockly_core.js?'))!; const b=await import(path); const block=b.common.getMainWorkspace().getTopBlocks(false)[0]; return { collapsed:block.isCollapsed(), comment:block.getCommentText() }; });
  expect(block).toEqual({collapsed:true,comment:'保存的注释'});
  // Tamper the cache fingerprint as a proxy for an F2 rule or map edit, without changing the authority.
  await page.evaluate(async () => { const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('minecraft-gui-maker-blockly-layouts');r.onsuccess=()=>resolve(r.result)}); await new Promise<void>(resolve=>{const tx=db.transaction('layouts','readwrite'),r=tx.objectStore('layouts').openCursor();r.onsuccess=()=>{const c=r.result;if(c){c.update({...c.value,fingerprint:'stale'});c.continue()}};tx.oncomplete=()=>resolve()}) });
  await page.reload(); await page.getByRole('button',{name:'Blockly 实验',exact:true}).click(); await editor.getByLabel('Blockly 规则').selectOption('rule_shared');
  await expect(editor).toContainText('布局快照无效或不兼容');
});


test('saving a semantic edit binds restored layout to the new rule', async ({ page }) => {
  const project=blocklyProject(); project.schemaVersion='0.34.0'; project.screens[0].behaviors.push({ id:'rule_direct', event:{type:'selection-change',sourceId:'node_22'}, actions:[{type:'set-status',targetId:'node_26',statusId:'status_running'}] });
  await page.goto('/'); await page.getByLabel('导入项目文件').setInputFiles({name:'p.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await expect(page.locator('.statusbar [role="status"]')).toContainText('导入成功'); await page.getByRole('button',{name:'Blockly 实验',exact:true}).click();
  const editor=page.getByTestId('blockly-editor'); await editor.getByLabel('Blockly 规则').selectOption('rule_direct');
  await page.evaluate(async()=>{const path=performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('/blockly_core.js?'))!;const b=await import(path);const ws=b.common.getMainWorkspace();const block=ws.getAllBlocks(false).find((x:any)=>x.type==='gui_set_status_direct');block.setFieldValue('status_warning','STATUS');ws.getTopBlocks(false)[0].moveBy(65,45);});
  await expect(editor.getByRole('button',{name:'保存积木规则'})).toBeEnabled(); await editor.getByRole('button',{name:'保存积木规则'}).click();
  await expect.poll(async()=>JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].behaviors.find((r:any)=>r.id==='rule_direct').actions[0].statusId).toBe('status_warning');
  await expect(editor).toContainText('已恢复本机 Blockly 布局');
  await expect(page.getByTestId('save-status')).toContainText('本地已保存');
  await page.reload(); await page.getByRole('button',{name:'Blockly 实验',exact:true}).click(); await editor.getByLabel('Blockly 规则').selectOption('rule_direct'); await expect(editor).toContainText('已恢复本机 Blockly 布局');
  expect(JSON.parse((await page.getByTestId('project-json').textContent())!).screens[0].behaviors.find((r:any)=>r.id==='rule_direct').actions[0].statusId).toBe('status_warning');
});
