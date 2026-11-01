import { memo, useEffect, useRef, useState, type DragEvent } from 'react';
import { NumericPreview } from './NumericPreview';
import { isNumericNode, drawNumericWidget } from '../render/numericWidgets';
import type { NumericState } from '../domain/numeric';
import { Group, Layer, Rect, Shape, Stage, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useStore } from 'zustand';
import { CATALOG, NODE_TYPES, type NodeType } from '../domain/catalog';
import type { Bounds, GuiNode, GuiScreen } from '../domain/schema';
import { displayText } from '../domain/model';
import { currentScreen, editorStore } from '../editor/store';
import { editableText, InlineTextEditor } from './InlineTextEditor';
import type { GuiScalePreview } from '../domain/guiScale';
import { tabManaged, tabVisibility } from '../domain/tabGroups';
import { screenNavigationSelected } from '../domain/screenTabNavigation';
import { panelBounds, panelRects } from '../domain/panel';
import { drawNativePanel, getPanelImage, isTextureStyle, panelPreviewRaster } from '../render/panelTexture';
import { CHECKBOX_SPRITES, SLIDER_SPRITES, CREATIVE_TAB_SPRITES, GUI_SPRITES, type LayeredResources } from '../resources/layered';
import { beforePanel, drawCreativeTabFallback, SpriteRasterCache, spriteForNode, type DecodedSprite } from '../render/spritePreview';
import { drawCheckboxFallback, drawPreviewText, previewCheckboxLayout, type FontChoice } from '../render/previewFont';
import type { BehaviorPreview } from '../ui/BehaviorPanel';
import { alignBounds, alignResizeBounds, equalSpacingCandidates, resolveEqualSpacing, type AlignmentGuides, type SpacingCandidate, type SpacingMark } from './smartAlignment';

export type View = { zoom: number; panX: number; panY: number; tool: 'select' | 'pan' };
type ResizeEdge = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'bottom-right';
type Props = { numericPreviewEpoch: number; screenPositions: Record<string, {x: number; y: number}>; setScreenPositions: (update: (previous: Record<string, {x: number; y: number}>) => Record<string, {x: number; y: number}>) => void; onSelectScreen: (id: string) => void; view: View; setView: (view: View) => void; preview?: GuiScalePreview | null; readOnly?: boolean; behaviorPreview?: BehaviorPreview | null; behaviorMode?: boolean; interaction: boolean; onBehaviorTrigger?: (id: string) => void; editTabs?: Record<string, string>; grid: { visible: boolean; spacing: number }; alignment: { guides: boolean; snap: boolean }; resources: LayeredResources; resourceGeneration: number; font: FontChoice; theme: 'dark' | 'light' };
type PreviewAsset = { sprite?: DecodedSprite; error?: string };

const C = {
  accent: '#f0b45c',
  accentSoft: '#2a2114',
  text: '#e9e6df',
  text2: '#b4b0a7',
  text3: '#8b877e',
  line: '#333941',
  design: '#1c2634',
  designLine: '#3c424a',
  grid: 'rgba(64, 165, 230, 0.65)',
  danger: '#e8837a',
  dangerSoft: 'rgba(43, 25, 24, 0.92)',
  ruler: '#0b0e11',
  rulerLine: '#2a2f36',
  rulerText: '#8b877e',
  rulerTick: '#3a4048',
  mono: 'Cascadia Mono, Consolas, monospace',
} as const;
const NO_SCREEN_TAB_GROUPS: import('../domain/schema').ScreenTabGroup[] = [];
const rgba = (color: string) => `rgba(${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${parseInt(color.slice(7, 9), 16)},${parseInt(color.slice(1, 3), 16) / 255})`;

const NodeDrawing = memo(function NodeDrawing({ node, bounds, onDown, onEdit, assets, cache, resourceActive, focused, selected, font, panel, zoom, numericState, numericOverlay = false }: {
  node: GuiNode; bounds: Bounds; onDown: (e: KonvaEventObject<PointerEvent>, id: string, mode: 'move' | 'resize', edge?: ResizeEdge) => void;
  numericState?: NumericState; numericOverlay?: boolean; onEdit: (id: string) => void; assets: Record<string, PreviewAsset>; cache: SpriteRasterCache; resourceActive: boolean; focused: boolean; selected: boolean; font: FontChoice; panel: boolean; zoom: number;
}) {
  const [hovered, setHovered] = useState(false);
  const { w, h } = bounds;
  const fill = node.type === 'minecraft:fill' ? rgba(node.props.color)
    : node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' ? '#314354' : node.type === 'minecraft:edit-box' || node.type === 'minecraft:checkbox' ? '#151e2b' : 'rgba(255,255,255,0.01)';
  const stroke = node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' || node.type === 'minecraft:checkbox' ? '#5a7185' : node.type === 'minecraft:edit-box' && node.props.bordered ? '#5a7185' : undefined;
  const id = isNumericNode(node) ? null : spriteForNode(node, hovered, focused);
  const asset = id ? assets[id] : undefined; let raster: HTMLCanvasElement | null = null; let renderError = '';
  if (id && asset?.sprite) { try { raster = cache.get(id, asset.sprite, node.type === 'minecraft:checkbox' ? 17 : w, node.type === 'minecraft:checkbox' ? 17 : h); } catch (error) { renderError = (error as Error).message; } }
  const unbordered = node.type === 'minecraft:edit-box' && !node.props.bordered;
  const textureError = !!(resourceActive && id && (asset?.error || renderError));
  return <Group x={bounds.x} y={bounds.y} opacity={node.state.visible ? ('enabled' in node.state && !node.state.enabled && !raster && node.type !== 'minecraft:checkbox' && !isNumericNode(node) ? 0.45 : 1) : 0.22}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onPointerDown={e => onDown(e, node.id, 'move')} onDblClick={e => { e.cancelBubble = true; onEdit(node.id); }}>
    <Rect width={w} height={h} fill={isNumericNode(node) ? 'rgba(0,0,0,0.001)' : node.type === 'minecraft:checkbox' ? 'rgba(0,0,0,0.001)' : raster || unbordered ? 'rgba(0,0,0,0.001)' : fill} stroke={node.type === 'minecraft:checkbox' || raster || unbordered ? undefined : stroke} strokeWidth={0.6} />
    {isNumericNode(node) && <Shape listening={false} sceneFunc={context => drawNumericWidget(context._context, node, w, h, font.family, assets, cache, { state: numericState, hovered, focused, overlay: numericOverlay, resourceActive })}/>}
    {node.type === 'minecraft:creative-tab' && !raster && <Shape listening={false} sceneFunc={context => drawCreativeTabFallback(context._context, node.props.selected)}/>}
    {node.type === 'minecraft:checkbox' && !raster && <Shape listening={false} sceneFunc={context => drawCheckboxFallback(context._context, node.props.selected)}/>}
    {raster && <Shape listening={false} sceneFunc={context => { const ctx = context._context; ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(raster, 0, 0); ctx.restore(); }} />}
    {node.type !== 'minecraft:fill' && node.type !== 'minecraft:creative-tab' && <Shape listening={false} sceneFunc={context => drawPreviewText(context._context, node, w, h, font.family, panel)}/>}
    {node.type === 'minecraft:checkbox' && <Shape listening={false} sceneFunc={context => { const ctx = context._context, layout = previewCheckboxLayout(ctx, node, font.family); if (layout.overflow || layout.truncated) { ctx.save(); ctx.font = '7px sans-serif'; ctx.textBaseline = 'top'; ctx.fillStyle = '#e8b86a'; ctx.fillText(layout.truncated ? '文字预览已截断' : '文字超出参考边界', 0, Math.max(h, 17) + 2); ctx.restore(); } }}/>}
    {textureError && <Group listening={false}>
      <Rect x={Math.max(0, w - 7 / zoom)} y={0} width={7 / zoom} height={7 / zoom} fill={C.danger} opacity={0.9}/>
      <Text text="!" x={Math.max(0, w - 4.5 / zoom)} y={1 / zoom} fontSize={6 / zoom} fontFamily={C.mono} fill="#2b1918"/>
    </Group>}
    {hovered && !selected && <Rect width={w} height={h} stroke={C.accent} opacity={0.55} strokeWidth={1 / zoom} listening={false}/>}
    {selected && <Rect width={w} height={h} stroke={C.accent} opacity={0.35} strokeWidth={1 / zoom} listening={false}/>}
  </Group>;
});

