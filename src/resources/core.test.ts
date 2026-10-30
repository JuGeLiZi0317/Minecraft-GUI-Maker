import { describe, expect, it } from 'vitest';
import { LIMITS, ResourceSessionManager, prepareSession } from './core';
import { meta, packFiles, zipFixture } from '../../tests/resource-fixtures';

type Fixture = { name: string; data: string; deflate?: boolean; mode?: number };
const zip = (files: Fixture[] = packFiles()) => ({ kind: 'zip' as const, blob: new Blob([new Uint8Array(zipFixture(files))]) });
const dir = (files: Fixture[] = packFiles()) => ({ kind: 'directory' as const, files: files.map(f => ({ path: f.name, file: new Blob([f.data]) })) });
describe('isolated resource pack sessions', () => {
  it.each([zip, dir])('validates a pack and reads only indexed files (%s)', async make => {
    const session = await prepareSession(make(), 'synthetic');
    expect(session.query('assets/example/test.txt')).toEqual({ status: 'valid', path: 'assets/example/test.txt', layer: 'synthetic', size: 17 });
    expect(new TextDecoder().decode(await session.read('assets/example/test.txt'))).toBe('synthetic payload');
    expect(session.query('assets/example/missing.txt').status).toBe('missing'); expect(session.query('../x').status).toBe('invalid'); session.close();
    expect(session.query('assets/example/test.txt').status).toBe('invalid');
  });
  const invalidFixtures: Fixture[][] = [
    [{ name: 'assets/example/a', data: 'x' }],
    [{ name: 'pack.mcmeta', data: '{' }, { name: 'assets/example/a', data: 'x' }],
    [{ name: 'pack.mcmeta', data: JSON.stringify({ pack: { pack_format: 35, description: 'x' } }) }, { name: 'assets/example/a', data: 'x' }],
    [{ name: 'pack.mcmeta', data: meta }, { name: 'assets/Bad/a', data: 'x' }],
    [{ name: 'pack.mcmeta', data: meta }, { name: '../escape', data: 'x' }, { name: 'assets/example/a', data: 'x' }],
    [{ name: 'pack.mcmeta', data: meta }, { name: 'assets/example/a', data: 'x' }, { name: 'assets/example/a', data: 'x' }],
    [{ name: 'pack.mcmeta', data: meta }, { name: 'assets/example/a', data: 'x' }, { name: 'assets/example/A', data: 'x' }],
    [{ name: 'pack.mcmeta', data: meta }, { name: 'assets/example/a', data: 'x', mode: 0xa000 }],
    [{ name: 'pack.mcmeta', data: meta }, { name: 'assets/example/a.png', data: 'not a png' }],
    [{ name: 'pack.mcmeta', data: JSON.stringify({ pack: { pack_format: 34, description: 'x' }, overlays: {} }) }, { name: 'assets/example/a', data: 'x' }],
  ];
  invalidFixtures.forEach((files, i) => it(`rejects invalid or unsupported fixture ${i}`, async () => { await expect(prepareSession(zip(files), 'test')).rejects.toThrow(); }));
  it('detects damaged CRC and rejects actual decompressed bytes exceeding a forged declared size', async () => {
    const corrupted = zipFixture(packFiles()); const at = corrupted.indexOf(Buffer.from('synthetic payload')); // compressed entry, use a stored fixture instead
    expect(at).toBe(-1);
    const stored = zipFixture([{ name: 'pack.mcmeta', data: meta }, { name: 'assets/example/a', data: 'payload' }]); stored[stored.indexOf(Buffer.from('payload'))] ^= 1;
    await expect(prepareSession({ kind: 'zip', blob: new Blob([new Uint8Array(stored)]) }, 'x')).rejects.toThrow('CRC');
    const forged = zipFixture([{ name: 'pack.mcmeta', data: meta }, { name: 'assets/example/a', data: 'abcdefghijk', deflate: true }]);
    const central = forged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), 30), second = forged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), central + 4);
    const local = forged.readUInt32LE(second + 42); forged.writeUInt32LE(1, second + 24); forged.writeUInt32LE(1, local + 22);
    await expect(prepareSession({ kind: 'zip', blob: new Blob([new Uint8Array(forged)]) }, 'x')).rejects.toThrow('实际解压大小');
  });
  it('rejects oversized input and preserves old session after failed or cancelled replacement', async () => {
    const manager = new ResourceSessionManager(), old = await manager.replace(dir(), 'old');
    await expect(manager.replace(zip([{ name: 'pack.mcmeta', data: '{' }]), 'bad')).rejects.toThrow(); expect(manager.current).toBe(old);
    const abort = new AbortController(); abort.abort(); await expect(manager.replace(zip(), 'cancel', abort.signal)).rejects.toMatchObject({ code: 'cancelled' }); expect(manager.current).toBe(old);
    const huge = new Blob([new Uint8Array(LIMITS.file + 1)]); await expect(manager.replace({ kind: 'directory', files: [{ path: 'assets/a/file', file: huge }] }, 'large')).rejects.toThrow('超限'); expect(manager.current).toBe(old);
    manager.close(); expect(manager.current).toBeNull(); expect(old.query('assets/example/test.txt').status).toBe('invalid');
  });
  it('accepts supported_formats containing 34 and rejects path traversal in directory', async () => {
    const contents = JSON.stringify({ pack: { pack_format: 35, supported_formats: [34, 35], description: 'x' } });
    await expect(prepareSession(dir([{ name: 'pack.mcmeta', data: contents }, { name: 'assets/example/a', data: 'x' }]), 'x')).resolves.toBeDefined();
    await expect(prepareSession(dir([{ name: 'pack.mcmeta', data: meta }, { name: 'assets/example/../a', data: 'x' }]), 'x')).rejects.toThrow();
  });
  it('rejects compression bombs, excessive PNG dimensions, JSON size, and file/directory collisions', async () => {
    const bomb = zipFixture([{ name: 'pack.mcmeta', data: meta }, { name: 'assets/example/bomb', data: new Uint8Array(1024 * 1024), deflate: true }]);
    await expect(prepareSession({ kind: 'zip', blob: new Blob([new Uint8Array(bomb)]) }, 'x')).rejects.toThrow('压缩比');
    const png = new Uint8Array(33); png.set([137,80,78,71,13,10,26,10]); const view = new DataView(png.buffer); view.setUint32(8, 13); png.set([73,72,68,82], 12); view.setUint32(16, LIMITS.pngAxis + 1); view.setUint32(20, 1);
    await expect(prepareSession({ kind: 'directory', files: [{ path: 'pack.mcmeta', file: new Blob([meta]) }, { path: 'assets/example/image.png', file: new Blob([png]) }] }, 'x')).rejects.toThrow('PNG 尺寸');
    await expect(prepareSession({ kind: 'directory', files: [{ path: 'pack.mcmeta', file: new Blob([meta]) }, { path: 'assets/example/large.json', file: new Blob([new Uint8Array(LIMITS.json + 1)]) }] }, 'x')).rejects.toThrow('超限');
    await expect(prepareSession(dir([{ name: 'pack.mcmeta', data: meta }, { name: 'assets/example/a', data: 'x' }, { name: 'assets/example/a/b', data: 'x' }]), 'x')).rejects.toThrow('冲突');
  });
});
