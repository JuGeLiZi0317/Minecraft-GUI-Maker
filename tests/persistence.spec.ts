import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { emptyProject, createNode } from '../src/domain/model';
import type { GuiProject } from '../src/domain/schema';
import { showScreenControls } from './workspace-helpers';

const current = async (page: Page): Promise<GuiProject> => JSON.parse((await page.getByTestId('project-json').textContent())!);
const saved = async (page: Page) => { await expect(page.getByTestId('save-status')).toContainText('已保存'); };
async function database(page: Page) {
  return page.evaluate(() => new Promise<{ version: number; rows: any[]; workspace: any; indexed: boolean }>((resolve, reject) => {
    const open = indexedDB.open('minecraft-gui-maker'); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction(['projects', 'workspace']);
      const rows = tx.objectStore('projects').getAll(), workspace = tx.objectStore('workspace').get('active');
      const indexed = tx.objectStore('projects').indexNames.contains('updatedAt');
      tx.oncomplete = () => { resolve({ version: db.version, rows: rows.result, workspace: workspace.result, indexed }); db.close(); };
    };
  }));
}
async function seed(context: BrowserContext, version: number, document: unknown) {
  await context.addInitScript(({ version, document }) => {
    if (sessionStorage.getItem('gui-c-seeded')) return; sessionStorage.setItem('gui-c-seeded', 'yes');
    const request = indexedDB.open('minecraft-gui-maker', version);
    request.onupgradeneeded = () => {
      const p = request.result.createObjectStore('projects', { keyPath: 'localId' });
      if (version >= 2) p.createIndex('updatedAt', 'updatedAt');
      request.result.createObjectStore('workspace', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['projects', 'workspace'], 'readwrite');
      tx.objectStore('projects').put({ localId: 'seed_copy', storageRevision: 3, updatedAt: 123, document });
      tx.objectStore('workspace').put({ key: 'active', localId: 'seed_copy', revision: 7 }); db.close();
    };
  }, { version, document });
}

test('real IndexedDB saves edits/undo and restores on reload without view or history data', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  await page.getByRole('button', { name: '添加 Rectangle', exact: true }).click(); await saved(page);
  await showScreenControls(page); await page.getByRole('button', { name: '撤销', exact: true }).click(); await saved(page);
  const expected = await current(page), before = await database(page);
  await showScreenControls(page);
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.5'); await page.getByLabel('Pan X', { exact: true }).fill('71');
  await page.getByText('设计区与游戏 GUI Scale', { exact: false }).first().click();
  await page.getByLabel('游戏 GUI Scale', { exact: true }).selectOption('3'); await page.getByRole('button', { name: '预览游戏缩放', exact: true }).click();
  await page.waitForTimeout(500); expect((await database(page)).workspace.revision).toBe(before.workspace.revision);
  await page.reload(); await saved(page); expect(await current(page)).toEqual(expected);
  await expect(page.getByTestId('history-count')).toHaveText('0 undo / 0 redo'); await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('2');
  await expect(page.getByTestId('canvas-host')).toHaveAttribute('data-preview', 'false');
  expect(Object.keys((await database(page)).rows[0]).sort()).toEqual(['document', 'localId', 'storageRevision', 'updatedAt']);
});

test('import creates a separate local copy, preserves previous edits and can reopen them', async ({ page }, info) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Button', exact: true }).click();
  const before = await current(page), imported = emptyProject(); imported.project.name = 'Imported copy';
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await saved(page); expect(await current(page)).toEqual(imported);
  const db = await database(page); expect(db.rows).toHaveLength(2);
  const old = db.rows.find(r => r.localId !== db.workspace.localId); expect(old.document).toEqual(before);
  await page.getByText('本地副本与保存说明', { exact: true }).click();
  await page.getByLabel('本地副本', { exact: true }).selectOption(old.localId);
  await page.getByRole('button', { name: '打开本地副本', exact: true }).click(); await saved(page);
  expect(await current(page)).toEqual(before); await page.screenshot({ path: info.outputPath('local-copies.png'), fullPage: true });
  await page.reload(); await saved(page); expect(await current(page)).toEqual(before);
});

