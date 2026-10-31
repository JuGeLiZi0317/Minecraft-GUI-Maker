import { drawCheckboxFallback, drawPreviewText, fontSession, type FontChoice } from '../render/previewFont';
import type { ExportReference, ExportSnapshot } from './snapshot';
import { panelBounds, panelRects, panelSource, panelTextureSide, type PanelStyle } from '../domain/panel';
import { drawNativePanel, getPanelImage, isTextureStyle } from '../render/panelTexture';
import { beforePanel, drawCreativeTabFallback, spriteForNode } from '../render/spritePreview';
import { tabManaged, tabVisibility } from '../domain/tabGroups';
import type { VisualSnapshot } from './visualSnapshot';

export const MAX_PNG_PIXELS = 16_777_216;
export function assertPngSize(width: number, height: number) {
  if (width > 8192 || height > 8192 || width * height > MAX_PNG_PIXELS) throw new Error('设计区超过PNG导出上限（单轴8192、总像素16,777,216），本批未生成；未缩放或修改设计，可单独备份JSON');
}
/** Keep the additional image within the same per-image allocation limits. */
export function referenceScale(width: number, height: number): number {
  assertPngSize(width, height);
  return Math.max(1, Math.min(4, Math.floor(8192 / width), Math.floor(8192 / height), Math.floor(Math.sqrt(MAX_PNG_PIXELS / (width * height)))));
}
const rgba = (argb: string) => `rgba(${parseInt(argb.slice(3, 5), 16)},${parseInt(argb.slice(5, 7), 16)},${parseInt(argb.slice(7, 9), 16)},${parseInt(argb.slice(1, 3), 16) / 255})`;
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
async function drawPanel(ctx: CanvasRenderingContext2D, width: number, height: number, style: PanelStyle) {
  if (isTextureStyle(style)) drawNativePanel(ctx, await getPanelImage(style), width, height);
  else for (const r of panelRects(width, height)) { ctx.fillStyle = r.color; ctx.fillRect(r.x, r.y, r.w, r.h); }
}
async function encode(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG编码失败，本批未生成；可重试或单独导出JSON')), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}
/** Square padded sheet; content starts at (0, 0), one pixel per GUI unit. */
export async function renderPanelTexture(snapshot: ExportSnapshot, reference: ExportReference, screenId = snapshot.document.screens[0].id): Promise<Uint8Array> {
  const screen = snapshot.document.screens.find(item => item.id === screenId);
  if (!screen) throw new Error(`导出 Screen 不存在：${screenId}`);
  const { width, height } = screen.designSize;
  if (screen.background.kind !== 'panel') throw new Error('当前设计未启用 Panel');
  const side = panelTextureSide(width, height); assertPngSize(side, side);
  const canvas = document.createElement('canvas'); canvas.width = side; canvas.height = side;
  try {
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('当前浏览器无法创建PNG绘图上下文，本批未生成');
    const panel = panelBounds(screen); ctx.save(); ctx.translate(panel.x, panel.y); await drawPanel(ctx, panel.w, panel.h, screen.background.style); ctx.restore();
    return addPngMetadata(await encode(canvas), { reference, kind: 'panel-background-texture', screenId: screen.id,
      width: side, height: side, contentWidth: width, contentHeight: height, unit: 'gui-px', origin: [0, 0], pixelRatio: 1, padding: 'transparent', panelBounds: panel, style: screen.background.style, source: panelSource(screen.background.style) });
  } finally { canvas.width = 0; canvas.height = 0; }
}
export function addPngMetadata(bytes: Uint8Array, metadata: unknown): Uint8Array {
  if (bytes.length < 20 || bytes[0] !== 137 || new TextDecoder().decode(bytes.slice(-8, -4)) !== 'IEND') throw new Error('PNG编码结果无效，本批未生成');
  // All metadata values are controlled ASCII IDs, version strings, dimensions and digests.
  const payload = new TextEncoder().encode('MinecraftGuiMaker\0' + JSON.stringify(metadata));
  const chunk = new Uint8Array(payload.length + 12), view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length); chunk.set(new TextEncoder().encode('tEXt'), 4); chunk.set(payload, 8);
  view.setUint32(chunk.length - 4, crc32(chunk.slice(4, -4)));
  const result = new Uint8Array(bytes.length + chunk.length), end = bytes.length - 12;
  result.set(bytes.slice(0, end)); result.set(chunk, end); result.set(bytes.slice(end), end + chunk.length);
  return result;
}
export async function renderDesignPng(snapshot: ExportSnapshot, reference: ExportReference, pixelRatio = 1, visual?: VisualSnapshot, font: FontChoice = fontSession.get(), screenId = snapshot.document.screens[0].id): Promise<Uint8Array> {
  const screen = snapshot.document.screens.find(item => item.id === screenId);
  if (!screen) throw new Error(`导出 Screen 不存在：${screenId}`);
  const { width, height } = screen.designSize;
  if (!Number.isInteger(pixelRatio) || pixelRatio < 1 || pixelRatio > 4) throw new Error('PNG参考图倍率无效');
  assertPngSize(width * pixelRatio, height * pixelRatio);
  const canvas = document.createElement('canvas'); canvas.width = width * pixelRatio; canvas.height = height * pixelRatio;
  try {
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('当前浏览器无法创建PNG绘图上下文，本批未生成');
    ctx.scale(pixelRatio, pixelRatio);
    ctx.clearRect(0, 0, width, height);
    // The enlarged image is a visual reference; this matte is not a game background.
    if (pixelRatio > 1) { ctx.fillStyle = '#1c2634'; ctx.fillRect(0, 0, width, height); }
    const visibleInGroup = tabVisibility(screen.nodes), managed = tabManaged(screen.nodes);
    const drawNode = (node: typeof screen.nodes[number]) => {
      if ((!managed.has(node.id) && !node.state.visible) || !visibleInGroup(node.id)) return;
      const { x, y, w, h } = node.bounds;
      ctx.save(); if (node.type !== 'minecraft:checkbox') { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); }
      const spriteId = spriteForNode(node), entry = spriteId ? visual?.entries[spriteId] : undefined;
      let raster: HTMLCanvasElement | null = null, renderError = '';
      if (spriteId && entry?.sprite) { try { raster = visual!.cache.get(spriteId, entry.sprite, node.type === 'minecraft:checkbox' ? 17 : w, node.type === 'minecraft:checkbox' ? 17 : h); } catch (error) { renderError = (error as Error).message; } }
      ctx.globalAlpha = 'enabled' in node.state && !node.state.enabled && !raster && node.type !== 'minecraft:checkbox' ? 0.45 : 1;
      if (node.type === 'minecraft:fill') { ctx.fillStyle = rgba(node.props.color); ctx.fillRect(x, y, w, h); }
      else {
        if (raster) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(raster, x, y); ctx.restore(); }
        else if (node.type === 'minecraft:creative-tab') { ctx.save(); ctx.translate(x, y); drawCreativeTabFallback(ctx, node.props.selected); ctx.restore(); }
        else if (node.type === 'minecraft:checkbox') { ctx.save(); ctx.translate(x, y); drawCheckboxFallback(ctx, node.props.selected); ctx.restore(); }
        else if (node.type !== 'minecraft:string-widget' && !(node.type === 'minecraft:edit-box' && !node.props.bordered)) {
          ctx.fillStyle = node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' ? '#314354' : '#151e2b'; ctx.fillRect(x, y, w, h);
          if (node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' || (node.type === 'minecraft:edit-box' && node.props.bordered)) { ctx.strokeStyle = '#5a7185'; ctx.lineWidth = 0.6; ctx.strokeRect(x, y, w, h); }
        }
        if (node.type !== 'minecraft:creative-tab' && visual?.active && spriteId && (entry?.error || renderError)) { ctx.font = '7px monospace'; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = '#ff746e'; ctx.fillText('纹理不可用', x, y); }
        ctx.save(); ctx.translate(x, y); drawPreviewText(ctx, node, w, h, font.family, screen.background.kind === 'panel'); ctx.restore();
      }
      ctx.restore();
    };
    screen.nodes.filter(beforePanel).forEach(drawNode);
    if (screen.background.kind === 'panel') { const panel = panelBounds(screen); ctx.save(); ctx.translate(panel.x, panel.y); await drawPanel(ctx, panel.w, panel.h, screen.background.style); ctx.restore(); }
    screen.nodes.filter(node => !beforePanel(node)).forEach(drawNode);
    return addPngMetadata(await encode(canvas), { reference, kind: pixelRatio === 1 ? 'design-area-reference' : 'enlarged-design-area-reference', screenId: screen.id,
      width: width * pixelRatio, height: height * pixelRatio, designWidth: width, designHeight: height, unit: 'gui-px', origin: [0, 0], xDirection: 'right', yDirection: 'down', pixelRatio, background: screen.background.kind === 'panel' ? panelSource(screen.background.style) : pixelRatio === 1 ? 'transparent' : 'preview-matte-#1c2634', resourceGeneration: visual?.generation ?? null, visualVerification: 'approximate-browser-rendering-only' });
  } finally { canvas.width = 0; canvas.height = 0; }
}
