import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { CATALOG } from '../domain/catalog';
import { ScreenGeometryControls } from './ScreenGeometryControls';
import { upgradeColorModeEdit, upgradeFillEdgeEdit, upgradeFillStyleEdit, upgradeImplementationNotesEdit, upgradeLocalizationEdit, upgradeLocalizationResourceEdit, upgradeNodeAliasEdit, upgradeTextStyleEdit, upgradeTooltipEdit, displayText, editNode, literal } from '../domain/model';
import { fillEdgeKey, fillEdgeStyle, fillStyleColors, fillStylePreset, hasCustomFillEdges, type FillEdgeSide, type FillStylePreset } from '../domain/fillStyle';
import { parseProject, PROJECT_SCHEMA_VERSIONS, type GuiNode, type ScreenTabGroup } from '../domain/schema';
import { currentScreen, screenById, editorStore } from '../editor/store';
import { useExportDraft } from '../exports/useExportDraft';
import { fontSession, previewCheckboxLayout } from '../render/previewFont';
import { confirmDeleteSelected } from './confirmDeletion';
import { multiLineLayout, type MultiLineTextNode } from '../render/multiLineText';
import { CycleOptionFields, SelectionFields } from './SelectionFields';
import { Field, TextFields } from './TextSpecField';
import { TooltipFields } from './TooltipFields';
import { isSelectionNode } from '../domain/selection';
import { numericError, type NumericConfig } from '../domain/numeric';
import { isNumericNode, type NumericNode } from '../render/numericWidgets';
import { isProgressNode, progressError, type ProgressNode } from '../domain/progress';
import { isStatusNode, type StatusNode } from '../domain/statusIndicator';
import { StatusFields } from './StatusFields';
import { allDescendants, isCollapsiblePanelNode, isContainerNode } from '../domain/collapsiblePanel';
import { isTreeViewNode } from '../domain/treeView';
import { TreeViewFields } from './TreeViewFields';
import { normalizeNamespaceCandidate, validateLocalizationNamespace } from '../domain/localization';
import { REPEATABLE_LIST_PREVIEW_COUNTS, isRepeatableListNode, repeatablePreviewRows, repeatableTemplateChildren } from '../domain/repeatableList';
import { effectiveButtonColorMode, nativeTextCapabilityNote } from '../domain/nativeTextCapability';
import { embeddedAssetError, embeddedPngError } from '../domain/embeddedImage';

type TextureImageProps = Extract<Extract<GuiNode, { type: 'minecraft:image' }>['props'], { kind: 'texture' }>;
type SpriteImageProps = Extract<Extract<GuiNode, { type: 'minecraft:image' }>['props'], { kind: 'sprite' }>;
type EmbeddedImageProps = Extract<Extract<GuiNode, { type: 'minecraft:image' }>['props'], { kind: 'embedded' }>;
type ImageSourceProps = TextureImageProps | SpriteImageProps | EmbeddedImageProps;
type ImageSourceCache = Map<string, Partial<Record<ImageSourceProps['kind'], ImageSourceProps>>>;

function NumericConstraints({ node, update }: { node: NumericNode; update: (change: (node: GuiNode) => GuiNode, dry?: boolean) => boolean }) {
  const [draft, setDraft] = useState({ min: String(node.props.min), max: String(node.props.max), step: String(node.props.step), initialValue: String(node.props.initialValue), numericType: node.props.numericType, decimals: String(node.props.format.decimals), unit: node.props.format.unit });
  const [error, setError] = useState(''), composing = useRef(false);
  const original = { min: String(node.props.min), max: String(node.props.max), step: String(node.props.step), initialValue: String(node.props.initialValue), numericType: node.props.numericType, decimals: String(node.props.format.decimals), unit: node.props.format.unit };
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const apply = (dry: boolean) => {
    if (!dirty) return;
    if (composing.current) throw new Error('请先完成输入法组合输入');
    if ([draft.min, draft.max, draft.step, draft.initialValue, draft.decimals].some(s => !s.trim())) throw new Error('数值配置不能为空');
    const config: NumericConfig = { min: Number(draft.min), max: Number(draft.max), step: Number(draft.step), initialValue: Number(draft.initialValue), numericType: draft.numericType, format: { decimals: Number(draft.decimals), unit: draft.unit } };
    const reason = numericError(config); if (reason) throw new Error(reason);
    if (!update(n => { if (isNumericNode(n)) Object.assign(n.props, config); return n; }, dry)) throw new Error('数值配置无效');
  };
  useExportDraft({ validate: () => apply(true), commit: () => apply(false) });
  return <section aria-label="数值约束" className="numeric-constraints" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}>
    <label className="field"><span>数值类型</span><select aria-label="数值类型" value={draft.numericType} onChange={e => setDraft({ ...draft, numericType: e.target.value as NumericConfig['numericType'] })}><option value="integer">整数</option><option value="decimal">小数</option></select></label>
    {([['min', '最小值'], ['max', '最大值'], ['step', '步进'], ['initialValue', '初始数值'], ['decimals', '显示小数位']] as const).map(([key, label]) => <label key={key} className="field"><span>{label}</span><input aria-label={label} inputMode="decimal" value={draft[key]} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setError(''); }}/></label>)}
    <label className="field"><span>数值单位</span><input aria-label="数值单位" maxLength={32} value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })}/></label>
    <button disabled={!dirty} onClick={() => { try { apply(true); apply(false); setError(''); } catch (e) { setError((e as Error).message); } }}>应用数值约束</button>
    {error && <p className="field-error" role="alert">{error}</p>}
    <p className="field-note">整组原子提交；最多6位小数。步进锚点为最小值，最大值额外作为可达端点；中点向较大值舍入。单位不进入可编辑数值串。</p>
  </section>;
}

function ProgressRangeConstraints({ node, update }: { node: ProgressNode; update: (change: (node: GuiNode) => GuiNode, dry?: boolean) => boolean }) {
  const original = { min: String(node.props.min), max: String(node.props.max), initialValue: String(node.props.initialValue) };
  const [draft, setDraft] = useState(original), [error, setError] = useState(''), composing = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const apply = (dry: boolean) => {
    if (!dirty) return;
    if (composing.current) throw new Error('请先完成输入法组合输入');
    if ([draft.min, draft.max, draft.initialValue].some(value => !value.trim())) throw new Error('数值配置不能为空');
    const config = { min: Number(draft.min), max: Number(draft.max), initialValue: Number(draft.initialValue) };
    const reason = progressError(config); if (reason) throw new Error(reason);
    if (!update(n => { if (isProgressNode(n)) Object.assign(n.props, config); return n; }, dry)) throw new Error('进度数值配置无效');
  };
  useExportDraft({ validate: () => apply(true), commit: () => apply(false) });
  return <section aria-label="进度数值范围" className="numeric-constraints" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}>
    {([['min', '最小值'], ['max', '最大值'], ['initialValue', '初始值']] as const).map(([key, label]) => <label key={key} className="field"><span>{label}</span><input aria-label={label} inputMode="decimal" value={draft[key]} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setError(''); }}/></label>)}
    <button disabled={!dirty} onClick={() => { try { apply(true); apply(false); setError(''); } catch (e) { setError((e as Error).message); } }}>应用数值范围</button>
    {error && <p className="field-error" role="alert">{error}</p>}
    <p className="field-note">最小值、最大值和初始值作为一组原子应用；不使用步进或量化。min=max 表示唯一值并显示为 100%。</p>
  </section>;
}

function MultiLineDiagnostics({ node }: { node: MultiLineTextNode }) {
  const font = useSyncExternalStore(fontSession.subscribe, fontSession.get);
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return <p>无法测量文字</p>;
  ctx.font = `9px ${font.family}`;
  const layout = multiLineLayout(node, text => ctx.measureText(text).width);
  return <p className="field-note" aria-label="多行文本布局诊断" aria-live="polite">浏览器近似：{layout.width} × {layout.height} px，{layout.lines.length} 行{layout.truncated ? '；已按最大行数截断（无省略号）' : ''}。预留区 {node.bounds.w} × {node.bounds.h} px；原生实际尺寸由游戏字体和内容决定。阴影及超宽单字可能超出预留区。</p>;
}


function CheckboxDiagnostics({ node, screen }: { node: Extract<GuiNode, { type: 'minecraft:checkbox' }>; screen: { width: number; height: number } }) {
  const font = useSyncExternalStore(fontSession.subscribe, fontSession.get);
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return <p className="field-note" aria-live="polite">无法测量文字；溢出未检查。</p>;
  const layout = previewCheckboxLayout(ctx, node, font.family);
  const outside = node.bounds.x + layout.textX + layout.textWidth > screen.width || node.bounds.y + layout.textY < 0 || node.bounds.y + layout.textY + layout.textHeight > screen.height;
  return <div className="field-note" aria-live="polite" aria-label="复选框布局诊断">
    {layout.overflow && <p>文字超出参考边界（浏览器近似）。</p>}
    {outside && <p>文字超出设计区（浏览器近似）。</p>}
    {layout.truncated && <p>文字预览超过 1024 UTF-16 单元，已截断；设计数据保留原文。</p>}
    {!layout.overflow && !outside && !layout.truncated && <p>浏览器近似未检测到文字溢出；游戏内排版待验证。</p>}
  </div>;
}


