import { initialControlState } from './domain/genericBehavior';
import { buildBehaviorIndex } from './domain/behaviorDiagnostics';
import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import { CATALOG, NODE_TYPES, type NodeType } from './domain/catalog';
import { isScrollableChildType, type ContainerDrop } from './domain/scrollablePanel';
import { isRepeatableChildType, isRepeatableListNode, repeatableChildRejection } from './domain/repeatableList';
import { displayText } from './domain/model';
import { containerLocalViewport, isCollapsiblePanelNode, nodeAbsoluteBounds } from './domain/collapsiblePanel';
import { MAX_JSON_BYTES } from './domain/schema';
import { currentScreen, editorStore } from './editor/store';
import { commitExportDrafts } from './exports/draftBarrier';
import { Canvas, type View } from './canvas/Canvas';
import { StatusPreview } from './canvas/StatusPreview';
import { isStatusNode } from './domain/statusIndicator';
import { Inspector, ProjectName } from './ui/Inspector';
import { ScreenSettings } from './ui/ScreenSettings';
import type { GuiScalePreview } from './domain/guiScale';
import { LocalSavePanel } from './ui/LocalSavePanel';
import { previewAssets } from './io/previewAssets';
import { captureExport, useExports } from './exports/useExports';
import { ExportPanel } from './ui/ExportPanel';
import { TemplatesPanel } from './ui/TemplatesPanel';
import { ResourceTestPanel } from './ui/ResourceTestPanel';
import { LayeredResources } from './resources/layered';
import { fontSession } from './render/previewFont';
import { exportFilename } from './exports/filenames';
import { loadWorkspace, saveWorkspace, type SidebarMode } from './ui/workspacePreferences';
import { HybridSidebar } from './ui/HybridSidebar';
import { WorkspaceSettingsPopover } from './ui/WorkspaceSettingsPopover';
import { localSession } from './io/localSession';
import { BehaviorPanel, type BehaviorPreview } from './ui/BehaviorPanel';
import type { SliderChangeEvent } from './domain/numeric';
import type { SelectionEvent } from './domain/selection';
import { useDismissOutside } from './ui/useDismissOutside';
import { ImportErrorDialog, type ImportFailure } from './ui/ImportErrorDialog';
import { confirmDeleteScreen, confirmDeleteSelected } from './ui/confirmDeletion';
import { BakePanel } from './ui/BakePanel';
import { LocalizationPanel } from './ui/LocalizationPanel';
import { EditorLayerControls, EditorLayerTree } from './ui/EditorLayerTree';
import { DEFAULT_EDITOR_LAYER_VIEW, editorLayerContext, editorLayerVisibility, pruneEditorLayerViews, type EditorLayerView, type EditorLayerViews } from './domain/editorLayerVisibility';

const THEME_KEY = 'minecraft-gui-maker.theme.v1';
const THEME_QUERY = '(prefers-color-scheme: dark)';
export type ThemeMode = 'light' | 'dark' | 'system';
const BlocklyBehaviorEditor = lazy(() => import('./ui/BlocklyBehaviorEditor'));
const loadThemeMode = (): ThemeMode => {
  try { const value = localStorage.getItem(THEME_KEY); return value === 'light' || value === 'system' ? value : 'dark'; } catch { return 'dark'; }
};

