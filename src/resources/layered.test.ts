import { expect, it } from 'vitest';
import { CHECKBOX_SPRITES, GUI_SPRITES, LayeredResources } from './layered';
import { meta, zipFixture } from '../../tests/resource-fixtures';

const png = () => { const b = new Uint8Array(33); b.set([137,80,78,71,13,10,26,10]); const v = new DataView(b.buffer); v.setUint32(8, 13); b.set([73,72,68,82], 12); v.setUint32(16, 200); v.setUint32(20, 20); return b; };
const location = (id: string) => `assets/minecraft/textures/gui/sprites/${id.slice('minecraft:'.length)}.png`;
const nine = (border: number) => JSON.stringify({ gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border } } });
const blob = (files: Parameters<typeof zipFixture>[0]) => new Blob([new Uint8Array(zipFixture(files))]);
const client = () => blob([{ name: 'version.json', data: JSON.stringify({ id: '1.21.1', pack_version: { resource: 34 } }), deflate: true, descriptor: true },
  { name: 'assets/minecraft/atlases/gui.json', data: JSON.stringify({ sources: [{ type: 'directory', source: 'gui/sprites', prefix: '' }] }), descriptor: true },
  ...GUI_SPRITES.flatMap((id, i) => [{ name: location(id), data: png(), descriptor: true }, { name: location(id) + '.mcmeta', data: nine(i === 1 ? 3 : 1), descriptor: true }])]);
const overlay = (files: Parameters<typeof zipFixture>[0]) => ({ kind: 'zip' as const, blob: blob([{ name: 'pack.mcmeta', data: meta }, ...files]) });

it('switches to default without discarding loaded resources and can restore them', async () => {
  const r = new LayeredResources(); await r.setBase(client(), 'client'); await r.setOverlay(overlay([{ name: 'assets/example/test.txt', data: 'test' }]), 'pack');
  const revision = r.revision; r.useDefault();
  expect(r.baseName).toBeNull(); expect(r.overlayName).toBeNull(); expect(r.revision).toBeGreaterThan(revision);
  expect(r.baseChoices).toEqual(['client']); expect(r.overlayChoices).toEqual(['pack']);
  r.selectResource('base', 0); r.selectResource('overlay', 0);
  expect(await r.sprite(GUI_SPRITES[0])).toMatchObject({ status: 'valid', imageLayer: '基础：client' }); r.close();
});

it('uses separate image and metadata layers, with no inheritance below an overriding image', async () => {
  const r = new LayeredResources(), path = location(GUI_SPRITES[0]); await r.setBase(client(), 'client');
  const base = await r.sprite(GUI_SPRITES[0]); expect(base).toMatchObject({ status: 'valid', imageLayer: '基础：client', metadataLayer: '基础：client', scaling: { type: 'nine_slice', border: { left: 1 } } });
  expect(await r.sprite(GUI_SPRITES[1])).toMatchObject({ status: 'valid', scaling: { type: 'nine_slice', border: { left: 3 } } });
  await r.setOverlay(overlay([{ name: path + '.mcmeta', data: nine(2) }]), 'metadata');
  expect(await r.sprite(GUI_SPRITES[0])).toMatchObject({ status: 'valid', imageLayer: '基础：client', metadataLayer: '覆盖：metadata', scaling: { border: { left: 2 } } });
  await r.setOverlay(overlay([{ name: path, data: png() }]), 'image');
  expect(await r.sprite(GUI_SPRITES[0])).toMatchObject({ status: 'valid', imageLayer: '覆盖：image', metadataLayer: null, scaling: { type: 'stretch' } });
  await r.setOverlay(overlay([{ name: path, data: png() }, { name: path + '.mcmeta', data: nine(3) }]), 'both');
  expect(await r.sprite(GUI_SPRITES[0])).toMatchObject({ status: 'valid', imageLayer: '覆盖：both', metadataLayer: '覆盖：both', scaling: { border: { left: 3 } } });
  r.close();
});