function ImageSourceFields({ node, update, cache }: { node: Extract<GuiNode, { type: 'minecraft:image' }>; update: (change: (node: GuiNode) => GuiNode, validateOnly?: boolean) => boolean; cache: ImageSourceCache }) {
  const assets = useStore(editorStore, s => s.doc.assets ?? []);
  const [error, setError] = useState('');
  const saved = cache.get(node.id) ?? {};
  saved[node.props.kind] = structuredClone(node.props);
  cache.set(node.id, saved);
  const commitTexture = (change: (props: TextureImageProps) => TextureImageProps, dry = false) => update(current => {
    if (current.type !== 'minecraft:image' || current.props.kind !== 'texture') return current;
    const props = change(current.props);
    if (!dry) cache.set(node.id, { ...cache.get(node.id), texture: structuredClone(props) });
    return { ...current, props };
  }, dry);
  const commitSprite = (change: (props: SpriteImageProps) => SpriteImageProps, dry = false) => update(current => {
    if (current.type !== 'minecraft:image' || current.props.kind !== 'sprite') return current;
    const props = change(current.props);
    if (!dry) cache.set(node.id, { ...cache.get(node.id), sprite: structuredClone(props) });
    return { ...current, props };
  }, dry);
  const commitEmbedded = (change: (props: EmbeddedImageProps) => EmbeddedImageProps) => update(current => {
    if (current.type !== 'minecraft:image' || current.props.kind !== 'embedded') return current;
    return { ...current, props: change(current.props) };
  });
  const useAsset = (asset: (typeof assets)[number]) => {
    try { editorStore.getState().useEmbeddedImage(node.id, asset.id); setError(''); }
    catch (cause) { setError((cause as Error).message); }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('PNG 不能超过 3 MB');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pngError = embeddedPngError(bytes); if (pngError) throw new Error(pngError);
      const view = new DataView(bytes.buffer), width = view.getUint32(16), height = view.getUint32(20);
      let binary = ''; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      const asset = { id: `asset_${crypto.randomUUID().slice(0, 8)}`, name: file.name, mime: 'image/png' as const, width, height, data: btoa(binary) };
      const assetError = embeddedAssetError(asset); if (assetError) throw new Error(assetError);
      editorStore.getState().attachEmbeddedImage(node.id, asset); setError('');
    } catch (cause) { setError((cause as Error).message); }
  };
  const sourceSelector = <label className="field"><span>图像来源</span><select aria-label="图像来源" value={node.props.kind} onChange={event => {
      const kind = event.target.value as ImageSourceProps['kind'];
      if (kind === node.props.kind) return;
      const texture: TextureImageProps = { kind: 'texture', resourceId: 'minecraft:textures/gui/container/dispenser.png', textureWidth: 256, textureHeight: 256, uv: { x: 0, y: 0, width: 256, height: 256 } };
      const sprite: SpriteImageProps = { kind: 'sprite', spriteId: 'minecraft:container/slot' };
      if (kind === 'embedded') { const asset = assets[0]; if (asset) useAsset(asset); else setError('请先上传一张 PNG 贴图'); return; }
      const current = cache.get(node.id) ?? {};
      const next = kind === 'texture' ? current.texture ?? texture : current.sprite ?? sprite;
      cache.set(node.id, { ...current, [node.props.kind]: structuredClone(node.props) });
      update(n => n.type === 'minecraft:image' ? { ...n, source: { category: 'vanilla-draw', className: 'net.minecraft.client.gui.GuiGraphics', member: kind === 'sprite' ? 'blitSprite' : 'blit' }, props: structuredClone(next) } : n);
    }}><option value="texture">Texture PNG</option><option value="sprite">GUI Sprite</option><option value="embedded">嵌入式 PNG</option></select></label>;
  const uploadField = <label className="field"><span>上传 PNG</span><input aria-label="上传嵌入式贴图" type="file" accept="image/png" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }}/></label>;
  if (node.props.kind === 'texture') {
    const props = node.props;
    return <>{sourceSelector}{uploadField}
      <Field label="Texture ResourceLocation" value={props.resourceId} onCommit={(v, dry) => commitTexture(current => ({ ...current, resourceId: v.trim() }), dry)}/>
      <div className="geometry">{(['textureWidth', 'textureHeight'] as const).map(key => <Field key={`${key}-${props[key]}`} label={`逻辑贴图 ${key.endsWith('Width') ? '宽' : '高'}`} unit="px" type="number" min={1} value={props[key]} onCommit={(v, dry) => commitTexture(current => ({ ...current, [key]: v.trim() ? Number(v) : NaN }), dry)}/>)}</div>
      <div className="geometry">{(['x', 'y', 'width', 'height'] as const).map(key => <Field key={`${key}-${props.uv[key]}`} label={`UV ${key}`} unit="px" type="number" min={key === 'width' || key === 'height' ? 1 : 0} value={props.uv[key]} onCommit={(v, dry) => commitTexture(current => ({ ...current, uv: { ...current.uv, [key]: v.trim() ? Number(v) : NaN } }), dry)}/>)}</div>
      <p className="field-note">Texture 的 UV 按逻辑贴图尺寸定义，并映射到资源 PNG 实际像素；整个 UV 区域缩放至节点 W×H。预览需在资源检查中加载客户端 JAR 或覆盖包。</p>
      {error && <p className="field-error" role="alert">{error}</p>}
    </>;
  }
  if (node.props.kind === 'embedded') {
    const props = node.props, asset = assets.find(item => item.id === props.assetId);
    return <>{sourceSelector}{uploadField}
      <label className="field"><span>项目内贴图</span><select aria-label="项目内贴图" value={props.assetId} onChange={event => useAsset(assets.find(item => item.id === event.target.value)!)}>{assets.map(item => <option key={item.id} value={item.id}>{item.name} · {item.width}×{item.height}</option>)}</select></label>
      <p className="field-note">嵌入式 PNG 存放在权威项目 JSON，不依赖客户端 JAR；导出和 Static Bake 使用同一图像数据。{asset ? ` 当前：${asset.name} · ${asset.width}×${asset.height}` : ' 当前资源缺失。'}</p>
      <div className="geometry">{(['x', 'y', 'width', 'height'] as const).map(key => <Field key={`${key}-${props.uv[key]}`} label={`UV ${key}`} unit="px" type="number" min={key === 'width' || key === 'height' ? 1 : 0} value={props.uv[key]} onCommit={(v, dry) => dry ? true : commitEmbedded(current => ({ ...current, uv: { ...current.uv, [key]: v.trim() ? Number(v) : NaN } }))}/>)}</div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </>;
  }
  const props = node.props;
  return <>{sourceSelector}{uploadField}<Field label="GUI Sprite ID" value={props.spriteId} onCommit={(v, dry) => commitSprite(current => ({ ...current, spriteId: v.trim() }), dry)}/><p className="field-note">Sprite 首版仅支持 Minecraft GUI atlas ResourceLocation；按 atlas metadata 的 stretch/tile/nine-slice 规则映射至 W×H，不支持自定义 atlas。</p>{error && <p className="field-error" role="alert">{error}</p>}</>;
}
function ColorPicker({ value, commit }: { value: string; commit: (color: string) => boolean }) {
  const [draft, setDraft] = useState(value); const applied = useRef(value);
  useEffect(() => { setDraft(value); applied.current = value; }, [value]);
  const apply = () => { if (draft !== applied.current && commit(draft)) applied.current = draft; };
  useExportDraft({ validate: () => {}, commit: apply });
  return <label className="field"><span>可视取色</span><input aria-label="可视取色" type="color" value={'#' + draft.slice(3)} onChange={e => setDraft(draft.slice(0, 3) + e.target.value.slice(1).toUpperCase())} onBlur={apply}/><button type="button" onClick={apply}>应用颜色</button></label>;
}
function ArgbColorField({ label, value, commit }: { label: string; value: string; commit: (value: string, validateOnly?: boolean) => boolean }) {
  return <><Field key={`${label}-${value}`} label={`${label} ARGB`} value={value} onCommit={commit}/>
    <ColorPicker key={label} value={value} commit={color => commit(color)}/></>;
}
type FillNode = Extract<GuiNode, { type: 'minecraft:fill' }>;
function FillStyleFields({ node, update }: { node: FillNode; update: (change: (node: GuiNode) => GuiNode, validateOnly?: boolean) => boolean }) {
  const style = fillStylePreset(node), colors = fillStyleColors(node), edges = fillEdgeStyle(node);
  const edgeSides: [FillEdgeSide, string][] = [['top', '上边'], ['right', '右边'], ['bottom', '下边'], ['left', '左边']];
  const setEdge = (side: FillEdgeSide, kind: 'color' | 'width') => (value: string, dry = false) => update(current => {
    if (current.type !== 'minecraft:fill') return current;
    const key = fillEdgeKey(side, kind), props: Record<string, unknown> = { ...current.props };
    if (kind === 'width') props[key] = value.trim() ? Number(value) : undefined;
    else props[key] = value;
    return { ...current, props: props as typeof current.props };
  }, dry);
  const setColor = (key: 'color' | 'borderColor' | 'highlightColor' | 'shadowColor') => (value: string, dry = false) => update(current => current.type === 'minecraft:fill'
    ? { ...current, props: { ...current.props, [key]: value } }
    : current, dry);
  return <section className="fill-style-fields" aria-label="Rectangle 静态样式">
    <label className="field"><span>样式预设</span><select aria-label="Rectangle 样式预设" value={style} onChange={event => update(current => current.type === 'minecraft:fill'
      ? { ...current, props: { ...current.props, stylePreset: event.target.value as FillStylePreset } }
      : current)}>
      <option value="plain">Plain · 纯色</option><option value="framed">Framed · 1px 边框</option>
      <option value="bevel_raised">Minecraft Bevel · 凸起</option><option value="bevel_inset">Minecraft Bevel · 凹陷</option>
    </select></label>
    <ArgbColorField label="填充色" value={node.props.color} commit={setColor('color')}/>
    {style === 'plain' && <details className="edge-border-fields" open>
      <summary>纯色四边（颜色与宽度）</summary>
      {edgeSides.map(([side, label]) => <div className="edge-border-row" key={side}>
        <strong>{label}</strong>
        <ArgbColorField label={`${label}颜色`} value={edges[side].color} commit={setEdge(side, 'color')}/>
        <Field key={`${side}-width-${edges[side].width}`} label={`${label}宽`} unit="px" type="number" min={0} max={64} value={edges[side].width} onCommit={(value, dry) => setEdge(side, 'width')(value, dry)}/>
      </div>)}
      {hasCustomFillEdges(node) && <button type="button" onClick={() => update(current => {
        if (current.type !== 'minecraft:fill') return current;
        const props = { ...current.props };
        for (const [side] of edgeSides) { delete (props as Record<string, unknown>)[fillEdgeKey(side, 'color')]; delete (props as Record<string, unknown>)[fillEdgeKey(side, 'width')]; }
        return { ...current, props };
      })}>恢复默认四边（填充色 / 1px）</button>}
      <p className="field-note">默认四边颜色与填充色相同、宽度 1px；宽度只向矩形内部增加。Minecraft GuiGraphics 没有 per-edge 边框 API（<code>renderOutline</code> 只有单色 1px），实现需要四次 <code>fill</code> 自绘；如需像素级稳定或复用，推荐 Static Bake。</p>
    </details>}
    {style !== 'plain' && <ArgbColorField label="边框色" value={colors.borderColor} commit={setColor('borderColor')}/>}
    {(style === 'bevel_raised' || style === 'bevel_inset') && <>
      <ArgbColorField label="高亮色" value={colors.highlightColor} commit={setColor('highlightColor')}/>
      <ArgbColorField label="阴影色" value={colors.shadowColor} commit={setColor('shadowColor')}/>
    </>}
    <p className="field-note">Plain 保留原始整块填充。Framed 使用 1 GUI px 内边框，最小 3×3；凸起/凹陷 Bevel 使用 1 px 外轮廓与 1 px 明暗内缘，最小 5×5。颜色使用 #AARRGGBB。</p>
  </section>;
}
export function ProjectName({ notify, disabled }: { notify: (message: string, error?: boolean) => void; disabled: boolean }) {
  const project = useStore(editorStore, s => s.doc.project);
  const suggestion = normalizeNamespaceCandidate(project.name);
  return <fieldset disabled={disabled}><Field key={project.name} label="项目名称" value={project.name} onCommit={(value, dry) => {
    const next = value.trim(); if (!next) throw new Error('项目名称不能为空');
    if (dry) { const doc = structuredClone(editorStore.getState().doc); doc.project.name = next; parseProject(JSON.stringify(doc)); }
    else { editorStore.getState().renameProject(next); notify('项目名称已更新'); }
  }}/><details className="localization-settings"><summary>本地化 {project.localizationNamespace ?? suggestion.value ?? '需设置'}</summary><Field key={project.localizationNamespace ?? ''} label="本地化命名空间" value={project.localizationNamespace ?? ''} placeholder={suggestion.value ? `建议：${suggestion.value}` : '请显式填写'} onCommit={(raw, dry) => {
    const value = raw.trim(); const namespaceError = value ? validateLocalizationNamespace(value) : null; if (namespaceError) throw new Error(namespaceError);
    if (dry) { const doc = structuredClone(editorStore.getState().doc); if (value) doc.project.localizationNamespace = value; else delete doc.project.localizationNamespace; if (value) { doc.schemaVersion = '0.43.0'; doc.entryScreenId ??= doc.screens[0].id; doc.screenTabGroups ??= []; } parseProject(JSON.stringify(doc)); }
    else { editorStore.getState().setLocalizationNamespace(value || undefined); notify(value ? '本地化命名空间已更新' : '使用项目名称生成命名空间建议'); }
  }}/>{!suggestion.value && <small role="alert" className="field-error">{suggestion.reason}</small>}<small>留空表示根据项目名称生成临时建议；仅保存的命名空间会进入项目。</small></details></fieldset>;
}

