import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodePreviewRaster } from '../../../src/render/previewRaster';
import { drawImageNode } from '../../../src/render/imageWidget';
import { createNode } from '../../../src/domain/model';

afterEach(() => vi.unstubAllGlobals());

describe('preview image lifetime', () => {
  it('publishes an independent surface and releases the temporary decoder bitmap', async () => {
    const bitmap = { width: 16, height: 16, close: vi.fn() };
    const copy = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: copy }) };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal('document', { createElement: () => canvas });
    const surface = await decodePreviewRaster(new Uint8Array(), 16, 16);
    expect(surface).toBe(canvas); expect(copy).toHaveBeenCalledWith(bitmap, 0, 0);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    const node = createNode('minecraft:image', 'image_test');
    if (node.type !== 'minecraft:image') throw new Error('Expected image');
    const drawImage = vi.fn(), ctx = { save: vi.fn(), restore: vi.fn(), drawImage };
    drawImageNode(ctx as unknown as CanvasRenderingContext2D, node, 64, 64, { kind: 'texture', image: surface, width: 16, height: 16 });
    expect(drawImage.mock.calls[0][0]).toBe(surface);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });

  it('releases a bitmap whose decoded dimensions do not match the checked PNG', async () => {
    const bitmap = { width: 16, height: 16, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    await expect(decodePreviewRaster(new Uint8Array(), 32, 16)).rejects.toThrow('PNG 解码尺寸不匹配');
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('restores the drawing context on failure while preserving export rejection', () => {
    const node = createNode('minecraft:image', 'image_test');
    if (node.type !== 'minecraft:image') throw new Error('Expected image');
    const error = new Error('closed bitmap');
    const ctx = { save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(() => { throw error; }) };
    expect(() => drawImageNode(ctx as unknown as CanvasRenderingContext2D, node, 64, 64, { kind: 'texture', image: {} as ImageBitmap, width: 16, height: 16 })).toThrow(error);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
});