export function App() {
  const [blocklyMode, setBlocklyMode] = useState(false), [bakeMode, setBakeMode] = useState(false), [blocklyMounted, setBlocklyMounted] = useState(false), [blocklyRuleId, setBlocklyRuleId] = useState<string | null>(null);
  const designMode = !blocklyMode && !bakeMode, activeBlockly = blocklyMode && !bakeMode;
  const [blocklyToolbarHost, setBlocklyToolbarHost] = useState<HTMLDivElement | null>(null);
  const blocklyDraftDirty = useRef(false), behaviorDraftDirty = useRef(false);
  const enterBlocklyMode = (ruleId?: string) => { if (ruleId && blocklyDraftDirty.current) { notify('Blockly 有未保存草稿；请先保存或放弃草稿，再定位其他规则。', true); return; } setBakeMode(false); setBlocklyRuleId(ruleId ?? null); setBlocklyMounted(true); setBlocklyMode(true); };
  const requireBehaviorDraftSettled = () => { if (behaviorDraftDirty.current) throw new Error('行为面板有未保存草稿，请先保存或取消编辑'); };
  const requireBlocklyDraftSettled = () => { if (blocklyDraftDirty.current) throw new Error('Blockly 有未保存草稿，请先保存积木规则或放弃草稿'); requireBehaviorDraftSettled(); };
  const state = useStore(editorStore);
  const screen = currentScreen(state);
  const behaviorBindings = useMemo(() => buildBehaviorIndex(state.doc).find(item => item.screenId === screen.id)?.nodes ?? [], [state.doc, screen.id]);
  const [screenName, setScreenName] = useState(() => displayText(screen.title));
  const [renamingScreen, setRenamingScreen] = useState(false);
  useEffect(() => { setScreenName(displayText(screen.title)); }, [screen.id, screen.title]);
  useEffect(() => { setRenamingScreen(false); }, [screen.id]);
  const font = useSyncExternalStore(fontSession.subscribe, fontSession.get);
  const [resources] = useState(() => new LayeredResources()), [resourceGeneration, setResourceGeneration] = useState(0);
  const resourceRestore = useRef<Promise<void> | null>(null);
  const [view, setView] = useState<View>({ zoom: 2, panX: 0, panY: 0, tool: 'select' });
  const [grid, setGrid] = useState({ visible: false, spacing: 10 }), [gridDraft, setGridDraft] = useState('10');
  const gridValid = /^\d+$/.test(gridDraft) && Number(gridDraft) >= 1 && Number(gridDraft) <= 200;
  const [preview, setPreview] = useState<GuiScalePreview | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interaction, setInteraction] = useState(false), [resourceOpenRequest, setResourceOpenRequest] = useState(0);
  const [previewStatusValues, setPreviewStatusValues] = useState<Record<string, string>>({});
  useEffect(() => { setPreviewStatusValues({}); }, [interaction, screen.id]);
  const [numericPreviewEpoch, setNumericPreviewEpoch] = useState(0);
  const fontRef = useRef<HTMLInputElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const editorMenuRef = useRef<HTMLElement>(null);
  useDismissOutside(editorMenuRef, true, () => editorMenuRef.current?.querySelectorAll('details[open]').forEach(item => item.removeAttribute('open')));
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  useDismissOutside(fontMenuRef, fontMenuOpen, () => setFontMenuOpen(false));
  useEffect(() => { setInteraction(false); setBehaviorPreview(null); setBehaviorMode(false); behaviorStartScreen.current = null; }, [state.doc]);
  const [exportOpen, setExportOpen] = useState(false), [templatesOpen, setTemplatesOpen] = useState(false);
  const [behaviorPreview, setBehaviorPreview] = useState<BehaviorPreview | null>(null);
  const [editTabs, setEditTabs] = useState<Record<string, string>>({});
  const [layerViews, setLayerViews] = useState<EditorLayerViews>({});
  const layerContext = editorLayerContext(screen, editTabs);
  const layerView = layerViews[layerContext.key]?.view ?? DEFAULT_EDITOR_LAYER_VIEW;
  const layerMask = useMemo(() => editorLayerVisibility(screen, editTabs, layerView), [screen, editTabs, layerView]);
  const selectedLayerNode = screen.nodes.find(node => node.id === state.selected);
  const updateLayerView = (view: EditorLayerView) => {
    editorStore.getState().cancelGesture();
    setLayerViews(previous => ({ ...previous, [layerContext.key]: { screenId: screen.id, pages: layerContext.pages, view } }));
  };
  useEffect(() => { setLayerViews(previous => pruneEditorLayerViews(previous, state.doc)); }, [state.doc]);  useEffect(() => {
    if (!state.selected) return;
    const locked = new Set(layerView.lockedIds ?? []);
    let node = screen.nodes.find(item => item.id === state.selected), seen = new Set<string>();
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      if (locked.has(node.id)) { editorStore.getState().select(null); return; }
      node = node.parentContainerId ? screen.nodes.find(item => item.id === node!.parentContainerId) : undefined;
    }
  }, [state.selected, layerView.lockedIds, screen.nodes]);

  const [screenPositions, setScreenPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [containerScroll, setContainerScroll] = useState<Record<string, number>>({});
  const [templateEditingId, setTemplateEditingId] = useState<string | null>(null);
  const [repeatPreviewRows, setRepeatPreviewRows] = useState<Record<string, number>>({});
  useEffect(() => { setTemplateEditingId(null); }, [state.currentScreenId]);
  useEffect(() => { if (state.operation === 'import' || state.operation === 'restore') setTemplateEditingId(null); }, [state.doc, state.operation]);
  useEffect(() => {
    if (!templateEditingId) return;
    if (!screen.nodes.some(node => node.id === templateEditingId && node.type === 'minecraft:repeatable-list')) setTemplateEditingId(null);
  }, [screen, templateEditingId]);
  useEffect(() => { setRepeatPreviewRows(previous => {
    const ids = new Set(state.doc.screens.flatMap(item => item.nodes.filter(node => node.type === 'minecraft:repeatable-list').map(node => node.id)));
    const next = Object.fromEntries(Object.entries(previous).filter(([id]) => ids.has(id)));
    return Object.keys(next).length === Object.keys(previous).length ? previous : next;
  }); }, [state.doc]);
  const [behaviorMode, setBehaviorMode] = useState(false), behaviorTrigger = useRef<((id: string) => void) | null>(null), sliderBehaviorTrigger = useRef<((event: SliderChangeEvent) => void) | null>(null), selectionBehaviorTrigger = useRef<((event: SelectionEvent) => void) | null>(null);
  const behaviorStartScreen = useRef<string | null>(null), behaviorNavigation = useRef<'navigate' | 'reset' | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(loadThemeMode);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(THEME_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(THEME_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    setSystemDark(media.matches);
    return () => media.removeEventListener('change', onChange);
  }, []);
  const theme: 'dark' | 'light' = themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode;
  const [importError, setImportError] = useState<ImportFailure | null>(null);
  useEffect(() => { if (behaviorMode || behaviorPreview || preview) setEditTabs({}); }, [behaviorMode, behaviorPreview, preview]);
  useEffect(() => {
    setEditTabs({}); setInteraction(false); setPreview(null);
    if (behaviorNavigation.current) {
      const transition = behaviorNavigation.current; behaviorNavigation.current = null;
      if (transition === 'navigate') { setInteraction(true); setBehaviorPreview(initialControlState(currentScreen(editorStore.getState()))); setBehaviorMode(true); }
      else { setBehaviorPreview(null); setBehaviorMode(false); }
      return;
    }
    behaviorStartScreen.current = null; setBehaviorPreview(null); setBehaviorMode(false);
  }, [state.currentScreenId]);
  useEffect(() => { if (state.operation === 'import' || state.operation === 'restore') { setEditTabs({}); setScreenPositions({}); setLayerViews({}); } }, [state.doc, state.operation]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, themeMode); } catch { /* theme is a preference, never blocks editing */ }
  }, [theme, themeMode]);
  const [prefs, setPrefs] = useState(loadWorkspace), [peek, setPeek] = useState({ left: false, right: false });
  const [behaviorReveal, setBehaviorReveal] = useState(0);
  const behaviorOpen = prefs.openedModules.includes('behavior');
  const setBehaviorOpen = (open: boolean) => { if (open) setBehaviorReveal(n => n + 1); setPrefs(p => ({ ...p, openedModules: open ? p.openedModules.includes('behavior') ? p.openedModules : [...p.openedModules, 'behavior'] : p.openedModules.filter(id => id !== 'behavior'), left: open && p.left.mode === 'collapsed' ? { ...p.left, mode: 'pinned' } : p.left })); };
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth), [mobileInspectorOpen, setMobileInspectorOpen] = useState(false), pointerDown = useRef(false), hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { saveWorkspace(prefs); }, [prefs]);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth), down = () => { pointerDown.current = true; }, up = () => { pointerDown.current = false; };
    window.addEventListener('resize', resize); window.addEventListener('pointerdown', down); window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up); window.addEventListener('dragend', up); window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('resize', resize); window.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up); window.removeEventListener('dragend', up); window.removeEventListener('blur', up);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);
  const mode = (side: 'left' | 'right', value: SidebarMode) => {
    setPrefs(p => ({ ...p, [side]: { ...p[side], mode: value } }));
    setPeek(p => ({ ...p, [side]: false }));
  };
  const showPeek = (side: 'left' | 'right') => {
    if (side === 'right' && viewportWidth <= 560) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!pointerDown.current && !state.gesture && prefs[side].mode !== 'pinned') setPeek(p => ({ ...p, [side]: true }));
  };
  const hidePeek = (side: 'left' | 'right') => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const container = document.querySelector(side === 'left' ? '.library' : '.inspector');
      if (!container?.contains(document.activeElement) && !pointerDown.current) setPeek(p => ({ ...p, [side]: false }));
    }, 350);
  };
  const compactWorkspace = viewportWidth <= 560;
  const libraryOpen = prefs.left.mode === 'pinned', inspectorOpen = compactWorkspace ? mobileInspectorOpen : prefs.right.mode === 'pinned';
  const setLibraryOpen = (open: boolean) => mode('left', open ? 'pinned' : 'collapsed');
  const setInspectorOpen = (open: boolean) => { if (compactWorkspace) setMobileInspectorOpen(open); else mode('right', open ? 'pinned' : 'collapsed'); };
  const limitWidth = (width: number) => Math.min(width, Math.max(160, Math.floor((viewportWidth - 300) / 2)));
  const libraryWidth = limitWidth(prefs.left.width), inspectorWidth = limitWidth(prefs.right.width);
  const setLibraryWidth = (width: number) => setPrefs(p => ({ ...p, left: { ...p.left, width } }));
  const setInspectorWidth = (width: number) => setPrefs(p => ({ ...p, right: { ...p.right, width } }));

  const workspaceRef = useRef<HTMLDivElement>(null);
  const resizeSidebar = (side: 'left' | 'right', event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return; event.preventDefault();
    const target = event.currentTarget, start = event.clientX, initial = side === 'left' ? libraryWidth : inspectorWidth, initialStored = prefs[side].width;
    target.setPointerCapture(event.pointerId);
    let collapse = false;
    const move = (e: PointerEvent) => {
      const raw = initial + (side === 'left' ? 1 : -1) * (e.clientX - start); collapse = raw < 120;
      const available = workspaceRef.current?.clientWidth ?? 850;
      const other = side === 'left' ? (inspectorOpen ? inspectorWidth : 0) + 50 : 44 + (libraryOpen && prefs.openedModules.length ? libraryWidth + 6 : 0);
      const limit = Math.max(side === 'left' ? 160 : 240, available - other - 350);
      const value = Math.round(Math.max(side === 'left' ? 160 : 240, Math.min(limit, initial + (side === 'left' ? 1 : -1) * (e.clientX - start))));
      if (!collapse) { if (side === 'left') setLibraryWidth(value); else setInspectorWidth(value); }
    };
    const end = () => {
      if (collapse) { if (side === 'left') setLibraryWidth(initialStored); else setInspectorWidth(initialStored); mode(side, 'collapsed'); }
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end);
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  };
  const [message, setMessage] = useState({ text: '设计自动保存到本机 · 建议定期导出 JSON 备份', error: false });
  const fileRef = useRef<HTMLInputElement>(null), layersRef = useRef<HTMLDivElement>(null);
  const importSequence = useRef(0);
  const moveLayer = (direction: 'up' | 'down' | 'first' | 'last') => {
    const buttons = [...(layersRef.current?.querySelectorAll<HTMLButtonElement>('.layer') ?? [])];
    if (!buttons.length) return;
    const focused = document.activeElement as HTMLElement | null;
    const focusedLayer = focused?.closest('.layer-row')?.querySelector<HTMLButtonElement>('.layer') ?? focused;
    const index = buttons.indexOf(focusedLayer as HTMLButtonElement);
    const next = direction === 'first' ? 0 : direction === 'last' ? buttons.length - 1
      : direction === 'up' ? Math.max(0, (index < 0 ? 0 : index) - 1)
      : Math.min(buttons.length - 1, (index < 0 ? -1 : index) + 1);
    buttons[next]?.focus();
    buttons[next]?.click();
  };
  const notify = (text: string, error = false) => setMessage({ text, error });
  useEffect(() => {
    let active = true;
    if (!resourceRestore.current) resourceRestore.current = (async () => {
      await resources.restoreSelection(await previewAssets.readResources());
    })();
    void resourceRestore.current.then(() => {
      if (active) setResourceGeneration(value => value + 1);
    }).catch(error => {
      if (active) notify(`本机资源包恢复失败：${(error as Error).message}；可重新选择资源包`, true);
    });
    void fontSession.restore().catch(error => { if (active) notify(`本机字体恢复失败：${(error as Error).message}`, true); });
    return () => { active = false; };
  }, [resources]);
  const enterRowTemplate = (id: string) => {
    const node = currentScreen(editorStore.getState()).nodes.find(item => item.id === id);
    if (node?.type !== 'minecraft:repeatable-list') return;
    setTemplateEditingId(id);
    setContainerScroll(previous => ({ ...previous, [id]: 0 }));
    editorStore.getState().select(id);
  };
  const exitRowTemplate = () => {
    const id = templateEditingId;
    setTemplateEditingId(null);
    if (id) editorStore.getState().select(id);
  };
  const addComponent = (type: NodeType, position?: { x: number; y: number }, containerDrop?: ContainerDrop) => {
    try {
      const editor = editorStore.getState(); let target = containerDrop, addPosition = position;
      if (templateEditingId) {
        const active = currentScreen(editor), root = active.nodes.find(node => node.id === templateEditingId);
        if (!root || !isRepeatableListNode(root)) throw new Error('Row Template 已不存在，请退出模板编辑');
        if (!isRepeatableChildType(type)) throw new Error(repeatableChildRejection(type) ?? 'Row Template 首版只接受普通叶子控件');
        if (!addPosition) {
          const absolute = nodeAbsoluteBounds(root, active.nodes, containerScroll), viewport = containerLocalViewport(root);
          addPosition = { x: absolute.x + viewport.x + viewport.w / 2, y: absolute.y + viewport.y + viewport.h / 2 };
        }
        target = { parentContainerId: templateEditingId, scrollOffsets: containerScroll, appendAtEnd: false };
      }
      if (!target && !addPosition && (isScrollableChildType(type) || isRepeatableChildType(type))) {
        const active = currentScreen(editor), selected = active.nodes.find(node => node.id === editor.selected);
        const candidate = selected && isRepeatableListNode(selected) ? selected
          : selected && isCollapsiblePanelNode(selected) ? selected
          : selected?.parentContainerId ? active.nodes.find(node => node.id === selected.parentContainerId) : undefined;
        if (candidate && (isRepeatableListNode(candidate) || isCollapsiblePanelNode(candidate))) {
          const absolute = nodeAbsoluteBounds(candidate, active.nodes, containerScroll), viewport = containerLocalViewport(candidate);
          addPosition = isRepeatableListNode(candidate)
            ? { x: absolute.x + viewport.x + 8, y: absolute.y + viewport.y + 4 }
            : { x: absolute.x + viewport.x + viewport.w / 2, y: absolute.y + viewport.y + viewport.h / 2 };
          target = { parentContainerId: candidate.id, scrollOffsets: containerScroll, appendAtEnd: !isRepeatableListNode(candidate) };
        }
      }
      editor.add(type, addPosition, target);
    }
    catch (error) { notify(`无法添加组件：${(error as Error).message}`, true); }
  };
  const exports = useExports(notify, resources, layerContext.pages);
  const revision = state.doc.project.revision;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (blocklyMode) return;
      const target = e.target as HTMLElement;
      if (designMode && !preview && !behaviorMode && !behaviorPreview && !e.altKey && !e.shiftKey && (e.ctrlKey || e.metaKey) && ['c', 'v'].includes(e.key.toLowerCase()) && !target?.closest('input,textarea,select,[contenteditable]') && !window.getSelection()?.toString()) {
        const editor = editorStore.getState();
        if (editor.blocked || editor.gesture) return;
        e.preventDefault();
        try {
          if (e.key.toLowerCase() === 'c') {
            if (editor.copySelected()) notify('控件已复制，Ctrl+V 粘贴。属性与子控件保留，F2 规则和 Bake 分组不复制');
          } else editor.pasteCopied(Object.values(layerContext.pages));
        } catch (error) { notify((error as Error).message, true); }
        return;
      }
      if ((e.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable]')) return;
      const s = editorStore.getState();
      if (preview || behaviorMode || behaviorPreview || s.blocked) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); try { confirmDeleteSelected(); } catch (error) { notify((error as Error).message, true); } }
      else if (e.key.startsWith('Arrow') && s.selected && !s.gesture) {
        e.preventDefault(); const delta = e.shiftKey ? 10 : 1;
        try { s.updateNode(s.selected, n => ({ ...n, bounds: { ...n.bounds, x: n.bounds.x + (e.key === 'ArrowRight' ? delta : e.key === 'ArrowLeft' ? -delta : 0), y: n.bounds.y + (e.key === 'ArrowDown' ? delta : e.key === 'ArrowUp' ? -delta : 0) } })); }
        catch (error) { notify((error as Error).message, true); }
      }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [preview, behaviorMode, behaviorPreview, blocklyMode, designMode, layerContext.key]);

  const saveBlob = (json: string, filename: string, done: string) => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); notify(done);
  };
  const download = () => {
    try {
      const snapshot = captureExport();
      saveBlob(snapshot.projectJson, exportFilename(snapshot.document.project.name, 'project'), 'JSON 已导出');
    } catch (error) { notify((error as Error).message, true); }
  };
  const downloadCommitted = () => {
    try {
      saveBlob(JSON.stringify(state.doc, null, 2) + '\n', exportFilename(state.doc.project.name, 'project'), '已下载当前已提交 JSON 备份');
    } catch (error) { notify((error as Error).message, true); }
  };
  const toggleBehavior = () => {
    setBehaviorOpen(!behaviorOpen);
  };
  const toggleInteractionPreview = () => {
    if (blocklyMode) { notify('请先切回 GUI 设计模式，再开启交互预览', true); return; }
    if (!interaction && behaviorDraftDirty.current) { notify('行为面板有未保存草稿，请先保存或取消编辑', true); return; }
    setNumericPreviewEpoch(epoch => epoch + 1);
    if (interaction) {
      setInteraction(false); setBehaviorPreview(null); setBehaviorMode(false);
      const s = editorStore.getState(), id = behaviorStartScreen.current;
      if (id && s.currentScreenId !== id && s.doc.screens.some(item => item.id === id)) {
        behaviorNavigation.current = 'reset'; editorStore.getState().switchScreen(id);
      }
      behaviorStartScreen.current = null;
      return;
    }
    const s = editorStore.getState(); behaviorStartScreen.current = s.currentScreenId;
    setInteraction(true); setBehaviorPreview(initialControlState(currentScreen(editorStore.getState()))); setBehaviorMode(true);
    if (s.doc.entryScreenId && s.doc.entryScreenId !== s.currentScreenId) { behaviorNavigation.current = 'navigate'; s.switchScreen(s.doc.entryScreenId); }
  };

  if (state.blocked === '正在读取本地副本') return <main className="loading-local">正在读取本地副本…</main>;
  return <div className="app-shell" style={{ '--inspector-width': `${inspectorOpen ? inspectorWidth : 0}px` } as CSSProperties}>
    <header className="app-header">
      <div className="brand"><span className="brand-mark" aria-hidden="true">▧</span><h1>Minecraft <strong>GUI Maker</strong></h1></div>
      <nav ref={editorMenuRef} className="editor-menu" aria-label="编辑器菜单" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); const active = (e.target as HTMLElement).closest('details'); e.currentTarget.querySelectorAll('details[open]').forEach(item => item.removeAttribute('open')); active?.querySelector('summary')?.focus(); } }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.querySelectorAll('details[open]').forEach(item => item.removeAttribute('open')); }} onClick={e => {
        const target = e.target as HTMLElement;
        if (target.closest('button')) e.currentTarget.querySelectorAll('details[open]').forEach(item => item.removeAttribute('open'));
        else if (target.closest('summary')) { const active = target.closest('details'); active?.parentElement?.querySelectorAll(':scope > details[open]').forEach(item => { if (item !== active) item.removeAttribute('open'); }); }
      }}>
        <details><summary>文件</summary><div>
          <button disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview} onClick={async () => { try { captureExport(); await localSession.createProject(); setBehaviorMode(false); setBehaviorPreview(null); setBehaviorOpen(false); setInteraction(false); notify('已新建 GUI 项目；原项目保留为本地副本'); } catch (error) { notify(`新建失败：${(error as Error).message}`, true); } }}>新的GUI项目</button>
          <button disabled={!!state.blocked || !!state.gesture || !!preview} onClick={() => fileRef.current?.click()}>导入设计 JSON</button>
          <button disabled={!!state.gesture} onClick={download}>下载设计 JSON</button>
          <button disabled={!!state.gesture || exports.busy} onClick={() => { setExportOpen(true); void exports.generate(() => setSettingsOpen(false)); }}>生成 PNG 和单项导出</button>
          <button disabled={!!state.gesture || exports.busy} onClick={() => { setExportOpen(true); void exports.generate(() => setSettingsOpen(false), true); }}>打包 ZIP</button>
        </div></details>
        <details><summary>编辑</summary><div>
          <button disabled={!!state.blocked || !!preview || blocklyMode || (!state.past.length && !state.gesture)} onClick={state.undo}>撤销操作</button>
          <button disabled={!!state.blocked || !!preview || blocklyMode || !state.future.length || !!state.gesture} onClick={state.redo}>重做操作</button>
        </div></details>
        <details><summary>视图</summary><div>
          <details className="editor-submenu" onMouseEnter={e => { if (window.matchMedia('(min-width: 761px) and (hover: hover)').matches) e.currentTarget.open = true; }} onMouseLeave={e => { if (window.matchMedia('(min-width: 761px) and (hover: hover)').matches) e.currentTarget.open = false; }}><summary role="menuitem">资源包检查</summary><div>
            <button onClick={() => { resources.useDefault(); setResourceGeneration(n => n + 1); void previewAssets.clearResources().then(() => notify('已使用默认样式；刷新后仍使用默认样式')).catch(error => notify(`已切换默认样式，但未能清除本机资源缓存：${(error as Error).message}`, true)); }}>使用默认样式</button>
            <button onClick={() => setResourceOpenRequest(n => n + 1)}>选择已有资源包</button>
          </div></details>
          <details className="editor-submenu" onMouseEnter={e => { if (window.matchMedia('(min-width: 761px) and (hover: hover)').matches) e.currentTarget.open = true; }} onMouseLeave={e => { if (window.matchMedia('(min-width: 761px) and (hover: hover)').matches) e.currentTarget.open = false; }}><summary>字体</summary><div>
            <button onClick={() => fontSession.clear()}>使用系统字体</button>
            <button onClick={() => fontRef.current?.click()}>选择字体文件</button>
            {font.cached.map(item => <button key={item.id} onClick={() => fontSession.useCached(item.id)}>{item.name}</button>)}
          </div></details>
          <button onClick={() => mode('left', libraryOpen ? 'collapsed' : 'pinned')}>{libraryOpen ? '收起模块侧栏' : '展开模块侧栏'}</button>
          <button onClick={() => mode('right', prefs.right.mode === 'auto' ? 'pinned' : 'auto')}>右侧自动隐藏：{prefs.right.mode === 'auto' ? '开' : '关'}</button>
          <button onClick={() => setSettingsOpen(true)}>打开 GUI Scale 设置</button>
          <button disabled={!!preview} onClick={() => setGrid({ ...grid, visible: !grid.visible })}>切换网格</button>
          <button aria-pressed={prefs.smartGuides} onClick={() => setPrefs(p => ({ ...p, smartGuides: !p.smartGuides }))}>智能参考线：{prefs.smartGuides ? '开' : '关'}</button>
          <button aria-pressed={prefs.smartSnap} onClick={() => setPrefs(p => ({ ...p, smartSnap: !p.smartSnap }))}>智能吸附：{prefs.smartSnap ? '开' : '关'}</button>
          <button aria-pressed={themeMode === 'light'} onClick={() => setThemeMode('light')}>主题：浅色</button>
          <button aria-pressed={themeMode === 'dark'} onClick={() => setThemeMode('dark')}>主题：深色</button>
          <button aria-pressed={themeMode === 'system'} onClick={() => setThemeMode('system')}>主题：跟随系统</button>
        </div></details>
        <details><summary>模式</summary><div>
          <button aria-pressed={designMode} onClick={() => { setBakeMode(false); setBlocklyMode(false); }}>切换到 GUI 设计</button>
          <button aria-pressed={blocklyMode} disabled={!!state.blocked || !!state.gesture || interaction || !!preview} onClick={() => enterBlocklyMode()}>切换到 Blockly 行为</button>
          <button onClick={toggleBehavior}>切换行为面板</button>
        </div></details>
        <details><summary>工具</summary><div>
          <button disabled={!!preview || !!state.gesture} onClick={() => setView({ ...view, tool: 'select' })}>使用选择工具</button>
          <button disabled={!!preview || !!state.gesture} onClick={() => setView({ ...view, tool: 'pan' })}>使用平移工具</button>
          <button disabled={!!preview || !!state.gesture} onClick={() => setView({ zoom: 2, panX: 0, panY: 0, tool: 'select' })}>重置画布视图</button>
        </div></details>
        <details><summary>帮助</summary><div><p>滚轮缩放、右键平移。Ctrl+Z 撤销，Ctrl+Shift+Z 重做。设计 JSON 是权威数据。</p></div></details>
      </nav>
      <div className="document-bar" title={`已提交版本 revision ${revision}`}>
        <div className="project-field"><ProjectName notify={notify} disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview}/></div>
        <span className="revision-chip" title="当前已提交文档 revision">REV {revision}</span>
        <LocalSavePanel notify={notify} onBackup={downloadCommitted} beforeOpen={requireBlocklyDraftSettled}/>
        <div className="history-actions">
          <button aria-label="撤销" title="Ctrl+Z" disabled={!!state.blocked || !!preview || blocklyMode || (!state.past.length && !state.gesture)} onClick={state.undo}>↶</button>
          <button aria-label="重做" title="Ctrl+Shift+Z" disabled={!!state.blocked || !!preview || blocklyMode || !state.future.length || !!state.gesture} onClick={state.redo}>↷</button>
        </div>
      </div>
      <div className="header-actions">
        <div className="export-group">
          <button className="quiet" aria-label="导出 JSON ↗" title="下载权威设计 JSON" disabled={!!state.gesture} onClick={download}>JSON</button>
          <button className="quiet" aria-label="一键导出 ZIP" title="生成同一快照并下载 ZIP" disabled={!!state.gesture || exports.busy} onClick={() => { setExportOpen(true); void exports.generate(() => setSettingsOpen(false), true); }}>ZIP</button>
          <button className="primary" aria-label="导出规格" disabled={!!state.gesture || exports.busy} onClick={() => { setExportOpen(true); void exports.generate(() => setSettingsOpen(false)); }}>导出规格</button>
          {exports.batch && <button className={`result-link ${exportOpen ? 'is-hidden' : ''}`} tabIndex={exportOpen ? -1 : 0} onClick={() => { setSettingsOpen(false); setExportOpen(true); }}>查看导出结果</button>}
        </div>
        <button type="button" className="quiet" aria-label="模板库" title="个人模板库：保存并复用控件组合" disabled={!!state.gesture || !!preview || !!behaviorPreview} onClick={() => setTemplatesOpen(true)}>模板</button>
        <button type="button" className="theme-shortcut" aria-label="切换主题" aria-pressed={theme === 'dark'} title={`当前：${theme === 'dark' ? '深色' : '浅色'}${themeMode === 'system' ? '（跟随系统）' : ''} · 切换为${theme === 'dark' ? '浅色' : '深色'}`} onClick={() => setThemeMode(theme === 'dark' ? 'light' : 'dark')}><span aria-hidden="true">{theme === 'dark' ? '☾' : '☀'}</span></button>
      </div>
      <input ref={fileRef} type="file" aria-label="导入项目文件" accept=".json,application/json" hidden disabled={!!state.blocked || !!state.gesture || !!preview} onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        const sequence = ++importSequence.current;
        try {
          if (file.size > MAX_JSON_BYTES) throw new Error('文件超过 5 MiB 上限');
          const text = await file.text(); if (sequence !== importSequence.current) return;
          try { requireBlocklyDraftSettled(); } catch (error) { notify((error as Error).message, true); return; }
          editorStore.getState().importJson(text); setImportError(null); notify('导入成功 · 创建新本地副本，可用撤销恢复导入前设计');
        } catch (error) {
          if (sequence !== importSequence.current) return;
          const message = (error as Error).message;
          setImportError({ fileName: file.name, size: file.size, message });
          notify(`导入失败：${message}`, true);
        }
      }}/>
      <input ref={fontRef} aria-label="选择预览字体" hidden type="file" accept=".ttf,.otf,.woff,.woff2" onChange={e => {
        const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void fontSession.select(file);
      }}/>
    </header>

    <div className={`context-bar ${activeBlockly ? 'blockly-context-bar' : ''}`}>
      <div className="workspace-mode-switch" role="group" aria-label="工作模式">
        <button type="button" aria-label="GUI 设计模式" aria-pressed={designMode} onClick={() => { setBakeMode(false); setBlocklyMode(false); }}>GUI 设计</button>
        <button type="button" aria-label="Blockly 实验" aria-pressed={activeBlockly} disabled={!!state.blocked || !!state.gesture || interaction || !!preview} onClick={() => enterBlocklyMode()}>Blockly 行为</button>
        <button type="button" aria-label="Bake / Assets 工作区" aria-pressed={bakeMode} disabled={!!state.gesture || interaction || !!preview || !!behaviorPreview} onClick={() => { setBlocklyMode(false); setBakeMode(true); }}>Bake / Assets</button>
      </div>
      {designMode && templateEditingId && <div className="template-edit-banner" role="status" data-testid="template-edit-banner"><span>正在编辑 Row Template · <code>{templateEditingId}</code></span><button type="button" onClick={exitRowTemplate}>退出模板编辑</button></div>}
      <div ref={setBlocklyToolbarHost} className="blockly-context-tools" data-testid="blockly-context-tools" hidden={!activeBlockly}/>
      {designMode && <>
        <div className="context-group context-screen" role="group" aria-label="Screen 画布工具">
          <label className="context-screen-select"><span>画布</span><select aria-label="当前画布" value={state.currentScreenId} disabled={!!state.gesture || !!preview || !!behaviorPreview} onChange={e => { try { commitExportDrafts(); state.switchScreen(e.target.value); } catch (error) { notify((error as Error).message, true); } }}>{state.doc.screens.map(item => <option key={item.id} value={item.id}>{displayText(item.title)} · {item.id}</option>)}</select></label>
          {renamingScreen ? <form className="screen-rename-form" onSubmit={e => { e.preventDefault(); try { commitExportDrafts(); state.renameScreen(screen.id, screenName); setRenamingScreen(false); notify('画布已重命名'); } catch (error) { notify((error as Error).message, true); } }}><input autoFocus aria-label="画布名称" maxLength={128} value={screenName} onChange={e => setScreenName(e.target.value)}/><button className="screen-tool-button" type="submit" title="保存画布名称" aria-label="保存画布名称">✓</button><button className="screen-tool-button" type="button" title="取消重命名" aria-label="取消重命名" onClick={() => { setRenamingScreen(false); setScreenName(displayText(screen.title)); }}>×</button></form> : null}
        <div className="context-screen-actions">
            {interaction && screen.nodes.some(node => isStatusNode(node) && node.state.visible) && <StatusPreview key={screen.id} screenId={screen.id} nodes={screen.nodes.filter((node): node is Extract<typeof node, { type: 'minecraft:status-indicator' }> => isStatusNode(node) && node.state.visible)} values={previewStatusValues} onChange={(nodeId, statusId) => setPreviewStatusValues(values => ({ ...values, [nodeId]: statusId }))}/>}
            {!renamingScreen && <button type="button" className="screen-tool-button" aria-label="重命名画布" title="重命名当前画布" disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview} onClick={() => setRenamingScreen(true)}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 14.5V17h2.5L16.2 6.3l-2.5-2.5L3 14.5Z"/><path d="m12.8 4.7 2.5 2.5"/></svg></button>}
            <button type="button" className="screen-tool-button" aria-label="新增画布" title="新增 Screen 画布" disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview || behaviorMode} onClick={() => { try { commitExportDrafts(); state.addScreen(); setView(v => ({ ...v, zoom: Math.min(v.zoom, 0.5), panX: 0, panY: 0 })); notify('已新增 Screen 画布'); } catch (error) { notify((error as Error).message, true); } }}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 3v14M3 10h14"/></svg></button>
            <button type="button" className="screen-tool-button screen-delete-button" aria-label="删除当前画布" title="确认删除当前 Screen 并清理相关绑定" disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview || behaviorMode || state.doc.screens.length <= 1} onClick={() => { try { if (!confirmDeleteScreen(screen.id)) return; setScreenPositions(previous => { const next = { ...previous }; delete next[screen.id]; return next; }); notify('Screen 画布及关联行为已删除，可撤销'); } catch (error) { notify((error as Error).message, true); } }}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.7 11h7.6l.7-11M8 8v5.5M12 8v5.5"/></svg></button>
          </div>
        </div>
      <div className="context-group context-left">
        <button className="tool-button" aria-label="选择工具" aria-pressed={view.tool === 'select'} onClick={() => setView({ ...view, tool: 'select' })}>选择</button>
        <button className="tool-button" aria-label="平移工具" aria-pressed={view.tool === 'pan'} onClick={() => setView({ ...view, tool: 'pan' })}>平移</button>
        <span className="context-divider" aria-hidden="true"/>
        <label className="grid-check"><input type="checkbox" aria-label="显示网格" disabled={!!preview} checked={grid.visible} onChange={e => setGrid({ ...grid, visible: e.target.checked })}/>网格</label>
        <span className="context-divider" aria-hidden="true"/>
        <label className="inline-field">Zoom <select aria-label="Zoom" title="画布内滚轮缩放，右键拖动平移" disabled={!!state.gesture || !!preview} value={view.zoom} onChange={e => setView({ ...view, zoom: Number(e.target.value) })}>
          {![0.25, 0.5, 1, 2, 4, 8, 16].includes(view.zoom) && <option value={view.zoom}>{Math.round(view.zoom * 100)}%</option>}
          {[0.25, 0.5, 1, 2, 4, 8, 16].map(z => <option key={z} value={z}>{z * 100}%</option>)}
        </select></label>
        <button className="icon-button" aria-label="重置视图" title="重置画布视图" disabled={!!state.gesture || !!preview} onClick={() => setView({ zoom: 2, panX: 0, panY: 0, tool: 'select' })}>⌖</button>
      </div>
      </>}
      <div className="context-group context-right" hidden={bakeMode}>
        <WorkspaceSettingsPopover blockly={activeBlockly}>
          {designMode && <div className="precise-view-fields">
        <label className="inline-field">间距 <input type="number" aria-label="网格间距" min="1" max="200" step="1" disabled={!!preview} aria-invalid={!gridValid} title="网格间距：1～200 GUI 逻辑像素" value={gridDraft} onChange={e => {
          const value = e.target.value; setGridDraft(value); const n = Number(value);
          if (/^\d+$/.test(value) && n >= 1 && n <= 200) setGrid({ ...grid, spacing: n });
        }} onBlur={() => { if (!gridValid) setGridDraft(String(grid.spacing)); }}/></label>
        <label className="inline-field">Pan X <input type="number" aria-label="Pan X" disabled={!!state.gesture || !!preview} value={view.panX} onChange={e => setView({ ...view, panX: Number(e.target.value) })}/></label>
        <label className="inline-field">Y <input type="number" aria-label="Pan Y" disabled={!!state.gesture || !!preview} value={view.panY} onChange={e => setView({ ...view, panY: Number(e.target.value) })}/></label>
          </div>}
          <div className="preview-font-fields">
        <small className="font-status" aria-live="polite" data-testid="font-status">{font.status}</small>
        <div className="context-font" ref={fontMenuRef}>
          <button className="context-action" aria-label="字体选择" aria-expanded={fontMenuOpen} aria-controls="context-font-menu" onClick={() => setFontMenuOpen(!fontMenuOpen)}>字体 ▾</button>
          <div id="context-font-menu" className="context-font-menu" hidden={!fontMenuOpen}>
            <button onClick={() => { fontSession.clear(); setFontMenuOpen(false); }}>使用系统字体</button>
            <button onClick={() => { setFontMenuOpen(false); fontRef.current?.click(); }}>选择字体文件</button>
            {font.cached.map(item => <button key={item.id} onClick={() => { fontSession.useCached(item.id); setFontMenuOpen(false); }}>{item.name}</button>)}
          </div>
        </div>
          </div>
        </WorkspaceSettingsPopover>
        <ResourceTestPanel manager={resources} hideTrigger={!designMode} openRequest={resourceOpenRequest} onChange={() => setResourceGeneration(n => n + 1)}/>
        {designMode && <button className="context-action" aria-label="交互预览" aria-pressed={interaction} disabled={!!preview || !!state.gesture} onClick={toggleInteractionPreview}>交互预览{interaction ? ' · 运行中' : ''}</button>}
        <ScreenSettings preview={preview} setPreview={setPreview} notify={notify} open={settingsOpen} setOpen={setSettingsOpen}/>
        <button className="behavior-toggle" aria-label="行为" aria-expanded={behaviorOpen} aria-pressed={behaviorOpen} onClick={toggleBehavior}>行为</button>

      </div>
    </div>

    <div ref={workspaceRef} style={{ '--library-width': `${44 + (libraryOpen && prefs.openedModules.length ? libraryWidth + 6 : 0)}px`, '--inspector-width': inspectorOpen ? `${inspectorWidth}px` : '0px', '--left-float-width': `${libraryWidth}px`, '--right-float-width': `${inspectorWidth}px`, '--tree-ratio': `${prefs.treeRatio * 100}%` } as CSSProperties} className={`workspace ${activeBlockly || bakeMode ? 'blockly-mode' : ''} ${bakeMode ? 'bake-mode' : ''} ${libraryOpen ? '' : 'library-collapsed'} ${inspectorOpen ? '' : 'inspector-collapsed'} ${!compactWorkspace && prefs.right.mode !== 'pinned' ? 'auto-right' : ''} ${peek.left ? 'peek-left' : ''} ${peek.right ? 'peek-right' : ''}`}>
      <HybridSidebar prefs={prefs} setPrefs={setPrefs} open={libraryOpen} setOpen={setLibraryOpen} width={libraryWidth} blocked={!!state.gesture} hidden={!designMode} reveal={behaviorReveal} selectedNodeId={selectedLayerNode && layerMask.pageActive(selectedLayerNode) ? selectedLayerNode.id : null} onResize={event => resizeSidebar('left', event)}>{{
        screens: <>          <label className="entry-screen-field">项目入口<select aria-label="项目入口 Screen" disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview} value={state.doc.entryScreenId ?? ''} onChange={e => { if (!e.target.value) return; try { commitExportDrafts(); state.setEntryScreen(e.target.value); notify('项目入口已更新'); } catch (error) { notify((error as Error).message, true); } }}><option value="" disabled>选择项目入口…</option>{state.doc.screens.map(item => <option key={item.id} value={item.id}>{displayText(item.title)} · {item.id}</option>)}</select></label><div className="hybrid-screen-list">{state.doc.screens.map(item => <button type="button" key={item.id} aria-label={`切换 Screen ${item.id}`} aria-pressed={item.id === state.currentScreenId} disabled={!!state.gesture || !!preview || !!behaviorPreview} onClick={() => { try { commitExportDrafts(); state.switchScreen(item.id); } catch (error) { notify((error as Error).message, true); } }}><span>{displayText(item.title)}</span><small>{item.id} · {item.nodes.length}</small></button>)}<button type="button" aria-label="新增 Screen" disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview || behaviorMode} onClick={() => { try { commitExportDrafts(); state.addScreen(); setView(v => ({ ...v, zoom: Math.min(v.zoom, 0.5), panX: 0, panY: 0 })); notify('已新增 Screen 画布'); } catch (error) { notify((error as Error).message, true); } }}>＋ 新增 Screen</button></div></>,
        structure: <>          <div className="layers-heading"><span>项目结构 · {screen.id}</span><button type="button" disabled={!state.selected || !!behaviorPreview} onClick={() => setBehaviorOpen(true)}>查看关联行为</button><span>{screen.nodes.length}</span></div>

          <EditorLayerControls view={layerView} disabled={!!behaviorPreview || !!preview || !!state.blocked} onChange={updateLayerView}/><div className="layers" ref={layersRef} onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); moveLayer('down'); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); moveLayer('up'); }
            else if (e.key === 'Home') { e.preventDefault(); moveLayer('first'); }
            else if (e.key === 'End') { e.preventDefault(); moveLayer('last'); }
          }}><EditorLayerTree focusRootId={templateEditingId ?? undefined} screen={screen} selected={state.selected} bindings={behaviorBindings} view={layerView} mask={layerMask} disabled={!!behaviorPreview || !!preview || !!state.blocked} onSelect={state.select} onChange={updateLayerView}/></div>