const nodeLabel = (node: GuiNode) => {
  if (node.alias) return `${node.alias} · ${CATALOG[node.type].label} (${node.id})`;
  const text = node.type === 'minecraft:creative-tab' ? node.props.name : node.type === 'minecraft:button' || node.type === 'minecraft:checkbox' ? displayText(node.props.message) : node.type === 'minecraft:string-widget' ? displayText(node.props.text) : node.type === 'minecraft:edit-box' ? displayText(node.props.narration) : node.type === 'minecraft:cycle-button' ? displayText(node.props.name) : '';
  return `${CATALOG[node.type].label}${text ? ` · ${text.slice(0, 48)}` : ''} (${node.id})`;
};
function TabEditingViews({ nodes, selections, setSelections, disabled }: { nodes: GuiNode[]; selections: Record<string, string>; setSelections: (value: Record<string, string>) => void; disabled: boolean }) {
  const tabs = nodes.filter((n): n is Extract<GuiNode, {type: 'minecraft:creative-tab'}> => n.type === 'minecraft:creative-tab' && !!n.props.groupId);
  const groups = [...new Set(tabs.map(n => n.props.groupId!))];
  if (!groups.length) return null;
  return <section className="tab-views" aria-label="标签编辑视图"><h3 className="section-title">标签编辑视图 <span>仅本次会话</span></h3>
    {groups.map(group => { const members = tabs.filter(n => n.props.groupId === group), current = members.find(n => n.id === selections[group]) ?? members.find(n => n.props.selected)!;
      return <div className="tab-group" key={group}><p className="field-note">组 {group} · 正在编辑：{current ? nodeLabel(current) : '无'}</p>
        {members.map(tab => <button key={tab.id} type="button" disabled={disabled} aria-pressed={tab.id === current?.id} onClick={() => setSelections({ ...selections, [group]: tab.id })}>编辑 {tab.props.name} · {tab.id}{tab.props.selected ? '（设计初始）' : ''}</button>)}
      </div>; })}
    <p className="field-note">仅切换画布编辑内容；测试从设计初态开始，导出始终使用设计初态。</p>
  </section>;
}

function TabGroupEditor({ node, nodes, notify }: { node: Extract<GuiNode, { type: 'minecraft:creative-tab' }>; nodes: GuiNode[]; notify: (message: string, error?: boolean) => void }) {
  const [group, setGroup] = useState(node.props.groupId ?? ''), [contents, setContents] = useState<string[]>(node.props.contentIds ?? []), [hideSelected, setHideSelected] = useState(false);
  useEffect(() => { setGroup(node.props.groupId ?? ''); setContents(node.props.contentIds ?? []); setHideSelected(false); }, [node.id, node.props.groupId, node.props.contentIds]);
  const contentNodes = nodes.filter(n => n.type !== 'minecraft:creative-tab'), selectedCount = contentNodes.filter(n => contents.includes(n.id)).length;
  const effectiveGroup = group.trim();
  const claimedBySiblings = new Set(effectiveGroup ? nodes.filter((n): n is Extract<GuiNode, { type: 'minecraft:creative-tab' }> => n.type === 'minecraft:creative-tab' && n.id !== node.id && n.props.groupId === effectiveGroup).flatMap(n => n.props.contentIds ?? []) : []);
  const candidateNodes = contentNodes.filter(n => !claimedBySiblings.has(n.id) || contents.includes(n.id));
  const visibleNodes = hideSelected ? candidateNodes.filter(n => !contents.includes(n.id)) : candidateNodes;
  return <div><label className="field"><span>标签组 ID（留空为独立标签）</span><input aria-label="标签组 ID" value={group} onChange={e => setGroup(e.target.value)} /></label>
    <p className="field-note">同组只选中一个标签；关联后显示由标签控制，原始可见性保留；先选择内容，再保存关联。同组其他 CreativeTab 已保存的内容默认不在当前列表重复显示，切回该标签时才显示；已共享内容仍可在此取消。</p>
    <div className="tab-content-toolbar"><span>已选内容 {selectedCount}</span>{selectedCount > 0 && <button type="button" aria-label={hideSelected ? '展开已选内容' : '折叠已选内容'} aria-expanded={!hideSelected} onClick={() => setHideSelected(value => !value)}>{hideSelected ? '展开已选' : '折叠已选'}</button>}{hideSelected && <small>仅显示未选内容</small>}</div>
    {visibleNodes.map(n => <label className="check" key={n.id}><input type="checkbox" aria-label={`标签内容 ${n.id}`} checked={contents.includes(n.id)} onChange={e => setContents(e.target.checked ? [...contents, n.id] : contents.filter(id => id !== n.id))}/>{nodeLabel(n)}{n.type === 'native_region' ? ' · 未归属时为 Persistent' : ''}</label>)}
    {hideSelected && selectedCount === contentNodes.length && <p className="field-note">全部内容已选；展开后可取消选择。</p>}
    <button onClick={() => { try { editorStore.getState().configureTab(node.id, group.trim() || undefined, group.trim() ? contents : [], node.props.selected); notify('标签组已保存 · 可撤销'); } catch (e) { notify((e as Error).message, true); } }}>保存标签组</button>
  </div>;
}