test('v1-to-v2 IndexedDB upgrade adds index and preserves seeded document', async ({ page, context }) => {
  const document = emptyProject(); document.project.name = 'Upgrade fixture'; document.screens[0].nodes.push(createNode('minecraft:button', 'legacy_button'));
  await seed(context, 1, document); await page.goto('/'); await saved(page);
  expect(await current(page)).toEqual(document); const db = await database(page);
  expect(db.version).toBe(2); expect(db.indexed).toBe(true); expect(db.rows[0].storageRevision).toBe(3); expect(db.workspace.revision).toBe(7);
});

for (const corruption of ['future-schema', 'corrupt-document']) test(`${corruption} is retained; recovery download and explicit new copy do not overwrite it`, async ({ page, context }) => {
  const bad = corruption === 'future-schema' ? { ...emptyProject(), schemaVersion: '99.0.0' } : { broken: 'no valid project structure' };
  await seed(context, 2, bad); await page.goto('/'); await expect(page.getByTestId('save-status')).toContainText('无法恢复');
  await expect(page.getByRole('button', { name: '添加 Button', exact: true })).toBeDisabled();
  await page.waitForTimeout(500); expect((await database(page)).rows[0].document).toEqual(bad);
  const ev = page.waitForEvent('download'); await page.getByRole('button', { name: '导出原始恢复记录', exact: true }).click(); const dl = await ev;
  const stream = await dl.createReadStream(), buffers = []; for await (const chunk of stream!) buffers.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(buffers).toString()).document).toEqual(bad);
  await page.getByRole('button', { name: '创建新副本（保留原记录）', exact: true }).click(); await saved(page);
  const db = await database(page); expect(db.rows).toHaveLength(2); expect(db.rows.find(r => r.localId === 'seed_copy').document).toEqual(bad);
});

test('invalid import does not create a local copy or modify existing IndexedDB records', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await saved(page);
  const before = await database(page), document = await current(page);
  await page.getByLabel('导入项目文件').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await expect(page.getByRole('alert')).toContainText('导入失败'); await page.waitForTimeout(500);
  expect(await database(page)).toEqual(before); expect(await current(page)).toEqual(document);
});

test('temporarily unavailable IndexedDB keeps memory editable and retries when available', async ({ page, context }) => {
  await context.addInitScript(() => {
    (window as any).__noLocalDb = true;
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args: Parameters<IDBFactory['open']>) {
      if ((window as any).__noLocalDb) throw new DOMException('Blocked by browser settings', 'SecurityError');
      return open.apply(this, args);
    };
  });
  await page.goto('/'); await expect(page.getByTestId('save-status')).toContainText('尚未保存');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); const document = await current(page);
  await page.evaluate(() => (window as any).__noLocalDb = false);
  await showScreenControls(page); await page.getByRole('button', { name: '本地保存状态和副本' }).click(); await page.getByRole('button', { name: '重试本地保存', exact: true }).click(); await saved(page);
  expect((await database(page)).rows[0].document).toEqual(document);
});

test('blocked upgrade preserves memory and retries after old database connection closes', async ({ page, context }) => {
  await context.addInitScript(() => {
    const req = indexedDB.open('minecraft-gui-maker', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('projects', { keyPath: 'localId' }); req.result.createObjectStore('workspace', { keyPath: 'key' }); };
    req.onsuccess = () => (window as any).__heldOldDb = req.result;
  });
  await page.goto('/'); await expect(page.getByTestId('save-status')).toContainText('升级被其他页面阻塞');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); const document = await current(page);
  await page.evaluate(() => (window as any).__heldOldDb.close());
  await expect.poll(async () => (await database(page)).version).toBe(2);
  await showScreenControls(page); await page.getByRole('button', { name: '本地保存状态和副本' }).click(); await page.getByRole('button', { name: '重试本地保存', exact: true }).click(); await saved(page);
  expect((await database(page)).rows[0].document).toEqual(document);
});

