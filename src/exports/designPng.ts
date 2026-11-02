import { drawCheckboxFallback, drawPreviewText, fontSession, type FontChoice } from '../render/previewFont';
import type { ExportReference, ExportSnapshot } from './snapshot';
import { panelBounds, panelRects, panelSource, panelTextureSide, type PanelStyle } from '../domain/panel';
import { drawNativePanel, getPanelImage, isTextureStyle } from '../render/panelTexture';
import { beforePanel, drawCreativeTabFallback, spriteForNode, SpriteRasterCache } from '../render/spritePreview';
import { isSelectionNode } from '../domain/selection';
import { drawSelectionWidget } from '../render/selectionWidgets';
import { isNumericNode, drawNumericWidget } from '../render/numericWidgets';
import { isProgressNode } from '../domain/progress';
import { drawProgressBar } from '../render/progressBar';
import { isStatusNode } from '../domain/statusIndicator';
import { drawStatusIndicator } from '../render/statusIndicator';
import { isImageNode } from '../domain/image';
import { drawImageNode } from '../render/imageWidget';
import { drawScrollText } from '../render/scrollText';
import { tabManaged, tabVisibility } from '../domain/tabGroups';
import { screenNavigationSelected } from '../domain/screenTabNavigation';
import type { VisualSnapshot } from './visualSnapshot';
import { contentSize, contentViewport, isScrollablePanelNode } from '../domain/scrollablePanel';

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
  const activeScreen = screen;
  const { width, height } = activeScreen.designSize;
  if (!Number.isInteger(pixelRatio) || pixelRatio < 1 || pixelRatio > 4) throw new Error('PNG参考图倍率无效');
  assertPngSize(width * pixelRatio, height * pixelRatio);
  const canvas = document.createElement('canvas'); canvas.width = width * pixelRatio; canvas.height = height * pixelRatio;
  try {
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('当前浏览器无法创建PNG绘图上下文，本批未生成');
    const renderContext = ctx;
    ctx.scale(pixelRatio, pixelRatio);
    ctx.clearRect(0, 0, width, height);
    // The enlarged image is a visual reference; this matte is not a game background.
    if (pixelRatio > 1) { ctx.fillStyle = '#1c2634'; ctx.fillRect(0, 0, width, height); }
    const visibleInGroup = tabVisibility(activeScreen.nodes), managed = tabManaged(activeScreen.nodes);
    const resolvedNodes = activeScreen.nodes.map(node => { const selected = screenNavigationSelected(node, activeScreen.id, snapshot.document.screenTabGroups ?? []); return node.type === 'minecraft:creative-tab' && selected !== null ? { ...node, props: { ...node.props, selected } } : node; });
    function drawNode(original: typeof activeScreen.nodes[number], drawBounds = original.bounds) {
      const selected = screenNavigationSelected(original, activeScreen.id, snapshot.document.screenTabGroups ?? []);
      const node = selected === null || original.type !== 'minecraft:creative-tab' ? original : { ...original, props: { ...original.props, selected } };
      if ((!managed.has(node.id) && !node.state.visible) || !visibleInGroup(node.id)) return;
      const { x, y, w, h } = drawBounds;
      if (isScrollablePanelNode(node)) {
        const viewport = contentViewport(node), metrics = contentSize(node);
        renderContext.save(); renderContext.fillStyle = rgba(node.props.backgroundColor); renderContext.fillRect(x, y, w, h); renderContext.strokeStyle = rgba(node.props.borderColor); renderContext.lineWidth = 1; renderContext.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
        renderContext.beginPath(); renderContext.rect(viewport.x, viewport.y, viewport.w, viewport.h); renderContext.clip();
        for (const child of resolvedNodes) if (child.parentContainerId === node.id) drawNode(child, { x: viewport.x + child.bounds.x, y: viewport.y + child.bounds.y, w: child.bounds.w, h: child.bounds.h });
        renderContext.restore();
        if (metrics.maxScroll > 0) { const thumb = Math.max(8, viewport.h * viewport.h / node.props.contentHeight); renderContext.fillStyle = '#111821'; renderContext.fillRect(viewport.x + viewport.w + 2, viewport.y, 6, viewport.h); renderContext.fillStyle = '#8795a5'; renderContext.fillRect(viewport.x + viewport.w + 2, viewport.y, 6, thumb); }
        return;
      }
      if (isSelectionNode(node)) { renderContext.save(); renderContext.translate(x, y); drawSelectionWidget(renderContext, node, w, h, font.family); renderContext.restore(); return; }
      if (isNumericNode(node)) {
        renderContext.save(); renderContext.translate(x, y); drawNumericWidget(renderContext, node, w, h, font.family, visual?.entries ?? {}, visual?.cache ?? new SpriteRasterCache(), { resourceActive: visual?.active }); renderContext.restore(); return;
      }
      if (isProgressNode(node)) { renderContext.save(); renderContext.translate(x, y); drawProgressBar(renderContext, node, w, h, font.family); renderContext.restore(); return; }
      if (isStatusNode(node)) { renderContext.save(); renderContext.translate(x, y); drawStatusIndicator(renderContext, node, w, h, font.family); renderContext.restore(); return; }
      if (isImageNode(node)) { renderContext.save(); renderContext.translate(x, y); drawImageNode(renderContext, node, w, h, visual?.images[node.id], visual?.cache ?? new SpriteRasterCache()); renderContext.restore(); return; }
      if (node.type === 'minecraft:fitting-multi-line-text-widget') { renderContext.save(); renderContext.translate(x, y); drawScrollText(renderContext, node, font.family); renderContext.restore(); return; }
      renderContext.save(); if (node.type !== 'minecraft:checkbox' && node.type !== 'minecraft:multi-line-text-widget') { renderContext.beginPath(); renderContext.rect(x, y, w, h); renderContext.clip(); }
      const spriteId = spriteForNode(node), entry = spriteId ? visual?.entries[spriteId] : undefined;
      let raster: HTMLCanvasElement | null = null, renderError = '';
      if (spriteId && entry?.sprite) { try { raster = visual!.cache.get(spriteId, entry.sprite, node.type === 'minecraft:checkbox' ? 17 : w, node.type === 'minecraft:checkbox' ? 17 : h); } catch (error) { renderError = (error as Error).message; } }
      renderContext.globalAlpha = 'enabled' in node.state && !node.state.enabled && !raster && node.type !== 'minecraft:checkbox' ? 0.45 : 1;
      if (node.type === 'minecraft:fill') { renderContext.fillStyle = rgba(node.props.color); renderContext.fillRect(x, y, w, h); }
      else {
        if (raster) { renderContext.save(); renderContext.imageSmoothingEnabled = false; renderContext.drawImage(raster, x, y); renderContext.restore(); }
        else if (node.type === 'minecraft:creative-tab') { renderContext.save(); renderContext.translate(x, y); drawCreativeTabFallback(renderContext, node.props.selected); renderContext.restore(); }
        else if (node.type === 'minecraft:checkbox') { renderContext.save(); renderContext.translate(x, y); drawCheckboxFallback(renderContext, node.props.selected); renderContext.restore(); }
        else if (node.type !== 'minecraft:string-widget' && node.type !== 'minecraft:multi-line-text-widget' && !(node.type === 'minecraft:edit-box' && !node.props.bordered)) {
          renderContext.fillStyle = node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' ? '#314354' : '#151e2b'; renderContext.fillRect(x, y, w, h);
          if (node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' || (node.type === 'minecraft:edit-box' && node.props.bordered)) { renderContext.strokeStyle = '#5a7185'; renderContext.lineWidth = 0.6; renderContext.strokeRect(x, y, w, h); }
        }
        if (node.type !== 'minecraft:creative-tab' && visual?.active && spriteId && (entry?.error || renderError)) { renderContext.font = '7px monospace'; renderContext.textBaseline = 'top'; renderContext.textAlign = 'left'; renderContext.fillStyle = '#ff746e'; renderContext.fillText('纹理不可用', x, y); }
        renderContext.save(); renderContext.translate(x, y); drawPreviewText(renderContext, node, w, h, font.family, activeScreen.background.kind === 'panel'); renderContext.restore();
      }
      renderContext.restore();
    }
    resolvedNodes.filter(node => node.parentContainerId === undefined && beforePanel(node)).forEach(node => drawNode(node));
    if (activeScreen.background.kind === 'panel') { const panel = panelBounds(screen); renderContext.save(); renderContext.translate(panel.x, panel.y); await drawPanel(renderContext, panel.w, panel.h, activeScreen.background.style); renderContext.restore(); }
    resolvedNodes.filter(node => node.parentContainerId === undefined && !beforePanel(node)).forEach(node => drawNode(node));
    return addPngMetadata(await encode(canvas), { reference, kind: pixelRatio === 1 ? 'design-area-reference' : 'enlarged-design-area-reference', screenId: screen.id,
      width: width * pixelRatio, height: height * pixelRatio, designWidth: width, designHeight: height, unit: 'gui-px', origin: [0, 0], xDirection: 'right', yDirection: 'down', pixelRatio, background: screen.background.kind === 'panel' ? panelSource(screen.background.style) : pixelRatio === 1 ? 'transparent' : 'preview-matte-#1c2634', resourceGeneration: visual?.generation ?? null, visualVerification: 'approximate-browser-rendering-only' });
  } finally { canvas.width = 0; canvas.height = 0; }
}