</>,
        components: <>          <div className="component-list">{NODE_TYPES.map(type => <Fragment key={type}>{type === 'native_region' && <h3 className="section-title">Native Regions</h3>}{type === 'minecraft:scrollable-panel' && <h3 className="section-title">Widgets</h3>}<button className="component-card" disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview || screen.nodes.length >= 1000}
            aria-label={`添加 ${CATALOG[type].label}`} draggable={!state.gesture && !behaviorPreview} onDragStart={e => { pointerDown.current = true; e.dataTransfer.setData('application/x-minecraft-gui-component', type); }} onClick={() => addComponent(type)}>
            <span className="component-glyph" aria-hidden="true">{CATALOG[type].glyph}</span><span><strong>{CATALOG[type].label}</strong><small>{CATALOG[type].subtitle}</small></span>
          </button></Fragment>)}</div></>,
        behavior: <BehaviorPanel key={state.currentScreenId} preview={behaviorPreview} setPreview={setBehaviorPreview} mode={behaviorMode} setMode={setBehaviorMode} canClick={!preview} triggerRef={behaviorTrigger} sliderTriggerRef={sliderBehaviorTrigger} selectionTriggerRef={selectionBehaviorTrigger}
          onOpenScreen={id => { setNumericPreviewEpoch(epoch => epoch + 1); if (editorStore.getState().currentScreenId !== id) { behaviorNavigation.current = 'navigate'; editorStore.getState().switchScreen(id); } setBehaviorPreview(initialControlState(currentScreen(editorStore.getState()))); setBehaviorMode(true); }} onOpenBlocklyRule={id => enterBlocklyMode(id)} onDraftChange={dirty => { behaviorDraftDirty.current = dirty; }}
          onResetPreview={() => { setNumericPreviewEpoch(epoch => epoch + 1); setInteraction(false); setBehaviorPreview(null); setBehaviorMode(false); const s = editorStore.getState(), id = s.doc.entryScreenId; behaviorStartScreen.current = null; if (id && s.doc.screens.some(item => item.id === id) && s.currentScreenId !== id) { behaviorNavigation.current = 'reset'; s.switchScreen(id); } }}
          close={() => setBehaviorOpen(false)} notify={notify}/>,
      }}</HybridSidebar>
      {designMode && <>
      <Inspector templateEditingId={templateEditingId} onEnterTemplate={enterRowTemplate} onExitTemplate={exitRowTemplate} containerScroll={containerScroll} repeatPreviewRows={repeatPreviewRows} setRepeatPreviewRows={setRepeatPreviewRows} key={state.currentScreenId} editTabs={editTabs} setEditTabs={setEditTabs} notify={notify} readOnly={!!preview || !!state.blocked || !!behaviorPreview} onOpenBake={() => setBakeMode(true)} onMouseEnter={() => showPeek('right')} onMouseLeave={() => hidePeek('right')} onPin={prefs.right.mode !== 'pinned' && peek.right ? () => mode('right', 'pinned') : undefined} emptyControls={null}/>
      <main className="studio">
            <Canvas templateEditingId={templateEditingId} editorLayers={layerView} containerScroll={containerScroll} setContainerScroll={setContainerScroll} repeatPreviewRows={repeatPreviewRows} onEditError={message => notify(message, true)} onAddNode={addComponent} numericPreviewEpoch={numericPreviewEpoch} statusValues={previewStatusValues} screenPositions={screenPositions} setScreenPositions={setScreenPositions} onSelectScreen={id => { try { commitExportDrafts(); editorStore.getState().switchScreen(id); } catch (error) { notify((error as Error).message, true); } }} interaction={interaction} view={view} setView={setView} preview={preview} readOnly={!!state.blocked || !!behaviorPreview} behaviorPreview={behaviorPreview} behaviorMode={behaviorMode} editTabs={editTabs} onBehaviorTrigger={id => behaviorTrigger.current?.(id)} onBehaviorSliderChange={event => sliderBehaviorTrigger.current?.(event)} onBehaviorSelectionChange={event => selectionBehaviorTrigger.current?.(event)} grid={grid} alignment={{ guides: prefs.smartGuides, snap: prefs.smartSnap }} resources={resources} resourceGeneration={resourceGeneration} font={font} theme={theme}/>
        {inspectorOpen && <div className="sidebar-resizer sidebar-resizer-right" role="separator" aria-label="调整属性栏宽度" onPointerDown={e => resizeSidebar('right', e)}/>}
        <button onMouseEnter={() => showPeek('right')} onMouseLeave={() => hidePeek('right')} className="sidebar-toggle sidebar-toggle-right" aria-label={inspectorOpen ? '收起属性栏' : '展开属性栏'} title={inspectorOpen ? '收起属性栏' : '展开属性栏'} aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(!inspectorOpen)}>{inspectorOpen ? '›' : '‹'}</button>
        <div className="studio-footer"><span><i/> {screen.nodes.length} COMPONENTS</span><span data-testid="history-count">{state.past.length} undo / {state.future.length} redo</span><span>INTEGER COORDINATES · GUI px</span></div>
      </main>
      </>}
      {blocklyMounted && <Suspense fallback={<div role="status">正在加载 Blockly 工作区…</div>}><BlocklyBehaviorEditor toolbarHost={blocklyToolbarHost} theme={theme} beforeScreenChange={requireBehaviorDraftSettled} active={activeBlockly} openRuleId={blocklyRuleId} setMode={setBlocklyMode} notify={notify} onDirtyChange={dirty => { blocklyDraftDirty.current = dirty; }}/></Suspense>}
      <section className="bake-workspace" aria-label="Bake Workspace" hidden={!bakeMode}><header><div><h2>Bake</h2><p>管理当前 Screen 的 Static Bake Groups，以及项目级 Localization 语言资源。</p></div><label>当前 Screen <select aria-label="Bake 当前 Screen" value={screen.id} disabled={!!state.gesture} onChange={event => { try { commitExportDrafts(); editorStore.getState().switchScreen(event.target.value); } catch (error) { notify((error as Error).message, true); } }}>{state.doc.screens.map(item => <option key={item.id} value={item.id}>{displayText(item.title)} · {item.id}</option>)}</select></label></header><BakePanel workspace screen={screen} disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview} notify={notify}/><LocalizationPanel disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview} notify={notify}/></section>
      <details className="json-preview" hidden={!designMode}><summary>项目 JSON <span>只读 / 当前已提交文档</span></summary><pre data-testid="project-json">{JSON.stringify(state.doc, null, 2)}</pre></details>
      {exportOpen && <ExportPanel {...exports} resourceRevision={resources.revision} onClose={() => setExportOpen(false)} currentJson={JSON.stringify(state.doc, null, 2) + '\n'}/>}
      <TemplatesPanel open={templatesOpen} onClose={() => setTemplatesOpen(false)} notify={notify} templateEditingId={templateEditingId} pageIds={Object.values(layerContext.pages)}/>
    </div>

    <footer className={`statusbar ${message.error ? 'error' : ''}`}>
      <div role={message.error ? 'alert' : 'status'} title={message.text}>{message.text}</div>
      <span className="status-meta">{screen.designSize.width} × {screen.designSize.height} GUI px · 编辑缩放 {Math.round(view.zoom * 100)}% · 资源 {resources.baseName ?? '中性预览'}{resources.overlayName ? ` · 覆盖：${resources.overlayName}` : ''}</span>
      <span className="status-target" title={`Minecraft 1.21.1 / NeoForge 21.1.244 · Java 21 · Schema ${state.doc.schemaVersion}`}>1.21.1 / NeoForge 21.1.244 <b>·</b> Java 21 <b>·</b> Schema {state.doc.schemaVersion}</span>
    </footer>
    {importError && <ImportErrorDialog failure={importError} onClose={() => setImportError(null)} onChoose={() => { setImportError(null); fileRef.current?.click(); }}/>}
  </div>;
}
