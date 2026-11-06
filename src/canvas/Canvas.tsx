import { usesControlState } from '../domain/genericBehavior';
import { memo, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { SelectionPreview } from './SelectionPreview';
import { isSelectionNode, selectionMinimum, type SelectionEvent, type SelectionNode } from '../domain/selection';
import { drawSelectionWidget } from '../render/selectionWidgets';
import { NumericPreview } from './NumericPreview';
import { isNumericNode, drawNumericWidget, type NumericNode } from '../render/numericWidgets';
import { isProgressNode } from '../domain/progress';
import { drawProgressBar } from '../render/progressBar';
import { isStatusNode } from '../domain/statusIndicator';
import { containerScrollOffset, contentSize, intersectBounds, isScrollablePanelNode, type ContainerDrop, type ScrollablePanelNode } from '../domain/scrollablePanel';
import { allDescendants, containerAncestorsEnabled, containerLocalViewport, containerScreenViewport, containerChildScreenBounds, designPanelExpansion, designSiblingOrder, isCollapsiblePanelNode, isContainerNode, nodeAbsoluteBounds, nodeVisibleBounds, type ContainerNode } from '../domain/collapsiblePanel';
import { drawStatusIndicator } from '../render/statusIndicator';
import { isImageNode } from '../domain/image';
import { drawImageNode, type RenderedImageAsset } from '../render/imageWidget';
import { drawScrollText } from '../render/scrollText';
import { ScrollTextPreview } from './ScrollTextPreview';
import { isTreeViewNode } from '../domain/treeView';
import { drawTreeView } from '../render/treeView';
import { TreeViewPreview } from './TreeViewPreview';
import { decodePreviewRaster } from '../render/previewRaster';
import type { NumericState, SliderChangeEvent } from '../domain/numeric';
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
import { canvasChrome, type CanvasChromeTheme } from './chromeTheme';

export type View = { zoom: number; panX: number; panY: number; tool: 'select' | 'pan' };
type ResizeEdge = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'bottom-right';
type Props = { onAddNode: (type: NodeType, position?: { x: number; y: number }, containerDrop?: ContainerDrop) => void; onEditError: (message: string) => void; containerScroll: Record<string, number>; setContainerScroll: (update: Record<string, number> | ((previous: Record<string, number>) => Record<string, number>)) => void; numericPreviewEpoch: number; statusValues: Record<string, string>; screenPositions: Record<string, {x: number; y: number}>; setScreenPositions: (update: (previous: Record<string, {x: number; y: number}>) => Record<string, {x: number; y: number}>) => void; onSelectScreen: (id: string) => void; view: View; setView: (view: View) => void; preview?: GuiScalePreview | null; readOnly?: boolean; behaviorPreview?: BehaviorPreview | null; behaviorMode?: boolean; interaction: boolean; onBehaviorTrigger?: (id: string) => void; onBehaviorSliderChange?: (event: SliderChangeEvent) => void; onBehaviorSelectionChange?: (event: SelectionEvent) => void; editTabs?: Record<string, string>; grid: { visible: boolean; spacing: number }; alignment: { guides: boolean; snap: boolean }; resources: LayeredResources; resourceGeneration: number; font: FontChoice; theme: 'dark' | 'light' };
type PreviewAsset = { sprite?: DecodedSprite; image?: RenderedImageAsset; error?: string };

const MONO = 'Cascadia Mono, Consolas, monospace';
/* Minecraft WYSIWYG surface colors: theme-independent by contract (same matte as PNG export). */
const DESIGN_SURFACE = '#1c2634';
const DESIGN_SURFACE_LINE = '#3c424a';
const NO_SCREEN_TAB_GROUPS: import('../domain/schema').ScreenTabGroup[] = [];
const rgba = (color: string) => `rgba(${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${parseInt(color.slice(7, 9), 16)},${parseInt(color.slice(1, 3), 16) / 255})`;
const containerAtPoint = (nodes: readonly GuiNode[], x: number, y: number, scrollOffsets: Readonly<Record<string, number>> = {}, expanded: Readonly<Record<string, boolean>> = {}) => [...nodes].reverse().find((node): node is ContainerNode => {
  if (!isContainerNode(node) || !node.state.visible) return false;
  const bounds = nodeAbsoluteBounds(node, nodes, scrollOffsets, expanded);
  const visible = nodeVisibleBounds(node, nodes, scrollOffsets, expanded);
  if (!visible || x < visible.x || y < visible.y || x >= visible.x + visible.w || y >= visible.y + visible.h) return false;
  const viewport = containerScreenViewport(node, nodes, scrollOffsets, expanded);
  const inContent = x >= viewport.x && x < viewport.x + viewport.w && y >= viewport.y && y < viewport.y + viewport.h;
  const collapsedHeader = isCollapsiblePanelNode(node) && !(expanded[node.id] ?? node.props.initialExpanded)
    && x >= bounds.x && x < bounds.x + bounds.w && y >= bounds.y && y < bounds.y + node.props.headerHeight;
  return inContent || collapsedHeader;
});

const NodeDrawing = memo(function NodeDrawing({ node, bounds, onDown, onEdit, assets, cache, resourceActive, focused, selected, font, panel, zoom, numericState, numericOverlay = false, runtimePreview = false, statusId, progressValue, expanded = true, chrome }: {
  node: GuiNode; bounds: Bounds; onDown: (e: KonvaEventObject<PointerEvent>, id: string, mode: 'move' | 'resize', edge?: ResizeEdge) => void;
  numericState?: NumericState; numericOverlay?: boolean; runtimePreview?: boolean; statusId?: string; progressValue?: number; expanded?: boolean; onEdit: (id: string) => void; assets: Record<string, PreviewAsset>; cache: SpriteRasterCache; resourceActive: boolean; focused: boolean; selected: boolean; font: FontChoice; panel: boolean; zoom: number; chrome: CanvasChromeTheme;
}) {
  const [hovered, setHovered] = useState(false);
  const { w, h } = bounds;
  const fill = node.type === 'minecraft:scrollable-panel' || node.type === 'minecraft:collapsible-panel' ? rgba(node.props.backgroundColor) : node.type === 'minecraft:fill' ? rgba(node.props.color)
    : node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' ? '#314354' : node.type === 'minecraft:edit-box' || node.type === 'minecraft:checkbox' ? '#151e2b' : 'rgba(255,255,255,0.01)';
  const stroke = node.type === 'minecraft:scrollable-panel' || (node.type === 'minecraft:collapsible-panel' && node.props.border) ? rgba(node.props.borderColor) : node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' || node.type === 'minecraft:checkbox' ? '#5a7185' : node.type === 'minecraft:edit-box' && node.props.bordered ? '#5a7185' : undefined;
  const id = isNumericNode(node) ? null : spriteForNode(node, hovered, focused);
  const asset = id ? assets[id] : undefined; let raster: HTMLCanvasElement | null = null; let renderError = '';
  if (id && asset?.sprite) { try { raster = cache.get(id, asset.sprite, node.type === 'minecraft:checkbox' ? 17 : w, node.type === 'minecraft:checkbox' ? 17 : h); } catch (error) { renderError = (error as Error).message; } }
  const unbordered = node.type === 'minecraft:edit-box' && !node.props.bordered;
  const textureError = !!((resourceActive && id && (asset?.error || renderError)) || (isImageNode(node) && assets[`image:${node.id}`]?.error));
  return <Group x={bounds.x} y={bounds.y} listening={!(runtimePreview && (isProgressNode(node) || isStatusNode(node) || isImageNode(node)))} opacity={node.state.visible ? ('enabled' in node.state && !node.state.enabled && !raster && node.type !== 'minecraft:checkbox' && !isNumericNode(node) && !isSelectionNode(node) ? 0.45 : 1) : 0.22}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onPointerDown={e => { if (node.type === 'minecraft:collapsible-panel' && runtimePreview) return; onDown(e, node.id, 'move'); }} onDblClick={e => { e.cancelBubble = true; onEdit(node.id); }}>
    <Rect width={w} height={h} fill={isNumericNode(node) || isProgressNode(node) ? 'rgba(0,0,0,0.001)' : node.type === 'minecraft:checkbox' ? 'rgba(0,0,0,0.001)' : raster || unbordered ? 'rgba(0,0,0,0.001)' : fill} stroke={node.type === 'minecraft:checkbox' || raster || unbordered ? undefined : stroke} strokeWidth={0.6} />
    {node.type === 'minecraft:collapsible-panel' && <>
      <Rect width={w} height={node.props.headerHeight} fill={rgba(node.props.headerColor)} listening={false}/>
      <Shape listening={false} sceneFunc={context => { const ctx = context._context; ctx.save(); ctx.fillStyle = rgba(node.props.textColor); ctx.font = `9px ${font.family}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(displayText(node.props.title), 6, node.props.headerHeight / 2); ctx.textAlign = 'center'; ctx.fillText(expanded ? '⌄' : '›', Math.max(8, w - 9), node.props.headerHeight / 2); ctx.restore(); }}/>
    </>}
    {isSelectionNode(node) && <Shape listening={false} sceneFunc={context => drawSelectionWidget(context._context, node, w, h, font.family)}/>}
    {isTreeViewNode(node) && <Shape listening={false} sceneFunc={context => drawTreeView(context._context, node, w, h, font.family)}/>}
    {isNumericNode(node) && <Shape listening={false} sceneFunc={context => drawNumericWidget(context._context, node, w, h, font.family, assets, cache, { state: numericState, hovered, focused, overlay: numericOverlay, resourceActive })}/>}
    {isProgressNode(node) && <Shape listening={false} sceneFunc={context => drawProgressBar(context._context, node, w, h, font.family, progressValue)}/>}
    {isStatusNode(node) && <Shape listening={false} sceneFunc={context => drawStatusIndicator(context._context, node, w, h, font.family, statusId)}/>}
    {node.type === 'minecraft:fitting-multi-line-text-widget' && !runtimePreview && <Shape listening={false} sceneFunc={context => drawScrollText(context._context, node, font.family)}/>}
    {isImageNode(node) && <Shape listening={false} sceneFunc={context => {
      const ctx = context._context;
      try { drawImageNode(ctx, node, w, h, assets[`image:${node.id}`]?.image, cache); }
      catch {
        // An individual preview failure must not strand Konva's queued layer draw.
        ctx.save(); ctx.fillStyle = '#391f23'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ff746e'; ctx.font = '7px sans-serif'; ctx.fillText('贴图绘制失败', 2, Math.min(h - 1, 10)); ctx.restore();
      }
    }}/>}
    {node.type === 'minecraft:creative-tab' && !raster && <Shape listening={false} sceneFunc={context => drawCreativeTabFallback(context._context, node.props.selected)}/>}
    {node.type === 'minecraft:checkbox' && !raster && <Shape listening={false} sceneFunc={context => drawCheckboxFallback(context._context, node.props.selected)}/>}
    {raster && <Shape listening={false} sceneFunc={context => { const ctx = context._context; ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(raster, 0, 0); ctx.restore(); }} />}
    {!isSelectionNode(node) && !isTreeViewNode(node) && !isProgressNode(node) && !isStatusNode(node) && node.type !== 'minecraft:fill' && node.type !== 'minecraft:creative-tab' && node.type !== 'minecraft:fitting-multi-line-text-widget' && <Shape listening={false} sceneFunc={context => drawPreviewText(context._context, node, w, h, font.family, panel)}/>}
    {node.type === 'minecraft:checkbox' && <Shape listening={false} sceneFunc={context => { const ctx = context._context, layout = previewCheckboxLayout(ctx, node, font.family); if (layout.overflow || layout.truncated) { ctx.save(); ctx.font = '7px sans-serif'; ctx.textBaseline = 'top'; ctx.fillStyle = chrome.diagWarn; ctx.fillText(layout.truncated ? '文字预览已截断' : '文字超出参考边界', 0, Math.max(h, 17) + 2); ctx.restore(); } }}/>}
    {textureError && <Group listening={false}>
      <Rect x={Math.max(0, w - 7 / zoom)} y={0} width={7 / zoom} height={7 / zoom} fill={chrome.diagBadText} opacity={0.9}/>
      <Text text="!" x={Math.max(0, w - 4.5 / zoom)} y={1 / zoom} fontSize={6 / zoom} fontFamily={MONO} fill={chrome.diagBadBg}/>
    </Group>}
    {hovered && !selected && <Rect width={w} height={h} stroke={chrome.accent} opacity={0.55} strokeWidth={1 / zoom} listening={false}/>}
    {selected && <Rect width={w} height={h} stroke={chrome.accent} opacity={0.35} strokeWidth={1 / zoom} listening={false}/>}
  </Group>;
});

function OtherScreen({ screen, assets, cache, resources, font, zoom, select, selectOnLeft, expanded, screenTabGroups = [], chrome }: { screen: GuiScreen; assets: Record<string, PreviewAsset>; cache: SpriteRasterCache; resources: LayeredResources; font: FontChoice; zoom: number; select: () => void; selectOnLeft: boolean; expanded: Record<string, boolean>; screenTabGroups?: import('../domain/schema').ScreenTabGroup[]; chrome: CanvasChromeTheme }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const style = screen.background.kind === 'panel' ? screen.background.style : null;
  useEffect(() => { let active = true; setImage(null); if (style && isTextureStyle(style)) void getPanelImage(style).then(value => { if (active) setImage(value); }).catch(() => {}); return () => { active = false; }; }, [style]);
  const bounds = panelBounds(screen), managed = tabManaged(screen.nodes), visible = tabVisibility(screen.nodes);
  const drawPlain = (original: GuiNode, nodeBounds = original.bounds, expanded = true) => {
    const selected = screenNavigationSelected(original, screen.id, screenTabGroups);
    const node: GuiNode = selected === null || original.type !== 'minecraft:creative-tab' ? original : { ...original, props: { ...original.props, selected } };
    const shown = managed.has(node.id) ? visible(node.id) : node.state.visible;
    const item = shown ? node : { ...node, state: { ...node.state, visible: false } } as GuiNode;
    return <NodeDrawing key={node.id} node={item} bounds={nodeBounds} expanded={expanded} onDown={() => {}} onEdit={() => {}} assets={assets} cache={cache} resourceActive={!!(resources.baseName || resources.overlayName)} focused={false} selected={false} font={font} panel={screen.background.kind === 'panel'} zoom={zoom} chrome={chrome}/>;
  };
  const draw = (node: GuiNode, supplied?: Bounds): ReactNode => {
    if (!isContainerNode(node)) return drawPlain(node, supplied ?? nodeAbsoluteBounds(node, screen.nodes, {}, expanded));
    const open = isCollapsiblePanelNode(node) ? expanded[node.id] : true;
    const absolute = supplied ?? nodeAbsoluteBounds(node, screen.nodes, {}, expanded), visibleBounds = isCollapsiblePanelNode(node) && !open ? { ...absolute, h: node.props.headerHeight } : absolute;
    const viewport = containerScreenViewport(node, screen.nodes, {}, expanded), dimensions = isScrollablePanelNode(node) ? contentSize(node) : { maxScroll: 0 };
    const thumbHeight = isScrollablePanelNode(node) && dimensions.maxScroll > 0 ? Math.max(8, viewport.h * viewport.h / node.props.contentHeight) : viewport.h;
    return <Group key={node.id}>
      {drawPlain(node, visibleBounds, open)}
      {open && <Group clipX={viewport.x} clipY={viewport.y} clipWidth={viewport.w} clipHeight={viewport.h}>
        {designSiblingOrder(screen.nodes.filter(child => child.parentContainerId === node.id), expanded).map(child => draw(child, containerChildScreenBounds(node, child, screen.nodes, {}, expanded)))}
      </Group>}
      {isScrollablePanelNode(node) && dimensions.maxScroll > 0 && <Group>
        <Rect x={viewport.x + viewport.w + 2} y={viewport.y} width={6} height={viewport.h} fill={chrome.scrollTrack}/>
        <Rect x={viewport.x + viewport.w + 2} y={viewport.y} width={6} height={thumbHeight} fill={chrome.scrollThumb} cornerRadius={3}/>
      </Group>}
    </Group>;
  };
  return <>
    <Rect width={screen.designSize.width} height={screen.designSize.height} fill={DESIGN_SURFACE} stroke={DESIGN_SURFACE_LINE} strokeWidth={1 / zoom} onPointerDown={e => { if (e.evt.button === 0 && selectOnLeft) { e.cancelBubble = true; select(); } }}/>
    <Group listening={false}>
      {screen.nodes.filter(node => !node.parentContainerId && beforePanel(node)).map(node => draw(node))}
      {screen.background.kind === 'panel' && !isTextureStyle(screen.background.style) && panelRects(bounds.w, bounds.h).map((r, i) => <Rect key={i} x={bounds.x + r.x} y={bounds.y + r.y} width={r.w} height={r.h} fill={r.color}/>)}
      {screen.background.kind === 'panel' && image && <Shape x={bounds.x} y={bounds.y} sceneFunc={context => { const ctx = context._context, raster = panelPreviewRaster(image, bounds.w, bounds.h); if (raster) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(raster, 0, 0); ctx.restore(); } else drawNativePanel(ctx, image, bounds.w, bounds.h); }}/>}
      {designSiblingOrder(screen.nodes.filter(node => !node.parentContainerId && !beforePanel(node)), expanded).map(node => draw(node))}
    </Group>
  </>;
}

function Rulers({ width, height, origin, zoom, design, chrome }: { width: number; height: number; origin: { x: number; y: number }; zoom: number; design: { width: number; height: number }; chrome: CanvasChromeTheme }) {
  const top = 20, left = 20;
  const ruler = { bg: chrome.rulerBg, line: chrome.rulerLine, text: chrome.rulerText, tick: chrome.rulerTick };
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
    <Text x={5} y={6} text="px" fontSize={8} fontFamily={MONO} fill={ruler.text}/>
    {xTicks.map((value, index) => {
      const x = origin.x + value * zoom;
      if (x < left || x > width - 1) return null;
      const major = Math.abs(value / step - Math.round(value / step)) < 0.0001;
      return <Rect key={`xt-${index}`} x={x} y={major ? top - 7 : top - 4} width={1} height={major ? 7 : 4} fill={major ? ruler.tick : ruler.line}/>;
    })}
    {xLabels.map(value => {
      const x = origin.x + value * zoom;
      if (x < left - 1 || x > width - 1) return null;
      return <Text key={`xl-${value}`} x={x + 3} y={3} text={String(value)} fontSize={9} fontFamily={MONO} fill={ruler.text}/>;
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
      return <Text key={`yl-${value}`} x={3} y={y - 3} text={String(value)} fontSize={9} fontFamily={MONO} fill={ruler.text} rotation={-90} offsetX={-4}/>;
    })}
    {origin.x >= left && origin.x < width && origin.y >= top && origin.y < height && <>
      <Rect x={origin.x - 4} y={origin.y} width={9} height={1} fill={chrome.accent} opacity={0.7}/>
      <Rect x={origin.x} y={origin.y - 4} width={1} height={9} fill={chrome.accent} opacity={0.7}/>
    </>}
  </Layer>;
}

export function Canvas({ onAddNode, onEditError, containerScroll, setContainerScroll, numericPreviewEpoch, statusValues, screenPositions, setScreenPositions, onSelectScreen, view, setView, preview = null, readOnly = false, behaviorPreview = null, behaviorMode = false, interaction, onBehaviorTrigger, onBehaviorSliderChange, onBehaviorSelectionChange, editTabs = {}, grid, alignment, resources, resourceGeneration, font, theme }: Props) {
  const runtimePreviewActive = interaction || behaviorPreview !== null;
  const chrome = canvasChrome(theme);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 540 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelImage, setPanelImage] = useState<{ style: string; image: HTMLImageElement } | null>(null);
  const [panelError, setPanelError] = useState('');
  const [assets, setAssets] = useState<Record<string, PreviewAsset>>({});
  const [spriteAssetsBusy, setSpriteAssetsBusy] = useState(false);
  const [imageAssetsBusy, setImageAssetsBusy] = useState(false);
  const [interactionValues, setInteractionValues] = useState<Record<string, boolean | string>>({});
  const [runtimeExpandedPanels, setRuntimeExpandedPanels] = useState<Record<string, boolean>>({});
  const [designExpandedByScreen, setDesignExpandedByScreen] = useState<Record<string, Record<string, boolean>>>({});
  const [interactionFocus, setInteractionFocus] = useState<string | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides>({});
  const [spacingMark, setSpacingMark] = useState<SpacingMark | null>(null);
  const currentScreenId = useStore(editorStore, s => s.currentScreenId);
  useEffect(() => { setInteractionValues({}); setInteractionFocus(null); setContainerScroll({}); if (interaction || behaviorPreview || behaviorMode) setEditingId(null); }, [interaction, behaviorPreview, behaviorMode, currentScreenId, numericPreviewEpoch]);
  const screen = useStore(editorStore, s => currentScreen(s));
  const initialExpanded = Object.fromEntries(screen.nodes.filter(isCollapsiblePanelNode).map(node => [node.id, node.props.initialExpanded]));
  const designExpanded = designPanelExpansion(screen.nodes, designExpandedByScreen[screen.id]);
  const runtimePanelMode = runtimePreviewActive || behaviorMode;
  const expandedPanels = runtimePanelMode ? { ...initialExpanded, ...runtimeExpandedPanels }
    : preview ? initialExpanded : designExpanded;
  const setExpandedPanels = (update: Record<string, boolean> | ((previous: Record<string, boolean>) => Record<string, boolean>)) => {
    if (runtimePanelMode) {
      setRuntimeExpandedPanels(previous => typeof update === 'function' ? update({ ...initialExpanded, ...previous }) : update);
      return;
    }
    if (preview || readOnly || behaviorMode) return;
    setDesignExpandedByScreen(previous => {
      const current = designPanelExpansion(screen.nodes, previous[screen.id]);
      const next = typeof update === 'function' ? update(current) : update;
      return { ...previous, [screen.id]: next };
    });
  };
  const togglePanel = (id: string) => {
    const panel = screen.nodes.find(node => node.id === id); if (!panel || !isCollapsiblePanelNode(panel)) return;
    const next = !(expandedPanels[id] ?? panel.props.initialExpanded);
    if (!runtimePreviewActive && !preview && !readOnly && !behaviorMode) editorStore.getState().select(id);
    if (!next) {
      const descendantIds = new Set(allDescendants(id, screen.nodes).map(node => node.id));
      if (interactionFocus && descendantIds.has(interactionFocus)) setInteractionFocus(null);
      for (const wrapper of host.current?.querySelectorAll<HTMLElement>('[data-numeric-node-id]') ?? []) {
        if (descendantIds.has(wrapper.dataset.numericNodeId ?? '')) wrapper.querySelector('input')?.blur();
      }
    }
    setExpandedPanels(value => ({ ...value, [id]: next }));
  };
  useEffect(() => { setRuntimeExpandedPanels(initialExpanded); }, [screen.id, numericPreviewEpoch, interaction, behaviorMode]);
  useEffect(() => { setContainerScroll({}); pointer.current = null; }, [currentScreenId, screen.designSize.width, screen.designSize.height]);
  useEffect(() => {
    setContainerScroll(previous => {
      const next: Record<string, number> = {};
      for (const node of screen.nodes) if (isScrollablePanelNode(node) && previous[node.id] !== undefined) {
        const offset = containerScrollOffset(node, previous[node.id]);
        if (offset !== 0) next[node.id] = offset;
      }
      const keys = Object.keys(previous), nextKeys = Object.keys(next);
      return keys.length === nextKeys.length && keys.every(key => previous[key] === next[key]) ? previous : next;
    });
  }, [screen, setContainerScroll]);
  useEffect(() => {
    for (const slider of host.current?.querySelectorAll<HTMLElement>('.numeric-live-slider[data-pointer-id]') ?? []) {
      const pointerId = Number(slider.dataset.pointerId);
      if (Number.isInteger(pointerId)) slider.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId }));
    }
  }, [size.width, size.height, screen.designSize.width, screen.designSize.height, screen]);
  const [numericRuntime, setNumericRuntime] = useState<Record<string, NumericState>>({});
  useEffect(() => { setNumericRuntime({}); }, [numericPreviewEpoch, screen.id, interaction, behaviorMode]);
  useEffect(() => {
    for (const node of screen.nodes) if (isNumericNode(node) && node.parentContainerId && numericRuntime[node.id]?.focused && !nodeVisibleBounds(node, screen.nodes, containerScroll, expandedPanels)) {
      const wrapper = [...(host.current?.querySelectorAll<HTMLElement>('[data-numeric-node-id]') ?? [])].find(item => item.dataset.numericNodeId === node.id);
      wrapper?.querySelector('input')?.blur();
    }
  }, [containerScroll, numericRuntime, screen]);
  const screens = useStore(editorStore, s => s.doc.screens);
  const screenTabGroupsState = useStore(editorStore, s => s.doc.screenTabGroups);
  const screenTabGroups = screenTabGroupsState ?? NO_SCREEN_TAB_GROUPS;
  const hasCreativeTab = screens.some(item => item.nodes.some(node => node.type === 'minecraft:creative-tab'));
  const hasCheckbox = screens.some(item => item.nodes.some(node => node.type === 'minecraft:checkbox'));
  const hasSlider = screens.some(item => item.nodes.some(node => node.type === 'minecraft:slider'));
  const imageNodes = screens.flatMap(item => item.nodes.filter(isImageNode));
  const imageRequestKey = imageNodes.map(node => `${node.id}:${node.props.kind}:${node.props.kind === 'texture' ? node.props.resourceId : node.props.spriteId}`).sort().join('|');
  const cache = useRef(new SpriteRasterCache()).current;
  useEffect(() => {
    let active = true; cache.clear();
    setAssets(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id.startsWith('image:'))));
    const spriteIds = resources.baseName ? [...GUI_SPRITES, ...(hasSlider ? SLIDER_SPRITES : []), ...(hasCheckbox ? CHECKBOX_SPRITES : []), ...(hasCreativeTab ? CREATIVE_TAB_SPRITES : [])] : [];
    setSpriteAssetsBusy(spriteIds.length > 0);
    const standardSprites = spriteIds.map(async id => {
      const result = await resources.sprite(id);
      if (result.status !== 'valid') return [id, { error: `${result.status}：${result.diagnostic}` }] as const;
      try {
        const raster = await decodePreviewRaster(result.data, result.width, result.height);
        if (!active) return [id, {}] as const;
        return [id, { sprite: { image: raster, scaling: result.scaling } }] as const;
      } catch (error) { return [id, { error: `invalid：PNG 解码失败：${(error as Error).message}` }] as const; }
    });
    void Promise.all(standardSprites).then(results => {
      if (active) setAssets(previous => ({ ...Object.fromEntries(Object.entries(previous).filter(([id]) => id.startsWith('image:'))), ...Object.fromEntries(results) }));
    }).catch(error => {
      if (active) setAssets(previous => ({ ...Object.fromEntries(Object.entries(previous).filter(([id]) => id.startsWith('image:'))), ...Object.fromEntries(spriteIds.map(id => [id, { error: `资源读取失败：${(error as Error).message}` }])) }));
    }).finally(() => { if (active) setSpriteAssetsBusy(false); });
    return () => { active = false; cache.clear(); };
  }, [resources, resourceGeneration, cache, hasCheckbox, hasCreativeTab, hasSlider]);
  useEffect(() => {
    let active = true;
    const imageAssetsWithoutLayer = imageNodes.map(node => [`image:${node.id}`, { error: 'missing：请在资源检查中选择客户端 JAR 或包含贴图的覆盖资源包' }] as const);
    setAssets(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !id.startsWith('image:'))));
    if (!resources.baseName && !resources.overlayName) {
      setAssets(previous => ({ ...previous, ...Object.fromEntries(imageAssetsWithoutLayer) })); setImageAssetsBusy(false);
      return () => { active = false; };
    }
    setImageAssetsBusy(imageNodes.length > 0);
    const imageRequests = new Map<string, { kind: 'texture' | 'sprite'; id: string; nodes: string[] }>();
    for (const node of imageNodes) { const kind = node.props.kind, id = kind === 'texture' ? node.props.resourceId : node.props.spriteId, key = `${kind}:${id}`;
      const entry = imageRequests.get(key) ?? { kind, id, nodes: [] }; entry.nodes.push(node.id); imageRequests.set(key, entry); }
    const imageLoads = [...imageRequests.values()].flatMap(request => (async () => {
      const result = request.kind === 'texture' ? await resources.texture(request.id) : await resources.sprite(request.id);
      if (result.status !== 'valid') return request.nodes.map(nodeId => [`image:${nodeId}`, { error: `${result.status}：${result.diagnostic}` }] as const);
      try {
        const raster = await decodePreviewRaster(result.data, result.width, result.height);
        if (!active) return request.nodes.map(nodeId => [`image:${nodeId}`, {}] as const);
        const image = request.kind === 'texture' ? { kind: 'texture' as const, image: raster, width: result.width, height: result.height } : { kind: 'sprite' as const, sprite: { image: raster, scaling: 'scaling' in result ? result.scaling : { type: 'stretch' as const } } };
        return request.nodes.map(nodeId => [`image:${nodeId}`, { image }] as const);
      } catch (error) { return request.nodes.map(nodeId => [`image:${nodeId}`, { error: `invalid：PNG 解码失败：${(error as Error).message}` }] as const); }
    })());
    void Promise.all(imageLoads).then(imageResults => { if (active) setAssets(previous => ({ ...previous, ...Object.fromEntries(imageResults.flat()) })); })
      .catch(error => { if (active) setAssets(previous => ({ ...previous, ...Object.fromEntries(imageNodes.map(node => [`image:${node.id}`, { error: `资源读取失败：${(error as Error).message}` }])) })); })
      .finally(() => { if (active) setImageAssetsBusy(false); });
    return () => { active = false; };
  }, [resources, resourceGeneration, imageRequestKey]);
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
  const pointer = useRef<null | { pointerId: number; x: number; y: number; zoom: number; mode: 'move' | 'resize' | 'pan' | 'scrollbar'; resizeEdge?: ResizeEdge; bounds?: Bounds; panX: number; panY: number; screenId?: string; designSize?: { width: number; height: number }; containerId?: string; container?: ScrollablePanelNode; maxScroll?: number; trackTravel?: number; initialOffset?: number; peers?: { id: string; bounds: Bounds }[]; min?: { w: number; h: number }; spacingCandidates?: SpacingCandidate[]; xKey?: string; yKey?: string; spacingKey?: string }>(null);
  const editError = useRef(onEditError); editError.current = onEditError;
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
    : runtimePreviewActive ? { x: Math.floor((size.width - screen.designSize.width * view.zoom) / 2), y: Math.floor((size.height - screen.designSize.height * view.zoom) / 2) }
    : { x: Math.floor((size.width - basis.width * view.zoom) / 2) + view.panX + basis.dx * view.zoom,
      y: Math.floor((size.height - basis.height * view.zoom) / 2) + view.panY + basis.dy * view.zoom };
  const current = useRef({ view, setView, size, screen, editingId, preview, readOnly, interaction, runtimePreviewActive, basis, alignment, origin, containerScroll, expandedPanels }); current.current = { view, setView, size, screen, editingId, preview, readOnly, interaction, runtimePreviewActive, basis, alignment, origin, containerScroll, expandedPanels };
  const header = (item: GuiScreen) => <Group y={-22 / renderZoom} draggable={!preview && !readOnly && !behaviorMode && !interaction && !gesture && view.tool !== 'pan'}
    onPointerDown={e => { if (e.evt.button === 0 && view.tool !== 'pan') e.cancelBubble = true; }}
    onDragEnd={e => { e.cancelBubble = true; const dx = e.target.x(), dy = e.target.y() + 22 / renderZoom; e.target.position({ x: 0, y: -22 / renderZoom }); if (Math.abs(dx) + Math.abs(dy) > 0.5) setScreenPositions(previous => ({ ...previous, [item.id]: { x: positions[item.id].x + dx, y: positions[item.id].y + dy } })); }}
    onClick={e => { if (e.evt.button === 0 && view.tool !== 'pan') { e.cancelBubble = true; if (item.id !== screen.id) onSelectScreen(item.id); } }}>
    <Rect width={Math.max(100, item.designSize.width)} height={20 / renderZoom} fill={item.id === screen.id ? chrome.tabActive : chrome.tabIdle} cornerRadius={2 / renderZoom}/>
    <Text x={5 / renderZoom} y={4 / renderZoom} text={`${displayText(item.title)} · ${item.id}`} fill={chrome.tabText} fontSize={11 / renderZoom} listening={false}/>
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
      if (p.mode === 'scrollbar' && p.containerId && p.container) setContainerScroll(values => ({ ...values, [p.containerId!]: containerScrollOffset(p.container!, (p.initialOffset ?? 0) + dy / p.zoom * (p.maxScroll ?? 0) / Math.max(1, p.trackTravel ?? 1)) }));
      else if (p.mode === 'pan') current.current.setView({ ...current.current.view, panX: p.panX + dx, panY: p.panY + dy });
      else if (p.bounds) {
        const state = editorStore.getState();
        if (state.currentScreenId !== p.screenId) { cancel(); return; }
        const design = p.designSize ?? currentScreen(state).designSize;
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
      const p = pointer.current; if (p?.pointerId !== e.pointerId) return;
      move(e);
      const c = current.current, state = editorStore.getState(), dragged = state.gesture && c.screen.nodes.find(node => node.id === state.gesture!.id);
      let target: ContainerDrop | undefined;
      if (p.mode === 'move' && dragged && !dragged.parentContainerId && !isContainerNode(dragged) && host.current) {
        const rect = host.current.getBoundingClientRect();
        const parent = containerAtPoint(c.screen.nodes, (e.clientX - rect.left - c.origin.x) / c.view.zoom, (e.clientY - rect.top - c.origin.y) / c.view.zoom, c.containerScroll, c.expandedPanels);
        if (parent) target = { parentContainerId: parent.id, scrollOffsets: c.containerScroll,
          appendAtEnd: isCollapsiblePanelNode(parent) && !(c.expandedPanels[parent.id] ?? parent.props.initialExpanded) };
      }
      pointer.current = null; setAlignmentGuides({}); setSpacingMark(null);
      try { editorStore.getState().commitGesture(target); } catch (error) { editError.current((error as Error).message); }
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
      if (!node || !('enabled' in node.state) || !node.state.enabled || !node.state.visible || !containerAncestorsEnabled(node, screen.nodes)) return;
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
    const parent = node.parentContainerId ? currentScreen(state).nodes.find(item => item.id === node.parentContainerId) : undefined;
    const localSize = parent && isContainerNode(parent) ? { width: containerLocalViewport(parent, true).w, height: isScrollablePanelNode(parent) ? parent.props.contentHeight : parent.bounds.h - parent.props.headerHeight } : currentScreen(state).designSize;
    const peers = currentScreen(state).nodes.filter(item => item.id !== id && item.parentContainerId === node.parentContainerId && item.state.visible && visibleInGroup(item.id)
      && !!nodeVisibleBounds(item, currentScreen(state).nodes, containerScroll, expandedPanels)).map(item => ({ id: item.id,
        bounds: isCollapsiblePanelNode(item) && !expandedPanels[item.id] ? { ...item.bounds, h: item.props.headerHeight } : item.bounds }));
    pointer.current = { pointerId, x, y, mode, resizeEdge, bounds: { ...bounds }, zoom: view.zoom, panX: view.panX, panY: view.panY, screenId: state.currentScreenId, designSize: localSize, peers,
      min: isSelectionNode(node) ? selectionMinimum(node) : CATALOG[node.type].min, spacingCandidates: mode === 'move' ? equalSpacingCandidates(bounds, peers, localSize) : undefined };
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
      // Let the runtime Tree View's own overflow viewport consume native wheel scrolling
      // before the host-level Canvas listener can preventDefault or zoom the editor.
      if (e.target instanceof Element && e.target.closest('[data-tree-view-scroll]')) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const c = current.current;
      if (e.target instanceof Element && e.target.closest('input,textarea,select')) {
        if (!c.runtimePreviewActive) return;
        const inputRect = element.getBoundingClientRect(), localX = (e.clientX - inputRect.left - c.origin.x) / c.view.zoom, localY = (e.clientY - inputRect.top - c.origin.y) / c.view.zoom;
        if (!c.screen.nodes.some(node => isScrollablePanelNode(node) && localX >= node.bounds.x && localY >= node.bounds.y && localX < node.bounds.x + node.bounds.w && localY < node.bounds.y + node.bounds.h)) return;
      }
      // The canvas owns an unmodified wheel gesture; forms and browser zoom keep their normal behavior.
      e.preventDefault(); e.stopPropagation();
      if (pointer.current || editorStore.getState().gesture || c.editingId || c.preview) return;
      const rect = element.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const old = c.view;
      if (c.runtimePreviewActive) {
        const ox = c.origin.x, oy = c.origin.y;
        const x = (px - ox) / old.zoom, y = (py - oy) / old.zoom;
        const node = [...c.screen.nodes].reverse().find(n => { const b = n.parentContainerId ? nodeVisibleBounds(n, c.screen.nodes, c.containerScroll) : n.bounds; return !!b && x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h; });
        if (node?.type === 'minecraft:cycle-button' && node.state.enabled && node.state.visible && e.deltaY !== 0) {
          setInteractionValues(values => { const oldValue = typeof values[node.id] === 'string' ? values[node.id] : node.props.initialOptionId;
            const index = node.props.options.findIndex(option => option.id === oldValue), delta = e.deltaY < 0 ? -1 : 1;
            return { ...values, [node.id]: node.props.options[(Math.max(0, index) + delta + node.props.options.length) % node.props.options.length].id }; });
          setInteractionFocus(node.id);
        }
        const container = [...c.screen.nodes].reverse().find((n): n is ScrollablePanelNode => {
          if (!isScrollablePanelNode(n) || !n.state.visible || !n.state.enabled) return false;
          const visible = nodeVisibleBounds(n, c.screen.nodes, c.containerScroll, c.expandedPanels), viewport = containerScreenViewport(n, c.screen.nodes, c.containerScroll, c.expandedPanels);
          return !!visible && x >= visible.x && y >= visible.y && x < visible.x + visible.w && y < visible.y + visible.h && x >= viewport.x && y >= viewport.y && x < viewport.x + viewport.w && y < viewport.y + viewport.h;
        });
        if (container) { setContainerScroll(values => ({ ...values, [container.id]: containerScrollOffset(container, (values[container.id] ?? 0) + (e.deltaY < 0 ? -24 : 24)) })); return; }
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
    if (preview || readOnly || interaction || behaviorMode || behaviorPreview) return;
    const type = e.dataTransfer.getData('application/x-minecraft-gui-component') as NodeType;
    if (!NODE_TYPES.includes(type)) return;
    const rect = host.current!.getBoundingClientRect();
    const position = { x: Math.round((e.clientX - rect.left - origin.x) / view.zoom), y: Math.round((e.clientY - rect.top - origin.y) / view.zoom) };
  const parent = containerAtPoint(screen.nodes, position.x, position.y, containerScroll, expandedPanels);
  onAddNode(type, position, parent ? { parentContainerId: parent.id, scrollOffsets: containerScroll,
    appendAtEnd: isCollapsiblePanelNode(parent) && !(expandedPanels[parent.id] ?? parent.props.initialExpanded) } : undefined);
  };
  const selectedParent = selectedNode?.parentContainerId ? screen.nodes.find(node => node.id === selectedNode.parentContainerId) : undefined;
  const selectedContainer = selectedParent && isContainerNode(selectedParent) ? selectedParent : undefined;
  const expandedGeometry = expandedPanels;
  const selectedBoundsRaw = selectedNode ? nodeAbsoluteBounds(selectedNode, screen.nodes, preview ? {} : containerScroll, expandedGeometry) : undefined;
  const selectedBounds = selectedBoundsRaw && selectedNode && isCollapsiblePanelNode(selectedNode) && !(expandedGeometry[selectedNode.id] ?? selectedNode.props.initialExpanded)
    ? { ...selectedBoundsRaw, h: selectedNode.props.headerHeight } : selectedBoundsRaw;
  const gestureBounds = gesture?.id === selected ? selectedNode?.parentContainerId ? (() => { const changed = { ...selectedNode, bounds: gesture.draft }; return selectedParent && isContainerNode(selectedParent) ? containerChildScreenBounds(selectedParent, changed, screen.nodes, preview ? {} : containerScroll, expandedGeometry) : gesture.draft; })() : gesture.draft : selectedBounds;
  const b = gestureBounds && selectedNode && isCollapsiblePanelNode(selectedNode) && !(expandedGeometry[selectedNode.id] ?? selectedNode.props.initialExpanded)
    ? { ...gestureBounds, h: selectedNode.props.headerHeight } : gestureBounds;
  const parentViewport = selectedContainer ? containerScreenViewport(selectedContainer, screen.nodes, preview ? {} : containerScroll, expandedGeometry) : undefined;
  const selectedViewport = parentViewport && selectedContainer ? (() => {
    let clip = parentViewport, parentId = selectedContainer.parentContainerId;
    while (parentId) {
      const ancestor = screen.nodes.find(node => node.id === parentId);
      if (!ancestor || !isContainerNode(ancestor)) break;
      clip = intersectBounds(clip, containerScreenViewport(ancestor, screen.nodes, containerScroll, expandedGeometry)) ?? { ...clip, w: 0, h: 0 };
      parentId = ancestor.parentContainerId;
    }
    return clip;
  })() : undefined;
  const parentScroll = selectedContainer && isScrollablePanelNode(selectedContainer) && !preview ? containerScrollOffset(selectedContainer, containerScroll[selectedContainer.id] ?? 0) : 0;
  const guideOrigin = parentViewport ? { x: origin.x + parentViewport.x * renderZoom, y: origin.y + (parentViewport.y - parentScroll) * renderZoom } : origin;
  const guideClip = selectedViewport ? { x: origin.x + selectedViewport.x * renderZoom, y: origin.y + selectedViewport.y * renderZoom, w: selectedViewport.w * renderZoom, h: selectedViewport.h * renderZoom }
    : { x: origin.x, y: origin.y, w: screen.designSize.width * renderZoom, h: screen.designSize.height * renderZoom };
  // Editing selection is session-only; behavior testing always starts from the document initial state.
  const validEditGroups = new Set(screen.nodes.filter(n => n.type === 'minecraft:creative-tab' && n.props.groupId && editTabs[n.props.groupId] === n.id).map(n => n.type === 'minecraft:creative-tab' ? n.props.groupId! : ''));
  const editSelection = Object.fromEntries(screen.nodes.filter(n => n.type === 'minecraft:creative-tab' && n.props.groupId && validEditGroups.has(n.props.groupId)).map(n => [n.id, { tabSelected: n.type === 'minecraft:creative-tab' && editTabs[n.props.groupId!] === n.id }]));
  const visualSelection = behaviorPreview ?? (preview ? null : editSelection);
  const visibleInGroup = tabVisibility(screen.nodes, visualSelection), managed = tabManaged(screen.nodes);
  const runtimeNodeVisible = (node: GuiNode) => (behaviorPreview?.[node.id]?.visible ?? (managed.has(node.id) ? true : node.state.visible)) && visibleInGroup(node.id);
  const runtimeAncestorsVisible = (node: GuiNode) => {
    let parentId = node.parentContainerId; const visited = new Set<string>();
    while (parentId) {
      if (visited.has(parentId)) return false;
      visited.add(parentId);
      const parent = screen.nodes.find(candidate => candidate.id === parentId);
      if (!parent || !isContainerNode(parent) || !runtimeNodeVisible(parent) || (isCollapsiblePanelNode(parent) && !(expandedPanels[parent.id] ?? parent.props.initialExpanded))) return false;
      parentId = parent.parentContainerId;
    }
    return true;
  };
  useEffect(() => {
    const capture = pointer.current;
    if (capture?.mode !== 'scrollbar' || !capture.containerId) return;
    const container = screen.nodes.find(node => node.id === capture.containerId);
    if (!container || !isScrollablePanelNode(container) || container !== capture.container || !runtimeNodeVisible(container) || !runtimeAncestorsVisible(container) || !container.state.enabled) pointer.current = null;
  }, [screen, behaviorPreview, interaction, containerScroll, expandedPanels]);
  const renderNodes = screen.nodes.map(node => {
    if (node.type !== 'minecraft:creative-tab') return node;
    const navigationSelected = screenNavigationSelected(node, screen.id, screenTabGroups);
    if (navigationSelected !== null) return { ...node, props: { ...node.props, selected: navigationSelected } };
    return visualSelection?.[node.id]?.tabSelected !== undefined ? { ...node, props: { ...node.props, selected: visualSelection[node.id].tabSelected! } } : node;
  });
  useEffect(() => {
    if (!interactionFocus) return;
    const focused = renderNodes.find(node => node.id === interactionFocus);
    if (!focused || !runtimeNodeVisible(focused) || !runtimeAncestorsVisible(focused) || ('enabled' in focused.state && !focused.state.enabled) || !containerAncestorsEnabled(focused, renderNodes) || (focused.parentContainerId && !nodeVisibleBounds(focused, renderNodes, runtimePreviewActive ? containerScroll : {}, expandedPanels))) setInteractionFocus(null);
  }, [interactionFocus, behaviorPreview, containerScroll, expandedPanels, currentScreenId, screen]);
  const drawingNodes = gesture ? renderNodes.map(node => node.id === gesture.id ? { ...node, bounds: gesture.draft } : node) : renderNodes;
  const designPaintNodes: GuiNode[] = [];
  const collectDesignPaint = (parentId?: string) => {
    for (const node of designSiblingOrder(drawingNodes.filter(item => item.parentContainerId === parentId), expandedGeometry)) {
      designPaintNodes.push(node);
      if (isContainerNode(node) && (!isCollapsiblePanelNode(node) || expandedGeometry[node.id])) collectDesignPaint(node.id);
    }
  };
  if (!runtimePanelMode && !preview) collectDesignPaint();
  const designVisualBounds = (node: GuiNode) => {
    const visible = nodeVisibleBounds(node, drawingNodes, containerScroll, expandedGeometry);
    if (!visible || !isCollapsiblePanelNode(node) || expandedGeometry[node.id]) return visible;
    return intersectBounds(visible, { ...nodeAbsoluteBounds(node, drawingNodes, containerScroll, expandedGeometry), h: node.props.headerHeight });
  };
  const projectRuntimeNode = (node: GuiNode): GuiNode => {
    if (!node.parentContainerId) return node;
    const panel = renderNodes.find(candidate => candidate.id === node.parentContainerId);
    return panel && isContainerNode(panel) ? { ...node, bounds: containerChildScreenBounds(panel, node, renderNodes, runtimePreviewActive ? containerScroll : {}, expandedPanels) } as GuiNode : node;
  };
  const overlayNodes = (nodes: GuiNode[]) => nodes.filter(node => (!node.parentContainerId || !!nodeVisibleBounds(node, renderNodes, runtimePreviewActive ? containerScroll : {}, expandedPanels)) && (!runtimePreviewActive || (containerAncestorsEnabled(node, renderNodes) && runtimeAncestorsVisible(node)))).map(node => projectRuntimeNode(node));
  const overlayClips = (nodes: GuiNode[]) => Object.fromEntries(nodes.flatMap(node => {
    if (!node.parentContainerId) return [];
    const visible = nodeVisibleBounds(node, renderNodes, runtimePreviewActive ? containerScroll : {}, expandedPanels);
    if (!visible) return [];
    const b = projectRuntimeNode(node).bounds;
    return [[node.id, { top: Math.max(0, (visible.y - b.y) * renderZoom), right: Math.max(0, (b.x + b.w - visible.x - visible.w) * renderZoom), bottom: Math.max(0, (b.y + b.h - visible.y - visible.h) * renderZoom), left: Math.max(0, (visible.x - b.x) * renderZoom) }]];
  }));
  const selectionRuntimeNodes = overlayNodes(renderNodes.filter(isSelectionNode).filter(node => (behaviorPreview?.[node.id]?.visible ?? (managed.has(node.id) ? true : node.state.visible)) && visibleInGroup(node.id)));
  const treeRuntimeNodes = overlayNodes(renderNodes.filter(isTreeViewNode).filter(node => (behaviorPreview?.[node.id]?.visible ?? (managed.has(node.id) ? true : node.state.visible)) && visibleInGroup(node.id))) as Extract<GuiNode, { type: 'minecraft:tree-view' }>[];
  const numericRuntimeNodes = overlayNodes(renderNodes.filter(isNumericNode).filter(node => (behaviorPreview?.[node.id]?.visible ?? (managed.has(node.id) ? true : node.state.visible)) && visibleInGroup(node.id))) as NumericNode[];
  const treeOverlayNodes = renderNodes.filter(isTreeViewNode).map(node => projectRuntimeNode(node)) as Extract<GuiNode, { type: 'minecraft:tree-view' }>[];
  const numericOverlayNodes = renderNodes.filter(isNumericNode).map(node => projectRuntimeNode(node)) as NumericNode[];
  const selectionClipInsets = overlayClips(selectionRuntimeNodes), numericClipInsets = overlayClips(numericRuntimeNodes), treeClipInsets = overlayClips(treeRuntimeNodes);
  const editingNode = editingId === selected ? screen.nodes.find(n => n.id === editingId) : undefined;
  const drawPlainNode = (original: GuiNode, bounds = original.bounds) => { const override = behaviorPreview?.[original.id];
          if (behaviorPreview && (!(override?.visible ?? (managed.has(original.id) ? true : original.state.visible)) || !visibleInGroup(original.id))) return null;
          let node: GuiNode = managed.has(original.id) ? { ...original, state: { ...original.state, visible: override?.visible ?? true } } as GuiNode : override?.visible === undefined ? original : { ...original, state: { ...original.state, visible: override.visible } } as GuiNode;
          if (!behaviorPreview && !visibleInGroup(node.id)) node = { ...node, state: { ...node.state, visible: false } } as GuiNode;
          if (behaviorPreview && node.type === 'minecraft:string-widget' && override?.text !== undefined) node = { ...node, props: { ...node.props, text: { kind: 'literal', value: override.text } } };
          if (behaviorPreview && node.type === 'minecraft:checkbox' && override?.checked !== undefined) node = { ...node, props: { ...node.props, selected: override.checked } };
          if (behaviorPreview && node.type === 'minecraft:progress-bar' && override?.progressValue !== undefined) node = { ...node, props: { ...node.props, initialValue: override.progressValue } };
          const value = interactionValues[node.id];
          const checkedValue = behaviorPreview?.[node.id]?.checked ?? (typeof value === 'boolean' ? value : undefined);
          const shown = interaction && node.type === 'minecraft:checkbox' && checkedValue !== undefined ? { ...node, props: { ...node.props, selected: checkedValue } }
            : interaction && node.type === 'minecraft:cycle-button' && typeof value === 'string' && node.props.options.some(o => o.id === value) ? { ...node, props: { ...node.props, initialOptionId: value } } : node;
          const gestureBounds = gesture?.id === node.id && !isContainerNode(node) ? node.parentContainerId ? (() => { const parent = screen.nodes.find(item => item.id === node.parentContainerId); return parent && isContainerNode(parent) ? containerChildScreenBounds(parent, { ...node, bounds: gesture.draft }, screen.nodes, preview ? {} : containerScroll, expandedGeometry) : gesture.draft; })() : gesture.draft : bounds;
          return <NodeDrawing key={node.id} node={shown} numericState={numericRuntime[node.id]} numericOverlay={runtimePreviewActive} runtimePreview={runtimePreviewActive} statusId={isStatusNode(node) ? behaviorPreview?.[node.id]?.statusId ?? statusValues[node.id] : undefined} progressValue={behaviorPreview?.[node.id]?.progressValue} expanded={node.type === 'minecraft:collapsible-panel' ? (expandedGeometry[node.id] ?? node.props.initialExpanded) : true} bounds={gestureBounds} onDown={stableDown} onEdit={interaction ? () => {} : stableEdit} assets={assets} cache={cache} resourceActive={!!(resources.baseName || resources.overlayName)} focused={interaction ? interactionFocus === node.id : editingId === node.id} selected={node.id === selected} font={font} panel={screen.background.kind === 'panel'} zoom={renderZoom} chrome={chrome}/>; };
  const drawNode = (original: GuiNode, suppliedBounds?: Bounds): ReactNode => {
    original = drawingNodes.find(node => node.id === original.id) ?? original;
    const geometryNodes = drawingNodes;
    if (!isContainerNode(original)) return drawPlainNode(original, suppliedBounds ?? (original.parentContainerId ? nodeAbsoluteBounds(original, renderNodes, runtimePreviewActive ? containerScroll : {}, expandedGeometry) : original.bounds));
    const visible = behaviorPreview ? (behaviorPreview[original.id]?.visible ?? (managed.has(original.id) ? true : original.state.visible)) && visibleInGroup(original.id) : original.state.visible && visibleInGroup(original.id);
    if (runtimePreviewActive && !visible) return null;
    const expanded = isCollapsiblePanelNode(original) ? (expandedGeometry[original.id] ?? original.props.initialExpanded) : true;
    const abs = suppliedBounds ?? (original.parentContainerId ? nodeAbsoluteBounds(original, geometryNodes, preview ? {} : containerScroll, expandedGeometry) : original.bounds);
    const displayBounds = isCollapsiblePanelNode(original) && !expanded ? { ...abs, h: original.props.headerHeight } : abs;
    const viewport = containerScreenViewport(original, geometryNodes, preview ? {} : containerScroll, expandedGeometry);
    const dims = isScrollablePanelNode(original) ? contentSize(original) : { maxScroll: 0 };
    const offset = isScrollablePanelNode(original) ? (runtimePreviewActive || !preview ? containerScrollOffset(original, containerScroll[original.id] ?? 0) : 0) : 0;
    const thumbHeight = isScrollablePanelNode(original) && dims.maxScroll > 0 ? Math.max(8, viewport.h * viewport.h / original.props.contentHeight) : viewport.h;
    const thumbY = viewport.y + (dims.maxScroll ? (viewport.h - thumbHeight) * offset / dims.maxScroll : 0);
    const siblings = geometryNodes.filter(node => node.parentContainerId === original.id);
    const children = expanded ? (!runtimePanelMode && !preview ? designSiblingOrder(siblings, expandedGeometry) : siblings) : [];
    return <Group key={original.id}>
      {drawPlainNode(original, displayBounds)}
      {children.length > 0 && viewport.w > 0 && viewport.h > 0 && <Group clipX={viewport.x} clipY={viewport.y} clipWidth={viewport.w} clipHeight={viewport.h}>
        {children.map(child => drawNode(child, containerChildScreenBounds(original, child, geometryNodes, preview ? {} : containerScroll, expandedGeometry)))}
      </Group>}
      {isScrollablePanelNode(original) && dims.maxScroll > 0 && <Group listening={runtimePreviewActive || (!preview && !readOnly && !behaviorMode && view.tool === 'select')}>
        <Rect x={viewport.x + viewport.w + 2} y={viewport.y} width={6} height={viewport.h} fill={chrome.scrollTrack}/>
        <Rect x={viewport.x + viewport.w + 2} y={thumbY} width={6} height={thumbHeight} fill={chrome.scrollThumb} cornerRadius={3} onPointerDown={e => {
          if ((!runtimePreviewActive && (preview || readOnly || behaviorMode || view.tool !== 'select' || !!gesture)) || e.evt.button !== 0) return;
          e.cancelBubble = true; e.evt.preventDefault(); const { clientX, clientY, pointerId } = e.evt;
          pointer.current = { pointerId, x: clientX, y: clientY, mode: 'scrollbar', zoom: renderZoom, panX: view.panX, panY: view.panY, containerId: original.id, container: original, maxScroll: dims.maxScroll, trackTravel: Math.max(1, viewport.h - thumbHeight), initialOffset: offset };
        }}/>
      </Group>}
    </Group>;
  };
  // Split the editing aid around the Panel pass. Outside its bounds the grid
  // remains below back-layer tabs; inside it the grid paints over the background
  // and below normal widgets. The disjoint clips avoid double-painted lines.
  const editingGrid = (insidePanel: boolean) => {
    const hasPanel = screen.background.kind === 'panel';
    if (!grid.visible || preview || (insidePanel && !hasPanel)) return null;
    return <Shape listening={false} sceneFunc={context => {
      const ctx = context._context, { width, height } = screen.designSize, spacing = grid.spacing;
      let left = Math.max(0, -origin.x / renderZoom), right = Math.min(width, (size.width - origin.x) / renderZoom);
      let top = Math.max(0, -origin.y / renderZoom), bottom = Math.min(height, (size.height - origin.y) / renderZoom);
      if (hasPanel) {
        if (insidePanel) {
          left = Math.max(left, panel.x); right = Math.min(right, panel.x + panel.w);
          top = Math.max(top, panel.y); bottom = Math.min(bottom, panel.y + panel.h);
        } else if (panel.x <= left && panel.y <= top && panel.x + panel.w >= right && panel.y + panel.h >= bottom) return;
      }
      if (right <= left || bottom <= top) return;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
      if (hasPanel) {
        ctx.beginPath();
        if (!insidePanel) ctx.rect(0, 0, width, height);
        ctx.rect(panel.x, panel.y, panel.w, panel.h); ctx.clip(insidePanel ? 'nonzero' : 'evenodd');
      }
      if (insidePanel) {
        // Back-layer tabs must also occlude the guide at transparent Panel
        // corners. Keep their existing draw order and mask their footprint.
        for (const node of drawingNodes.filter(node => !node.parentContainerId && beforePanel(node) && runtimeNodeVisible(node))) {
          const bounds = node.bounds;
          if (!intersectBounds(bounds, { x: left, y: top, w: right - left, h: bottom - top })) continue;
          ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h); ctx.clip('evenodd');
        }
      }
      ctx.beginPath(); ctx.lineWidth = 1 / renderZoom; ctx.strokeStyle = insidePanel ? chrome.panelGrid : chrome.grid;
      for (let x = Math.ceil(left / spacing) * spacing; x <= right; x += spacing) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
      for (let y = Math.ceil(top / spacing) * spacing; y <= bottom; y += spacing) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
      ctx.stroke(); ctx.restore();
    }}/>;
  };
  const chip = (() => {
    if (!b || preview || interaction || behaviorPreview || (selectedViewport && !intersectBounds(b, selectedViewport))) return null;
    const chipWidth = 112, chipHeight = 18;
    const selTop = origin.y + b.y * renderZoom;
    const selRight = origin.x + (b.x + b.w) * renderZoom, selBottom = origin.y + (b.y + b.h) * renderZoom;
    const x = Math.max(4, Math.min(size.width - chipWidth - 4, selRight + 6));
    const y = selBottom + 6 + chipHeight > size.height - 30 ? Math.max(24, selTop - chipHeight - 6) : selBottom + 6;
    const hidden = selectedNode && !selectedNode.state.visible;
    return { x, y, width: chipWidth, height: chipHeight, text: `${hidden ? '隐藏 · ' : ''}W ${b.w}  H ${b.h}` };
  })();
  return <div ref={host} className={`canvas-host ${view.tool}`} data-testid="canvas-host" role="application" aria-label="GUI 设计画布"
    data-origin-x={origin.x} data-origin-y={origin.y} data-zoom={renderZoom} data-preview={!!preview} data-runtime-preview-active={runtimePreviewActive}
    data-scroll-offsets={JSON.stringify(containerScroll)}
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
        {frame && <Rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill={chrome.previewFrame} stroke={chrome.previewFrameLine} strokeWidth={1}/>}
        {!preview && !interaction && !behaviorMode && screens.filter(item => item.id !== screen.id).map(item => <Group key={item.id} x={origin.x + (positions[item.id].x - activePosition.x) * renderZoom} y={origin.y + (positions[item.id].y - activePosition.y) * renderZoom} scaleX={renderZoom} scaleY={renderZoom}>
          <OtherScreen screen={item} assets={assets} cache={cache} resources={resources} font={font} zoom={renderZoom} select={() => onSelectScreen(item.id)} selectOnLeft={view.tool === 'select'} expanded={designPanelExpansion(item.nodes, designExpandedByScreen[item.id])} screenTabGroups={screenTabGroups} chrome={chrome}/>
          {header(item)}
        </Group>)}
        <Group x={origin.x} y={origin.y} scaleX={renderZoom} scaleY={renderZoom} listening={!preview}>
        <Rect width={screen.designSize.width} height={screen.designSize.height} fill={DESIGN_SURFACE} stroke={DESIGN_SURFACE_LINE} strokeWidth={1 / renderZoom} />
        {!preview && screens.length > 1 && header(screen)}
        {!preview && (() => {
          const { width, height } = screen.designSize, length = 8 / renderZoom, line = 1 / renderZoom;
          const marks: [number, number, number, number][] = [
            [0, 0, length, line], [0, 0, line, length],
            [width - length, 0, length, line], [width - line, 0, line, length],
            [0, height - line, length, line], [0, height - length, line, length],
            [width - length, height - line, length, line], [width - line, height - length, line, length],
          ];
          return <Group listening={false}>{marks.map(([x, y, w, h], index) => <Rect key={index} x={x} y={y} width={w} height={h} fill={chrome.accent} opacity={0.4}/>)}</Group>;
        })()}
        {editingGrid(false)}
        {renderNodes.filter(node => node.parentContainerId === undefined && beforePanel(node)).map(node => drawNode(node))}
        {screen.background.kind === 'panel' && !isTextureStyle(screen.background.style) && panelRects(panel.w, panel.h).map((r, i) => <Rect key={i} x={r.x + panel.x} y={r.y + panel.y} width={r.w} height={r.h} fill={r.color} listening={false}/>)}
        {screen.background.kind === 'panel' && isTextureStyle(screen.background.style) && panelImage?.style === screen.background.style && <Shape x={panel.x} y={panel.y} listening={false} sceneFunc={context => {
          const ctx = context._context, raster = panelPreviewRaster(panelImage.image, panel.w, panel.h);
          if (!raster) { drawNativePanel(ctx, panelImage.image, panel.w, panel.h); return; }
          ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(raster, 0, 0); ctx.restore();
        }}/>}
        {editingGrid(true)}
        {(!runtimePanelMode && !preview ? designSiblingOrder(renderNodes.filter(node => node.parentContainerId === undefined && !beforePanel(node)), expandedGeometry) : renderNodes.filter(node => node.parentContainerId === undefined && !beforePanel(node))).map(node => drawNode(node))}
        {b && !preview && !interaction && !behaviorPreview && <Group clipX={selectedViewport?.x} clipY={selectedViewport?.y} clipWidth={selectedViewport?.w} clipHeight={selectedViewport?.h}>
          <Rect x={b.x} y={b.y} width={b.w} height={b.h} stroke={chrome.selectionOutline} opacity={0.9} strokeWidth={3 / renderZoom} listening={false}/>
          <Rect x={b.x} y={b.y} width={b.w} height={b.h} stroke={chrome.accent} strokeWidth={1.5 / renderZoom} listening={false}/>
          {!readOnly && selectedNode?.type !== 'minecraft:creative-tab' && !(selectedNode && isCollapsiblePanelNode(selectedNode) && !(expandedGeometry[selectedNode.id] ?? selectedNode.props.initialExpanded)) && <Group>
            {([
              { edge: 'left', x: b.x - 4 / renderZoom, y: b.y + b.h / 2 - 4 / renderZoom, cursor: 'ew-resize' },
              { edge: 'right', x: b.x + b.w - 4 / renderZoom, y: b.y + b.h / 2 - 4 / renderZoom, cursor: 'ew-resize' },
              { edge: 'top', x: b.x + b.w / 2 - 4 / renderZoom, y: b.y - 4 / renderZoom, cursor: 'ns-resize' },
              { edge: 'bottom', x: b.x + b.w / 2 - 4 / renderZoom, y: b.y + b.h - 4 / renderZoom, cursor: 'ns-resize' },
              { edge: 'top-left', x: b.x - 4 / renderZoom, y: b.y - 4 / renderZoom, cursor: 'nwse-resize' },
              { edge: 'bottom-right', x: b.x + b.w - 4 / renderZoom, y: b.y + b.h - 4 / renderZoom, cursor: 'nwse-resize' },
            ] as const).map(handle => <Rect key={handle.edge} x={handle.x} y={handle.y} width={8 / renderZoom} height={8 / renderZoom}
              fill={chrome.accent} stroke={chrome.accentInk} strokeWidth={1 / renderZoom} onPointerDown={e => begin(e, selected!, 'resize', handle.edge)}
              onMouseEnter={e => { const stage = e.target.getStage(); if (stage) stage.container().style.cursor = handle.cursor; }}
              onMouseLeave={e => { const stage = e.target.getStage(); if (stage) stage.container().style.cursor = 'default'; }}/>)}
          </Group>}
        </Group>}
      </Group>
      {chip && <Group x={chip.x} y={chip.y} listening={false}>
        <Rect width={chip.width} height={chip.height} fill={chrome.chipBg} opacity={0.96} stroke={chrome.chipLine} strokeWidth={1} cornerRadius={3}/>
        <Text x={6} y={5} text={chip.text} fontSize={9} fontFamily={MONO} fill={chrome.chipText}/>
      </Group>}
      </Group></Layer>
      {!preview && alignment.guides && (alignmentGuides.x !== undefined || alignmentGuides.y !== undefined || !!spacingMark) && <Layer listening={false}>
        <Group clipX={selectedViewport ? guideClip.x : undefined} clipY={selectedViewport ? guideClip.y : undefined} clipWidth={selectedViewport ? guideClip.w : undefined} clipHeight={selectedViewport ? guideClip.h : undefined}>
        {alignmentGuides.x !== undefined && <Rect x={guideOrigin.x + alignmentGuides.x * renderZoom - 0.5} y={guideClip.y} width={1} height={guideClip.h} fill={chrome.alignGuide} opacity={0.95}/>}
        {alignmentGuides.y !== undefined && <Rect x={guideClip.x} y={guideOrigin.y + alignmentGuides.y * renderZoom - 0.5} width={guideClip.w} height={1} fill={chrome.alignGuide} opacity={0.95}/>}
        {spacingMark && <Shape listening={false} sceneFunc={context => {
          const ctx = context._context; ctx.save(); ctx.beginPath(); ctx.lineWidth = 1; ctx.strokeStyle = chrome.spacingLine;
          for (const [a, b] of spacingMark.intervals) {
            if (spacingMark.axis === 'x') { const y = guideOrigin.y + spacingMark.cross * renderZoom, x1 = guideOrigin.x + a * renderZoom, x2 = guideOrigin.x + b * renderZoom;
              ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.moveTo(x1, y - 3); ctx.lineTo(x1, y + 3); ctx.moveTo(x2, y - 3); ctx.lineTo(x2, y + 3);
            } else { const x = guideOrigin.x + spacingMark.cross * renderZoom, y1 = guideOrigin.y + a * renderZoom, y2 = guideOrigin.y + b * renderZoom;
              ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.moveTo(x - 3, y1); ctx.lineTo(x + 3, y1); ctx.moveTo(x - 3, y2); ctx.lineTo(x + 3, y2);
            }
          }
          ctx.stroke(); ctx.restore();
        }}/>}
        {spacingMark && <Group listening={false}>{spacingMark.intervals.map(([a, b], index) => <Text key={`${spacingMark.key}-${index}`} x={spacingMark.axis === 'x' ? guideOrigin.x + (a + b) / 2 * renderZoom - 15 : guideOrigin.x + spacingMark.cross * renderZoom - 18}
          y={spacingMark.axis === 'x' ? guideOrigin.y + spacingMark.cross * renderZoom - 13 : guideOrigin.y + (a + b) / 2 * renderZoom - 5}
          text={`${spacingMark.gap}px`} fontSize={9} fontFamily={MONO} fill={chrome.spacingText} listening={false}/>)}</Group>}
        </Group>
      </Layer>}
      {!preview && <Rulers width={size.width} height={size.height} origin={origin} zoom={renderZoom} design={screen.designSize} chrome={chrome}/>}
    </Stage>
    {runtimePreviewActive && !preview && <div className="runtime-preview-overlays" key={`runtime:${screen.id}:${numericPreviewEpoch}`}>
      <SelectionPreview screenId={screen.id} design={screen.designSize} nodes={selectionRuntimeNodes as SelectionNode[]} clipInsets={selectionClipInsets} origin={origin} zoom={renderZoom} family={font.family} runtimeValues={behaviorMode && behaviorPreview && usesControlState(screen) ? Object.fromEntries(Object.entries(behaviorPreview).flatMap(([id, state]) => state.optionId !== undefined ? [[id,state.optionId]] : [])) : undefined} onSelectionChange={behaviorMode ? onBehaviorSelectionChange : undefined}/>
      <TreeViewPreview key={`tree:${screen.id}:${numericPreviewEpoch}`} nodes={treeOverlayNodes} activeNodeIds={treeRuntimeNodes.map(node => node.id)} clipInsets={treeClipInsets} screenId={screen.id} resetKey={numericPreviewEpoch} origin={origin} zoom={renderZoom}/>
      <ScrollTextPreview resetKey={numericPreviewEpoch} nodes={renderNodes.filter((node): node is Extract<GuiNode, { type: 'minecraft:fitting-multi-line-text-widget' }> => node.type === 'minecraft:fitting-multi-line-text-widget' && (behaviorPreview?.[node.id]?.visible ?? (managed.has(node.id) ? true : node.state.visible)) && visibleInGroup(node.id)).map(node => projectRuntimeNode(node) as typeof node)} origin={origin} zoom={renderZoom} family={font.family}/>
      <NumericPreview key={`${screen.id}:${numericPreviewEpoch}`} screenId={screen.id} nodes={numericOverlayNodes} activeNodeIds={numericRuntimeNodes.map(node => node.id)} clipInsets={numericClipInsets} origin={origin} zoom={renderZoom} family={font.family} runtimeValues={behaviorMode && behaviorPreview && usesControlState(screen) ? Object.fromEntries(Object.entries(behaviorPreview).flatMap(([id, state]) => state.sliderValue !== undefined ? [[id,state.sliderValue]] : [])) : undefined} onSliderValueChange={behaviorMode ? onBehaviorSliderChange : undefined} onVisualChange={setNumericRuntime}/>
      {renderNodes.filter(isCollapsiblePanelNode).filter(node => runtimeNodeVisible(node) && runtimeAncestorsVisible(node) && (!node.parentContainerId || !!nodeVisibleBounds(node, renderNodes, containerScroll, expandedPanels))).map(node => {
        const bounds = nodeAbsoluteBounds(node, renderNodes, containerScroll, expandedPanels), open = expandedPanels[node.id] ?? node.props.initialExpanded;
        return <button key={`collapse-${node.id}`} type="button" data-collapse-toggle={node.id} aria-label={`${displayText(node.props.title)}，${open ? '已展开' : '已收起'}`} aria-expanded={open} disabled={!node.state.enabled}
          onClick={() => togglePanel(node.id)} style={{ position: 'absolute', left: origin.x + bounds.x * renderZoom, top: origin.y + bounds.y * renderZoom, width: bounds.w * renderZoom, height: node.props.headerHeight * renderZoom, padding: 0, border: 0, background: 'transparent', color: 'transparent', cursor: 'pointer', zIndex: 40 }}/ >;
      })}
    </div>}
    {!runtimePreviewActive && !preview && !readOnly && !behaviorMode && <div className="design-panel-overlays">
      {renderNodes.filter(isCollapsiblePanelNode).filter(node => node.state.visible && (!node.parentContainerId || !!nodeVisibleBounds(node, renderNodes, containerScroll, expandedGeometry))).map(node => {
        const bounds = nodeAbsoluteBounds(node, renderNodes, containerScroll, expandedGeometry), open = expandedGeometry[node.id] ?? node.props.initialExpanded;
        const visible = designVisualBounds(node);
        const action = visible && intersectBounds(visible, { x: bounds.x + bounds.w - node.props.headerHeight, y: bounds.y, w: node.props.headerHeight, h: node.props.headerHeight });
        if (!action || designPaintNodes.slice(designPaintNodes.findIndex(item => item.id === node.id) + 1).some(item => {
          const covered = designVisualBounds(item); return covered && !!intersectBounds(action, covered);
        })) return null;
        return <button key={`design-collapse-${node.id}`} type="button" className="design-panel-toggle" data-design-collapse-toggle={node.id}
          aria-label={`${displayText(node.props.title)}，${open ? '收起设计视图' : '展开设计视图'}；仅影响编辑器显示`} aria-expanded={open}
          title="折叠仅影响设计视图，不改变游戏初始状态"
          onPointerDown={event => event.stopPropagation()} onClick={() => togglePanel(node.id)}
          style={{ position: 'absolute', left: origin.x + action.x * renderZoom, top: origin.y + action.y * renderZoom,
            width: action.w * renderZoom, height: action.h * renderZoom, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', zIndex: 40 }}/ >;
      })}
    </div>}
    {editingNode && b && !preview && !readOnly && <InlineTextEditor key={editingNode.id} node={editingNode} left={origin.x + b.x * view.zoom}
      top={origin.y + b.y * view.zoom} width={b.w * view.zoom} height={b.h * view.zoom}
      zoom={view.zoom} close={() => setEditingId(null)}/>}
    <div className="canvas-caption" aria-hidden="true"><b>SCREEN</b><span>{screen.id}</span><span className="caption-rule"/><span>{screen.designSize.width} × {screen.designSize.height} · GUI 逻辑像素</span></div>
    {!screen.nodes.length && !preview && screens.length === 1 && <div className="canvas-empty">
      <div className="canvas-empty-eyebrow">EMPTY SCREEN</div>
      <h2>空白设计区</h2>
      <p>从组件库添加组件，或直接拖入设计区。所有坐标使用整数 GUI 逻辑像素。</p>
      <div className="canvas-empty-actions">
        <button aria-label="新建 Button" disabled={readOnly || behaviorMode || !!gesture} onClick={() => onAddNode('minecraft:button')}>Button</button>
        <button aria-label="新建 StringWidget" disabled={readOnly || behaviorMode || !!gesture} onClick={() => onAddNode('minecraft:string-widget')}>StringWidget</button>
        <button aria-label="新建 Scrollable Panel" disabled={readOnly || behaviorMode || !!gesture} onClick={() => onAddNode('minecraft:scrollable-panel')}>Scrollable Panel</button>
        <button aria-label="新建 Collapsible Panel" disabled={readOnly || behaviorMode || !!gesture} onClick={() => onAddNode('minecraft:collapsible-panel')}>Collapsible Panel</button>
        <button aria-label="新建 Rectangle" disabled={readOnly || behaviorMode || !!gesture} onClick={() => onAddNode('minecraft:fill')}>Rectangle</button>
      </div>
      <p className="canvas-empty-note">这是规格设计器，不运行 Java GUI。也可以从文件菜单导入 JSON。</p>
    </div>}
    <span className={`canvas-badge ${preview ? 'preview' : resources.baseName ? 'resource' : ''}`} title={preview ? `只读预览：游戏 GUI Scale ${preview.effectiveScale}×，窗口已适配网页。` : '浏览器近似预览，不执行 Java Widget；最终外观以游戏内实测为准。'}>
      {preview ? `只读预览 · GUI Scale ${preview.effectiveScale}×` : resources.baseName ? '纹理参考 · 浏览器近似' : '中性近似预览'}
    </span>
    <div className="canvas-zoom" aria-hidden="true"><b>{preview ? `游戏缩放 ${preview.effectiveScale}×` : `编辑缩放 ${Math.round(renderZoom * 100)}%`}</b><span className="zoom-sep">·</span><span>{preview ? `GUI ${preview.logicalWidth} × ${preview.logicalHeight}` : '逻辑坐标不变'}</span></div>
    {!!(resources.baseName || resources.overlayName || imageNodes.length) && (spriteAssetsBusy || imageAssetsBusy || Object.values(assets).some(a => a.error)) && <div className="sprite-diagnostics" role="status">
      <strong>资源诊断</strong>
      {spriteAssetsBusy || imageAssetsBusy ? '正在解码纹理资源…' : Object.entries(assets).filter(([, a]) => a.error).map(([id, a]) => <div key={id}>{id}：{a.error}</div>)}
    </div>}
    {hasCreativeTab && !resources.baseName && <div className="canvas-note" role="status">CreativeTab 未使用客户端资源，当前为中性回退。</div>}
    {panelError && <div className="panel-load-error">Panel 纹理加载失败：{panelError}</div>}
  </div>;
}
