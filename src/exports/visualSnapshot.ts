import { screenNavigationSelected } from '../domain/screenTabNavigation';
import type { LayeredResources } from '../resources/layered';
import { SpriteRasterCache, spriteForNode, type DecodedSprite } from '../render/spritePreview';
import { tabManaged, tabVisibility } from '../domain/tabGroups';
import { sha256, type ExportSnapshot } from './snapshot';
import { isNumericNode, numericSpriteIds } from '../render/numericWidgets';
import { isImageNode } from '../domain/image';
import type { RenderedImageAsset } from '../render/imageWidget';

type VisualEntry = { sprite?: DecodedSprite; error?: string };
export type VisualSnapshot = { generation: number; active: boolean; entries: Readonly<Record<string, VisualEntry>>; images: Readonly<Record<string, RenderedImageAsset>>; cache: SpriteRasterCache;
  manifest: { generation: number; base: string | null; overlay: string | null; state: 'initial'; sprites: Record<string, unknown>; screens: { screenId: string; spriteIds: string[]; diagnostics: string[] }[]; diagnostics: string[] };
  dispose: () => void };

/** The returned bitmaps are owned by this export and never share the live preview cache. */
export async function captureVisual(resources: LayeredResources, document: ExportSnapshot): Promise<VisualSnapshot> {
  const generation = resources.revision, base = resources.baseName, overlay = resources.overlayName;
  const verify = () => { if (resources.revision !== generation) throw new Error('资源会话已改变，请重新导出'); };
  const entries: Record<string, VisualEntry> = {}, images: Record<string, RenderedImageAsset> = {}, sprites: Record<string, unknown> = {}, bitmaps: ImageBitmap[] = [], diagnostics: string[] = [];
  const screenState = document.document.screens.map(screen => ({ screenId: screen.id, nodes: screen.nodes.map(node => { const selected = screenNavigationSelected(node, screen.id, document.document.screenTabGroups ?? []); return node.type === 'minecraft:creative-tab' && selected !== null ? { ...node, props: { ...node.props, selected } } : node; }), managed: tabManaged(screen.nodes), visible: tabVisibility(screen.nodes) }));
  const shown = (state: typeof screenState[number], n: typeof state.nodes[number]) => state.visible(n.id) && (state.managed.has(n.id) || n.state.visible);
  const ids = [...new Set(screenState.flatMap(state => state.nodes.filter(node => shown(state, node)).flatMap(node => isNumericNode(node) ? numericSpriteIds(node) : [spriteForNode(node)])).filter((id): id is string => id !== null))];
  try {
    if (!base) for (const id of ids) { const error = `${id}：missing：未选择客户端基础 JAR`; entries[id] = { error }; diagnostics.push(error); sprites[id] = { status: 'missing', diagnostic: '未选择客户端基础 JAR' }; }
    if (base) for (const id of ids) {
      verify(); const result = await resources.sprite(id); verify();
      if (result.status !== 'valid') { const error = `${id}：${result.status}：${result.diagnostic}`; entries[id] = { error }; diagnostics.push(error); sprites[id] = { status: result.status, diagnostic: result.diagnostic }; continue; }
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(new Blob([new Uint8Array(result.data)], { type: 'image/png' })); }
      catch { verify(); const error = `${id}：invalid：PNG 解码失败`; entries[id] = { error }; diagnostics.push(error); sprites[id] = { status: 'invalid', diagnostic: 'PNG 解码失败' }; continue; }
      bitmaps.push(bitmap); verify();
      if (bitmap.width !== result.width || bitmap.height !== result.height) { const error = `${id}：invalid：PNG 解码尺寸不匹配`; entries[id] = { error }; diagnostics.push(error); sprites[id] = { status: 'invalid', diagnostic: 'PNG 解码尺寸不匹配' }; continue; }
      const digest = await sha256(result.data); verify();
      entries[id] = { sprite: { image: bitmap, scaling: result.scaling } };
      sprites[id] = { status: 'valid', imageLayer: result.imageLayer, metadataLayer: result.metadataLayer, width: result.width, height: result.height, scaling: result.scaling, sha256: digest };
    }
    const pageErrors: Record<string, string[]> = {};
    for (const state of screenState) for (const node of state.nodes.filter(isImageNode)) {
      const kind = node.props.kind, id = kind === 'texture' ? node.props.resourceId : node.props.spriteId, key = `image:${node.id}`;
      if (!shown(state, node)) continue;
      verify(); const result = kind === 'texture' ? await resources.texture(id) : await resources.sprite(id); verify();
      if (result.status !== 'valid') { const message = `${state.screenId}/${node.id} ${id}：${result.status}：${result.diagnostic}`; diagnostics.push(message); (pageErrors[state.screenId] ??= []).push(message); sprites[key] = { status: result.status, diagnostic: result.diagnostic, resourceId: id, kind }; continue; }
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(new Blob([new Uint8Array(result.data)], { type: 'image/png' })); }
      catch { verify(); const message = `${state.screenId}/${node.id} ${id}：PNG 解码失败`; diagnostics.push(message); (pageErrors[state.screenId] ??= []).push(message); sprites[key] = { status: 'invalid', diagnostic: 'PNG 解码失败', resourceId: id, kind }; continue; }
      bitmaps.push(bitmap); verify();
      if (bitmap.width !== result.width || bitmap.height !== result.height) { const message = `${state.screenId}/${node.id} ${id}：PNG 解码尺寸不匹配`; diagnostics.push(message); (pageErrors[state.screenId] ??= []).push(message); sprites[key] = { status: 'invalid', diagnostic: 'PNG 解码尺寸不匹配', resourceId: id, kind }; continue; }
      const digest = await sha256(result.data); verify();
      const scaling: DecodedSprite['scaling'] = 'scaling' in result ? result.scaling as DecodedSprite['scaling'] : { type: 'stretch' };
      images[node.id] = kind === 'texture' ? { kind: 'texture', image: bitmap, width: result.width, height: result.height } : { kind: 'sprite', sprite: { image: bitmap, scaling } };
      sprites[key] = { status: 'valid', resourceId: id, kind, imageLayer: result.imageLayer, ...('metadataLayer' in result ? { metadataLayer: result.metadataLayer } : {}), ...(kind === 'sprite' ? { scaling } : {}), width: result.width, height: result.height, sha256: digest };
    }
    verify(); const cache = new SpriteRasterCache();
    if (base) for (const state of screenState) for (const node of state.nodes) {
      const id = spriteForNode(node), sprite = id && entries[id]?.sprite;
      if (!shown(state, node) || !id || !sprite) continue;
      try { cache.get(id, sprite, node.type === 'minecraft:checkbox' ? 17 : node.bounds.w, node.type === 'minecraft:checkbox' ? 17 : node.bounds.h); }
      catch (error) { const message = `${state.screenId}/${node.id}：纹理预览不可用：${(error as Error).message}`; diagnostics.push(message); (pageErrors[state.screenId] ??= []).push(message); }
    }
    const screens = screenState.map(state => { const spriteIds = [...new Set(state.nodes.filter(node => shown(state, node)).flatMap(node => isNumericNode(node) ? numericSpriteIds(node) : [spriteForNode(node)]).filter((id): id is string => id !== null))]; const imageNodeIds = state.nodes.filter(isImageNode).filter(node => shown(state, node)).map(node => node.id); return { screenId: state.screenId, spriteIds, imageNodeIds, diagnostics: [...spriteIds.flatMap(id => entries[id]?.error ? [entries[id].error!] : []), ...(pageErrors[state.screenId] ?? [])] }; });
    return { generation, active: !!(base || overlay), entries, images, cache, manifest: { generation, base, overlay, state: 'initial', sprites, screens, diagnostics },
      dispose: () => { cache.clear(); bitmaps.forEach(image => image.close()); } };
  } catch (error) { bitmaps.forEach(image => image.close()); throw error; }
}