function ScreenNavigationGroupEditor({ group, doc, currentNodeId, notify }: { group: ScreenTabGroup; doc: ReturnType<typeof editorStore.getState>['doc']; currentNodeId: string; notify: (message: string, error?: boolean) => void }) {
  const [draft, setDraft] = useState<ScreenTabGroup>(() => structuredClone(group));
  useEffect(() => setDraft(structuredClone(group)), [group]);
  const referenced = (tabId: string) => doc.screens.some(item => item.nodes.some(n => n.type === 'minecraft:creative-tab' && n.props.navigationGroupId === group.id && n.props.navigationTabId === tabId));
  const changeTab = (index: number, patch: Partial<ScreenTabGroup['tabs'][number]>) => setDraft(value => ({ ...value, tabs: value.tabs.map((tab, i) => i === index ? { ...tab, ...patch } : tab) }));
  return <div className="screen-navigation-group">
    <label className="field"><span>项目级导航组名称</span><input aria-label="Screen 导航组名称" maxLength={128} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
    <p className="field-note">标签定义在项目级维护；本 Screen 上的 CreativeTab 只保存组和标签 ID。数组顺序就是显示顺序。</p>
    {draft.tabs.map((tab, index) => <div className="screen-navigation-tab" key={tab.id}>
      <strong>{index + 1}. {tab.id}</strong>
      <label className="field"><span>标签名称</span><input aria-label={`导航标签名称 ${tab.id}`} maxLength={128} value={tab.name} onChange={e => changeTab(index, { name: e.target.value })}/></label>
      <label className="field"><span>目标 Screen</span><select aria-label={`导航目标 Screen ${tab.id}`} value={tab.targetScreenId} onChange={e => changeTab(index, { targetScreenId: e.target.value })}>{doc.screens.map(item => <option key={item.id} value={item.id}>{displayText(item.title)} · {item.id}</option>)}</select></label>
      <div className="screen-navigation-row-actions"><button type="button" disabled={index === 0} onClick={() => setDraft(value => { const tabs = [...value.tabs]; [tabs[index - 1], tabs[index]] = [tabs[index], tabs[index - 1]]; return { ...value, tabs }; })}>上移</button><button type="button" disabled={index === draft.tabs.length - 1} onClick={() => setDraft(value => { const tabs = [...value.tabs]; [tabs[index + 1], tabs[index]] = [tabs[index], tabs[index + 1]]; return { ...value, tabs }; })}>下移</button><button type="button" disabled={draft.tabs.length <= 1 || referenced(tab.id)} title={referenced(tab.id) ? '仍有 Screen 实例引用此标签' : '删除标签'} onClick={() => setDraft(value => ({ ...value, tabs: value.tabs.filter((_, i) => i !== index) }))}>删除</button></div>
    </div>)}
    <button type="button" disabled={draft.tabs.length >= 100 || !doc.screens.some(item => !draft.tabs.some(tab => tab.targetScreenId === item.id))} onClick={() => {
      const used = new Set([doc.project.id, ...doc.screens.flatMap(item => [item.id, ...item.nodes.map(n => n.id), ...item.behaviors.map(r => r.id), ...(item.screenTargets ?? []).map(t => t.id)]), ...(doc.screenTabGroups ?? []).flatMap(item => [item.id, ...item.tabs.map(tab => tab.id)]), ...draft.tabs.map(tab => tab.id)]);
      let n = 1; while (used.has(`navtab_${n}`)) n++;
      const targetScreenId = doc.screens.find(item => !draft.tabs.some(tab => tab.targetScreenId === item.id))!.id;
      setDraft(value => ({ ...value, tabs: [...value.tabs, { id: `navtab_${n}`, name: `标签 ${n}`, targetScreenId }] }));
    }}>添加导航标签</button>
    <button type="button" onClick={() => { try { editorStore.getState().saveScreenTabGroup(draft); notify('项目级标签组已保存 · 可撤销'); } catch (error) { notify((error as Error).message, true); } }}>保存项目级标签组</button>
    <p className="field-note">选中此组件代表的标签：{draft.tabs.find(tab => tab.id === (doc.screens.flatMap(item => item.nodes).find(n => n.id === currentNodeId && n.type === 'minecraft:creative-tab') as Extract<GuiNode, {type:'minecraft:creative-tab'}> | undefined)?.props.navigationTabId)?.name ?? '未选择'}</p>
  </div>;
}

function CreativeTabModeEditor({ node, doc, screenNodes, notify }: { node: Extract<GuiNode, { type: 'minecraft:creative-tab' }>; doc: ReturnType<typeof editorStore.getState>['doc']; screenNodes: GuiNode[]; notify: (message: string, error?: boolean) => void }) {
  const navigation = node.props.tabMode === 'screen-navigation';
  const group = doc.screenTabGroups?.find(item => item.id === node.props.navigationGroupId);
  const target = group?.tabs.find(tab => tab.id === node.props.navigationTabId);
  const firstAvailableTab = (groupId: string) => {
    const group = doc.screenTabGroups?.find(item => item.id === groupId);
    const used = new Set(screenNodes.filter(item => item.type === 'minecraft:creative-tab' && item.id !== node.id && item.props.tabMode === 'screen-navigation' && item.props.navigationGroupId === groupId).map(item => item.type === 'minecraft:creative-tab' ? item.props.navigationTabId : undefined));
    return group?.tabs.find(tab => !used.has(tab.id)) ?? group?.tabs[0];
  };
  return <div className="creative-tab-mode-editor">
    <label className="field"><span>标签模式</span><select aria-label="CreativeTab 模式" value={navigation ? 'screen-navigation' : 'content'} onChange={e => {
      try {
        if (e.target.value === 'content') { editorStore.getState().configureTab(node.id, undefined, [], node.props.selected); notify('已切换为 H2-B 内容切换模式'); }
        else if (!doc.entryScreenId) notify('请先在项目结构中明确选择项目入口 Screen，再启用导航标签', true);
        else if (doc.screenTabGroups?.length) { const firstGroup = doc.screenTabGroups[0], firstTab = firstAvailableTab(firstGroup.id); if (!firstTab) throw new Error('当前标签组没有可用标签，请先编辑组定义'); editorStore.getState().configureCreativeTabNavigation(node.id, firstGroup.id, firstTab.id); notify(`已关联项目级导航组 ${firstGroup.id}；请为此 Screen 选择对应标签`); }
        else { const id = editorStore.getState().createScreenTabGroup(node.id); notify(`已创建项目级导航组 ${id}；请补齐标签并为各 Screen 放置标签实例`); }
      } catch (error) { notify((error as Error).message, true); }
    }}><option value="content">内容切换（H2-B）</option><option value="screen-navigation">Screen 导航</option></select></label>
    {!navigation && <><TabGroupEditor node={node} nodes={screenNodes} notify={notify}/><p className="field-note">内容模式沿用 H2-B：同一 Screen 内切换关联组件的显示状态。</p></>}
    {navigation && <>
      {doc.screenTabGroups?.length ? <label className="field"><span>项目级标签组</span><select aria-label="Screen 导航组" value={node.props.navigationGroupId ?? ''} onChange={e => {
        const nextGroup = doc.screenTabGroups?.find(item => item.id === e.target.value), tab = nextGroup && firstAvailableTab(nextGroup.id); if (!nextGroup || !tab) return;
        try { editorStore.getState().configureCreativeTabNavigation(node.id, nextGroup.id, tab.id); } catch (error) { notify((error as Error).message, true); }
      }}>{doc.screenTabGroups.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label> : <p className="field-note">尚无项目级导航组。可从入口 Screen 上的 CreativeTab 创建。</p>}
      {group && <><label className="field"><span>此组件代表的导航标签</span><select aria-label="CreativeTab 导航标签" value={node.props.navigationTabId ?? ''} onChange={e => { try { editorStore.getState().configureCreativeTabNavigation(node.id, group.id, e.target.value); } catch (error) { notify((error as Error).message, true); } }}>{group.tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.name} → {tab.targetScreenId}</option>)}</select></label>
        <p className="field-note">目标：{target?.name ?? '无'} → {target?.targetScreenId ?? '无'}。当前页选中纹理由当前真实 Screen ID 推导。每页各放置一组对应的视觉标签实例。</p>
        <ScreenNavigationGroupEditor key={group.id} group={group} doc={doc} currentNodeId={node.id} notify={notify}/></>}
    </>}
  </div>;
}


function ImplementationNotesEditor({ value, commit, disabled = false }: { value: string; commit: (value: string, validateOnly?: boolean) => boolean; disabled?: boolean }) {
  const [draft, setDraft] = useState(value), [error, setError] = useState('');
  const applied = useRef(value);
  useEffect(() => { setDraft(value); applied.current = value; setError(''); }, [value]);
  const apply = (validateOnly: boolean) => {
    if (draft === applied.current) return;
    if (draft.length > 4096) throw new Error('实现备注最多 4096 个字符');
    if (commit(draft, validateOnly) === false) throw new Error('实现备注输入无效');
    if (!validateOnly) { applied.current = draft; setError(''); }
  };
  useExportDraft({ validate: () => { try { apply(true); } catch (e) { setError((e as Error).message); throw e; } }, commit: () => { try { apply(false); } catch (e) { setError((e as Error).message); } } });
  return <div className="implementation-notes-editor">
    <textarea aria-label="实现备注" rows={5} maxLength={4096} placeholder="记录业务数据来源、交互意图或 Java 接入点；不会执行，也不会改变初始状态。" value={draft} disabled={disabled}
      onChange={event => { setDraft(event.target.value); setError(''); }}
      onBlur={() => { try { apply(true); apply(false); } catch (e) { setError((e as Error).message); } }}
      onKeyDown={event => { if (event.key === 'Escape') { setDraft(applied.current); setError(''); } }}/>
    <div className="implementation-notes-actions"><button type="button" disabled={disabled || draft === applied.current} onClick={() => { try { apply(true); apply(false); } catch (e) { setError((e as Error).message); } }}>应用备注</button><button type="button" disabled={disabled || !draft} onClick={() => { setDraft(''); setError(''); try { if (commit('', false) === false) throw new Error('无法清空实现备注'); applied.current = ''; } catch (e) { setError((e as Error).message); } }}>清空</button><small>{draft.length} / 4096</small></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <p className="field-note">仅作为设计态实现说明导出到 Agent Specification；不是 F2 指令，不影响画布、预览、命中或游戏初始状态。</p>
  </div>;
}