function OtherScreen({ screen, assets, cache, resources, font, zoom, select, selectOnLeft, screenTabGroups = [] }: { screen: GuiScreen; assets: Record<string, PreviewAsset>; cache: SpriteRasterCache; resources: LayeredResources; font: FontChoice; zoom: number; select: () => void; selectOnLeft: boolean; screenTabGroups?: import('../domain/schema').ScreenTabGroup[] }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const style = screen.background.kind === 'panel' ? screen.background.style : null;
  useEffect(() => { let active = true; setImage(null); if (style && isTextureStyle(style)) void getPanelImage(style).then(value => { if (active) setImage(value); }).catch(() => {}); return () => { active = false; }; }, [style]);
  const bounds = panelBounds(screen), managed = tabManaged(screen.nodes), visible = tabVisibility(screen.nodes);
  const draw = (original: GuiNode) => {
    const selected = screenNavigationSelected(original, screen.id, screenTabGroups);
    const node: GuiNode = selected === null || original.type !== 'minecraft:creative-tab' ? original : { ...original, props: { ...original.props, selected } };
    const shown = managed.has(node.id) ? visible(node.id) : node.state.visible;
    const item = shown ? node : { ...node, state: { ...node.state, visible: false } } as GuiNode;
    return <NodeDrawing key={node.id} node={item} bounds={item.bounds} onDown={() => {}} onEdit={() => {}} assets={assets} cache={cache} resourceActive={!!resources.baseName} focused={false} selected={false} font={font} panel={screen.background.kind === 'panel'} zoom={zoom}/>;
  };
  return <>
    <Rect width={screen.designSize.width} height={screen.designSize.height} fill={C.design} stroke={C.designLine} strokeWidth={1 / zoom} onPointerDown={e => { if (e.evt.button === 0 && selectOnLeft) { e.cancelBubble = true; select(); } }}/>
    <Group listening={false}>
      {screen.nodes.filter(beforePanel).map(draw)}
      {screen.background.kind === 'panel' && !isTextureStyle(screen.background.style) && panelRects(bounds.w, bounds.h).map((r, i) => <Rect key={i} x={bounds.x + r.x} y={bounds.y + r.y} width={r.w} height={r.h} fill={r.color}/>)}
      {screen.background.kind === 'panel' && image && <Shape x={bounds.x} y={bounds.y} sceneFunc={context => { const ctx = context._context, raster = panelPreviewRaster(image, bounds.w, bounds.h); if (raster) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(raster, 0, 0); ctx.restore(); } else drawNativePanel(ctx, image, bounds.w, bounds.h); }}/>}
      {screen.nodes.filter(node => !beforePanel(node)).map(draw)}
    </Group>
  </>;
}

