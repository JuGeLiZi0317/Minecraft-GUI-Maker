import { describe, expect, it } from 'vitest';
import { embeddedAssetError, EMBEDDED_IMAGE_CONTRACT } from '../../../src/domain/embeddedImage';
import { parseProject } from '../../../src/domain/schema';
import { embeddedImageProject, EMBEDDED_IMAGE_DATA } from '../../fixtures/embeddedImageProject';

describe('Q5-L embedded image assets', () => {
  it('accepts a project with an embedded PNG and validates its dimensions', () => {
    const doc = parseProject(JSON.stringify(embeddedImageProject()));
    expect(doc.schemaVersion).toBe('0.56.0');
    expect(doc.assets[0]).toMatchObject({ id: 'asset_tex', width: 8, height: 8 });
    expect(doc.screens[0].nodes[0]).toMatchObject({ type: 'minecraft:image', props: { kind: 'embedded', assetId: 'asset_tex' } });
    expect(EMBEDDED_IMAGE_CONTRACT.version).toBe('1.0.0');
  });

  it('rejects a mismatched PNG dimension, invalid base64 and excess size', () => {
    const doc = embeddedImageProject();
    expect(() => parseProject(JSON.stringify({ ...doc, assets: [{ ...doc.assets[0], width: 4 }] }))).toThrow();
    expect(() => parseProject(JSON.stringify({ ...doc, assets: [{ ...doc.assets[0], data: 'not base64' }] }))).toThrow();
    expect(embeddedAssetError({ id: 'x', name: 'x', mime: 'image/png', width: 8, height: 8, data: EMBEDDED_IMAGE_DATA })).toBeNull();
    expect(embeddedAssetError({ id: 'x', name: 'x', mime: 'image/png', width: 4, height: 8, data: EMBEDDED_IMAGE_DATA })).toContain('尺寸');
  });

  it('requires Schema 0.56.0 for embedded images', () => {
    const doc = embeddedImageProject(); doc.schemaVersion = '0.55.0';
    expect(() => parseProject(JSON.stringify(doc))).toThrow(/0.56.0/);
  });
});
