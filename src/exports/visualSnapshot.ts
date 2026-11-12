import type { LayeredResources } from '../resources/layered';
import { SpriteRasterCache, spriteForNode, type DecodedSprite } from '../render/spritePreview';
import { sha256, type ExportSnapshot } from './snapshot';
import { isNumericNode, numericSpriteIds } from '../render/numericWidgets';
import { isImageNode } from '../domain/image';
import type { RenderedImageAsset } from '../render/imageWidget';
import { decodeBase64 } from '../domain/embeddedImage';
import { planPageExports, resolvePageVisualState, type PageExportVariant } from './pageExport';

type VisualEntry = { sprite?: DecodedSprite; error?: string };
export type VisualSnapshot = { generation: number; active: boolean; entries: Readonly<Record<string, VisualEntry>>; images: Readonly<Record<string, RenderedImageAsset>>; cache: SpriteRasterCache;
  manifest: { generation: number; base: string | null; overlay: string | null; state: 'initial'; sprites: Record<string, unknown>; screens: { screenId: string; spriteIds: string[]; imageNodeIds?: string[]; diagnostics: string[] }[]; diagnostics: string[] };
  dispose: () => void };

/** The returned bitmaps are owned by this export and never share the live preview cache. */
export async function captureVisual(resources: LayeredResources, snapshot: ExportSnapshot, pagePlan: ReadonlyMap<string, PageExportVariant[]> = planPageExports(snapshot.document)): Promise<VisualSnapshot> {
  const generation = resources.revision, base = resources.baseName, overlay = resources.overlayName;
  const verify = () => { if (resources.revision !== generation) throw new Error('资源会话已改变，请重新导出'); };
  const entries: Record<string, VisualEntry> = {}, images: Record<string, RenderedImageAsset> = {}, sprites: Record<string, unknown> = {}, bitmaps: ImageBitmap[] = [], diagnostics: string[] = [];
  const screenState = snapshot.document.screens.map(screen => {
    const variants = pagePlan.get(screen.id)!;
    const selections = variants.length ? variants.map(variant => variant.selections) : [undefined];
    const spriteIds = new Set<string>(), visibleIds = new Set<string>();
    const spriteNodes = new Map<string, { id: string; width: number; height: number; nodeId: string }>();
    for (const selection of selections) {
      const { nodes, isVisible } = resolvePageVisualState(screen, snapshot.document.screenTabGroups ?? [], selection);
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        visibleIds.add(node.id);
        if (isNumericNode(node)) {
          for (const id of numericSpriteIds(node)) spriteIds.add(id);
          continue;
        }
        const id = spriteForNode(node);
        if (!id) continue;
        spriteIds.add(id);
        const { w, h } = node.type === 'minecraft:checkbox' ? { w: 17, h: 17 } : node.bounds;
        spriteNodes.set(`${node.id}/${id}`, { id, width: w, height: h, nodeId: node.id });
      }
    }
    // Enabled Bake groups also emit standalone PNGs for Pages outside the selected variants.
    const bakedIds = new Set((screen.bakeGroups ?? []).filter(group => group.enabled).flatMap(group => group.memberIds));
    const imageNodes = screen.nodes.filter(isImageNode).filter(node => visibleIds.has(node.id) || bakedIds.has(node.id));
    return { screenId: screen.id, spriteIds: [...spriteIds], spriteNodes: [...spriteNodes.values()], imageNodes };
  });
  const ids = [...new Set(screenState.flatMap(state => state.spriteIds))];
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
    for (const state of screenState) for (const node of state.imageNodes) {
      const kind = node.props.kind, key = `image:${node.id}`;
      if (kind === 'embedded') {
        const props = node.props; if (props.kind !== 'embedded') continue;
        const asset = snapshot.document.assets.find(item => item.id === props.assetId);
        if (!asset) { const message = `${state.screenId}/${node.id} embedded:${props.assetId}：missing：嵌入式贴图资源不存在`; diagnostics.push(message); (pageErrors[state.screenId] ??= []).push(message); sprites[key] = { status: 'missing', diagnostic: '嵌入式贴图资源不存在', resourceId: `embedded:${props.assetId}`, kind }; continue; }
        try { const bitmap = await createImageBitmap(new Blob([decodeBase64(asset.data).buffer as ArrayBuffer], { type: 'image/png' })); bitmaps.push(bitmap); images[node.id] = { kind: 'texture', image: bitmap, width: asset.width, height: asset.height }; sprites[key] = { status: 'valid', resourceId: `embedded:${asset.id}`, kind: 'embedded', width: asset.width, height: asset.height }; }
        catch { const message = `${state.screenId}/${node.id} embedded:${props.assetId}：invalid：PNG 解码失败`; diagnostics.push(message); (pageErrors[state.screenId] ??= []).push(message); sprites[key] = { status: 'invalid', diagnostic: 'PNG 解码失败', resourceId: `embedded:${props.assetId}`, kind }; }
        continue;
      }
      const id = kind === 'texture' ? node.props.resourceId : node.props.spriteId;
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
    if (base) for (const state of screenState) for (const { id, width, height, nodeId } of state.spriteNodes) {
      const sprite = entries[id]?.sprite;
      if (!sprite) continue;
      try { cache.get(id, sprite, width, height); }
      catch (error) { const message = `${state.screenId}/${nodeId} ${id}：纹理预览不可用：${(error as Error).message}`; diagnostics.push(message); (pageErrors[state.screenId] ??= []).push(message); }
    }
    const screens = screenState.map(({ screenId, spriteIds, imageNodes }) => ({
      screenId, spriteIds, imageNodeIds: imageNodes.map(node => node.id),
      diagnostics: [...spriteIds.flatMap(id => entries[id]?.error ? [entries[id].error!] : []), ...(pageErrors[screenId] ?? [])],
    }));
    return { generation, active: !!(base || overlay), entries, images, cache, manifest: { generation, base, overlay, state: 'initial', sprites, screens, diagnostics },
      dispose: () => { cache.clear(); bitmaps.forEach(image => image.close()); } };
  } catch (error) { bitmaps.forEach(image => image.close()); throw error; }
}
