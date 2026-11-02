import type { ImageNode } from '../domain/image';
import { textureSourceRect } from '../domain/image';
import { SpriteRasterCache, type DecodedSprite } from './spritePreview';

export type RenderedImageAsset = { kind: 'texture'; image: CanvasImageSource; width: number; height: number } | { kind: 'sprite'; sprite: DecodedSprite };
export function drawImageNode(ctx: CanvasRenderingContext2D, node: ImageNode, w: number, h: number, asset?: RenderedImageAsset, cache = new SpriteRasterCache()) {
  if (!asset) return;
  ctx.save();
  try {
    ctx.imageSmoothingEnabled = false;
    if (node.props.kind === 'texture' && asset.kind === 'texture') {
      const rect = textureSourceRect(node as import('../domain/image').TextureImageNode, asset.width, asset.height);
      ctx.drawImage(asset.image, rect.x, rect.y, rect.width, rect.height, 0, 0, w, h);
    } else if (node.props.kind === 'sprite' && asset.kind === 'sprite') {
      const raster = cache.get(`image-sprite:${node.props.spriteId}`, asset.sprite, w, h);
      ctx.drawImage(raster, 0, 0);
    }
  } finally { ctx.restore(); }
}
export function imageRect(node: ImageNode, output: { x: number; y: number; w: number; h: number }, actualSize?: { width: number; height: number }) {
  if (node.props.kind === 'sprite' || !actualSize) return { source: null, destination: { ...output } };
  return { source: textureSourceRect(node as import('../domain/image').TextureImageNode, actualSize.width, actualSize.height), destination: { ...output } };
}