function Rulers({ width, height, origin, zoom, design, theme }: { width: number; height: number; origin: { x: number; y: number }; zoom: number; design: { width: number; height: number }; theme: 'dark' | 'light' }) {
  const top = 20, left = 20;
  const ruler = theme === 'light'
    ? { bg: '#f3f1ec', line: '#d9d5cc', text: '#6b675e', tick: '#b5b0a6' }
    : { bg: C.ruler, line: C.rulerLine, text: C.rulerText, tick: C.rulerTick };
  const candidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  const step = candidates.find(value => value * zoom >= 56) ?? 10000;
  const minor = step >= 10 ? step / 5 : step;
  const xTicks: number[] = [], xLabels: number[] = [], yTicks: number[] = [], yLabels: number[] = [];
  for (let value = 0; value <= design.width + 0.001; value += minor) xTicks.push(value);
  for (let value = 0; value <= design.width + 0.001; value += step) xLabels.push(value);
  for (let value = 0; value <= design.height + 0.001; value += minor) yTicks.push(value);
  for (let value = 0; value <= design.height + 0.001; value += step) yLabels.push(value);
  return <Layer listening={false}>
    <Rect x={0} y={0} width={width} height={top} fill={ruler.bg} opacity={0.97}/>
    <Rect x={0} y={0} width={left} height={height} fill={ruler.bg} opacity={0.97}/>
    <Rect x={0} y={top - 1} width={width} height={1} fill={ruler.line}/>
    <Rect x={left - 1} y={0} width={1} height={height} fill={ruler.line}/>
    <Rect x={0} y={0} width={left} height={top} fill={ruler.bg}/>
    <Text x={5} y={6} text="px" fontSize={8} fontFamily={C.mono} fill={ruler.text}/>
    {xTicks.map((value, index) => {
      const x = origin.x + value * zoom;
      if (x < left || x > width - 1) return null;
      const major = Math.abs(value / step - Math.round(value / step)) < 0.0001;
      return <Rect key={`xt-${index}`} x={x} y={major ? top - 7 : top - 4} width={1} height={major ? 7 : 4} fill={major ? ruler.tick : ruler.line}/>;
    })}
    {xLabels.map(value => {
      const x = origin.x + value * zoom;
      if (x < left - 1 || x > width - 1) return null;
      return <Text key={`xl-${value}`} x={x + 3} y={3} text={String(value)} fontSize={9} fontFamily={C.mono} fill={ruler.text}/>;
    })}
    {yTicks.map((value, index) => {
      const y = origin.y + value * zoom;
      if (y < top || y > height - 1) return null;
      const major = Math.abs(value / step - Math.round(value / step)) < 0.0001;
      return <Rect key={`yt-${index}`} x={major ? left - 7 : left - 4} y={y} width={major ? 7 : 4} height={1} fill={major ? ruler.tick : ruler.line}/>;
    })}
    {yLabels.map(value => {
      const y = origin.y + value * zoom;
      if (y < top - 1 || y > height - 1) return null;
      return <Text key={`yl-${value}`} x={3} y={y - 3} text={String(value)} fontSize={9} fontFamily={C.mono} fill={ruler.text} rotation={-90} offsetX={-4}/>;
    })}
    {origin.x >= left && origin.x < width && origin.y >= top && origin.y < height && <>
      <Rect x={origin.x - 4} y={origin.y} width={9} height={1} fill={C.accent} opacity={0.7}/>
      <Rect x={origin.x} y={origin.y - 4} width={1} height={9} fill={C.accent} opacity={0.7}/>
    </>}
  </Layer>;
}

