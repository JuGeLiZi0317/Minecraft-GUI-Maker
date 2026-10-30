import panel16Url from '../gui/panel_16x.png';
const optional32 = import.meta.glob<string>('../gui/panel_32x.png', { eager: true, query: '?url', import: 'default' });
const panel32Url = optional32['../gui/panel_32x.png'] ?? '';
import metadataText from '../gui/panel.png.mcmeta?raw';
import { NATIVE_PANEL_16, NATIVE_PANEL_32, type PanelStyle } from '../domain/panel';

export const PANEL_METADATA_SHA256 = '508dd60e754290cbb697a2ceafbceec9a566f97fa9148a8daeebae47a93175bd';
export const PANEL_TEXTURES = {
  [NATIVE_PANEL_16]: { url: panel16Url, size: 16, sha256: 'fddb3181380dafc289cbe1394bb1e3d9b7f1d529fde5e82088354d7e390905f2' },
  [NATIVE_PANEL_32]: { url: panel32Url, size: 32, sha256: '93d85b18dcaf9b22dc5382877a126bb6496563edb7bf70c860edd06f2a80a5e9' },
} as const;
export type TextureStyle = keyof typeof PANEL_TEXTURES;
export const isTextureStyle = (style: PanelStyle): style is TextureStyle => style === NATIVE_PANEL_16 || style === NATIVE_PANEL_32;
const metadata = JSON.parse(metadataText) as { gui?: { scaling?: { type?: string; width?: number; height?: number; border?: number } } };
const scaling = metadata.gui?.scaling;
if (scaling?.type !== 'nine_slice' || scaling.width !== 16 || scaling.height !== 16 || scaling.border !== 4) throw new Error('Panel mcmeta 不符合固定的 16×16、4px 九宫格合同');

const cache = new Map<TextureStyle, Promise<HTMLImageElement>>();
export function getPanelImage(style: TextureStyle): Promise<HTMLImageElement> {
  const existing = cache.get(style); if (existing) return existing;
  const task = (async () => {
    const config = PANEL_TEXTURES[style];
    if (!config.url) throw new Error('旧版 32× Panel 纹理未提供，请在本地添加 panel_32x.png');
    const response = await fetch(config.url);
    if (!response.ok) throw new Error('无法读取用户提供的 Panel 纹理');
    const bytes = await response.arrayBuffer();
    if (!crypto.subtle) throw new Error('当前浏览器无法校验 Panel 纹理摘要');
    const hex = async (data: BufferSource) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), n => n.toString(16).padStart(2, '0')).join('');
    const hash = await hex(bytes), metadataHash = await hex(new TextEncoder().encode(metadataText));
    if (hash !== config.sha256) throw new Error('Panel 纹理与固定摘要不符，已阻止导出');
    if (metadataHash !== PANEL_METADATA_SHA256) throw new Error('Panel 元数据与固定摘要不符，已阻止导出');
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (image.naturalWidth !== config.size || image.naturalHeight !== config.size) throw new Error('Panel 纹理尺寸与声明不一致');
      return image;
    } finally { URL.revokeObjectURL(url); }
  })();
  cache.set(style, task); void task.catch(() => { if (cache.get(style) === task) cache.delete(style); });
  return task;
}

/** Minecraft 1.21.1 uses 4px borders and repeats/crops each edge and centre tile. */
export function drawNativePanel(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = image.naturalWidth / 16, borderX = Math.min(4, Math.floor(width / 2)), borderY = Math.min(4, Math.floor(height / 2));
  if (![1, 2].includes(scale) || image.naturalHeight !== image.naturalWidth) throw new Error('Panel 纹理分辨率无效');
  let logicalImage: CanvasImageSource = image;
  if (scale === 2) {
    const logical = document.createElement('canvas'); logical.width = 16; logical.height = 16;
    const logicalContext = logical.getContext('2d'); if (!logicalContext) throw new Error('无法创建 Panel 逻辑纹理');
    logicalContext.imageSmoothingEnabled = false; logicalContext.drawImage(image, 0, 0, 16, 16); logicalImage = logical;
  }
  ctx.save(); ctx.imageSmoothingEnabled = false;
  const draw = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number, tiled: boolean) => {
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    if (!tiled) { ctx.drawImage(logicalImage, sx, sy, sw, sh, dx, dy, dw, dh); return; }
    const tile = document.createElement('canvas'); tile.width = sw; tile.height = sh;
    const tileContext = tile.getContext('2d'); if (!tileContext) throw new Error('无法创建 Panel 九宫格绘图上下文');
    tileContext.imageSmoothingEnabled = false; tileContext.drawImage(logicalImage, sx, sy, sw, sh, 0, 0, sw, sh);
    const pattern = ctx.createPattern(tile, 'repeat'); if (!pattern) throw new Error('无法生成 Panel 平铺图案');
    ctx.save(); ctx.translate(dx, dy); ctx.fillStyle = pattern; ctx.fillRect(0, 0, dw, dh); ctx.restore();
  };
  const bx = borderX, by = borderY, midW = width - 2 * bx, midH = height - 2 * by;
  draw(0, 0, bx, by, 0, 0, bx, by, false);
  draw(bx, 0, 16 - 2 * bx, by, bx, 0, midW, by, true);
  draw(16 - bx, 0, bx, by, width - bx, 0, bx, by, false);
  draw(0, by, bx, 16 - 2 * by, 0, by, bx, midH, true);
  draw(bx, by, 16 - 2 * bx, 16 - 2 * by, bx, by, midW, midH, true);
  draw(16 - bx, by, bx, 16 - 2 * by, width - bx, by, bx, midH, true);
  draw(0, 16 - by, bx, by, 0, height - by, bx, by, false);
  draw(bx, 16 - by, 16 - 2 * bx, by, bx, height - by, midW, by, true);
  draw(16 - bx, 16 - by, bx, by, width - bx, height - by, bx, by, false);
  ctx.restore();
}

// Compose at integer GUI pixels before the editor's zoom/pan/DPR transform.
// Keep at most one raster per source image; a size change replaces the previous one.
const previewCache = new WeakMap<HTMLImageElement, { width: number; height: number; canvas: HTMLCanvasElement }>();
export function panelPreviewRaster(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement | null {
  if (width > 8192 || height > 8192 || width * height > 16_777_216) return null;
  const previous = previewCache.get(image);
  if (previous?.width === width && previous.height === height) return previous.canvas;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('无法创建 Panel 预览画布');
  drawNativePanel(context, image, width, height);
  previewCache.set(image, { width, height, canvas });
  return canvas;
}
