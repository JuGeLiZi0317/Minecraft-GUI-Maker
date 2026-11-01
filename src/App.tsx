import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import { CATALOG, NODE_TYPES } from './domain/catalog';
import { displayText } from './domain/model';
import { MAX_JSON_BYTES } from './domain/schema';
import { currentScreen, editorStore } from './editor/store';
import { commitExportDrafts } from './exports/draftBarrier';
import { Canvas, type View } from './canvas/Canvas';
import { Inspector, ProjectName } from './ui/Inspector';
import { ScreenSettings } from './ui/ScreenSettings';
import type { GuiScalePreview } from './domain/guiScale';
import { LocalSavePanel } from './ui/LocalSavePanel';
import { captureExport, useExports } from './exports/useExports';
import { ExportPanel } from './ui/ExportPanel';
import { ResourceTestPanel } from './ui/ResourceTestPanel';
import { LayeredResources } from './resources/layered';
import { fontSession } from './render/previewFont';
import { exportFilename } from './exports/filenames';
import { loadWorkspace, saveWorkspace, type SidebarMode } from './ui/workspacePreferences';
import { localSession } from './io/localSession';
import { BehaviorPanel, type BehaviorPreview } from './ui/BehaviorPanel';
import { useDismissOutside } from './ui/useDismissOutside';
import { ImportErrorDialog, type ImportFailure } from './ui/ImportErrorDialog';

const THEME_KEY = 'minecraft-gui-maker.theme.v1';
const loadTheme = (): 'dark' | 'light' => {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
};

