import { prepareClient, prepareSession, ResourceError, type ResourceSession } from './core';

export const GUI_SPRITES = ['minecraft:widget/button', 'minecraft:widget/button_highlighted', 'minecraft:widget/button_disabled', 'minecraft:widget/text_field', 'minecraft:widget/text_field_highlighted'] as const;
/** Checkbox sprites audited for 1.21.1; loaded only when requested by an H1 node. */
export const CHECKBOX_SPRITES = ['minecraft:widget/checkbox', 'minecraft:widget/checkbox_highlighted', 'minecraft:widget/checkbox_selected', 'minecraft:widget/checkbox_selected_highlighted'] as const;
/** Exactly the four native AbstractSliderButton 1.21.1 sprites. */
export const SLIDER_SPRITES = ['minecraft:widget/slider', 'minecraft:widget/slider_highlighted', 'minecraft:widget/slider_handle', 'minecraft:widget/slider_handle_highlighted'] as const;
export const CREATIVE_TAB_SPRITES = ['unselected', 'selected'].flatMap(state => Array.from({ length: 7 }, (_, i) => `minecraft:container/creative_inventory/tab_top_${state}_${i + 1}`));
type PackInput = Parameters<typeof prepareSession>[0];
export type Scaling = { type: 'stretch' } | { type: 'tile'; width: number; height: number } | { type: 'nine_slice'; width: number; height: number; border: { left: number; right: number; top: number; bottom: number } };
export type SpriteResult = { status: 'valid'; id: string; imageLayer: string; metadataLayer: string | null; width: number; height: number; scaling: Scaling; data: Uint8Array; diagnostic: string }
  | { status: 'missing' | 'filtered' | 'invalid' | 'unsupported'; id: string; diagnostic: string };
const atlas = 'assets/minecraft/atlases/gui.json';
const text = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
function parseAtlas(data: Uint8Array) {
  const obj = JSON.parse(text(data));
  return Array.isArray(obj?.sources) && obj.sources.length === 1 && obj.sources[0]?.type === 'directory' && obj.sources[0]?.source === 'gui/sprites' && obj.sources[0]?.prefix === '';
}
function scaling(data: Uint8Array | null): Scaling {
  if (!data) return { type: 'stretch' };
  const obj = JSON.parse(text(data)); if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('元数据必须是对象');
  if ('animation' in obj) throw new ResourceError('unsupported', '动画元数据尚不支持');
  if (obj.gui === undefined) return { type: 'stretch' };
  if (!obj.gui || typeof obj.gui !== 'object' || Array.isArray(obj.gui)) throw new Error('gui 元数据无效');
  const s = obj.gui.scaling; if (s === undefined) return { type: 'stretch' };
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('scaling 无效');
  if (s.type === 'stretch') return { type: 'stretch' };
  if (s.type !== 'tile' && s.type !== 'nine_slice') throw new ResourceError('unsupported', '未知 sprite 缩放类型');
  if (!Number.isSafeInteger(s.width) || !Number.isSafeInteger(s.height) || s.width <= 0 || s.height <= 0) throw new Error('缩放尺寸无效');
  if (s.type === 'tile') return { type: 'tile', width: s.width, height: s.height };
  const b = s.border; const border = Number.isSafeInteger(b) && b > 0 ? { left: b, right: b, top: b, bottom: b } : b;
  if (!border || typeof border !== 'object' || !['left', 'right', 'top', 'bottom'].every(k => Number.isSafeInteger(border[k]) && border[k] >= 0) || border.left + border.right >= s.width || border.top + border.bottom >= s.height) throw new Error('九宫格边框无效');
  return { type: 'nine_slice', width: s.width, height: s.height, border: { left: border.left, right: border.right, top: border.top, bottom: border.bottom } };
}