export function Inspector({ notify, readOnly = false, emptyControls, editTabs, setEditTabs, containerScroll, repeatPreviewRows, setRepeatPreviewRows, templateEditingId, onEnterTemplate, onExitTemplate, onOpenBake, onMouseEnter, onMouseLeave, onPin }: { templateEditingId: string | null; onEnterTemplate: (id: string) => void; onExitTemplate: () => void; onOpenBake?: () => void; onMouseEnter?: () => void; onMouseLeave?: () => void; onPin?: () => void; notify: (message: string, error?: boolean) => void; readOnly?: boolean; emptyControls: ReactNode; editTabs: Record<string, string>; setEditTabs: (value: Record<string, string>) => void; containerScroll: Readonly<Record<string, number>>; repeatPreviewRows: Record<string, number>; setRepeatPreviewRows: (update: Record<string, number> | ((previous: Record<string, number>) => Record<string, number>)) => void }) {
  const imageSourceCache = useRef<ImageSourceCache>(new Map()).current;
  const doc = useStore(editorStore, s => s.doc);
  const selected = useStore(editorStore, s => s.selected);
  const gesture = useStore(editorStore, s => s.gesture);
  const screen = useStore(editorStore, currentScreen);
  const screenId = useStore(editorStore, s => s.currentScreenId);
  const node = screen.nodes.find(n => n.id === selected);
  const siblings = node ? screen.nodes.filter(item => item.parentContainerId === node.parentContainerId) : [];
  const layerIndex = node ? siblings.findIndex(item => item.id === node.id) : -1;
  const colorModeNode = node?.type === 'minecraft:button' || node?.type === 'minecraft:cycle-button' ? node : null;
  const effectiveColorMode = colorModeNode ? effectiveButtonColorMode(colorModeNode) : null;
  const colorControlsHidden = effectiveColorMode === 'native';
  const update = (change: (node: GuiNode) => GuiNode, validateOnly = false) => {
    if (!node) return false;
    try {
      const current = editorStore.getState();
      if (current.currentScreenId !== screenId) throw new Error('Screen 已切换，无法提交旧草稿');
      if (current.blocked) throw new Error(current.blocked);
      if (validateOnly) {
        const copy = structuredClone(current.doc);
        screenById(copy, screenId).nodes = screenById(copy, screenId).nodes.map(n => n.id === node.id ? editNode(n, change) : n);
        if (screenById(copy, screenId).nodes.some(n => n.type === 'minecraft:status-indicator' && n.props.statuses.some(status => status.text?.kind === 'translate')) && PROJECT_SCHEMA_VERSIONS.indexOf(copy.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.22.0')) { copy.schemaVersion = '0.22.0'; copy.screenTabGroups ??= []; copy.entryScreenId ??= copy.screens[0].id; }
        upgradeFillStyleEdit(copy); upgradeNodeAliasEdit(copy); upgradeTextStyleEdit(copy); upgradeLocalizationEdit(copy); upgradeTooltipEdit(copy); upgradeLocalizationResourceEdit(copy); upgradeColorModeEdit(copy); upgradeImplementationNotesEdit(copy); upgradeFillEdgeEdit(copy); parseProject(JSON.stringify(copy));
      } else { current.updateNode(node.id, change); notify('属性已更新'); }
      return true;
    } catch (e) { notify((e as Error).message, true); if (validateOnly) throw e; return false; }
  };
  const updateScreenNotes = (value: string, validateOnly = false) => {
    const current = editorStore.getState();
    if (current.currentScreenId !== screenId) throw new Error('Screen 已切换，无法提交旧草稿');
    if (current.blocked) throw new Error(current.blocked);
    if (validateOnly) {
      const copy = structuredClone(current.doc), target = screenById(copy, screenId);
      if (value.trim()) target.implementationNotes = value; else delete target.implementationNotes;
      upgradeImplementationNotesEdit(copy); parseProject(JSON.stringify(copy)); return true;
    }
    current.setScreenNotes(value); notify(value.trim() ? 'Screen 实现备注已更新' : 'Screen 实现备注已清空'); return true;
  };
  const checkbox = (label: string, checked: boolean, change: (checked: boolean) => GuiNode): ReactNode => <label className="check"><input type="checkbox" aria-label={label} checked={checked} onChange={e => update(() => change(e.target.checked))}/>{label}</label>;
  return <aside className="inspector" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    <div className="panel-heading"><span>INSPECTOR</span><span className="tiny-dot"/></div>{onPin && <button className="sidebar-pin" onClick={onPin}>固定属性栏</button>}
    <ScreenGeometryControls key={screen.id} notify={notify} readOnly={readOnly || !!gesture} showPanel={!node}/>
    <TabEditingViews nodes={screen.nodes} selections={editTabs} setSelections={setEditTabs} disabled={readOnly || !!gesture}/>
    <div className="inspector-controls" hidden={!!node}>
      {emptyControls}
      {!node && <div className="document-summary"><span className="file-icon" aria-hidden="true">▤</span><div><strong>{doc.project.name}</strong><small>{screen.id} · {screen.designSize.width} × {screen.designSize.height} GUI px</small></div></div>}
      {!node && <div className="inspector-empty"><h3>未选择组件</h3><p>在画布或项目结构中选择组件，编辑位置、尺寸与属性。画布尺寸仍可在上方调整。</p></div>}
      {!node && <details className="inspector-section implementation-notes" data-testid="screen-implementation-notes">
        <summary><span>Screen 实现备注</span>{screen.implementationNotes?.trim() ? <span className="notes-badge">已填写</span> : <span className="notes-muted">未填写</span>}</summary>
        <div className="section-body"><ImplementationNotesEditor key={screen.id} value={screen.implementationNotes ?? ''} commit={updateScreenNotes}/></div>
      </details>}
    </div>
    {node && <fieldset disabled={!!gesture || readOnly} key={node.id}>
        {templateEditingId && <div className="template-edit-banner inspector-template-banner" role="status" data-testid="inspector-template-banner"><span>Row Template 编辑模式 · <code>{templateEditingId}</code></span><button type="button" onClick={onExitTemplate}>退出模板编辑</button></div>}
        <div className="selected-heading"><span className="node-glyph">{CATALOG[node.type].glyph}</span><div><h2>{node.alias ?? CATALOG[node.type].label}</h2><code>{node.id}</code></div></div>
        {node.type === 'minecraft:repeatable-list' && templateEditingId !== node.id && <button type="button" className="context-action" data-testid="enter-template-edit" onClick={() => onEnterTemplate(node.id)}>编辑 Row Template</button>}
        <Field key={`alias-${node.id}-${node.alias ?? ''}`} label="控件别名" value={node.alias ?? ''} onCommit={(raw, dry) => update(n => { const alias = raw.trim(); if (alias) n.alias = alias; else delete n.alias; return n; }, dry)}/>
        <p className="field-note">仅用于编辑器识别，最多 128 字；留空恢复默认名称。不会修改游戏文案或稳定 ID。</p>
        <div className="layer-order-actions" aria-label="绘制顺序"><span>绘制顺序 {layerIndex + 1} / {siblings.length}</span><button type="button" disabled={layerIndex <= 0} onClick={() => editorStore.getState().moveNode(node.id, 'earlier')}>绘制更早</button><button type="button" disabled={layerIndex < 0 || layerIndex >= siblings.length - 1} onClick={() => editorStore.getState().moveNode(node.id, 'later')}>绘制更晚</button></div>

        <details className="inspector-section implementation-notes" data-testid="node-implementation-notes">
          <summary><span>实现备注</span>{node.implementationNotes?.trim() ? <span className="notes-badge">已填写</span> : <span className="notes-muted">未填写</span>}</summary>
          <div className="section-body"><ImplementationNotesEditor key={node.id} value={node.implementationNotes ?? ''} commit={(raw, dry) => update(n => { if (raw.trim()) n.implementationNotes = raw; else delete n.implementationNotes; return n; }, dry)}/></div>
        </details>        {(() => { const groups = (screen.bakeGroups ?? []).filter(group => group.memberIds.includes(node.id)); return groups.length ? <section className="inspector-section bake-association" aria-label="Bake 归属"><h3 className="section-title">Static Bake 归属</h3><div className="section-body"><p className="field-note">{groups.map(group => `${group.name} · ${group.id}`).join('；')}</p><button type="button" className="context-action" onClick={onOpenBake}>在 Bake Workspace 中管理</button></div></section> : null; })()}
        {node.type !== 'minecraft:creative-tab' && (() => { const refs = screen.nodes.filter((n): n is Extract<GuiNode, { type: 'minecraft:creative-tab' }> => n.type === 'minecraft:creative-tab' && !!n.props.groupId && !!n.props.contentIds?.includes(node.id)); return refs.length ? <section className="inspector-section tab-reference" aria-label="标签内容归属"><h3 className="section-title">标签内容归属</h3><div className="section-body"><p className="field-note">{refs.length > 1 ? '同组共享内容：' : '关联标签：'}{refs.map(n => nodeLabel(n)).join('、')}</p><p className="field-note">选择相应标签，在其内容列表中勾选或取消关联并保存。</p></div></section> : null; })()}
        <details className="inspector-section" open>
          <summary><span>变换</span><span>GUI px</span></summary>
          <div className="section-body"><div className="geometry">
            {(node.type === 'minecraft:creative-tab' || node.type === 'native_region' || node.type === 'minecraft:single_slot' ? (['x', 'y'] as const) : (['x', 'y', 'w', 'h'] as const)).map(key => <Field key={`${key}-${node.bounds[key]}`} label={key.toUpperCase()} unit="px" type="number" min={key === 'w' || key === 'h' ? CATALOG[node.type].min[key] : 0} value={node.bounds[key]}
              onCommit={(raw, dry) => { const value = raw.trim() === '' ? NaN : Number(raw); return update(n => ({ ...n, bounds: { ...n.bounds, [key]: value } }), dry); }}/>)}</div>
            <p className="field-note">{node.type === 'minecraft:single_slot' ? '固定 18×18 GUI px，仅能整体移动；X/Y 为槽位背景边框左上角，内容原点为 X+1/Y+1。' : node.type === 'native_region' ? '固定 162×76 GUI px，仅能整体移动；X/Y 为首格槽位背景边框原点。' : node.parentContainerId ? '子节点 X/Y/W/H 使用父容器内容局部 GUI px；X/Y 从内容区左上角计算。' : node.type === 'minecraft:creative-tab' ? '固定 26×32 GUI px，位置为贴图左上角。' : node.type === 'minecraft:checkbox' ? 'W、H 仅为设计参考边界；原版尺寸由游戏字体、文字与构造最大宽度决定，不能强制按参考高度构造。' : '拖动边缘中点只调整宽或高；拖动右下或左上角手柄可同时调整宽高。拖左边或上边时，对侧位置保持不变。'} 超出所在坐标区域的精确输入会被拒绝。</p>
          </div>
        </details>
        {node.type !== 'minecraft:tree-view' && node.type !== 'native_region' && node.type !== 'minecraft:single_slot' && !isRepeatableListNode(node) && <section className="inspector-section"><h3 className="section-title">父容器</h3><div className="section-body">
          <label className="field"><span>容器</span><select aria-label="父容器" value={node.parentContainerId ?? ''} onChange={e => { try { editorStore.getState().setNodeContainer(node.id, e.target.value || undefined, containerScroll); notify('父容器已更新'); } catch (error) { notify((error as Error).message, true); } }}><option value="">Screen 根节点</option>{screen.nodes.filter(candidate => isContainerNode(candidate) && candidate.id !== node.id && !allDescendants(node.id, screen.nodes).some(child => child.id === candidate.id) && (!isContainerNode(node) || (node.type !== candidate.type && candidate.parentContainerId === undefined))).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.id}</option>)}</select></label>
          <p className="field-note">跨级转移保持屏幕位置；仅允许 Scrollable Panel 与 Collapsible Panel 交叉嵌套，最多两层。</p>
        </div></section>}
        <details className="inspector-section" open>
          <summary><span>外观与文案</span></summary>
          <div className="section-body">
          {node.type === 'native_region' && <>
            <label className="field"><span>Region kind</span><input aria-label="Region kind" readOnly value={node.props.kind}/></label>
            <label className="field"><span>固定宽度</span><input aria-label="固定宽度" readOnly value={162}/></label>
            <label className="field"><span>固定高度</span><input aria-label="固定高度" readOnly value={76}/></label>
            <p className="field-note">Screen 根级区域。未归入 Page 时为 Persistent，在所有 Page 显示；勾选到某个 Page 后仅在该 Page 显示。仍是同一个 Menu/Screen 会话。X/Y 为首格 18×18 背景边框左上角；真实 Slot 的 16×16 内容原点为 X+1/Y+1。行偏移 0/18/36/58，固定 162×76 GUI px。仅近似背景预览，无物品交互；不能缩放、进入容器，也不能作为 F2 动作目标。</p>
          </>}
          {node.type === 'minecraft:single_slot' && <>
            <label className="field"><span>使用意图</span><select aria-label="Single Slot 使用意图" value={node.props.usage} onChange={event => update(n => n.type === 'minecraft:single_slot' ? { ...n, props: { ...n.props, usage: event.target.value as 'inventory' | 'ghost_selection' | 'visual_only' } } : n)}>
              <option value="inventory">inventory · 真实容器 Slot</option>
              <option value="ghost_selection">ghost_selection · 非消耗型材料选择/标记</option>
              <option value="visual_only">visual_only · 仅静态槽位外观</option>
            </select></label>
            <Field key={`slot-placeholder-${node.props.placeholderItemId ?? ''}`} label="占位物品 ID" value={node.props.placeholderItemId ?? ''} placeholder="minecraft:iron_ingot" onCommit={(value, dry) => update(n => n.type === 'minecraft:single_slot' ? { ...n, props: value.trim() ? { ...n.props, placeholderItemId: value.trim() } : (() => { const props = { ...n.props }; delete props.placeholderItemId; return props; })() } : n, dry)}/>
            {node.props.placeholderItemId && <button type="button" onClick={() => update(n => { if (n.type !== 'minecraft:single_slot') return n; const props = { ...n.props }; delete props.placeholderItemId; return { ...n, props }; })}>清除占位物品</button>}
            <p className="field-note">固定 18×18 背景框，内容为 +1/+1 的 16×16；节点移动不改变内部几何，不能拉伸。inventory 必须在 Java Menu.addSlot 中创建真实 Slot，Menu 索引由 addSlot 顺序决定；ghost_selection 不消耗物品，外部物品选择、JEI/REI Ghost Ingredient 兼容层与 Menu 状态由 Mod 实现；visual_only 没有 Slot/命中/焦点。占位物品仅设计预览，不是 ItemStack。Row Template 首版拒绝 Single Slot（无可靠动态 Slot 身份）。</p>
          </>}
          {node.type === 'minecraft:scrollable-panel' && <>
            <Field key={node.props.padding} label="内边距" type="number" min={0} max={16} value={node.props.padding} onCommit={(raw, dry) => { const value = raw.trim() ? Number(raw) : NaN; return update(n => n.type === 'minecraft:scrollable-panel' ? { ...n, props: { ...n.props, padding: value } } : n, dry); }}/>
            <Field key={node.props.contentHeight} label="内容高度" unit="px" type="number" min={1} max={8192} value={node.props.contentHeight} onCommit={(raw, dry) => { const value = raw.trim() ? Number(raw) : NaN; return update(n => n.type === 'minecraft:scrollable-panel' ? { ...n, props: { ...n.props, contentHeight: value } } : n, dry); }}/>
            <Field key={node.props.backgroundColor} label="背景色 ARGB" value={node.props.backgroundColor} onCommit={(value, dry) => update(n => n.type === 'minecraft:scrollable-panel' ? { ...n, props: { ...n.props, backgroundColor: value } } : n, dry)}/>
            <Field key={node.props.borderColor} label="边框色 ARGB" value={node.props.borderColor} onCommit={(value, dry) => update(n => n.type === 'minecraft:scrollable-panel' ? { ...n, props: { ...n.props, borderColor: value } } : n, dry)}/>
            <p className="field-note">子节点以内容局部坐标保存；滚动条占用右侧 8px。可与 Collapsible Panel 交叉嵌套一层。</p>
          </>}
          {isCollapsiblePanelNode(node) && <>
            <TextFields label="标题" owner={node} keySuffix="title" value={node.props.title} commit={(value, dry) => update(n => isCollapsiblePanelNode(n) ? { ...n, props: { ...n.props, title: value } } : n, dry)}/>
            <Field key={node.props.headerHeight} label="标题栏高度" unit="px" type="number" min={16} max={40} value={node.props.headerHeight} onCommit={(raw, dry) => { const value = raw.trim() ? Number(raw) : NaN; return update(n => isCollapsiblePanelNode(n) ? { ...n, props: { ...n.props, headerHeight: value } } : n, dry); }}/>
            {checkbox('初始展开', node.props.initialExpanded, value => ({ ...node, props: { ...node.props, initialExpanded: value } }))}
            <p className="field-note">H 是固定的展开高度；收起时只显示标题栏。子项局部坐标和展开布局始终保留。</p>
            <Field key={node.props.headerColor} label="标题栏色 ARGB" value={node.props.headerColor} onCommit={(value, dry) => update(n => isCollapsiblePanelNode(n) ? { ...n, props: { ...n.props, headerColor: value } } : n, dry)}/>
            <Field key={node.props.backgroundColor} label="内容背景色 ARGB" value={node.props.backgroundColor} onCommit={(value, dry) => update(n => isCollapsiblePanelNode(n) ? { ...n, props: { ...n.props, backgroundColor: value } } : n, dry)}/>
            <Field key={node.props.textColor} label="标题文字色 ARGB" value={node.props.textColor} onCommit={(value, dry) => update(n => isCollapsiblePanelNode(n) ? { ...n, props: { ...n.props, textColor: value } } : n, dry)}/>
            {checkbox('边框', node.props.border, value => ({ ...node, props: { ...node.props, border: value } }))}
            {node.props.border && <Field key={node.props.borderColor} label="边框色 ARGB" value={node.props.borderColor} onCommit={(value, dry) => update(n => isCollapsiblePanelNode(n) ? { ...n, props: { ...n.props, borderColor: value } } : n, dry)}/>}
          </>}
          {isRepeatableListNode(node) && <>
            <Field key={`rh-${node.id}-${node.props.rowHeight}`} label="固定行高" unit="px" type="number" min={9} max={512} value={node.props.rowHeight} onCommit={(raw, dry) => { const value = raw.trim() ? Number(raw) : NaN; return update(n => isRepeatableListNode(n) ? { ...n, props: { ...n.props, rowHeight: value } } : n, dry); }}/>
            <Field key={`rg-${node.id}-${node.props.rowGap}`} label="行间距" unit="px" type="number" min={0} max={64} value={node.props.rowGap} onCommit={(raw, dry) => { const value = raw.trim() ? Number(raw) : NaN; return update(n => isRepeatableListNode(n) ? { ...n, props: { ...n.props, rowGap: value } } : n, dry); }}/>
            <Field key={`rp-${node.id}-${node.props.padding}`} label="内边距" unit="px" type="number" min={0} max={16} value={node.props.padding} onCommit={(raw, dry) => { const value = raw.trim() ? Number(raw) : NaN; return update(n => isRepeatableListNode(n) ? { ...n, props: { ...n.props, padding: value } } : n, dry); }}/>
            <Field key={`rt-${node.id}-${node.props.templateId}`} label="Row Template ID（稳定）" value={node.props.templateId} onCommit={(value, dry) => update(n => isRepeatableListNode(n) ? { ...n, props: { ...n.props, templateId: value.trim() } } : n, dry)}/>
            <Field key={`rb-${node.id}-${node.props.dataSource.bindingKey}`} label="外部数据绑定键" value={node.props.dataSource.bindingKey} onCommit={(value, dry) => update(n => isRepeatableListNode(n) ? { ...n, props: { ...n.props, dataSource: { ...n.props.dataSource, bindingKey: value.trim() } } } : n, dry)}/>
            <Field key={`rbg-${node.id}-${node.props.backgroundColor}`} label="背景色 ARGB" value={node.props.backgroundColor} onCommit={(value, dry) => update(n => isRepeatableListNode(n) ? { ...n, props: { ...n.props, backgroundColor: value } } : n, dry)}/>
            <Field key={`rbd-${node.id}-${node.props.borderColor}`} label="边框色 ARGB" value={node.props.borderColor} onCommit={(value, dry) => update(n => isRepeatableListNode(n) ? { ...n, props: { ...n.props, borderColor: value } } : n, dry)}/>
            <section className="inspector-section" aria-label="Repeatable List 模拟数据">
              <h3 className="section-title">模拟数据 <span>仅设计预览</span></h3>
              <div className="section-body">
                <div className="repeat-preview-buttons">{REPEATABLE_LIST_PREVIEW_COUNTS.map(count => <button key={count} type="button" aria-pressed={repeatablePreviewRows(repeatPreviewRows, node.id) === count} onClick={() => setRepeatPreviewRows(rows => ({ ...rows, [node.id]: count }))}>{count} 行</button>)}</div>
                <Field key={`rr-${node.id}-${repeatablePreviewRows(repeatPreviewRows, node.id)}`} label="模拟行数" type="number" min={0} max={1000} value={repeatablePreviewRows(repeatPreviewRows, node.id)} onCommit={(raw) => { setRepeatPreviewRows(rows => ({ ...rows, [node.id]: Math.max(0, Math.min(1000, Math.floor(Number(raw) || 0))) })); return true; }}/>
                <p className="field-note">行数不写入项目 JSON，也不进入游戏业务合同。0 行时设计态保留一条虚线模板行用于编辑；导出参考 PNG 固定使用 3 行代表性预览。</p>
              </div>
            </section>
            <p className="field-note">模板子节点使用行内局部坐标：X 从视口左边开始，Y 从行顶开始，且必须完整落在固定行高与视口宽度内。行内控件的事件只是 Java 接入点；静态模板节点 ID 不是运行时记录 ID。</p>
            <p className="field-note">已放置 {repeatableTemplateChildren(node, screen.nodes).length} 个模板子节点。不可见行不参与绘制、命中、焦点遍历或旁白；滚动位置与模拟行数仅属于编辑器会话。</p>
          </>}
          {node.type === 'minecraft:image' && <ImageSourceFields node={node} update={update} cache={imageSourceCache}/>}
          {colorModeNode && <>
            <label className="field"><span>文字颜色来源</span><select aria-label="文字颜色来源" value={effectiveColorMode ?? 'native'} onChange={e => {
              const mode = e.target.value as 'native' | 'neoforge';
              update(n => {
                if (n.type === 'minecraft:button') return { ...n, props: { ...n.props, colorMode: mode, ...(mode === 'neoforge' && n.props.color === undefined ? { color: '#FFFFFFFF' } : {}) } };
                if (n.type === 'minecraft:cycle-button') return { ...n, props: { ...n.props, colorMode: mode, ...(mode === 'neoforge' && n.props.color === undefined ? { color: '#FFFFFFFF' } : {}) } };
                return n;
              });
            }}>
              <option value="native">使用原生颜色样式</option>
              <option value="neoforge">NeoForge 文字颜色 API</option>
            </select></label>
            <p className="field-note">原生模式使用 Button/CycleButton 的白色（禁用浅灰）文字，不导出 setFGColor；NeoForge 模式才允许编辑并导出文字颜色。旧项目缺少该字段时按原颜色渲染。</p>
          </>}
          {node.type !== 'minecraft:fill' && node.type !== 'minecraft:image' && node.type !== 'minecraft:creative-tab' && node.type !== 'minecraft:fitting-multi-line-text-widget' && node.type !== 'minecraft:scrollable-panel' && ('textShadow' in node.props || node.type === 'minecraft:checkbox' || node.type === 'minecraft:string-widget' || node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' || node.type === 'minecraft:edit-box') && checkbox('文字阴影', 'textShadow' in node.props ? node.props.textShadow ?? false : false, (v): GuiNode => {
            if (node.type === 'minecraft:checkbox' || node.type === 'minecraft:string-widget' || node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' || node.type === 'minecraft:edit-box') return { ...node, props: { ...node.props, textShadow: v } } as GuiNode;
            const next = structuredClone(node); if ('textShadow' in next.props) next.props.textShadow = v; return next;
          })}
          {isSelectionNode(node) && <SelectionFields key={JSON.stringify([node.id, node.props.name, node.props.options, node.props.initialSelectedOptionId, node.type === 'minecraft:radio-group' ? node.props.orientation : node.props.visibleRows])} node={node} update={update}/>}
          {isTreeViewNode(node) && <TreeViewFields key={node.id} node={node} update={update}/>}
          {isNumericNode(node) && <>
            <TextFields label="控件名称" owner={node} keySuffix="name" value={node.props.name} commit={(v, dry) => update(n => { if (isNumericNode(n)) n.props.name = v; return n; }, dry)}/>
            <NumericConstraints key={JSON.stringify([node.id, node.props.min, node.props.max, node.props.step, node.props.initialValue, node.props.numericType, node.props.format])} node={node} update={update}/>
            {node.type === 'minecraft:numeric-input' && <>
              {checkbox('显示边框', node.props.bordered, v => ({ ...node, props: { ...node.props, bordered: v } }))}
              {checkbox('可编辑初态', node.props.editable, v => ({ ...node, props: { ...node.props, editable: v } }))}
              <Field key={node.props.errorMessage} label="数值错误说明" value={node.props.errorMessage} onCommit={(v, dry) => update(n => n.type === 'minecraft:numeric-input' ? { ...n, props: { ...n.props, errorMessage: v } } : n, dry)}/>
              <p className="field-note">交互预览中 Enter 或失焦提交。非法提交保留草稿和上次有效值；原生 EditBox 需要实现数值适配器。事件 numeric-commit 仅为未绑定业务的强类型意图。</p>
            </>}
            {node.type === 'minecraft:slider' && <>
              {checkbox('显示当前值', node.props.showValue, v => ({ ...node, props: { ...node.props, showValue: v } }))}
              <p className="field-note">水平单值滑块；原生8px手柄，最小宽9px。左右键每次一个合法值，按键消费；鼠标就近量化，释放不重复发事件。阴影关闭时游戏端须自定义文字绘制；不能假设原生有 setter。事件 slider-change 只报告有效变化。</p>
            </>}
          </>}
          {node.type === 'minecraft:multi-line-text-widget' && <>
            <TextFields multiline label="多行文字" owner={node} value={node.props.text} commit={(v, dry) => update(n => n.type === 'minecraft:multi-line-text-widget' ? { ...n, props: { ...n.props, text: v } } : n, dry)}/>
            <Field key={`mw-${node.props.maxWidth}`} label="最大宽度" type="number" min={1} value={node.props.maxWidth} onCommit={(v, dry) => update(n => n.type === 'minecraft:multi-line-text-widget' ? { ...n, props: { ...n.props, maxWidth: v.trim() ? Number(v) : NaN } } : n, dry)}/>
            <Field key={`mr-${node.props.maxRows}`} label="最大行数" type="number" min={1} value={node.props.maxRows} onCommit={(v, dry) => update(n => n.type === 'minecraft:multi-line-text-widget' ? { ...n, props: { ...n.props, maxRows: v.trim() ? Number(v) : NaN } } : n, dry)}/>
            <label className="field"><span>对齐</span><select aria-label="对齐" value={node.props.align} onChange={e => update(n => n.type === 'minecraft:multi-line-text-widget' ? { ...n, props: { ...n.props, align: e.target.value as 'left' | 'center' } } : n)}><option value="left">左对齐</option><option value="center">居中</option></select></label>
            <p className="field-note">W 是换行最大宽度，H = 最大行数 × 9；高度 Resize 按 9 px 步进。精确 H 须为 9 的倍数。居中相对实际文本宽度；阴影关闭时游戏端须自定义文字绘制；不能假设原生有 setter。显示文本不接受输入、不滚动、不自动旁白。</p>
            <MultiLineDiagnostics node={node}/>
          </>}
          {node.type === 'minecraft:fitting-multi-line-text-widget' && <>
            <TextFields multiline label="只读文本" owner={node} value={node.props.text} commit={(v, dry) => update(n => n.type === 'minecraft:fitting-multi-line-text-widget' ? { ...n, props: { ...n.props, text: v } } : n, dry)}/>
            {checkbox('文字阴影', node.props.textShadow ?? true, value => ({ ...node, props: { ...node.props, textShadow: value } }))}
            <p className="field-note">视窗 W×H 是固定 viewport，不是文本最大宽度/最大行数。原生固定 9px 行高，内容总行数不截断；overflow 时滚动，设计态不接收滚动输入。</p>
            <p className="field-note">原生滚动条位于 Widget 右侧并可能向 bounds.w 外延 8px；仅有溢出时显示。游戏用原生焦点框与滚动条 Sprite，网页和 PNG 使用中性近似。滚动初始位置固定为顶部。</p>
          </>}
          {node.type === 'minecraft:progress-bar' && <>
            <ProgressRangeConstraints key={JSON.stringify([node.id, node.props.min, node.props.max, node.props.initialValue])} node={node} update={update}/>
            <label className="field"><span>填充方向</span><select aria-label="填充方向" value={node.props.direction} onChange={e => update(n => n.type === 'minecraft:progress-bar' ? { ...n, props: { ...n.props, direction: e.target.value as typeof n.props.direction } } : n)}><option value="left-to-right">从左到右</option><option value="right-to-left">从右到左</option><option value="bottom-to-top">从下到上</option><option value="top-to-bottom">从上到下</option></select></label>
            {(['backgroundColor', 'foregroundColor', 'borderColor'] as const).map((key, index) => <Field key={`${key}-${node.props[key]}`} label={['背景色', '前景色', '边框色'][index]} value={node.props[key]} onCommit={(v, dry) => update(n => n.type === 'minecraft:progress-bar' ? { ...n, props: { ...n.props, [key]: v } } : n, dry)}/>)}
            {checkbox('显示边框', node.props.border, v => ({ ...node, props: { ...node.props, border: v } }))}
            <Field key={`pt-${node.props.borderThickness}`} label="边框厚度" type="number" min={0} max={16} value={node.props.borderThickness} onCommit={(v, dry) => update(n => n.type === 'minecraft:progress-bar' ? { ...n, props: { ...n.props, borderThickness: v.trim() ? Number(v) : NaN } } : n, dry)}/>
            <label className="field"><span>显示文字</span><select aria-label="显示文字" value={node.props.display} onChange={e => update(n => n.type === 'minecraft:progress-bar' ? { ...n, props: { ...n.props, display: e.target.value as typeof n.props.display } } : n)}><option value="none">不显示</option><option value="percentage">百分比</option><option value="value">初始数值</option></select></label>
            {checkbox('文字阴影', node.props.textShadow, v => ({ ...node, props: { ...node.props, textShadow: v } }))}
            <p className="field-note">只读绘制节点，不响应运行时输入。min=max 时按 100% 显示；运行数据来源由游戏实现者接入，设计初值不代表业务绑定。百分比按四舍五入取整。Minecraft 原生没有通用 ProgressBar Widget，使用 GuiGraphics.fill 绘制。</p>
          </>}
          {isStatusNode(node) && <>
            <TextFields label="控件名称" owner={node} keySuffix="name" value={node.props.name} commit={(v, dry) => update(n => { if (isStatusNode(n)) n.props.name = v; return n; }, dry)}/>
            <StatusFields key={JSON.stringify([node.id, node.props.statuses, node.props.initialStatusId])} node={node as StatusNode} update={update}/>
            <label className="field"><span>指示符形状</span><select aria-label="指示符形状" value={node.props.shape} onChange={e => update(n => isStatusNode(n) ? { ...n, props: { ...n.props, shape: e.target.value as typeof n.props.shape } } : n)}><option value="circle">圆形</option><option value="square">方形</option></select></label>
            {checkbox('显示状态文字', node.props.showLabel, value => ({ ...node, props: { ...node.props, showLabel: value } }))}
            <p className="field-note">状态指示器仅绘制初始状态，不接受游戏输入。状态颜色使用 #AARRGGBB；至少应显示文字或在 Screen 旁白中提供状态说明。运行时状态由实现者设置并触发重绘，无变量绑定或服务端同步。</p>
          </>}
          {node.type === 'minecraft:creative-tab' && <><Field key={node.props.name} label="标签名称" value={node.props.name} onCommit={(v, dry) => update(n => n.type === 'minecraft:creative-tab' ? { ...n, props: { ...n.props, name: v } } : n, dry)}/><label className="field"><span>顶部列</span><select aria-label="顶部列" value={node.props.column} onChange={e => update(n => n.type === 'minecraft:creative-tab' ? { ...n, props: { ...n.props, column: Number(e.target.value) } } : n)}>{[1,2,3,4,5,6,7].map(i => <option key={i} value={i}>{i}</option>)}</select></label>{node.props.tabMode !== 'screen-navigation' && <label className="check"><input type="checkbox" aria-label="初始选中" checked={node.props.selected} onChange={e => { if (!e.target.checked && node.props.groupId) { notify('同组必须有一个初始选中标签，请选择其他标签', true); return; } try { if (node.props.groupId && e.target.checked) editorStore.getState().configureTab(node.id, node.props.groupId, node.props.contentIds ?? [], true); else update(n => n.type === 'minecraft:creative-tab' ? { ...n, props: { ...n.props, selected: e.target.checked } } : n); } catch (error) { notify((error as Error).message, true); } }}/>初始选中</label>}{node.props.tabMode === 'screen-navigation' && <><p className="field-note">{doc.screens.flatMap(s => s.nodes).some(n => n.type === 'minecraft:creative-tab' && n.id !== node.id && n.props.navigationGroupId === node.props.navigationGroupId && n.props.navigationTabId === node.props.navigationTabId && (n.props.column !== node.props.column || n.bounds.x !== node.bounds.x || n.bounds.y !== node.bounds.y)) ? '⚠ 同一导航标签在其他页面的位置或列号有覆盖差异。' : '此导航标签各页布局一致。'}</p><button onClick={() => { try { editorStore.getState().syncNavigationTabLayout(node.id); notify('同一导航标签布局已同步至各页 · 可撤销'); } catch (e) { notify((e as Error).message, true); } }}>将此标签布局同步至各页</button><p className="field-note">显式同步位置与列号，可撤销；后续单页修改仍独立，不建立隐式继承。</p></>}<CreativeTabModeEditor node={node} doc={doc} screenNodes={screen.nodes} notify={notify}/><p className="field-note">名称不绘制在 Sprite 上；Screen 导航只在交互预览开启时生效。</p></>}
          {node.type === 'minecraft:button' && <TextFields label="按钮文字" owner={node} value={node.props.message} commit={(v, dry) => update(n => n.type === 'minecraft:button' ? { ...n, props: { ...n.props, message: v } } : n, dry)}/>}
          {node.type === 'minecraft:checkbox' && <>
            <TextFields label="复选框文字" owner={node} value={node.props.message} commit={(v, dry) => update(n => n.type === 'minecraft:checkbox' ? { ...n, props: { ...n.props, message: v } } : n, dry)}/>
            <Field key={node.props.maxWidth} label="构造最大宽度" unit="px" type="number" min={1} value={node.props.maxWidth} onCommit={(v, dry) => update(n => n.type === 'minecraft:checkbox' ? { ...n, props: { ...n.props, maxWidth: v.trim() ? Number(v) : NaN } } : n, dry)}/>
            {checkbox('初始勾选', node.props.selected, v => ({ ...node, props: { ...node.props, selected: v } }))}
            <p className="field-note">W、H 是设计参考边界；构造最大宽度独立设置，H 不是原版构造参数。文字排版与溢出以浏览器字体近似，游戏内尺寸待验证。</p>
            <p className="field-note">浅色底板上的深灰文字仅是可读性设计预览。原版 Checkbox 固定浅色文字，游戏中需要开发者自定义绘制才能实现深灰效果。</p>
            <CheckboxDiagnostics node={node} screen={screen.designSize}/>
          </>}
          {node.type === 'minecraft:cycle-button' && <>
            <TextFields label="选项名称" owner={node} keySuffix="name" value={node.props.name} commit={(v, dry) => update(n => n.type === 'minecraft:cycle-button' ? { ...n, props: { ...n.props, name: v } } : n, dry)}/>
            <CycleOptionFields key={JSON.stringify([node.props.options, node.props.initialOptionId])} node={node} update={update}/>
            <details className="advanced-json"><summary>高级：选项 JSON（只读参考，仍可整体替换）</summary>
              <Field key={JSON.stringify(node.props.options)} label="选项 JSON" value={JSON.stringify(node.props.options)} onCommit={(v, dry) => { let options: typeof node.props.options; try { options = JSON.parse(v); } catch { throw new Error('选项 JSON 语法错误'); } return update(n => n.type === 'minecraft:cycle-button' ? { ...n, props: { ...n.props, options } } : n, dry); }}/>
            </details>
            <label className="field"><span>显示格式</span><select aria-label="显示格式" value={node.props.displayFormat} onChange={e => update(n => n.type === 'minecraft:cycle-button' ? { ...n, props: { ...n.props, displayFormat: e.target.value as 'value-only' | 'name-and-value' } } : n)}><option value="value-only">仅显示值</option><option value="name-and-value">名称和值</option></select></label>
          </>}
          {node.type === 'minecraft:edit-box' && <>
            <TextFields label="叙述标签" owner={node} keySuffix="narration" value={node.props.narration} commit={(v, dry) => update(n => n.type === 'minecraft:edit-box' ? { ...n, props: { ...n.props, narration: v } } : n, dry)}/>
            <Field key={`value-${node.props.value}`} label="输入初值" value={node.props.value} onCommit={(v, dry) => update(n => n.type === 'minecraft:edit-box' ? { ...n, props: { ...n.props, value: v } } : n, dry)}/>
            <Field key={node.props.maxLength} label="最大长度" type="number" min={0} value={node.props.maxLength} onCommit={(v, dry) => update(n => n.type === 'minecraft:edit-box' ? { ...n, props: { ...n.props, maxLength: v.trim() ? Number(v) : NaN } } : n, dry)}/>
            <TextFields label="占位文字" owner={node} keySuffix="hint" value={node.props.hint ?? literal('')} commit={(v, dry) => update(n => n.type === 'minecraft:edit-box' ? { ...n, props: { ...n.props, hint: v } } : n, dry)}/>
            {checkbox('显示边框', node.props.bordered, v => ({ ...node, props: { ...node.props, bordered: v } }))}
            {checkbox('可编辑初态', node.props.editable, v => ({ ...node, props: { ...node.props, editable: v } }))}
          </>}
          {node.type === 'minecraft:string-widget' && <>
            <TextFields label="标签文字" owner={node} value={node.props.text} commit={(v, dry) => update(n => n.type === 'minecraft:string-widget' ? { ...n, props: { ...n.props, text: v } } : n, dry)}/>
            <label className="field"><span>对齐</span><select aria-label="对齐" value={node.props.align} onChange={e => update(n => n.type === 'minecraft:string-widget' ? { ...n, props: { ...n.props, align: e.target.value as 'left' | 'center' | 'right' } } : n)}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
          </>}
          {node.type === 'minecraft:fill' && <FillStyleFields node={node} update={update}/>}
          <TooltipFields key={`tooltip-${node.id}`} node={node} update={update}/>
          {nativeTextCapabilityNote(node) && <p className="field-note" data-testid="native-text-capability">{nativeTextCapabilityNote(node)}</p>}
          {(node.type !== 'minecraft:creative-tab' && node.type !== 'minecraft:image' && node.type !== 'minecraft:scrollable-panel' && node.type !== 'minecraft:fill' && 'color' in node.props && !colorControlsHidden) && <><Field key={node.props.color} label={node.type === 'minecraft:progress-bar' ? '文字色 ARGB' : '颜色 ARGB'} value={node.props.color ?? (node.type === 'minecraft:checkbox' ? '#FFE0E0E0' : '#FFE0E8F1')} onCommit={(v, dry) => update(n => { if ('color' in n.props) n.props.color = v; return n; }, dry)}/>
            {node.type === 'minecraft:checkbox' && <button onClick={() => update(n => { if (n.type === 'minecraft:checkbox') delete n.props.color; return n; })}>使用原生浅灰文字</button>}<ColorPicker key={node.id} value={node.props.color ?? '#FFE0E0E0'} commit={color => update(n => { if ('color' in n.props) n.props.color = color; return n; })}/>
            <p className="field-note">系统取色器支持可视选择；透明度保留，使用 ARGB 前两位修改。</p><div className="color-preview"><span style={{ background: `#${(node.props.color ?? '#FFE0E0E0').slice(3)}${(node.props.color ?? '#FFE0E0E0').slice(1, 3)}` }}/><small>格式 #AARRGGBB · 前两位为透明度。按 Enter 或离开输入框应用。</small></div></>}
          </div>
        </details>
        <details className="inspector-section" open>
          <summary><span>初始状态</span></summary>
          <div className="section-body">{node.type !== 'native_region' && checkbox('可见初态', node.state.visible, visible => { const next = structuredClone(node); next.state.visible = visible; return next; })}
            {'enabled' in node.state && checkbox('启用初态', node.state.enabled, enabled => { const next = structuredClone(node); if ('enabled' in next.state) next.state.enabled = enabled; return next; })}
            <p className="field-note">编辑模式保留隐藏组件的淡色轮廓，便于选择；不执行游戏交互。</p>
          </div>
        </details>
        <details className="inspector-section source-info">
          <summary><span>来源与限制</span></summary>
          <div className="section-body"><span className="source-tag">{node.source.category}</span><code>{node.source.className}</code><p>{CATALOG[node.type].evidence}</p><p>浏览器近似预览，不执行 Java Widget；来源表示设计规格对应的已审计 API。</p></div>
        </details>
        <button className="delete-button" onClick={() => { try { confirmDeleteSelected(); } catch (error) { notify((error as Error).message, true); } }}>删除组件</button>
      </fieldset>}
  </aside>;
}
