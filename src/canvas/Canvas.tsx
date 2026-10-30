import { memo, useEffect, useRef, useState, type DragEvent } from 'react';
import { Group, Layer, Rect, Shape, Stage, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useStore } from 'zustand';
import { NODE_TYPES, type NodeType } from '../domain/catalog';
import type { Bounds, GuiNode } from '../domain/schema';
import { editorStore } from '../editor/store';
import { editableText, InlineTextEditor } from './InlineTextEditor';
import type { GuiScalePreview } from '../domain/guiScale';
import { tabManaged, tabVisibility } from '../domain/tabGroups';
import { panelBounds, panelRects } from '../domain/panel';
import { drawNativePanel, getPanelImage, isTextureStyle, panelPreviewRaster } from '../render/panelTexture';
import { CHECKBOX_SPRITES, CREATIVE_TAB_SPRITES, GUI_SPRITES, type LayeredResources } from '../resources/layered';
import { beforePanel, drawCreativeTabFallback, SpriteRasterCache, spriteForNode, type DecodedSprite } from '../render/spritePreview';
import { drawCheckboxFallback, drawPreviewText, previewCheckboxLayout, type FontChoice } from '../render/previewFont';
import type { BehaviorPreview } from '../ui/BehaviorPanel';

export type View = { zoom: number; panX: number; panY: number; tool: 'select' | 'pan' };
type Props = { view: View; setView: (view: View) => void; preview?: GuiScalePreview | null; readOnly?: boolean; behaviorPreview?: BehaviorPreview | null; behaviorMode?: boolean; interaction: boolean; onBehaviorTrigger?: (id: string) => void; editTabs?: Record<string, string>; grid: { visible: boolean; spacing: number }; resources: LayeredResources; resourceGeneration: number; font: FontChoice };
type PreviewAsset = { sprite?: DecodedSprite; error?: string };
const rgba = (color: string) => `rgba(${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${parseInt(color.slice(7, 9), 16)},${parseInt(color.slice(1, 3), 16) / 255})`;