export function App() {
  const state = useStore(editorStore);
  const screen = currentScreen(state);
  const [screenName, setScreenName] = useState(() => displayText(screen.title));
  const [renamingScreen, setRenamingScreen] = useState(false);
  useEffect(() => { setScreenName(displayText(screen.title)); }, [screen.id, screen.title]);
  useEffect(() => { setRenamingScreen(false); }, [screen.id]);
  const font = useSyncExternalStore(fontSession.subscribe, fontSession.get);
  const [resources] = useState(() => new LayeredResources()), [resourceGeneration, setResourceGeneration] = useState(0);
  const [view, setView] = useState<View>({ zoom: 2, panX: 0, panY: 0, tool: 'select' });
  const [grid, setGrid] = useState({ visible: false, spacing: 10 }), [gridDraft, setGridDraft] = useState('10');
  const gridValid = /^\d+$/.test(gridDraft) && Number(gridDraft) >= 1 && Number(gridDraft) <= 200;
  const [preview, setPreview] = useState<GuiScalePreview | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interaction, setInteraction] = useState(false), [resourceOpenRequest, setResourceOpenRequest] = useState(0);
  const [numericPreviewEpoch, setNumericPreviewEpoch] = useState(0);
  const fontRef = useRef<HTMLInputElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  useDismissOutside(fontMenuRef, fontMenuOpen, () => setFontMenuOpen(false));
  useEffect(() => { setInteraction(false); setBehaviorPreview(null); setBehaviorMode(false); behaviorStartScreen.current = null; }, [state.doc]);
  const [exportOpen, setExportOpen] = useState(false);
  const [behaviorOpen, setBehaviorOpen] = useState(false), [behaviorPreview, setBehaviorPreview] = useState<BehaviorPreview | null>(null);
  const [editTabs, setEditTabs] = useState<Record<string, string>>({});
  const [screenPositions, setScreenPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [behaviorMode, setBehaviorMode] = useState(false), behaviorTrigger = useRef<((id: string) => void) | null>(null);
  const behaviorStartScreen = useRef<string | null>(null), behaviorNavigation = useRef<'navigate' | 'reset' | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(loadTheme);
  const [importError, setImportError] = useState<ImportFailure | null>(null);
  useEffect(() => { if (behaviorMode || behaviorPreview || preview) setEditTabs({}); }, [behaviorMode, behaviorPreview, preview]);
  useEffect(() => {
    setEditTabs({}); setInteraction(false); setPreview(null);
    if (behaviorNavigation.current) {
      const transition = behaviorNavigation.current; behaviorNavigation.current = null;
      if (transition === 'navigate') { setInteraction(true); setBehaviorPreview({}); setBehaviorMode(true); }
      else { setBehaviorPreview(null); setBehaviorMode(false); }
      return;
    }
    behaviorStartScreen.current = null; setBehaviorPreview(null); setBehaviorMode(false);
  }, [state.currentScreenId]);
  useEffect(() => { if (state.operation !== 'edit') { setEditTabs({}); setScreenPositions({}); } }, [state.doc, state.operation]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* theme is a preference, never blocks editing */ }
  }, [theme]);
  const [prefs, setPrefs] = useState(loadWorkspace), [peek, setPeek] = useState({ left: false, right: false });
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth), pointerDown = useRef(false), hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const libraryOpen = prefs.left.mode === 'pinned', inspectorOpen = prefs.right.mode === 'pinned';
  const setLibraryOpen = (open: boolean) => mode('left', open ? 'pinned' : 'collapsed');
  const setInspectorOpen = (open: boolean) => mode('right', open ? 'pinned' : 'collapsed');
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
      const other = side === 'left' ? (inspectorOpen ? inspectorWidth : 0) : (libraryOpen ? libraryWidth : 0);
      const limit = Math.max(side === 'left' ? 160 : 240, available - other - 400);
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
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = direction === 'first' ? 0 : direction === 'last' ? buttons.length - 1
      : direction === 'up' ? Math.max(0, (index < 0 ? 0 : index) - 1)
      : Math.min(buttons.length - 1, (index < 0 ? -1 : index) + 1);
    buttons[next]?.focus();
    buttons[next]?.click();
  };
  const notify = (text: string, error = false) => setMessage({ text, error });
  const exports = useExports(notify, resources);
  const revision = state.doc.project.revision;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable]')) return;
      const s = editorStore.getState();
      if (preview || behaviorMode || behaviorPreview || s.blocked) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); try { s.deleteSelected(); } catch (error) { notify((error as Error).message, true); } }
      else if (e.key.startsWith('Arrow') && s.selected && !s.gesture) {
        e.preventDefault(); const delta = e.shiftKey ? 10 : 1;
        try { s.updateNode(s.selected, n => ({ ...n, bounds: { ...n.bounds, x: n.bounds.x + (e.key === 'ArrowRight' ? delta : e.key === 'ArrowLeft' ? -delta : 0), y: n.bounds.y + (e.key === 'ArrowDown' ? delta : e.key === 'ArrowUp' ? -delta : 0) } })); }
        catch (error) { notify((error as Error).message, true); }
      }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [preview, behaviorMode, behaviorPreview]);

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
    setNumericPreviewEpoch(epoch => epoch + 1);
    if (interaction) {
      setInteraction(false); setBehaviorPreview(null); setBehaviorMode(false);
      const id = editorStore.getState().doc.entryScreenId;
      if (id && editorStore.getState().currentScreenId !== id && editorStore.getState().doc.screens.some(item => item.id === id)) {
        behaviorNavigation.current = 'reset'; editorStore.getState().switchScreen(id);
      }
      behaviorStartScreen.current = null;
      return;
    }
    const s = editorStore.getState(); behaviorStartScreen.current = s.currentScreenId;
    setInteraction(true); setBehaviorPreview({}); setBehaviorMode(true);
    if (s.doc.entryScreenId && s.doc.entryScreenId !== s.currentScreenId) { behaviorNavigation.current = 'navigate'; s.switchScreen(s.doc.entryScreenId); }
  };

  if (state.blocked === '正在读取本地副本') return <main className="loading-local">正在读取本地副本…</main>;
  return <div className="app-shell" style={{ '--inspector-width': `${inspectorOpen ? inspectorWidth : 0}px` } as CSSProperties}>
    <header className="app-header">
      <div className="brand"><span className="brand-mark" aria-hidden="true">▧</span><h1>Minecraft <strong>GUI Maker</strong></h1></div>
      <nav className="editor-menu" aria-label="编辑器菜单" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.querySelectorAll('details[open]').forEach(item => item.removeAttribute('open')); }} onClick={e => {
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
          <button disabled={!!state.blocked || !!preview || (!state.past.length && !state.gesture)} onClick={state.undo}>撤销操作</button>
          <button disabled={!!state.blocked || !!preview || !state.future.length || !!state.gesture} onClick={state.redo}>重做操作</button>
        </div></details>
        <details><summary>视图</summary><div>
          <details className="editor-submenu" onMouseEnter={e => { e.currentTarget.open = true; }} onMouseLeave={e => { e.currentTarget.open = false; }}><summary role="menuitem">资源包检查</summary><div>
            <button onClick={() => { resources.useDefault(); setResourceGeneration(n => n + 1); }}>使用默认样式</button>
            <button onClick={() => setResourceOpenRequest(n => n + 1)}>选择已有资源包</button>
          </div></details>
          <details className="editor-submenu" onMouseEnter={e => { e.currentTarget.open = true; }} onMouseLeave={e => { e.currentTarget.open = false; }}><summary>字体</summary><div>
            <button onClick={() => fontSession.clear()}>使用系统字体</button>
            <button onClick={() => fontRef.current?.click()}>选择字体文件</button>
            {font.cached.map(item => <button key={item.id} onClick={() => fontSession.useCached(item.id)}>{item.name}</button>)}
          </div></details>
          <button onClick={() => mode('left', prefs.left.mode === 'auto' ? 'pinned' : 'auto')}>左侧自动隐藏：{prefs.left.mode === 'auto' ? '开' : '关'}</button>
          <button onClick={() => mode('right', prefs.right.mode === 'auto' ? 'pinned' : 'auto')}>右侧自动隐藏：{prefs.right.mode === 'auto' ? '开' : '关'}</button>
          <button onClick={() => setSettingsOpen(true)}>打开 GUI Scale 设置</button>
          <button disabled={!!preview} onClick={() => setGrid({ ...grid, visible: !grid.visible })}>切换网格</button>
          <button aria-pressed={prefs.smartGuides} onClick={() => setPrefs(p => ({ ...p, smartGuides: !p.smartGuides }))}>智能参考线：{prefs.smartGuides ? '开' : '关'}</button>
          <button aria-pressed={prefs.smartSnap} onClick={() => setPrefs(p => ({ ...p, smartSnap: !p.smartSnap }))}>智能吸附：{prefs.smartSnap ? '开' : '关'}</button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '切换为亮色主题' : '切换为暗色主题'}</button>
        </div></details>
        <details><summary>模式</summary><div>
          <button onClick={toggleBehavior}>切换行为面板</button>
        </div></details>
        <details><summary>工具</summary><div>
          <button disabled={!!preview || !!state.gesture} onClick={() => setView({ ...view, tool: 'select' })}>使用选择工具</button>
          <button disabled={!!preview || !!state.gesture} onClick={() => setView({ ...view, tool: 'pan' })}>使用平移工具</button>
          <button disabled={!!preview || !!state.gesture} onClick={() => setView({ zoom: 2, panX: 0, panY: 0, tool: 'select' })}>重置画布视图</button>
        </div></details>
        <details><summary>帮助</summary><div><p>滚轮缩放、右键平移。Ctrl+Z 撤销，Ctrl+Shift+Z 重做。设计 JSON 是权威数据。</p></div></details>
      </nav>
      <div className="document-bar">
        <div className="project-field"><ProjectName notify={notify} disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview}/></div>
        <span className="revision-chip" title="当前已提交文档 revision">REV {revision}</span>
        <LocalSavePanel notify={notify} onBackup={downloadCommitted}/>
        <div className="history-actions">
          <button aria-label="撤销" title="Ctrl+Z" disabled={!!state.blocked || !!preview || (!state.past.length && !state.gesture)} onClick={state.undo}>↶</button>
          <button aria-label="重做" title="Ctrl+Shift+Z" disabled={!!state.blocked || !!preview || !state.future.length || !!state.gesture} onClick={state.redo}>↷</button>
        </div>
      </div>
      <div className="header-actions">
        <div className="export-group">
          <button className="quiet" aria-label="导出 JSON ↗" title="下载权威设计 JSON" disabled={!!state.gesture} onClick={download}>JSON</button>
          <button className="quiet" aria-label="一键导出 ZIP" title="生成同一快照并下载 ZIP" disabled={!!state.gesture || exports.busy} onClick={() => { setExportOpen(true); void exports.generate(() => setSettingsOpen(false), true); }}>ZIP</button>
          <button className="primary" aria-label="导出规格" disabled={!!state.gesture || exports.busy} onClick={() => { setExportOpen(true); void exports.generate(() => setSettingsOpen(false)); }}>导出规格</button>
          <button className={`result-link ${!exportOpen && exports.batch ? '' : 'is-hidden'}`} tabIndex={!exportOpen && exports.batch ? 0 : -1} onClick={() => { setSettingsOpen(false); setExportOpen(true); }}>查看导出结果</button>
        </div>
      </div>
      <input ref={fileRef} type="file" aria-label="导入项目文件" accept=".json,application/json" hidden disabled={!!state.blocked || !!state.gesture || !!preview} onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        const sequence = ++importSequence.current;
        try {
          if (file.size > MAX_JSON_BYTES) throw new Error('文件超过 5 MiB 上限');
          const text = await file.text(); if (sequence !== importSequence.current) return;
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

    <div className="context-bar">
      <div className="context-group context-left">
        <button className="tool-button" aria-label="选择工具" aria-pressed={view.tool === 'select'} onClick={() => setView({ ...view, tool: 'select' })}>选择</button>
        <button className="tool-button" aria-label="平移工具" aria-pressed={view.tool === 'pan'} onClick={() => setView({ ...view, tool: 'pan' })}>平移</button>
        <span className="context-divider" aria-hidden="true"/>
        <label className="grid-check"><input type="checkbox" aria-label="显示网格" disabled={!!preview} checked={grid.visible} onChange={e => setGrid({ ...grid, visible: e.target.checked })}/>网格</label>
        <label className="inline-field">间距 <input type="number" aria-label="网格间距" min="1" max="200" step="1" disabled={!!preview} aria-invalid={!gridValid} title="网格间距：1～200 GUI 逻辑像素" value={gridDraft} onChange={e => {
          const value = e.target.value; setGridDraft(value); const n = Number(value);
          if (/^\d+$/.test(value) && n >= 1 && n <= 200) setGrid({ ...grid, spacing: n });
        }} onBlur={() => { if (!gridValid) setGridDraft(String(grid.spacing)); }}/></label>
        <span className="context-divider" aria-hidden="true"/>
        <label className="inline-field">Zoom <select aria-label="Zoom" title="画布内滚轮缩放，右键拖动平移" disabled={!!state.gesture || !!preview} value={view.zoom} onChange={e => setView({ ...view, zoom: Number(e.target.value) })}>
          {![0.25, 0.5, 1, 2, 4, 8, 16].includes(view.zoom) && <option value={view.zoom}>{Math.round(view.zoom * 100)}%</option>}
          {[0.25, 0.5, 1, 2, 4, 8, 16].map(z => <option key={z} value={z}>{z * 100}%</option>)}
        </select></label>
        <label className="inline-field">Pan X <input type="number" aria-label="Pan X" disabled={!!state.gesture || !!preview} value={view.panX} onChange={e => setView({ ...view, panX: Number(e.target.value) })}/></label>
        <label className="inline-field">Y <input type="number" aria-label="Pan Y" disabled={!!state.gesture || !!preview} value={view.panY} onChange={e => setView({ ...view, panY: Number(e.target.value) })}/></label>
        <button className="icon-button" aria-label="重置视图" title="重置画布视图" disabled={!!state.gesture || !!preview} onClick={() => setView({ zoom: 2, panX: 0, panY: 0, tool: 'select' })}>⌖</button>
      </div>
      <div className="context-group context-right">
        <small className="font-status" aria-live="polite" data-testid="font-status">{font.status}</small>
        <div className="context-font" ref={fontMenuRef}>
          <button className="context-action" aria-label="字体选择" aria-expanded={fontMenuOpen} aria-controls="context-font-menu" onClick={() => setFontMenuOpen(!fontMenuOpen)}>字体 ▾</button>
          <div id="context-font-menu" className="context-font-menu" hidden={!fontMenuOpen}>
            <button onClick={() => { fontSession.clear(); setFontMenuOpen(false); }}>使用系统字体</button>
            <button onClick={() => { setFontMenuOpen(false); fontRef.current?.click(); }}>选择字体文件</button>
            {font.cached.map(item => <button key={item.id} onClick={() => { fontSession.useCached(item.id); setFontMenuOpen(false); }}>{item.name}</button>)}
          </div>
        </div>
        <ResourceTestPanel manager={resources} openRequest={resourceOpenRequest} onChange={() => setResourceGeneration(n => n + 1)}/>
        <button className="context-action" aria-label="交互预览" aria-pressed={interaction} disabled={!!preview || !!state.gesture} onClick={toggleInteractionPreview}>交互预览：{interaction ? '开' : '关'}</button>
        <ScreenSettings preview={preview} setPreview={setPreview} notify={notify} open={settingsOpen} setOpen={setSettingsOpen}/>
        <button className="behavior-toggle" aria-label="行为" aria-expanded={behaviorOpen} aria-pressed={behaviorOpen} onClick={toggleBehavior}>行为</button>
      </div>
    </div>

    <div ref={workspaceRef} style={{ '--library-width': libraryOpen ? `${libraryWidth}px` : '0px', '--inspector-width': inspectorOpen ? `${inspectorWidth}px` : '0px', '--left-float-width': `${libraryWidth}px`, '--right-float-width': `${inspectorWidth}px`, '--tree-ratio': `${prefs.treeRatio * 100}%` } as CSSProperties} className={`workspace ${libraryOpen ? '' : 'library-collapsed'} ${inspectorOpen ? '' : 'inspector-collapsed'} ${prefs.left.mode !== 'pinned' ? 'auto-left' : ''} ${prefs.right.mode !== 'pinned' ? 'auto-right' : ''} ${peek.left ? 'peek-left' : ''} ${peek.right ? 'peek-right' : ''}`}>
      <aside className="library" onMouseEnter={() => showPeek('left')} onMouseLeave={() => hidePeek('left')}>
        {prefs.left.mode !== 'pinned' && peek.left && <button className="sidebar-pin" onClick={() => mode('left', 'pinned')}>固定组件栏</button>}
        <div className={screen.nodes.length ? 'library-tree' : 'library-tree empty'}>
          <div className="layers-heading"><span>项目结构 · {screen.id}</span><span>{screen.nodes.length}</span></div>
          <label className="entry-screen-field">项目入口<select aria-label="项目入口 Screen" disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview} value={state.doc.entryScreenId ?? ''} onChange={e => { if (!e.target.value) return; try { commitExportDrafts(); state.setEntryScreen(e.target.value); notify('项目入口已更新'); } catch (error) { notify((error as Error).message, true); } }}><option value="" disabled>选择项目入口…</option>{state.doc.screens.map(item => <option key={item.id} value={item.id}>{displayText(item.title)} · {item.id}</option>)}</select></label>
          <div className="layers" ref={layersRef} onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); moveLayer('down'); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); moveLayer('up'); }
            else if (e.key === 'Home') { e.preventDefault(); moveLayer('first'); }
            else if (e.key === 'End') { e.preventDefault(); moveLayer('last'); }
          }}>{!screen.nodes.length ? <p className="muted">尚无组件</p> : [...screen.nodes].reverse().map(node => <button key={node.id} disabled={!!behaviorPreview} className={node.id === state.selected ? 'layer selected' : 'layer'} aria-label={`选择 ${node.id}`} aria-pressed={node.id === state.selected} onClick={() => state.select(node.id)}><span aria-hidden="true">{CATALOG[node.type].glyph}</span><span>{node.id}<small>{CATALOG[node.type].label}</small></span><span aria-hidden="true" title={node.state.visible ? '可见初态：显示' : '可见初态：隐藏'}>{node.state.visible ? '◦' : '–'}</span></button>)}</div>
        </div>
        <div className={`library-split ${screen.nodes.length ? '' : 'empty'}`} role="separator" aria-label="调整项目结构区域高度" onPointerDown={e => {
          if (e.button !== 0) return;
          const target = e.currentTarget, rect = target.parentElement!.getBoundingClientRect(); target.setPointerCapture(e.pointerId);
          const move = (event: PointerEvent) => setPrefs(p => ({ ...p, treeRatio: Math.min(0.8, Math.max(0.2, (event.clientY - rect.top) / rect.height)) }));
          const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); };
          target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
        }}/>
        <div className="library-palette">
          <div className="panel-heading"><span>COMPONENTS</span><span>{NODE_TYPES.length}</span></div>
          <h2>构建你的界面</h2>
          <div className="component-list">{NODE_TYPES.map(type => <button key={type} className="component-card" disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview || screen.nodes.length >= 1000}
            aria-label={`添加 ${CATALOG[type].label}`} draggable={!state.gesture && !behaviorPreview} onDragStart={e => { pointerDown.current = true; e.dataTransfer.setData('application/x-minecraft-gui-component', type); }} onClick={() => state.add(type)}>
            <span className="component-glyph" aria-hidden="true">{CATALOG[type].glyph}</span><span><strong>{CATALOG[type].label}</strong><small>{CATALOG[type].subtitle}</small></span>
          </button>)}</div>
        </div>
      </aside>
      <Inspector key={state.currentScreenId} editTabs={editTabs} setEditTabs={setEditTabs} notify={notify} readOnly={!!preview || !!state.blocked || !!behaviorPreview} onMouseEnter={() => showPeek('right')} onMouseLeave={() => hidePeek('right')} onPin={prefs.right.mode !== 'pinned' && peek.right ? () => mode('right', 'pinned') : undefined} emptyControls={null}/>
      <main className="studio">
        <div className="screen-toolbar" aria-label="Screen 画布工具">
          <label className="screen-toolbar-select"><span>画布</span><select aria-label="当前画布" value={state.currentScreenId} disabled={!!state.gesture || !!preview || !!behaviorPreview} onChange={e => { try { commitExportDrafts(); state.switchScreen(e.target.value); } catch (error) { notify((error as Error).message, true); } }}>{state.doc.screens.map(item => <option key={item.id} value={item.id}>{displayText(item.title)} · {item.id}</option>)}</select></label>
          {renamingScreen ? <form className="screen-rename-form" onSubmit={e => { e.preventDefault(); try { commitExportDrafts(); state.renameScreen(screen.id, screenName); setRenamingScreen(false); notify('画布已重命名'); } catch (error) { notify((error as Error).message, true); } }}><input autoFocus aria-label="画布名称" maxLength={128} value={screenName} onChange={e => setScreenName(e.target.value)}/><button className="screen-tool-button" type="submit" title="保存画布名称" aria-label="保存画布名称">✓</button><button className="screen-tool-button" type="button" title="取消重命名" aria-label="取消重命名" onClick={() => { setRenamingScreen(false); setScreenName(displayText(screen.title)); }}>×</button></form> : <strong className="screen-toolbar-title">{displayText(screen.title)}</strong>}
          <div className="screen-toolbar-actions">
            {!renamingScreen && <button type="button" className="screen-tool-button" aria-label="重命名画布" title="重命名当前画布" disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview} onClick={() => setRenamingScreen(true)}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 14.5V17h2.5L16.2 6.3l-2.5-2.5L3 14.5Z"/><path d="m12.8 4.7 2.5 2.5"/></svg></button>}
            <button type="button" className="screen-tool-button" aria-label="新增画布" title="新增 Screen 画布" disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview || behaviorMode} onClick={() => { try { commitExportDrafts(); state.addScreen(); setView(v => ({ ...v, zoom: Math.min(v.zoom, 0.5), panX: 0, panY: 0 })); notify('已新增 Screen 画布'); } catch (error) { notify((error as Error).message, true); } }}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 3v14M3 10h14"/></svg></button>
            <button type="button" className="screen-tool-button screen-delete-button" aria-label="删除当前画布" title={state.doc.entryScreenId === screen.id ? '先在左侧更换项目入口，再删除此画布' : '删除当前 Screen 画布'} disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview || behaviorMode || state.doc.screens.length <= 1} onClick={() => { try { commitExportDrafts(); state.deleteScreen(screen.id); setScreenPositions(previous => { const next = { ...previous }; delete next[screen.id]; return next; }); notify('Screen 画布已删除，可撤销'); } catch (error) { notify((error as Error).message, true); } }}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.7 11h7.6l.7-11M8 8v5.5M12 8v5.5"/></svg></button>
          </div>
        </div>
            <Canvas numericPreviewEpoch={numericPreviewEpoch} screenPositions={screenPositions} setScreenPositions={setScreenPositions} onSelectScreen={id => { try { commitExportDrafts(); editorStore.getState().switchScreen(id); } catch (error) { notify((error as Error).message, true); } }} interaction={interaction} view={view} setView={setView} preview={preview} readOnly={!!state.blocked || !!behaviorPreview} behaviorPreview={behaviorPreview} behaviorMode={behaviorMode} editTabs={editTabs} onBehaviorTrigger={id => behaviorTrigger.current?.(id)} grid={grid} alignment={{ guides: prefs.smartGuides, snap: prefs.smartSnap }} resources={resources} resourceGeneration={resourceGeneration} font={font} theme={theme}/>
        {libraryOpen && <div className="sidebar-resizer sidebar-resizer-left" role="separator" aria-label="调整组件栏宽度" onPointerDown={e => resizeSidebar('left', e)}/>}
        {inspectorOpen && <div className="sidebar-resizer sidebar-resizer-right" role="separator" aria-label="调整属性栏宽度" onPointerDown={e => resizeSidebar('right', e)}/>}
        <button onMouseEnter={() => showPeek('left')} onMouseLeave={() => hidePeek('left')} className="sidebar-toggle sidebar-toggle-left" aria-label={libraryOpen ? '收起组件栏' : '展开组件栏'} title={libraryOpen ? '收起组件栏' : '展开组件栏'} aria-expanded={libraryOpen} onClick={() => setLibraryOpen(!libraryOpen)}>{libraryOpen ? '‹' : '›'}</button>
        <button onMouseEnter={() => showPeek('right')} onMouseLeave={() => hidePeek('right')} className="sidebar-toggle sidebar-toggle-right" aria-label={inspectorOpen ? '收起属性栏' : '展开属性栏'} title={inspectorOpen ? '收起属性栏' : '展开属性栏'} aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(!inspectorOpen)}>{inspectorOpen ? '›' : '‹'}</button>
        {exportOpen && <ExportPanel {...exports} resourceRevision={resources.revision} onClose={() => setExportOpen(false)} currentJson={JSON.stringify(state.doc, null, 2) + '\n'}/>}
        {(behaviorOpen || behaviorMode) && <div hidden={!behaviorOpen}><BehaviorPanel key={state.currentScreenId} preview={behaviorPreview} setPreview={setBehaviorPreview} mode={behaviorMode} setMode={setBehaviorMode} canClick={!preview} triggerRef={behaviorTrigger}
          onOpenScreen={id => { setNumericPreviewEpoch(epoch => epoch + 1); if (editorStore.getState().currentScreenId !== id) { behaviorNavigation.current = 'navigate'; editorStore.getState().switchScreen(id); } setBehaviorPreview({}); setBehaviorMode(true); }}
          onResetPreview={() => { setNumericPreviewEpoch(epoch => epoch + 1); setInteraction(false); const s = editorStore.getState(), id = s.doc.entryScreenId; behaviorStartScreen.current = null; if (id && s.doc.screens.some(item => item.id === id) && s.currentScreenId !== id) { behaviorNavigation.current = 'reset'; s.switchScreen(id); } }}
          close={() => setBehaviorOpen(false)} notify={notify}/></div>}
        <div className="studio-footer"><span><i/> {screen.nodes.length} COMPONENTS</span><span data-testid="history-count">{state.past.length} undo / {state.future.length} redo</span><span>INTEGER COORDINATES · GUI px</span></div>
        <details className="json-preview"><summary>项目 JSON <span>只读 / 当前已提交文档</span></summary><pre data-testid="project-json">{JSON.stringify(state.doc, null, 2)}</pre></details>
      </main>
    </div>

    <footer className={`statusbar ${message.error ? 'error' : ''}`}>
      <div role={message.error ? 'alert' : 'status'}>{message.text}</div>
      <span className="status-meta">{screen.designSize.width} × {screen.designSize.height} GUI px · 编辑缩放 {Math.round(view.zoom * 100)}% · 资源 {resources.baseName ?? '中性预览'}{resources.overlayName ? ` · 覆盖：${resources.overlayName}` : ''}</span>
      <span className="status-target">1.21.1 / NeoForge 21.1.244 <b>·</b> Java 21 <b>·</b> Schema {state.doc.schemaVersion}</span>
    </footer>
    {importError && <ImportErrorDialog failure={importError} onClose={() => setImportError(null)} onChoose={() => { setImportError(null); fileRef.current?.click(); }}/>}
  </div>;
}