for (const fault of ['quota', 'abort']) {
  test(`failed ${fault} transaction preserves persisted data, remains dirty, exports and retries`, async ({ page, context }) => {
    await context.addInitScript(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
        const mode = (window as any).__cFault;
        if (this.name === 'projects' && mode === 'quota') throw new DOMException('Injected quota failure', 'QuotaExceededError');
        const req = put.apply(this, args); if (this.name === 'projects' && mode === 'abort') this.transaction.abort(); return req;
      };
    });
    await page.goto('/'); await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await saved(page);
    const before = await database(page); await page.evaluate(f => (window as any).__cFault = f, fault);
    await page.getByRole('button', { name: '添加 Rectangle', exact: true }).click();
    await expect(page.getByTestId('save-status')).toContainText('尚未保存'); expect(await database(page)).toEqual(before);
    await page.getByRole('button', { name: '添加 StringWidget', exact: true }).click(); expect((await current(page)).screens[0].nodes).toHaveLength(3);
    const event = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON' }).click(); await event;
    await page.evaluate(() => (window as any).__cFault = null); await showScreenControls(page); await page.getByRole('button', { name: '本地保存状态和副本' }).click(); await page.getByRole('button', { name: '重试本地保存', exact: true }).click(); await saved(page);
    expect((await database(page)).rows[0].document.screens[0].nodes).toHaveLength(3);
  });
}

test('Web Locks makes second tab readonly, then permits reconnect after writer closes', async ({ page, context }) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await saved(page);
  const second = await context.newPage(); await second.goto('/'); await expect(second.getByTestId('save-status')).toContainText('此页只读');
  await expect(second.getByRole('button', { name: '添加 Rectangle', exact: true })).toBeDisabled(); expect((await current(second)).screens[0].nodes).toHaveLength(1);
  const backup = second.waitForEvent('download'); await second.getByRole('button', { name: '导出 JSON' }).click(); await backup;
  await page.close(); await second.getByRole('button', { name: '本地保存状态和副本' }).click(); await second.getByRole('button', { name: '重新连接', exact: false }).click(); await saved(second);
  await second.getByRole('button', { name: '添加 Rectangle', exact: true }).click(); await saved(second); expect((await current(second)).screens[0].nodes).toHaveLength(2);
});

test('without Web Locks stale tab CAS cannot overwrite newer saved content', async ({ page, context }) => {
  await context.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }));
  await page.goto('/'); await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await saved(page);
  const second = await context.newPage(); await second.goto('/'); await saved(second);
  await page.getByRole('button', { name: '添加 StringWidget', exact: true }).click(); await saved(page); const winner = await current(page);
  await second.getByRole('button', { name: '添加 Rectangle', exact: true }).click(); await expect(second.getByTestId('save-status')).toContainText('其他页面');
  await expect(second.getByRole('button', { name: '添加 Button', exact: true })).toBeDisabled();
  const db = await database(second); expect(db.rows.find(r => r.localId === db.workspace.localId).document).toEqual(winner);
  expect((await current(second)).screens[0].nodes.at(-1)?.type).toBe('minecraft:fill');
});

test('versionchange closes live connection and freezes editor without losing document', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '添加 Button', exact: true }).click(); await saved(page); const before = await current(page);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('minecraft-gui-maker', 3); req.onsuccess = () => { req.result.close(); resolve(); }; req.onerror = () => reject(req.error);
  }));
  await expect(page.getByTestId('save-status')).toContainText('数据库版本已改变'); await expect(page.getByRole('button', { name: '添加 Button', exact: true })).toBeDisabled();
  expect(await current(page)).toEqual(before); expect((await database(page)).version).toBe(3);
});

test('future database version stays untouched and memory editing/export remain available', async ({ page, context }) => {
  const document = emptyProject(); document.project.name = 'Future database'; await seed(context, 3, document); await page.goto('/');
  await expect(page.getByTestId('save-status')).toContainText('较新应用版本');
  await page.getByRole('button', { name: '添加 Button', exact: true }).click(); expect((await current(page)).screens[0].nodes).toHaveLength(1);
  const db = await database(page); expect(db.version).toBe(3); expect(db.rows[0].document).toEqual(document); expect(db.workspace.revision).toBe(7);
  const backup = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON' }).click(); await backup;
});
