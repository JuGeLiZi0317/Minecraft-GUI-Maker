import { expect, test } from '@playwright/test';
import { packFiles, zipFixture, meta } from './resource-fixtures';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

test('browser ZIP and selected-directory adapter, cancellation and atomic failure', async ({ page }) => {
  const zip = Array.from(zipFixture(packFiles()));
  await page.goto('/');
  const result = await page.evaluate(async ({ zip, meta }) => {
    const m = await (new Function('return import("/src/resources/core.ts")')() as Promise<typeof import('../src/resources/core')>);
    const manager = new m.ResourceSessionManager();
    const old = await manager.replace({ kind: 'zip', blob: new Blob([Uint8Array.from(zip)]) }, 'zip');
    const payload = new TextDecoder().decode(await old.read('assets/example/test.txt'));
    const files = [new File([meta], 'pack.mcmeta'), new File(['folder'], 'a.txt')];
    Object.defineProperty(files[0], 'webkitRelativePath', { value: 'chosen/pack.mcmeta' });
    Object.defineProperty(files[1], 'webkitRelativePath', { value: 'chosen/assets/example/a.txt' });
    const directory = await m.prepareSession(m.directoryFiles(files), 'folder');
    const folder = new TextDecoder().decode(await directory.read('assets/example/a.txt'));
    let failed = false, cancelled = false;
    try { await manager.replace({ kind: 'zip', blob: new Blob([new Uint8Array([1, 2, 3])]) }, 'bad'); } catch { failed = manager.current === old; }
    const controller = new AbortController();
    const slow = new Blob(['data']);
    slow.stream = () => new ReadableStream<Uint8Array<ArrayBuffer>>({ start(c) { setTimeout(() => { try { c.enqueue(new Uint8Array([1])); c.close(); } catch { /* cancelled */ } }, 100); } });
    const task = manager.replace({ kind: 'directory', files: [{ path: 'pack.mcmeta', file: slow }, { path: 'assets/example/a', file: new Blob(['x']) }] }, 'cancel', controller.signal);
    setTimeout(() => controller.abort(), 10);
    try { await task; } catch (error) { cancelled = (error as { code?: string }).code === 'cancelled' && manager.current === old; }
    directory.close(); manager.close();
    return { payload, folder, failed, cancelled };
  }, { zip, meta });
  expect(result).toEqual({ payload: 'synthetic payload', folder: 'folder', failed: true, cancelled: true });
});

test('browser webkitdirectory file input produces root-relative paths', async ({ page }, info) => {
  const root = info.outputPath('synthetic-pack'); await mkdir(join(root, 'assets', 'example'), { recursive: true });
  await writeFile(join(root, 'pack.mcmeta'), meta); await writeFile(join(root, 'assets', 'example', 'a.txt'), 'directory input');
  await page.goto('/'); await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'test-directory'; input.setAttribute('webkitdirectory', ''); document.body.appendChild(input); });
  await page.locator('#test-directory').setInputFiles(root);
  const result = await page.evaluate(async () => {
    const m = await (new Function('return import("/src/resources/core.ts")')() as Promise<typeof import('../src/resources/core')>);
    const files = Array.from((document.querySelector('#test-directory') as HTMLInputElement).files!);
    const s = await m.prepareSession(m.directoryFiles(files), 'selected');
    const value = new TextDecoder().decode(await s.read('assets/example/a.txt')); s.close();
    return { count: files.length, hasRelativePaths: files.every(file => file.webkitRelativePath.startsWith('synthetic-pack/')), value };
  });
  expect(result).toEqual({ count: 2, hasRelativePaths: true, value: 'directory input' });
});

test('browser counts real deflate output and rejects a forged size', async ({ page }, info) => {
  const data = randomBytes(2 * 1024 * 1024);
  const valid = zipFixture([{ name: 'pack.mcmeta', data: meta }, { name: 'assets/example/data.bin', data, deflate: true }]);
  const forged = Buffer.from(valid), first = forged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), 30), second = forged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), first + 4), local = forged.readUInt32LE(second + 42);
  forged.writeUInt32LE(1024, second + 24); forged.writeUInt32LE(1024, local + 22);
  await page.goto('/');
  const result = await page.evaluate(async ({ good, bad }) => {
    const m = await (new Function('return import("/src/resources/core.ts")')() as Promise<typeof import('../src/resources/core')>);
    const bytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const start = performance.now(), s = await m.prepareSession({ kind: 'zip', blob: new Blob([bytes(good)]) }, 'benchmark');
    const length = (await s.read('assets/example/data.bin')).length; s.close();
    let message = ''; try { await m.prepareSession({ kind: 'zip', blob: new Blob([bytes(bad)]) }, 'forged'); } catch (e) { message = (e as Error).message; }
    return { length, message, elapsedMs: performance.now() - start };
  }, { good: valid.toString('base64'), bad: forged.toString('base64') });
  await info.attach('resource-experiment.json', { body: JSON.stringify({ ...result, compressedBytes: valid.length }), contentType: 'application/json' });
  console.log(JSON.stringify({ ...result, compressedBytes: valid.length }));
  expect(result.length).toBe(data.length); expect(result.message).toContain('实际解压大小');
});