const NodeDrawing = memo(function NodeDrawing({ node, bounds, onDown, onEdit, assets, cache, resourceActive, focused, font, panel }: {
  node: GuiNode; bounds: Bounds; onDown: (e: KonvaEventObject<PointerEvent>, id: string, mode: 'move' | 'resize') => void;
  onEdit: (id: string) => void; assets: Record<string, PreviewAsset>; cache: SpriteRasterCache; resourceActive: boolean; focused: boolean; font: FontChoice; panel: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const { w, h } = bounds;
  const fill = node.type === 'minecraft:fill' ? rgba(node.props.color)
    : node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' ? '#314354' : node.type === 'minecraft:edit-box' || node.type === 'minecraft:checkbox' ? '#151e2b' : 'rgba(255,255,255,0.01)';
  const stroke = node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button' || node.type === 'minecraft:checkbox' ? '#5a7185' : node.type === 'minecraft:edit-box' && node.props.bordered ? '#5a7185' : undefined;
  const id = spriteForNode(node, hovered, focused);
  const asset = id ? assets[id] : undefined; let raster: HTMLCanvasElement | null = null; let renderError = '';
  if (id && asset?.sprite) { try { raster = cache.get(id, asset.sprite, node.type === 'minecraft:checkbox' ? 17 : w, node.type === 'minecraft:checkbox' ? 17 : h); } catch (error) { renderError = (error as Error).message; } }
  const unbordered = node.type === 'minecraft:edit-box' && !node.props.bordered;
  return <Group x={bounds.x} y={bounds.y} opacity={node.state.visible ? ('enabled' in node.state && !node.state.enabled && !raster && node.type !== 'minecraft:checkbox' ? 0.45 : 1) : 0.22}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onPointerDown={e => onDown(e, node.id, 'move')} onDblClick={e => { e.cancelBubble = true; onEdit(node.id); }}>
    <Rect width={w} height={h} fill={node.type === 'minecraft:checkbox' ? 'rgba(0,0,0,0.001)' : raster || unbordered ? 'rgba(0,0,0,0.001)' : fill} stroke={node.type === 'minecraft:checkbox' || raster || unbordered ? undefined : stroke} strokeWidth={0.6} />
    {node.type === 'minecraft:creative-tab' && !raster && <Shape listening={false} sceneFunc={context => drawCreativeTabFallback(context._context, node.props.selected)}/>}
    {node.type === 'minecraft:checkbox' && !raster && <Shape listening={false} sceneFunc={context => drawCheckboxFallback(context._context, node.props.selected)}/>}
    {raster && <Shape listening={false} sceneFunc={context => { const ctx = context._context; ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(raster, 0, 0); ctx.restore(); }} />}
    {node.type !== 'minecraft:creative-tab' && resourceActive && id && (asset?.error || renderError) && <Text text="纹理不可用" fontSize={7} fill="#ff746e" listening={false}/>}
    {node.type !== 'minecraft:fill' && node.type !== 'minecraft:creative-tab' && <Shape listening={false} sceneFunc={context => drawPreviewText(context._context, node, w, h, font.family, panel)}/>}
    {node.type === 'minecraft:checkbox' && <Shape listening={false} sceneFunc={context => { const ctx = context._context, layout = previewCheckboxLayout(ctx, node, font.family); if (layout.overflow || layout.truncated) { ctx.save(); ctx.font = '7px sans-serif'; ctx.textBaseline = 'top'; ctx.fillStyle = '#ffb35a'; ctx.fillText(layout.truncated ? '文字预览已截断' : '文字超出参考边界', 0, Math.max(h, 17) + 2); ctx.restore(); } }}/>} 
  </Group>;
});

export function Canvas({ view, setView, preview = null, readOnly = false, behaviorPreview = null, behaviorMode = false, interaction, onBehaviorTrigger, editTabs = {}, grid, resources, resourceGeneration, font }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 540 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelImage, setPanelImage] = useState<{ style: string; image: HTMLImageElement } | null>(null);
  const [panelError, setPanelError] = useState('');
  const [assets, setAssets] = useState<Record<string, PreviewAsset>>({});
  const [assetBusy, setAssetBusy] = useState(false);
  const [interactionValues, setInteractionValues] = useState<Record<string, boolean | string>>({});
  const [interactionFocus, setInteractionFocus] = useState<string | null>(null);
  useEffect(() => { setInteractionValues({}); setInteractionFocus(null); if (interaction || behaviorPreview) setEditingId(null); }, [interaction, behaviorPreview]);
  const screen = useStore(editorStore, s => s.doc.screens[0]);
  const hasCreativeTab = screen.nodes.some(node => node.type === 'minecraft:creative-tab');
  const hasCheckbox = screen.nodes.some(node => node.type === 'minecraft:checkbox');
  const cache = useRef(new SpriteRasterCache()).current;
  useEffect(() => {
    let active = true; const decoded: ImageBitmap[] = []; cache.clear(); setAssets({});
    if (!resources.baseName) { setAssetBusy(false); return () => { active = false; }; }
    setAssetBusy(true);
    void Promise.all([...GUI_SPRITES, ...(hasCheckbox ? CHECKBOX_SPRITES : []), ...(hasCreativeTab ? CREATIVE_TAB_SPRITES : [])].map(async id => {
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
  }, [resources, resourceGeneration, cache, hasCheckbox, hasCreativeTab]);
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
  const current = useRef({ view, setView, size, screen, editingId, preview, readOnly, interaction }); current.current = { view, setView, size, screen, editingId, preview, readOnly, interaction };
  const pointer = useRef<null | { pointerId: number; x: number; y: number; zoom: number; mode: 'move' | 'resize' | 'pan'; bounds?: Bounds; panX: number; panY: number }>(null);
  const fit = preview ? Math.max(0.01, Math.min(Math.max(1, size.width - 48) / preview.framebufferWidth, Math.max(1, size.height - 110) / preview.framebufferHeight)) : 1;
  const frame = preview ? { x: (size.width - preview.framebufferWidth * fit) / 2, y: (size.height - preview.framebufferHeight * fit) / 2,
    w: preview.framebufferWidth * fit, h: preview.framebufferHeight * fit } : null;
  const renderZoom = preview ? fit * preview.effectiveScale : view.zoom;
  const origin = frame && preview ? { x: frame.x + Math.floor((preview.logicalWidth - screen.designSize.width) / 2) * renderZoom,
    y: frame.y + Math.floor((preview.logicalHeight - screen.designSize.height) / 2) * renderZoom }
    : { x: Math.floor((size.width - screen.designSize.width * view.zoom) / 2) + view.panX,
      y: Math.floor((size.height - screen.designSize.height * view.zoom) / 2) + view.panY };
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const r = entries[0].contentRect; setSize({ width: Math.max(1, r.width), height: Math.max(1, r.height) });
    });
    observer.observe(host.current!); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const cancel = () => { pointer.current = null; editorStore.getState().cancelGesture(); };
    const move = (e: PointerEvent) => {
      const p = pointer.current; if (!p || p.pointerId !== e.pointerId) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (p.mode === 'pan') current.current.setView({ ...current.current.view, panX: p.panX + dx, panY: p.panY + dy });
      else if (p.bounds) {
        const design = editorStore.getState().doc.screens[0].designSize;
        editorStore.getState().previewBounds(p.mode === 'move' ? { ...p.bounds, x: p.bounds.x + dx / p.zoom, y: p.bounds.y + dy / p.zoom }
          : { ...p.bounds, w: Math.min(design.width - p.bounds.x, p.bounds.w + dx / p.zoom), h: Math.min(design.height - p.bounds.y, p.bounds.h + dy / p.zoom) });
      }
    };
    const end = (e: PointerEvent) => {
      if (pointer.current?.pointerId !== e.pointerId) return;
      move(e); pointer.current = null; editorStore.getState().commitGesture();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel); window.addEventListener('keydown', key);
    return () => { cancel(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key); };
  }, []);
  const begin = (e: KonvaEventObject<PointerEvent>, id: string, mode: 'move' | 'resize') => {
    if (preview) return;
    if (e.evt.button !== 0 && e.evt.button !== 2) return;
    e.cancelBubble = true;
    if (behaviorMode) { if (e.evt.button === 0) onBehaviorTrigger?.(id); return; }
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
    const bounds = state.doc.screens[0].nodes.find(n => n.id === id)!.bounds;
    pointer.current = { pointerId, x, y, mode, bounds: { ...bounds }, zoom: view.zoom, panX: view.panX, panY: view.panY };
  };
  // Stable callback keeps the other 299 drawings untouched during a single-node drag.
  const beginRef = useRef(begin); beginRef.current = begin;
  const stableDown = useRef((e: KonvaEventObject<PointerEvent>, id: string, mode: 'move' | 'resize') => beginRef.current(e, id, mode)).current;
  const stableEdit = useRef((id: string) => {
    if (current.current.preview || current.current.readOnly) return;
    const state = editorStore.getState(), node = state.doc.screens[0].nodes.find(n => n.id === id);
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
        const ox = Math.floor((c.size.width - c.screen.designSize.width * old.zoom) / 2) + old.panX;
        const oy = Math.floor((c.size.height - c.screen.designSize.height * old.zoom) / 2) + old.panY;
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
      const oldX = Math.floor((c.size.width - c.screen.designSize.width * old.zoom) / 2) + old.panX;
      const oldY = Math.floor((c.size.height - c.screen.designSize.height * old.zoom) / 2) + old.panY;
      const panX = px - (px - oldX) / old.zoom * zoom - Math.floor((c.size.width - c.screen.designSize.width * zoom) / 2);
      const panY = py - (py - oldY) / old.zoom * zoom - Math.floor((c.size.height - c.screen.designSize.height * zoom) / 2);
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
  const renderNodes = screen.nodes.map(node => node.type === 'minecraft:creative-tab' && visualSelection?.[node.id]?.tabSelected !== undefined ? { ...node, props: { ...node.props, selected: visualSelection[node.id].tabSelected! } } : node);
  const editingNode = editingId === selected ? screen.nodes.find(n => n.id === editingId) : undefined;
  const drawNode = (original: GuiNode) => { const override = behaviorPreview?.[original.id];
          if (behaviorPreview && (!(override?.visible ?? (managed.has(original.id) ? true : original.state.visible)) || !visibleInGroup(original.id))) return null;
          let node: GuiNode = managed.has(original.id) ? { ...original, state: { ...original.state, visible: override?.visible ?? true } } as GuiNode : override?.visible === undefined ? original : { ...original, state: { ...original.state, visible: override.visible } } as GuiNode;
          if (!behaviorPreview && !visibleInGroup(node.id)) node = { ...node, state: { ...node.state, visible: false } } as GuiNode;
          if (behaviorPreview && node.type === 'minecraft:string-widget' && override?.text !== undefined) node = { ...node, props: { ...node.props, text: { kind: 'literal', value: override.text } } };
          if (behaviorPreview && node.type === 'minecraft:checkbox' && override?.checked !== undefined) node = { ...node, props: { ...node.props, selected: override.checked } };
          const value = interactionValues[node.id];
          const shown = interaction && node.type === 'minecraft:checkbox' && typeof value === 'boolean' ? { ...node, props: { ...node.props, selected: value } }
            : interaction && node.type === 'minecraft:cycle-button' && typeof value === 'string' && node.props.options.some(o => o.id === value) ? { ...node, props: { ...node.props, initialOptionId: value } } : node;
          return <NodeDrawing key={node.id} node={shown} bounds={gesture?.id === node.id ? gesture.draft : node.bounds} onDown={stableDown} onEdit={interaction ? () => {} : stableEdit} assets={assets} cache={cache} resourceActive={!!resources.baseName} focused={interaction ? interactionFocus === node.id : editingId === node.id} font={font} panel={screen.background.kind === 'panel'}/>; };
  return <div ref={host} className={`canvas-host ${view.tool}`} data-testid="canvas-host" role="application" aria-label="GUI 设计画布"
    data-origin-x={origin.x} data-origin-y={origin.y} data-zoom={renderZoom} data-preview={!!preview}
    data-grid-visible={grid.visible && !preview} data-grid-spacing={grid.spacing}
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
        {frame && <Rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="#0c121a" stroke="#6a7d91" strokeWidth={1}/>}
        <Group x={origin.x} y={origin.y} scaleX={renderZoom} scaleY={renderZoom} listening={!preview}>
        <Rect width={screen.designSize.width} height={screen.designSize.height} fill="#1c2634" stroke="#4b5a6e" strokeWidth={1 / renderZoom} />
        {renderNodes.filter(beforePanel).map(drawNode)}
        {screen.background.kind === 'panel' && !isTextureStyle(screen.background.style) && panelRects(panel.w, panel.h).map((r, i) => <Rect key={i} x={r.x + panel.x} y={r.y + panel.y} width={r.w} height={r.h} fill={r.color} listening={false}/>)}
        {screen.background.kind === 'panel' && isTextureStyle(screen.background.style) && panelImage?.style === screen.background.style && <Shape x={panel.x} y={panel.y} listening={false} sceneFunc={context => {
          const ctx = context._context, raster = panelPreviewRaster(panelImage.image, panel.w, panel.h);
          if (!raster) { drawNativePanel(ctx, panelImage.image, panel.w, panel.h); return; }
          ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(raster, 0, 0); ctx.restore();
        }}/>} 
        {grid.visible && !preview && <Shape listening={false} sceneFunc={context => {
          const ctx = context._context, { width, height } = screen.designSize, spacing = grid.spacing;
          const left = Math.max(0, -origin.x / renderZoom), right = Math.min(width, (size.width - origin.x) / renderZoom);
          const top = Math.max(0, -origin.y / renderZoom), bottom = Math.min(height, (size.height - origin.y) / renderZoom);
          if (right <= left || bottom <= top) return;
          ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
          ctx.beginPath(); ctx.lineWidth = 1 / renderZoom; ctx.strokeStyle = 'rgba(106, 142, 163, 0.5)';
          for (let x = Math.ceil(left / spacing) * spacing; x <= right; x += spacing) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
          for (let y = Math.ceil(top / spacing) * spacing; y <= bottom; y += spacing) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
          ctx.stroke(); ctx.restore();
        }}/>}
        {renderNodes.filter(node => !beforePanel(node)).map(drawNode)}
        {b && !preview && !interaction && !behaviorPreview && <Group>
          <Rect x={b.x} y={b.y} width={b.w} height={b.h} stroke="#8defca" strokeWidth={1.5 / view.zoom} dash={[4 / view.zoom, 3 / view.zoom]} listening={false}/>
          {!readOnly && selectedNode?.type !== 'minecraft:creative-tab' && <Rect x={b.x + b.w - 4 / view.zoom} y={b.y + b.h - 4 / view.zoom} width={8 / view.zoom} height={8 / view.zoom}
            fill="#8defca" stroke="#142a24" strokeWidth={1 / view.zoom} onPointerDown={e => begin(e, selected!, 'resize')}/>}
        </Group>}
      </Group></Group></Layer>
    </Stage>
    {editingNode && !preview && !readOnly && <InlineTextEditor key={editingNode.id} node={editingNode} left={origin.x + editingNode.bounds.x * view.zoom}
      top={origin.y + editingNode.bounds.y * view.zoom} width={editingNode.bounds.w * view.zoom} height={editingNode.bounds.h * view.zoom}
      zoom={view.zoom} close={() => setEditingId(null)}/>}
    <div className="canvas-caption" aria-hidden="true">SCREEN / {screen.designSize.width} × {screen.designSize.height}<span>GUI LOGICAL PIXELS</span></div>
    {!screen.nodes.length && !preview && <div className="empty-hint">从左侧添加一个组件<span>点击组件卡片，或拖入设计区</span></div>}
    <span className="canvas-badge">{preview ? `只读预览 · GUI Scale ${preview.effectiveScale}× · GUI ${preview.logicalWidth}×${preview.logicalHeight} · 窗口已适配网页` : resources.baseName ? '用户资源纹理预览 · 字体近似 · 导出为组件初态' : '中性近似预览 · 非游戏渲染'}</span>
    {!!resources.baseName && (assetBusy || Object.values(assets).some(a => a.error)) && <div className="sprite-diagnostics" role="status">{assetBusy ? '正在解码 GUI 纹理…' : Object.entries(assets).filter(([, a]) => a.error).map(([id, a]) => <div key={id}>{id}：{a.error}</div>)}</div>}
    {hasCreativeTab && !resources.baseName && <div className="sprite-diagnostics" role="status">CreativeTab：未选择客户端资源，使用中性回退。</div>}
    {panelError && <div className="panel-load-error" role="alert">Panel 纹理加载失败：{panelError}</div>}
  </div>;
}