export function Canvas({ numericPreviewEpoch, screenPositions, setScreenPositions, onSelectScreen, view, setView, preview = null, readOnly = false, behaviorPreview = null, behaviorMode = false, interaction, onBehaviorTrigger, editTabs = {}, grid, alignment, resources, resourceGeneration, font, theme }: Props) {
  const chrome = theme === 'light' ? { bg: '#f3f1ec', line: '#d9d5cc', text: '#4d4a43' } : { bg: C.ruler, line: C.line, text: C.text2 };
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 540 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelImage, setPanelImage] = useState<{ style: string; image: HTMLImageElement } | null>(null);
  const [panelError, setPanelError] = useState('');
  const [assets, setAssets] = useState<Record<string, PreviewAsset>>({});
  const [assetBusy, setAssetBusy] = useState(false);
  const [interactionValues, setInteractionValues] = useState<Record<string, boolean | string>>({});
  const [interactionFocus, setInteractionFocus] = useState<string | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides>({});
  const [spacingMark, setSpacingMark] = useState<SpacingMark | null>(null);
  const currentScreenId = useStore(editorStore, s => s.currentScreenId);
  useEffect(() => { setInteractionValues({}); setInteractionFocus(null); if (interaction || behaviorPreview) setEditingId(null); }, [interaction, currentScreenId]);
  const screen = useStore(editorStore, s => currentScreen(s));
  const [numericRuntime, setNumericRuntime] = useState<Record<string, NumericState>>({});
  useEffect(() => { setNumericRuntime({}); }, [numericPreviewEpoch, screen.id, interaction, behaviorMode]);
  const screens = useStore(editorStore, s => s.doc.screens);
  const screenTabGroupsState = useStore(editorStore, s => s.doc.screenTabGroups);
  const screenTabGroups = screenTabGroupsState ?? NO_SCREEN_TAB_GROUPS;
  const hasCreativeTab = screens.some(item => item.nodes.some(node => node.type === 'minecraft:creative-tab'));
  const hasCheckbox = screens.some(item => item.nodes.some(node => node.type === 'minecraft:checkbox'));
  const hasSlider = screens.some(item => item.nodes.some(node => node.type === 'minecraft:slider'));
  const cache = useRef(new SpriteRasterCache()).current;
  useEffect(() => {
    let active = true; const decoded: ImageBitmap[] = []; cache.clear(); setAssets({});
    if (!resources.baseName) { setAssetBusy(false); return () => { active = false; }; }
    setAssetBusy(true);
    void Promise.all([...GUI_SPRITES, ...(hasSlider ? SLIDER_SPRITES : []), ...(hasCheckbox ? CHECKBOX_SPRITES : []), ...(hasCreativeTab ? CREATIVE_TAB_SPRITES : [])].map(async id => {
      const result = await resources.sprite(id);
      if (result.status !== 'valid') return [id, { error: `${result.status}：${result.diagnostic}` }] as const;
      try {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(result.data)], { type: 'image/png' }));
        if (!active) { bitmap.close(); return [id, {}] as const; }
        if (bitmap.width !== result.width || bitmap.height !== result.height) { bitmap.close(); throw new Error('PNG 解码尺寸不匹配'); }
        decoded.push(bitmap); return [id, { sprite: { image: bitmap, scaling: result.scaling } }] as const;
      } catch (error) { return [id, { error: `invalid：PNG 解码失败：${(error as Error).message}` }] as const; }
    })).then(values => { if (active) { setAssets(Object.fromEntries(values)); setAssetBusy(false); } });
    return () => { active = false; cache.clear(); decoded.forEach(bitmap => bitmap.close()); };
  }, [resources, resourceGeneration, cache, hasCheckbox, hasCreativeTab, hasSlider]);
  const panel = panelBounds(screen);
  const panelStyle = screen.background.kind === 'panel' ? screen.background.style : null;
  useEffect(() => {
    let active = true; setPanelError(''); setPanelImage(null);
    if (panelStyle && isTextureStyle(panelStyle)) void getPanelImage(panelStyle).then(image => { if (active) setPanelImage({ style: panelStyle, image }); }).catch(error => { if (active) setPanelError((error as Error).message); });
    return () => { active = false; };
  }, [panelStyle]);
  const selected = useStore(editorStore, s => s.selected);
  const gesture = useStore(editorStore, s => s.gesture);
  const selectedNode = screen.nodes.find(n => n.id === selected);
  useEffect(() => { setEditingId(id => id === selected ? id : null); }, [selected]);
  useEffect(() => { setEditingId(null); setInteractionValues({}); setInteractionFocus(null); }, [screen.id]);
  const pointer = useRef<null | { pointerId: number; x: number; y: number; zoom: number; mode: 'move' | 'resize' | 'pan'; resizeEdge?: ResizeEdge; bounds?: Bounds; panX: number; panY: number; screenId?: string; peers?: { id: string; bounds: Bounds }[]; min?: { w: number; h: number }; spacingCandidates?: SpacingCandidate[]; xKey?: string; yKey?: string; spacingKey?: string }>(null);
  useEffect(() => { if (pointer.current) { pointer.current = null; editorStore.getState().cancelGesture(); } setAlignmentGuides({}); setSpacingMark(null); }, [screen.id]);
  const fit = preview ? Math.max(0.01, Math.min(Math.max(1, size.width - 48) / preview.framebufferWidth, Math.max(1, size.height - 110) / preview.framebufferHeight)) : 1;
  const frame = preview ? { x: (size.width - preview.framebufferWidth * fit) / 2, y: (size.height - preview.framebufferHeight * fit) / 2,
    w: preview.framebufferWidth * fit, h: preview.framebufferHeight * fit } : null;
  const renderZoom = preview ? fit * preview.effectiveScale : view.zoom;
  let nextX = 0;
  const positions = Object.fromEntries(screens.map(item => { const position = screenPositions[item.id] ?? { x: nextX, y: 0 }; nextX += item.designSize.width + 60; return [item.id, position]; }));
  const activePosition = positions[screen.id], first = screens[0];
  const basis = { width: first.designSize.width, height: first.designSize.height, dx: activePosition.x, dy: activePosition.y };
  const origin = frame && preview ? { x: frame.x + Math.floor((preview.logicalWidth - screen.designSize.width) / 2) * renderZoom,
    y: frame.y + Math.floor((preview.logicalHeight - screen.designSize.height) / 2) * renderZoom }
    : interaction || behaviorMode ? { x: Math.floor((size.width - screen.designSize.width * view.zoom) / 2), y: Math.floor((size.height - screen.designSize.height * view.zoom) / 2) }
    : { x: Math.floor((size.width - basis.width * view.zoom) / 2) + view.panX + basis.dx * view.zoom,
      y: Math.floor((size.height - basis.height * view.zoom) / 2) + view.panY + basis.dy * view.zoom };
  const current = useRef({ view, setView, size, screen, editingId, preview, readOnly, interaction, basis, alignment, origin }); current.current = { view, setView, size, screen, editingId, preview, readOnly, interaction, basis, alignment, origin };
  const header = (item: GuiScreen) => <Group y={-22 / renderZoom} draggable={!preview && !readOnly && !behaviorMode && !interaction && !gesture && view.tool !== 'pan'}
    onPointerDown={e => { if (e.evt.button === 0 && view.tool !== 'pan') e.cancelBubble = true; }}
    onDragEnd={e => { e.cancelBubble = true; const dx = e.target.x(), dy = e.target.y() + 22 / renderZoom; e.target.position({ x: 0, y: -22 / renderZoom }); if (Math.abs(dx) + Math.abs(dy) > 0.5) setScreenPositions(previous => ({ ...previous, [item.id]: { x: positions[item.id].x + dx, y: positions[item.id].y + dy } })); }}
    onClick={e => { if (e.evt.button === 0 && view.tool !== 'pan') { e.cancelBubble = true; if (item.id !== screen.id) onSelectScreen(item.id); } }}>
    <Rect width={Math.max(100, item.designSize.width)} height={20 / renderZoom} fill={item.id === screen.id ? '#6e5128' : '#354452'} cornerRadius={2 / renderZoom}/>
    <Text x={5 / renderZoom} y={4 / renderZoom} text={`${displayText(item.title)} · ${item.id}`} fill="#f4eee2" fontSize={11 / renderZoom} listening={false}/>
  </Group>;
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const r = entries[0].contentRect; setSize({ width: Math.max(1, r.width), height: Math.max(1, r.height) });
    });
    observer.observe(host.current!); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const cancel = () => { pointer.current = null; setAlignmentGuides({}); setSpacingMark(null); editorStore.getState().cancelGesture(); };
    const move = (e: PointerEvent) => {
      const p = pointer.current; if (!p || p.pointerId !== e.pointerId) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (p.mode === 'pan') current.current.setView({ ...current.current.view, panX: p.panX + dx, panY: p.panY + dy });
      else if (p.bounds) {
        const state = editorStore.getState();
        if (state.currentScreenId !== p.screenId) { cancel(); return; }
        const design = currentScreen(state).designSize;
        const raw = p.mode === 'move' ? { ...p.bounds, x: p.bounds.x + dx / p.zoom, y: p.bounds.y + dy / p.zoom }
          : (() => {
            const edge = p.resizeEdge ?? 'bottom-right';
            const min = p.min ?? { w: 1, h: 1 };
            const changeX = Math.round(dx / p.zoom), changeY = Math.round(dy / p.zoom);
            if (edge === 'left') { const right = p.bounds!.x + p.bounds!.w, x = Math.max(0, Math.min(right - min.w, p.bounds!.x + changeX)); return { ...p.bounds!, x, w: right - x }; }
            if (edge === 'right') return { ...p.bounds!, w: Math.max(min.w, Math.min(design.width - p.bounds!.x, p.bounds!.w + changeX)) };
            if (edge === 'top') { const bottom = p.bounds!.y + p.bounds!.h, y = Math.max(0, Math.min(bottom - min.h, p.bounds!.y + changeY)); return { ...p.bounds!, y, h: bottom - y }; }
            if (edge === 'bottom') return { ...p.bounds!, h: Math.max(min.h, Math.min(design.height - p.bounds!.y, p.bounds!.h + changeY)) };
            if (edge === 'top-left') {
              const right = p.bounds!.x + p.bounds!.w, bottom = p.bounds!.y + p.bounds!.h;
              const x = Math.max(0, Math.min(right - min.w, p.bounds!.x + changeX)), y = Math.max(0, Math.min(bottom - min.h, p.bounds!.y + changeY));
              return { ...p.bounds!, x, y, w: right - x, h: bottom - y };
            }
            return { ...p.bounds!, w: Math.max(min.w, Math.min(design.width - p.bounds!.x, p.bounds!.w + changeX)), h: Math.max(min.h, Math.min(design.height - p.bounds!.y, p.bounds!.h + changeY)) };
          })();
        if (p.mode === 'move' && p.peers) {
          const aligned = alignBounds(raw, design, p.peers, p.zoom, { snap: current.current.alignment.snap, guides: current.current.alignment.guides, previous: { xKey: p.xKey, yKey: p.yKey } });
          p.xKey = aligned.guides.xKey; p.yKey = aligned.guides.yKey; setAlignmentGuides(aligned.guides);
          const spaced = resolveEqualSpacing(aligned.bounds, p.spacingCandidates ?? [], p.zoom, { snap: current.current.alignment.snap, guides: current.current.alignment.guides,
            blockedAxes: [aligned.guides.xKey ? 'x' : null, aligned.guides.yKey ? 'y' : null].filter((axis): axis is 'x' | 'y' => axis !== null), previousKey: p.spacingKey });
          p.spacingKey = spaced.key; setSpacingMark(spaced.mark ?? null); editorStore.getState().previewBounds(spaced.bounds);
        } else if (p.mode === 'resize' && p.peers && p.min) {
          const aligned = alignResizeBounds(raw, design, p.peers, p.zoom, { snap: current.current.alignment.snap, guides: current.current.alignment.guides, min: p.min, edge: p.resizeEdge, previous: { xKey: p.xKey, yKey: p.yKey } });
          p.xKey = aligned.guides.xKey; p.yKey = aligned.guides.yKey; setAlignmentGuides(aligned.guides); setSpacingMark(null);
          editorStore.getState().previewBounds(aligned.bounds);
        } else { setSpacingMark(null); editorStore.getState().previewBounds(raw); }
      }
    };
    const end = (e: PointerEvent) => {
      if (pointer.current?.pointerId !== e.pointerId) return;
      move(e); pointer.current = null; setAlignmentGuides({}); setSpacingMark(null); editorStore.getState().commitGesture();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel); window.addEventListener('keydown', key);
    return () => { cancel(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key); };
  }, []);
  const begin = (e: KonvaEventObject<PointerEvent>, id: string, mode: 'move' | 'resize', resizeEdge?: ResizeEdge) => {
    if (preview) return;
    if (e.evt.button !== 0 && e.evt.button !== 2) return;
    e.cancelBubble = true;
    if (behaviorMode && e.evt.button === 0) onBehaviorTrigger?.(id);
    if (interaction) {
      if (e.evt.button !== 0) return;
      const node = screen.nodes.find(n => n.id === id);
      if (!node || !('enabled' in node.state) || !node.state.enabled || !node.state.visible) return;
      setInteractionFocus(id);
      setInteractionValues(values => {
        if (node.type === 'minecraft:checkbox') return { ...values, [id]: !(typeof values[id] === 'boolean' ? values[id] : node.props.selected) };
        if (node.type === 'minecraft:cycle-button') {
          const old = typeof values[id] === 'string' ? values[id] : node.props.initialOptionId;
          const index = node.props.options.findIndex(option => option.id === old), delta = e.evt.shiftKey ? -1 : 1;
          return { ...values, [id]: node.props.options[(Math.max(0, index) + delta + node.props.options.length) % node.props.options.length].id };
        }
        return values;
      });
      return;
    }
    const { clientX: x, clientY: y, pointerId } = e.evt;
    if (e.evt.button === 2 || view.tool === 'pan') {
      e.evt.preventDefault();
      pointer.current = { pointerId, x, y, mode: 'pan', zoom: view.zoom, panX: view.panX, panY: view.panY }; return;
    }
    const state = editorStore.getState();
    if (readOnly) { state.select(id); return; }
    state.beginGesture(id);
    const node = currentScreen(state).nodes.find(n => n.id === id); if (!node) { state.cancelGesture(); return; }
    const bounds = node.bounds, visibleInGroup = tabVisibility(currentScreen(state).nodes, editSelection);
    const peers = currentScreen(state).nodes.filter(item => item.id !== id && item.state.visible && visibleInGroup(item.id)).map(item => ({ id: item.id, bounds: item.bounds }));
    pointer.current = { pointerId, x, y, mode, resizeEdge, bounds: { ...bounds }, zoom: view.zoom, panX: view.panX, panY: view.panY, screenId: state.currentScreenId, peers,
      min: CATALOG[node.type].min, spacingCandidates: mode === 'move' ? equalSpacingCandidates(bounds, peers, currentScreen(state).designSize) : undefined };
    setAlignmentGuides({}); setSpacingMark(null);
  };
  // Stable callback keeps the other 299 drawings untouched during a single-node drag.
  const beginRef = useRef(begin); beginRef.current = begin;
  const stableDown = useRef((e: KonvaEventObject<PointerEvent>, id: string, mode: 'move' | 'resize', edge?: ResizeEdge) => beginRef.current(e, id, mode, edge)).current;
  const stableEdit = useRef((id: string) => {
    if (current.current.preview || current.current.readOnly) return;
    const state = editorStore.getState(), node = currentScreen(state).nodes.find(n => n.id === id);
    if (node && editableText(node) !== null) { state.cancelGesture(); state.select(id); setEditingId(id); }
  }).current;
  useEffect(() => {
    const element = host.current!;
    const wheel = (e: WheelEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.target instanceof Element && e.target.closest('input,textarea,select'))) return;
      // The canvas owns an unmodified wheel gesture; forms and browser zoom keep their normal behavior.
      e.preventDefault(); e.stopPropagation();
      const c = current.current;
      if (pointer.current || editorStore.getState().gesture || c.editingId || c.preview) return;
      const rect = element.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const old = c.view;
      if (c.interaction) {
        const ox = c.origin.x, oy = c.origin.y;
        const x = (px - ox) / old.zoom, y = (py - oy) / old.zoom;
        const node = [...c.screen.nodes].reverse().find(n => x >= n.bounds.x && y >= n.bounds.y && x < n.bounds.x + n.bounds.w && y < n.bounds.y + n.bounds.h);
        if (node?.type === 'minecraft:cycle-button' && node.state.enabled && node.state.visible && e.deltaY !== 0) {
          setInteractionValues(values => { const oldValue = typeof values[node.id] === 'string' ? values[node.id] : node.props.initialOptionId;
            const index = node.props.options.findIndex(option => option.id === oldValue), delta = e.deltaY < 0 ? -1 : 1;
            return { ...values, [node.id]: node.props.options[(Math.max(0, index) + delta + node.props.options.length) % node.props.options.length].id }; });
          setInteractionFocus(node.id);
        }
        return;
      }
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? c.size.height : 1);
      const zoom = Math.max(0.25, Math.min(16, Math.round(old.zoom * Math.exp(-delta * 0.002) * 1000) / 1000));
      const oldX = Math.floor((c.size.width - c.basis.width * old.zoom) / 2) + old.panX + c.basis.dx * old.zoom;
      const oldY = Math.floor((c.size.height - c.basis.height * old.zoom) / 2) + old.panY + c.basis.dy * old.zoom;
      const panX = px - (px - oldX) / old.zoom * zoom - Math.floor((c.size.width - c.basis.width * zoom) / 2) - c.basis.dx * zoom;
      const panY = py - (py - oldY) / old.zoom * zoom - Math.floor((c.size.height - c.basis.height * zoom) / 2) - c.basis.dy * zoom;
      const next = { ...old, zoom, panX, panY };
      current.current = { ...c, view: next }; c.setView(next);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (preview || readOnly) return;
    const type = e.dataTransfer.getData('application/x-minecraft-gui-component') as NodeType;
    if (!NODE_TYPES.includes(type)) return;
    const rect = host.current!.getBoundingClientRect();
    editorStore.getState().add(type, { x: Math.round((e.clientX - rect.left - origin.x) / view.zoom), y: Math.round((e.clientY - rect.top - origin.y) / view.zoom) });
  };
  const b = gesture?.id === selected ? gesture.draft : selectedNode?.bounds;
  // Editing selection is session-only; behavior testing always starts from the document initial state.
  const validEditGroups = new Set(screen.nodes.filter(n => n.type === 'minecraft:creative-tab' && n.props.groupId && editTabs[n.props.groupId] === n.id).map(n => n.type === 'minecraft:creative-tab' ? n.props.groupId! : ''));
  const editSelection = Object.fromEntries(screen.nodes.filter(n => n.type === 'minecraft:creative-tab' && n.props.groupId && validEditGroups.has(n.props.groupId)).map(n => [n.id, { tabSelected: n.type === 'minecraft:creative-tab' && editTabs[n.props.groupId!] === n.id }]));
  const visualSelection = behaviorPreview ?? (preview ? null : editSelection);
  const visibleInGroup = tabVisibility(screen.nodes, visualSelection), managed = tabManaged(screen.nodes);
  const renderNodes = screen.nodes.map(node => {
    if (node.type !== 'minecraft:creative-tab') return node;
    const navigationSelected = screenNavigationSelected(node, screen.id, screenTabGroups);
    if (navigationSelected !== null) return { ...node, props: { ...node.props, selected: navigationSelected } };
    return visualSelection?.[node.id]?.tabSelected !== undefined ? { ...node, props: { ...node.props, selected: visualSelection[node.id].tabSelected! } } : node;
  });
  const editingNode = editingId === selected ? screen.nodes.find(n => n.id === editingId) : undefined;
  const drawNode = (original: GuiNode) => { const override = behaviorPreview?.[original.id];
          if (behaviorPreview && (!(override?.visible ?? (managed.has(original.id) ? true : original.state.visible)) || !visibleInGroup(original.id))) return null;
          let node: GuiNode = managed.has(original.id) ? { ...original, state: { ...original.state, visible: override?.visible ?? true } } as GuiNode : override?.visible === undefined ? original : { ...original, state: { ...original.state, visible: override.visible } } as GuiNode;
          if (!behaviorPreview && !visibleInGroup(node.id)) node = { ...node, state: { ...node.state, visible: false } } as GuiNode;
          if (behaviorPreview && node.type === 'minecraft:string-widget' && override?.text !== undefined) node = { ...node, props: { ...node.props, text: { kind: 'literal', value: override.text } } };
          if (behaviorPreview && node.type === 'minecraft:checkbox' && override?.checked !== undefined) node = { ...node, props: { ...node.props, selected: override.checked } };
          const value = interactionValues[node.id];
          const checkedValue = behaviorPreview?.[node.id]?.checked ?? (typeof value === 'boolean' ? value : undefined);
          const shown = interaction && node.type === 'minecraft:checkbox' && checkedValue !== undefined ? { ...node, props: { ...node.props, selected: checkedValue } }
            : interaction && node.type === 'minecraft:cycle-button' && typeof value === 'string' && node.props.options.some(o => o.id === value) ? { ...node, props: { ...node.props, initialOptionId: value } } : node;
          return <NodeDrawing key={node.id} node={shown} numericState={numericRuntime[node.id]} numericOverlay={interaction || behaviorMode} bounds={gesture?.id === node.id ? gesture.draft : node.bounds} onDown={stableDown} onEdit={interaction ? () => {} : stableEdit} assets={assets} cache={cache} resourceActive={!!resources.baseName} focused={interaction ? interactionFocus === node.id : editingId === node.id} selected={node.id === selected} font={font} panel={screen.background.kind === 'panel'} zoom={renderZoom}/>; };
  const chip = (() => {
    if (!b || preview || interaction || behaviorPreview) return null;
    const chipWidth = 112, chipHeight = 18;
    const selTop = origin.y + b.y * renderZoom;
    const selRight = origin.x + (b.x + b.w) * renderZoom, selBottom = origin.y + (b.y + b.h) * renderZoom;
    const x = Math.max(4, Math.min(size.width - chipWidth - 4, selRight + 6));
    const y = selBottom + 6 + chipHeight > size.height - 30 ? Math.max(24, selTop - chipHeight - 6) : selBottom + 6;
    const hidden = selectedNode && !selectedNode.state.visible;
    return { x, y, width: chipWidth, height: chipHeight, text: `${hidden ? '隐藏 · ' : ''}W ${b.w}  H ${b.h}` };
  })();
  return <div ref={host} className={`canvas-host ${view.tool}`} data-testid="canvas-host" role="application" aria-label="GUI 设计画布"
    data-origin-x={origin.x} data-origin-y={origin.y} data-zoom={renderZoom} data-preview={!!preview}
    data-grid-visible={grid.visible && !preview} data-grid-spacing={grid.spacing}
    data-smart-guides={alignment.guides} data-smart-snap={alignment.snap}
    data-alignment-x={alignmentGuides.x ?? ''} data-alignment-y={alignmentGuides.y ?? ''}
    data-spacing-axis={spacingMark?.axis ?? ''} data-spacing-gap={spacingMark?.gap ?? ''}
    data-gui-scale={preview?.effectiveScale} data-gui-width={preview?.logicalWidth} data-gui-height={preview?.logicalHeight}
    onDragOver={e => e.preventDefault()} onDrop={drop}
    onContextMenu={e => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}>
    <Stage width={size.width} height={size.height} onPointerDown={e => {
      if (preview || behaviorMode) return;
      if (e.evt.button !== 0 && e.evt.button !== 2) return;
      if (e.evt.button === 2 || view.tool === 'pan') { e.evt.preventDefault(); pointer.current = { pointerId: e.evt.pointerId, x: e.evt.clientX, y: e.evt.clientY,
        mode: 'pan', zoom: view.zoom, panX: view.panX, panY: view.panY };
      } else editorStore.getState().select(null);
    }}>
      <Layer><Group clipX={frame?.x} clipY={frame?.y} clipWidth={frame?.w} clipHeight={frame?.h}>
        {frame && <Rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="#080a0c" stroke="#6a7d91" strokeWidth={1}/>}
        {!preview && !interaction && !behaviorMode && screens.filter(item => item.id !== screen.id).map(item => <Group key={item.id} x={origin.x + (positions[item.id].x - activePosition.x) * renderZoom} y={origin.y + (positions[item.id].y - activePosition.y) * renderZoom} scaleX={renderZoom} scaleY={renderZoom}>
          <OtherScreen screen={item} assets={assets} cache={cache} resources={resources} font={font} zoom={renderZoom} select={() => onSelectScreen(item.id)} selectOnLeft={view.tool === 'select'} screenTabGroups={screenTabGroups}/>
          {header(item)}
        </Group>)}
        <Group x={origin.x} y={origin.y} scaleX={renderZoom} scaleY={renderZoom} listening={!preview}>
        <Rect width={screen.designSize.width} height={screen.designSize.height} fill={C.design} stroke={C.designLine} strokeWidth={1 / renderZoom} />
        {!preview && screens.length > 1 && header(screen)}
        {!preview && (() => {
          const { width, height } = screen.designSize, length = 8 / renderZoom, line = 1 / renderZoom;
          const marks: [number, number, number, number][] = [
            [0, 0, length, line], [0, 0, line, length],
            [width - length, 0, length, line], [width - line, 0, line, length],
            [0, height - line, length, line], [0, height - length, line, length],
            [width - length, height - line, length, line], [width - line, height - length, line, length],
          ];
          return <Group listening={false}>{marks.map(([x, y, w, h], index) => <Rect key={index} x={x} y={y} width={w} height={h} fill={C.accent} opacity={0.4}/>)}</Group>;
        })()}
        {renderNodes.filter(beforePanel).map(drawNode)}
        {screen.background.kind === 'panel' && !isTextureStyle(screen.background.style) && panelRects(panel.w, panel.h).map((r, i) => <Rect key={i} x={r.x + panel.x} y={r.y + panel.y} width={r.w} height={r.h} fill={r.color} listening={false}/>)}
        {screen.background.kind === 'panel' && isTextureStyle(screen.background.style) && panelImage?.style === screen.background.style && <Shape x={panel.x} y={panel.y} listening={false} sceneFunc={context => {
          const ctx = context._context, raster = panelPreviewRaster(panelImage.image, panel.w, panel.h);
          if (!raster) { drawNativePanel(ctx, panelImage.image, panel.w, panel.h); return; }
          ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(raster, 0, 0); ctx.restore();
        }}/>}
        {renderNodes.filter(node => !beforePanel(node)).map(drawNode)}
        {b && !preview && !interaction && !behaviorPreview && <Group>
          <Rect x={b.x} y={b.y} width={b.w} height={b.h} stroke="#080a0c" opacity={0.9} strokeWidth={3 / renderZoom} listening={false}/>
          <Rect x={b.x} y={b.y} width={b.w} height={b.h} stroke={C.accent} strokeWidth={1.5 / renderZoom} listening={false}/>
          {!readOnly && selectedNode?.type !== 'minecraft:creative-tab' && <Group>
            {([
              { edge: 'left', x: b.x - 4 / renderZoom, y: b.y + b.h / 2 - 4 / renderZoom, cursor: 'ew-resize' },
              { edge: 'right', x: b.x + b.w - 4 / renderZoom, y: b.y + b.h / 2 - 4 / renderZoom, cursor: 'ew-resize' },
              { edge: 'top', x: b.x + b.w / 2 - 4 / renderZoom, y: b.y - 4 / renderZoom, cursor: 'ns-resize' },
              { edge: 'bottom', x: b.x + b.w / 2 - 4 / renderZoom, y: b.y + b.h - 4 / renderZoom, cursor: 'ns-resize' },
              { edge: 'top-left', x: b.x - 4 / renderZoom, y: b.y - 4 / renderZoom, cursor: 'nwse-resize' },
              { edge: 'bottom-right', x: b.x + b.w - 4 / renderZoom, y: b.y + b.h - 4 / renderZoom, cursor: 'nwse-resize' },
            ] as const).map(handle => <Rect key={handle.edge} x={handle.x} y={handle.y} width={8 / renderZoom} height={8 / renderZoom}
              fill={C.accent} stroke="#221604" strokeWidth={1 / renderZoom} onPointerDown={e => begin(e, selected!, 'resize', handle.edge)}
              onMouseEnter={e => { const stage = e.target.getStage(); if (stage) stage.container().style.cursor = handle.cursor; }}
              onMouseLeave={e => { const stage = e.target.getStage(); if (stage) stage.container().style.cursor = 'default'; }}/>)}
          </Group>}
        </Group>}
        {grid.visible && !preview && <Shape listening={false} sceneFunc={context => {
          const ctx = context._context, { width, height } = screen.designSize, spacing = grid.spacing;
          const left = Math.max(0, -origin.x / renderZoom), right = Math.min(width, (size.width - origin.x) / renderZoom);
          const top = Math.max(0, -origin.y / renderZoom), bottom = Math.min(height, (size.height - origin.y) / renderZoom);
          if (right <= left || bottom <= top) return;
          ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
          ctx.beginPath(); ctx.lineWidth = 1 / renderZoom; ctx.strokeStyle = C.grid;
          for (let x = Math.ceil(left / spacing) * spacing; x <= right; x += spacing) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
          for (let y = Math.ceil(top / spacing) * spacing; y <= bottom; y += spacing) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
          ctx.stroke(); ctx.restore();
        }}/>}
      </Group>
      {chip && <Group x={chip.x} y={chip.y} listening={false}>
        <Rect width={chip.width} height={chip.height} fill={chrome.bg} opacity={0.96} stroke={chrome.line} strokeWidth={1} cornerRadius={3}/>
        <Text x={6} y={5} text={chip.text} fontSize={9} fontFamily={C.mono} fill={chrome.text}/>
      </Group>}
      </Group></Layer>
      {!preview && alignment.guides && (alignmentGuides.x !== undefined || alignmentGuides.y !== undefined || !!spacingMark) && <Layer listening={false}>
        {alignmentGuides.x !== undefined && <Rect x={origin.x + alignmentGuides.x * renderZoom - 0.5} y={origin.y} width={1} height={screen.designSize.height * renderZoom} fill="#55d6bd" opacity={0.95}/>}
        {alignmentGuides.y !== undefined && <Rect x={origin.x} y={origin.y + alignmentGuides.y * renderZoom - 0.5} width={screen.designSize.width * renderZoom} height={1} fill="#55d6bd" opacity={0.95}/>}
        {spacingMark && <Shape listening={false} sceneFunc={context => {
          const ctx = context._context; ctx.save(); ctx.beginPath(); ctx.lineWidth = 1; ctx.strokeStyle = '#f0b45c';
          for (const [a, b] of spacingMark.intervals) {
            if (spacingMark.axis === 'x') { const y = origin.y + spacingMark.cross * renderZoom, x1 = origin.x + a * renderZoom, x2 = origin.x + b * renderZoom;
              ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.moveTo(x1, y - 3); ctx.lineTo(x1, y + 3); ctx.moveTo(x2, y - 3); ctx.lineTo(x2, y + 3);
            } else { const x = origin.x + spacingMark.cross * renderZoom, y1 = origin.y + a * renderZoom, y2 = origin.y + b * renderZoom;
              ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.moveTo(x - 3, y1); ctx.lineTo(x + 3, y1); ctx.moveTo(x - 3, y2); ctx.lineTo(x + 3, y2);
            }
          }
          ctx.stroke(); ctx.restore();
        }}/>}
        {spacingMark && <Group listening={false}>{spacingMark.intervals.map(([a, b], index) => <Text key={`${spacingMark.key}-${index}`} x={spacingMark.axis === 'x' ? origin.x + (a + b) / 2 * renderZoom - 15 : origin.x + spacingMark.cross * renderZoom - 18}
          y={spacingMark.axis === 'x' ? origin.y + spacingMark.cross * renderZoom - 13 : origin.y + (a + b) / 2 * renderZoom - 5}
          text={`${spacingMark.gap}px`} fontSize={9} fontFamily={C.mono} fill="#ffd389" listening={false}/>)}</Group>}
      </Layer>}
      {!preview && <Rulers width={size.width} height={size.height} origin={origin} zoom={renderZoom} design={screen.designSize} theme={theme}/>}
    </Stage>
    {(interaction || behaviorMode) && !preview && <NumericPreview key={`${screen.id}:${numericPreviewEpoch}`} screenId={screen.id} nodes={renderNodes.filter(isNumericNode).filter(node => (behaviorPreview?.[node.id]?.visible ?? (managed.has(node.id) ? true : node.state.visible)) && visibleInGroup(node.id))} origin={origin} zoom={renderZoom} family={font.family} onVisualChange={setNumericRuntime}/>}
    {editingNode && !preview && !readOnly && <InlineTextEditor key={editingNode.id} node={editingNode} left={origin.x + editingNode.bounds.x * view.zoom}
      top={origin.y + editingNode.bounds.y * view.zoom} width={editingNode.bounds.w * view.zoom} height={editingNode.bounds.h * view.zoom}
      zoom={view.zoom} close={() => setEditingId(null)}/>}
    <div className="canvas-caption" aria-hidden="true"><b>SCREEN</b><span>{screen.id}</span><span className="caption-rule"/><span>{screen.designSize.width} × {screen.designSize.height} · GUI 逻辑像素</span></div>
    {!screen.nodes.length && !preview && screens.length === 1 && <div className="canvas-empty">
      <div className="canvas-empty-eyebrow">EMPTY SCREEN</div>
      <h2>空白设计区</h2>
      <p>从组件库添加组件，或直接拖入设计区。所有坐标使用整数 GUI 逻辑像素。</p>
      <div className="canvas-empty-actions">
        <button aria-label="新建 Button" disabled={readOnly || behaviorMode || !!gesture} onClick={() => editorStore.getState().add('minecraft:button')}>Button</button>
        <button aria-label="新建 StringWidget" disabled={readOnly || behaviorMode || !!gesture} onClick={() => editorStore.getState().add('minecraft:string-widget')}>StringWidget</button>
        <button aria-label="新建 Rectangle" disabled={readOnly || behaviorMode || !!gesture} onClick={() => editorStore.getState().add('minecraft:fill')}>Rectangle</button>
      </div>
      <p className="canvas-empty-note">这是规格设计器，不运行 Java GUI。也可以从文件菜单导入 JSON。</p>
    </div>}
    <span className={`canvas-badge ${preview ? 'preview' : resources.baseName ? 'resource' : ''}`} title={preview ? `只读预览：游戏 GUI Scale ${preview.effectiveScale}×，窗口已适配网页。` : '浏览器近似预览，不执行 Java Widget；最终外观以游戏内实测为准。'}>
      {preview ? `只读预览 · GUI Scale ${preview.effectiveScale}×` : resources.baseName ? '纹理参考 · 浏览器近似' : '中性近似预览'}
    </span>
    <div className="canvas-zoom" aria-hidden="true"><b>{preview ? `游戏缩放 ${preview.effectiveScale}×` : `编辑缩放 ${Math.round(renderZoom * 100)}%`}</b><span className="zoom-sep">·</span><span>{preview ? `GUI ${preview.logicalWidth} × ${preview.logicalHeight}` : '逻辑坐标不变'}</span></div>
    {!!resources.baseName && (assetBusy || Object.values(assets).some(a => a.error)) && <div className="sprite-diagnostics" role="status">
      <strong>资源诊断</strong>
      {assetBusy ? '正在解码 GUI 纹理…' : Object.entries(assets).filter(([, a]) => a.error).map(([id, a]) => <div key={id}>{id}：{a.error}</div>)}
    </div>}
    {hasCreativeTab && !resources.baseName && <div className="canvas-note" role="status">CreativeTab 未使用客户端资源，当前为中性回退。</div>}
    {panelError && <div className="panel-load-error">Panel 纹理加载失败：{panelError}</div>}
  </div>;
}
