import { describe, expect, it } from 'vitest';
import { exportFilename, safeExportStem, screenExportFilename } from '../../../src/exports/filenames';
import { buildZip, ZIP_DATA_LIMIT } from '../../../src/exports/zip';
import type { ExportFile } from '../../../src/exports/bundle';

describe('export filenames and ZIP bounds', () => {
  it('keeps ordinary unicode and sanitizes unsafe and reserved names', () => {
    expect(safeExportStem('我的 GUI 42')).toBe('我的 GUI 42');
    expect(safeExportStem('A\ud800B😀')).toBe('A_B😀');
    expect(safeExportStem('  ../../CON:abc?  ')).toBe('.._.._CON_abc_');
    for (const name of ['', '   ', '...', ' . ']) expect(safeExportStem(name)).toBe('minecraft-gui');
    for (const name of ['CON', 'con.txt', 'LPT1', 'aux .json']) expect(safeExportStem(name).startsWith('_')).toBe(true);
    expect(new TextEncoder().encode(safeExportStem('界'.repeat(200))).length).toBeLessThanOrEqual(120);
    expect(exportFilename('测试', 'project')).toBe('测试.json');
  });
  it('rejects unsafe or duplicate entries and oversize before producing a ZIP', async () => {
    const file = (name: string, bytes = new Uint8Array([1])): ExportFile => ({ name, bytes, mime: 'text/plain', label: '' });
    await expect(buildZip([file('../x')])).rejects.toThrow();
    await expect(buildZip([file('A'), file('a')])).rejects.toThrow();
    await expect(buildZip([file('large', new Uint8Array(ZIP_DATA_LIMIT + 1))])).rejects.toThrow('64 MiB');
  });
  it('checks session changes during packaging before returning a blob', async () => {
    let calls = 0;
    await expect(buildZip([{ name: 'a.json', label: '', mime: '', bytes: new Uint8Array([1]) }], () => { if (++calls > 1) throw Error('session changed'); })).rejects.toThrow('session changed');
  });
  it('uses stable Screen IDs to avoid collisions and bounds long UTF-8 names', () => {
    const a = screenExportFilename('项目'.repeat(100), '同名'.repeat(100), 'screen_a', 'design');
    const b = screenExportFilename('项目'.repeat(100), '同名'.repeat(100), 'screen_b', 'design');
    expect(a).not.toBe(b); expect(a).toContain('--screen_a.png'); expect(new TextEncoder().encode(a).length).toBeLessThanOrEqual(255);
    expect(a).not.toMatch(/[\\/]/);
  });
});