it('rejects invalid, unsupported and cancelled replacements while keeping existing layers', async () => {
  const r = new LayeredResources(); await r.setBase(client(), 'client');
  await r.setOverlay(overlay([{ name: location(GUI_SPRITES[0]) + '.mcmeta', data: '{' }]), 'bad metadata');
  expect(await r.sprite(GUI_SPRITES[0])).toMatchObject({ status: 'invalid' });
  await expect(r.setOverlay(overlay([{ name: '../bad', data: 'x' }]), 'bad')).rejects.toThrow(); expect(r.overlayName).toBe('bad metadata');
  const controller = new AbortController(); controller.abort(); await expect(r.setBase(client(), 'cancel', controller.signal)).rejects.toMatchObject({ code: 'cancelled' }); expect(r.baseName).toBe('client');
  await r.setOverlay(overlay([{ name: 'assets/minecraft/atlases/gui.json', data: '{}' }]), 'atlas'); expect(await r.sprite(GUI_SPRITES[0])).toMatchObject({ status: 'unsupported' });
  expect(await r.sprite('minecraft:unknown')).toMatchObject({ status: 'unsupported' }); r.clearOverlay();
  expect(await r.sprite(GUI_SPRITES[0])).toMatchObject({ status: 'valid' }); r.close();
});

it('rejects stale async sprite reads after a layer change', async () => {
  const r = new LayeredResources(); await r.setBase(client(), 'client');
  const pending = r.sprite(GUI_SPRITES[0]); r.clearOverlay();
  expect(await pending).toMatchObject({ status: 'unsupported', diagnostic: '资源层已变化，请重新查询' }); r.close();
});

it('rejects a corrupt signed descriptor and preserves the current base', async () => {
  const r = new LayeredResources(); await r.setBase(client(), 'original');
  const bytes = new Uint8Array(await client().arrayBuffer());
  const marker = bytes.findIndex((_, i) => bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 7 && bytes[i + 3] === 8);
  expect(marker).toBeGreaterThan(0); bytes[marker + 4] ^= 1;
  await expect(r.setBase(new Blob([bytes]), 'bad')).rejects.toThrow(); expect(r.baseName).toBe('original');
  expect(await r.sprite(GUI_SPRITES[0])).toMatchObject({ status: 'valid' }); r.close();
});

it('resolves each checkbox sprite independently and reports missing, invalid, and unsupported metadata', async () => {
  const r = new LayeredResources(); await r.setBase(client(), 'client');
  expect(await r.sprite(CHECKBOX_SPRITES[0])).toMatchObject({ status: 'missing' });
  await r.setOverlay(overlay(CHECKBOX_SPRITES.flatMap((id, i) => [
    { name: location(id), data: png() }, { name: location(id) + '.mcmeta', data: nine(i + 1) },
  ])), 'checkbox');
  for (const [index, id] of CHECKBOX_SPRITES.entries()) {
    expect(await r.sprite(id)).toMatchObject({ status: 'valid', imageLayer: '覆盖：checkbox', metadataLayer: '覆盖：checkbox', scaling: { border: { left: index + 1 } } });
  }
  await r.setOverlay(overlay([{ name: location(CHECKBOX_SPRITES[0]), data: png() }, { name: location(CHECKBOX_SPRITES[0]) + '.mcmeta', data: '{' }]), 'invalid');
  expect(await r.sprite(CHECKBOX_SPRITES[0])).toMatchObject({ status: 'invalid' });
  await r.setOverlay(overlay([{ name: location(CHECKBOX_SPRITES[0]), data: png() }, { name: location(CHECKBOX_SPRITES[0]) + '.mcmeta', data: JSON.stringify({ animation: {} }) }]), 'unsupported');
  expect(await r.sprite(CHECKBOX_SPRITES[0])).toMatchObject({ status: 'unsupported' });
  r.close();
});