export class LayeredResources {
  private base: ResourceSession | null = null; private overlay: ResourceSession | null = null;
  private savedBase: ResourceSession[] = []; private savedOverlay: ResourceSession[] = [];
  private generation = 0; private active: AbortController | null = null;
  get baseName() { return this.base?.layer ?? null; }
  get overlayName() { return this.overlay?.layer ?? null; }
  get baseChoices() { return this.savedBase.map(s => s.layer); }
  get overlayChoices() { return this.savedOverlay.map(s => s.layer); }
  get baseIndex() { return this.savedBase.indexOf(this.base!); }
  get overlayIndex() { return this.savedOverlay.indexOf(this.overlay!); }
  useDefault() { this.active?.abort(); this.active = null; this.base = this.overlay = null; this.generation++; }
  selectResource(kind: 'base' | 'overlay', index: number) {
    const session = (kind === 'base' ? this.savedBase : this.savedOverlay)[index];
    if (!session) throw new Error('资源不存在');
    this.active?.abort(); this.active = null;
    if (kind === 'base') this.base = session; else this.overlay = session;
    this.generation++;
  }
  get revision() { return this.generation; }
  private async replace(kind: 'base' | 'overlay', prepare: (signal: AbortSignal) => Promise<ResourceSession>, signal?: AbortSignal) {
    this.active?.abort(); const controller = new AbortController(); this.active = controller;
    const stop = () => controller.abort(); signal?.addEventListener('abort', stop, { once: true }); if (signal?.aborted) controller.abort();
    let next: ResourceSession | null = null;
    try {
      next = await prepare(controller.signal); if (controller.signal.aborted || this.active !== controller) throw new ResourceError('cancelled', '读取已取消');
      const saved = kind === 'base' ? this.savedBase : this.savedOverlay;
      if (saved.length >= 8) throw new ResourceError('unsupported', '本次会话该类型最多保留 8 个资源，请先清除会话');
      saved.push(next); if (kind === 'base') this.base = next; else this.overlay = next;
      next = null; this.generation++;
    } finally { next?.close(); signal?.removeEventListener('abort', stop); if (this.active === controller) this.active = null; }
  }
  async setBase(blob: Blob, name: string, signal?: AbortSignal) {
    await this.replace('base', async s => { const session = await prepareClient(blob, name, s);
      try { if (!parseAtlas(await session.read(atlas, s))) throw new ResourceError('unsupported', '客户端 GUI atlas 不是受支持的 directory source'); return session; }
      catch (e) { session.close(); throw e; }
    }, signal);
  }
  async setOverlay(input: PackInput, name: string, signal?: AbortSignal) { await this.replace('overlay', s => prepareSession(input, name, s), signal); }
  clearOverlay() { this.active?.abort(); this.active = null; this.savedOverlay.forEach(s => s.close()); this.savedOverlay = []; this.overlay = null; this.generation++; }
  close() { this.active?.abort(); this.active = null; this.savedBase.forEach(s => s.close()); this.savedOverlay.forEach(s => s.close()); this.savedBase = []; this.savedOverlay = []; this.base = this.overlay = null; this.generation++; }
  query(path: string) {
    const upper = this.overlay?.query(path); if (upper && upper.status !== 'missing') return upper.status === 'valid' ? { ...upper, layer: `覆盖：${upper.layer}` } : upper;
    const lower = this.base?.query(path); return lower?.status === 'valid' ? { ...lower, layer: `基础：${lower.layer}` } : lower ?? { status: 'missing' as const, diagnostic: '未提供基础资源' };
  }
  async sprite(id: string): Promise<SpriteResult> {
    const generation = this.generation, base = this.base, upper = this.overlay;
    const result = (status: 'missing' | 'filtered' | 'invalid' | 'unsupported', diagnostic: string): SpriteResult => ({ status, id, diagnostic });
    if (!(GUI_SPRITES as readonly string[]).includes(id) && !(CHECKBOX_SPRITES as readonly string[]).includes(id) && !(SLIDER_SPRITES as readonly string[]).includes(id) && !CREATIVE_TAB_SPRITES.includes(id)) return result('unsupported', '仅支持已审计的 GUI sprite');
    if (!base) return result('missing', '未选择客户端基础 JAR');
    try {
      if (upper?.query(atlas).status === 'valid') return result('unsupported', '覆盖包含 GUI atlas 定义，尚不支持合并 atlas source');
      if (!parseAtlas(await base.read(atlas))) return result('unsupported', 'GUI atlas source 不支持');
      const path = `assets/minecraft/textures/gui/sprites/${id.slice('minecraft:'.length)}.png`;
      const upperImage = upper?.query(path).status === 'valid', source = upperImage ? upper! : base;
      if (source.query(path).status !== 'valid') return result('missing', 'sprite 图片不存在');
      const metadataPath = `${path}.mcmeta`;
      const metadataSource = upper?.query(metadataPath).status === 'valid' ? upper : (!upperImage && base.query(metadataPath).status === 'valid' ? base : null);
      const [image, metadata] = await Promise.all([source.read(path), metadataSource?.read(metadataPath) ?? Promise.resolve(null)]);
      if (generation !== this.generation) return result('unsupported', '资源层已变化，请重新查询');
      if (image.length < 33 || ![137,80,78,71,13,10,26,10].every((v, i) => image[i] === v)) return result('invalid', 'PNG 文件头无效');
      const view = new DataView(image.buffer, image.byteOffset, image.byteLength), width = view.getUint32(16), height = view.getUint32(20);
      if (view.getUint32(8) !== 13 || text(image.subarray(12, 16)) !== 'IHDR' || !width || !height || width > 8192 || height > 8192 || width * height > 16_777_216) return result('invalid', 'PNG IHDR 无效或尺寸超限');
      return { status: 'valid', id, imageLayer: source === base ? `基础：${source.layer}` : `覆盖：${source.layer}`, metadataLayer: metadataSource ? `${metadataSource === base ? '基础' : '覆盖'}：${metadataSource.layer}` : null,
        width, height, scaling: scaling(metadata), data: image, diagnostic: '仅检查 PNG 文件头，未验证完整解码；客户端版本为自报，来源未认证。' };
    } catch (error) { if (generation !== this.generation) return result('unsupported', '资源层已变化，请重新查询');
      return result(error instanceof ResourceError && error.code === 'unsupported' ? 'unsupported' : 'invalid', error instanceof Error ? error.message : '资源解析失败'); }
  }
}
