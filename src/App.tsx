import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import { CATALOG, NODE_TYPES } from './domain/catalog';
import { MAX_JSON_BYTES } from './domain/schema';
import { editorStore } from './editor/store';
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

export function App() {
  const state = useStore(editorStore);
  const font = useSyncExternalStore(fontSession.subscribe, fontSession.get);
  const [resources] = useState(() => new LayeredResources()), [resourceGeneration, setResourceGeneration] = useState(0);
  const [view, setView] = useState<View>({ zoom: 2, panX: 0, panY: 0, tool: 'select' });
  const [grid, setGrid] = useState({ visible: false, spacing: 10 }), [gridDraft, setGridDraft] = useState('10');
  const gridValid = /^\d+$/.test(gridDraft) && Number(gridDraft) >= 1 && Number(gridDraft) <= 200;
  const [preview, setPreview] = useState<GuiScalePreview | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interaction, setInteraction] = useState(false), [resourceOpenRequest, setResourceOpenRequest] = useState(0);
  const fontRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setInteraction(false); }, [state.doc]);
  const [exportOpen, setExportOpen] = useState(false);
  const [behaviorOpen, setBehaviorOpen] = useState(false), [behaviorPreview, setBehaviorPreview] = useState<BehaviorPreview | null>(null);
  const [editTabs, setEditTabs] = useState<Record<string, string>>({});
  const [behaviorMode, setBehaviorMode] = useState(false), behaviorTrigger = useRef<((id: string) => void) | null>(null);
  useEffect(() => { if (preview || behaviorPreview || behaviorMode) setInteraction(false); }, [preview, behaviorPreview, behaviorMode]);
  useEffect(() => { if (behaviorMode || behaviorPreview || preview) setEditTabs({}); }, [behaviorMode, behaviorPreview, preview]);
  useEffect(() => { if (state.operation !== 'edit') setEditTabs({}); }, [state.doc, state.operation]);
  const [prefs, setPrefs] = useState(loadWorkspace), [peek, setPeek] = useState({ left: false, right: false });
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth), pointerDown = useRef(false), hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatus = useStore(localSession.status, s => s.message);
  useEffect(() => { saveWorkspace(prefs); }, [prefs]);
  useEffect(() => { const resize = () => setViewportWidth(window.innerWidth), down = () => { pointerDown.current = true; }, up = () => { pointerDown.current = false; }; window.addEventListener('resize', resize); window.addEventListener('pointerdown', down); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('dragend', up); window.addEventListener('blur', up); return () => { window.removeEventListener('resize', resize); window.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('dragend', up); window.removeEventListener('blur', up); if (hideTimer.current) clearTimeout(hideTimer.current); }; }, []);
  const mode = (side: 'left' | 'right', value: SidebarMode) => { setPrefs(p => ({ ...p, [side]: { ...p[side], mode: value } })); setPeek(p => ({ ...p, [side]: false })); };
  const showPeek = (side: 'left' | 'right') => { if (hideTimer.current) clearTimeout(hideTimer.current); if (!pointerDown.current && !state.gesture && prefs[side].mode !== 'pinned') setPeek(p => ({ ...p, [side]: true })); };
  const hidePeek = (side: 'left' | 'right') => { if (hideTimer.current) clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => { const container = document.querySelector(side === 'left' ? '.library' : '.inspector'); if (!container?.contains(document.activeElement) && !pointerDown.current) setPeek(p => ({ ...p, [side]: false })); }, 350); };
  const libraryOpen = prefs.left.mode === 'pinned', inspectorOpen = prefs.right.mode === 'pinned';
  const setLibraryOpen = (open: boolean) => mode('left', open ? 'pinned' : 'collapsed'), setInspectorOpen = (open: boolean) => mode('right', open ? 'pinned' : 'collapsed');
  const limitWidth = (width: number) => Math.min(width, Math.max(160, Math.floor((viewportWidth - 300) / 2)));
  const libraryWidth = limitWidth(prefs.left.width), inspectorWidth = limitWidth(prefs.right.width);
  const setLibraryWidth = (width: number) => setPrefs(p => ({ ...p, left: { ...p.left, width } })), setInspectorWidth = (width: number) => setPrefs(p => ({ ...p, right: { ...p.right, width } }));

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
    const end = () => { if (collapse) { if (side === 'left') setLibraryWidth(initialStored); else setInspectorWidth(initialStored); mode(side, 'collapsed'); } target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  };
  const [message, setMessage] = useState({ text: '已提交设计将自动保存到本机 · 请定期导出JSON备份', error: false });
  const fileRef = useRef<HTMLInputElement>(null);
  const importSequence = useRef(0);
  const notify = (text: string, error = false) => setMessage({ text, error });
  const exports = useExports(notify, resources);
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
  const download = () => {
    try {
      const snapshot = captureExport(), json = snapshot.projectJson;
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = exportFilename(snapshot.document.project.name, 'project'); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); notify('JSON 已导出');
    } catch (error) { notify((error as Error).message, true); }
  };
  if (state.blocked === '正在读取本地副本') return <main className="loading-local">正在读取本地副本…</main>;
  return <div className="app-shell">
    <header className="app-header"><div className="brand"><span className="brand-mark">▧</span><div><h1>Minecraft <strong>GUI Maker</strong></h1><p>VISUAL SPECIFICATION STUDIO</p></div></div>
      <div className="target-chip"><i/> 1.21.1 <span>/</span> NeoForge 21.1.244</div>
      <div className="header-actions"><span className="phase-label">PHASE D</span><button onClick={() => { if (behaviorOpen) { setBehaviorPreview(null); setBehaviorMode(false); } setBehaviorOpen(!behaviorOpen); }} aria-expanded={behaviorOpen}>行为</button><button disabled={!!state.blocked || !!state.gesture || !!preview} onClick={() => fileRef.current?.click()}>↥ 导入 JSON</button><button disabled={!!state.gesture} onClick={download}>导出 JSON ↗</button>{!exportOpen && exports.batch && <button onClick={() => { setSettingsOpen(false); setExportOpen(true); }}>查看导出结果</button>}<button aria-label="一键导出 ZIP" disabled={!!state.gesture || exports.busy} onClick={() => { setExportOpen(true); void exports.generate(() => setSettingsOpen(false), true); }}>导出 ZIP</button><button className="primary" disabled={!!state.gesture || exports.busy} onClick={() => { setExportOpen(true); void exports.generate(() => setSettingsOpen(false)); }}>导出规格</button></div>
      <input ref={fileRef} type="file" aria-label="导入项目文件" accept=".json,application/json" hidden disabled={!!state.blocked || !!state.gesture || !!preview} onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        const sequence = ++importSequence.current;
        try {
          if (file.size > MAX_JSON_BYTES) throw new Error('文件超过 5 MiB 上限');
          const text = await file.text(); if (sequence !== importSequence.current) return;
          editorStore.getState().importJson(text); notify('导入成功 · 创建新本地副本，可用撤销恢复导入前设计');
        } catch (error) { if (sequence === importSequence.current) notify(`导入失败：${(error as Error).message}`, true); }
      }}/>
    </header>
    <nav className="editor-menu" aria-label="编辑器菜单" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.querySelectorAll('details[open]').forEach(item => item.removeAttribute('open')); }} onClick={e => { const target = e.target as HTMLElement; if (target.closest('button')) e.currentTarget.querySelectorAll('details[open]').forEach(item => item.removeAttribute('open')); else if (target.closest('summary')) { const active = target.closest('details'); active?.parentElement?.querySelectorAll(':scope > details[open]').forEach(item => { if (item !== active) item.removeAttribute('open'); }); } }}>
      <details><summary>文件</summary><div><button disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview} onClick={async () => { try { captureExport(); await localSession.createProject(); setBehaviorMode(false); setBehaviorPreview(null); setBehaviorOpen(false); setInteraction(false); notify("已新建 GUI 项目；原项目保留为本地副本"); } catch (error) { notify(`新建失败：${(error as Error).message}`, true); } }}>新的GUI项目</button><button disabled={!!state.blocked || !!state.gesture || !!preview} onClick={() => fileRef.current?.click()}>导入设计 JSON</button><button disabled={!!state.gesture} onClick={download}>下载设计 JSON</button><button disabled={!!state.gesture || exports.busy} onClick={() => { setExportOpen(true); void exports.generate(() => setSettingsOpen(false)); }}>生成 PNG 和单项导出</button><button disabled={!!state.gesture || exports.busy} onClick={() => { setExportOpen(true); void exports.generate(() => setSettingsOpen(false), true); }}>打包 ZIP</button></div></details>
      <details><summary>编辑</summary><div><button disabled={!!state.blocked || !!preview || (!state.past.length && !state.gesture)} onClick={state.undo}>撤销操作</button><button disabled={!!state.blocked || !!preview || !state.future.length || !!state.gesture} onClick={state.redo}>重做操作</button></div></details>
      <details><summary>视图</summary><div><details className="editor-submenu" onMouseEnter={e => { e.currentTarget.open = true; }} onMouseLeave={e => { e.currentTarget.open = false; }}><summary>资源包检查</summary><div><button onClick={() => { resources.useDefault(); setResourceGeneration(n => n + 1); }}>使用默认样式</button><button onClick={() => setResourceOpenRequest(n => n + 1)}>选择已有资源包</button></div></details><details className="editor-submenu" onMouseEnter={e => { e.currentTarget.open = true; }} onMouseLeave={e => { e.currentTarget.open = false; }}><summary>字体</summary><div><button onClick={() => fontSession.clear()}>使用默认字体</button><button onClick={() => fontRef.current?.click()}>选择字体文件</button>{font.cached.map(item => <button key={item.id} onClick={() => fontSession.useCached(item.id)}>{item.name}</button>)}</div></details><button onClick={() => mode('left', prefs.left.mode === 'auto' ? 'pinned' : 'auto')}>左侧自动隐藏：{prefs.left.mode === 'auto' ? '开' : '关'}</button><button onClick={() => mode('right', prefs.right.mode === 'auto' ? 'pinned' : 'auto')}>右侧自动隐藏：{prefs.right.mode === 'auto' ? '开' : '关'}</button><button onClick={() => setSettingsOpen(true)}>打开 GUI Scale 设置</button><button disabled={!!preview} onClick={() => setGrid({ ...grid, visible: !grid.visible })}>切换网格</button></div></details>
      <details><summary>模式</summary><div><button aria-label="交互预览" aria-pressed={interaction} disabled={!!preview || !!behaviorPreview || behaviorMode || !!state.gesture} onClick={() => setInteraction(value => !value)}>交互预览：{interaction ? "开启" : "关闭"}</button><button onClick={() => { if (behaviorOpen) { setBehaviorPreview(null); setBehaviorMode(false); } setBehaviorOpen(!behaviorOpen); }}>切换行为面板</button></div></details>
      <details><summary>工具</summary><div><button disabled={!!preview || !!state.gesture} onClick={() => setView({ ...view, tool: 'select' })}>使用选择工具</button><button disabled={!!preview || !!state.gesture} onClick={() => setView({ ...view, tool: 'pan' })}>使用平移工具</button><button disabled={!!preview || !!state.gesture} onClick={() => setView({ zoom: 2, panX: 0, panY: 0, tool: 'select' })}>重置画布视图</button></div></details>
      <details><summary>帮助</summary><div><p>滚轮缩放、右键平移；Ctrl+Z 撤销，Ctrl+Shift+Z 重做。设计 JSON 是权威数据。</p></div></details>
    </nav>
    <div className="global-toolbars"><div className="studio-toolbar"><ProjectName notify={notify} disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview}/><div className="document-actions"><ResourceTestPanel hideTrigger manager={resources} openRequest={resourceOpenRequest} onChange={() => setResourceGeneration(n => n + 1)}/><LocalSavePanel notify={notify}/><div className="history-actions"><button aria-label="撤销" title="Ctrl+Z" disabled={!!state.blocked || !!preview || (!state.past.length && !state.gesture)} onClick={state.undo}>↶</button><button aria-label="重做" title="Ctrl+Shift+Z" disabled={!!state.blocked || !!preview || !state.future.length || !!state.gesture} onClick={state.redo}>↷</button></div></div><input ref={fontRef} aria-label="选择预览字体" hidden type="file" accept=".ttf,.otf,.woff,.woff2" onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void fontSession.select(file); }}/><small aria-live="polite" data-testid="font-status">{font.status}</small><div className="tool-group"><ScreenSettings preview={preview} setPreview={setPreview} notify={notify} open={settingsOpen} setOpen={setSettingsOpen}/></div>
          <div className="view-controls"><label className="grid-check"><input type="checkbox" aria-label="显示网格" disabled={!!preview} checked={grid.visible} onChange={e => setGrid({ ...grid, visible: e.target.checked })}/>网格</label><label>间距 <input type="number" aria-label="网格间距" min="1" max="200" step="1" disabled={!!preview} aria-invalid={!gridValid} title="网格间距：1～200 GUI 逻辑像素" value={gridDraft} onChange={e => { const value = e.target.value; setGridDraft(value); const n = Number(value); if (/^\d+$/.test(value) && n >= 1 && n <= 200) setGrid({ ...grid, spacing: n }); }} onBlur={() => { if (!gridValid) setGridDraft(String(grid.spacing)); }}/></label>
            <label>Zoom <select aria-label="Zoom" title="画布内滚轮缩放，右键拖动平移" disabled={!!state.gesture || !!preview} value={view.zoom} onChange={e => setView({ ...view, zoom: Number(e.target.value) })}>
            {![0.25, 0.5, 1, 2, 4, 8, 16].includes(view.zoom) && <option value={view.zoom}>{Math.round(view.zoom * 100)}%</option>}{[0.25, 0.5, 1, 2, 4, 8, 16].map(z => <option key={z} value={z}>{z * 100}%</option>)}</select></label>
            <label>Pan X <input type="number" aria-label="Pan X" disabled={!!state.gesture || !!preview} value={view.panX} onChange={e => setView({ ...view, panX: Number(e.target.value) })}/></label>
            <label>Y <input type="number" aria-label="Pan Y" disabled={!!state.gesture || !!preview} value={view.panY} onChange={e => setView({ ...view, panY: Number(e.target.value) })}/></label>
            <button aria-label="重置视图" disabled={!!state.gesture || !!preview} onClick={() => setView({ zoom: 2, panX: 0, panY: 0, tool: 'select' })}>⌖</button></div></div></div>
    <div ref={workspaceRef} style={{ '--library-width': libraryOpen ? `${libraryWidth}px` : '0px', '--inspector-width': inspectorOpen ? `${inspectorWidth}px` : '0px', '--left-float-width': `${libraryWidth}px`, '--right-float-width': `${inspectorWidth}px`, '--tree-ratio': `${prefs.treeRatio * 100}%` } as CSSProperties} className={`workspace ${libraryOpen ? '' : 'library-collapsed'} ${inspectorOpen ? '' : 'inspector-collapsed'} ${prefs.left.mode !== 'pinned' ? 'auto-left' : ''} ${prefs.right.mode !== 'pinned' ? 'auto-right' : ''} ${peek.left ? 'peek-left' : ''} ${peek.right ? 'peek-right' : ''}`}>
      <aside className="library" onMouseEnter={() => showPeek('left')} onMouseLeave={() => hidePeek('left')}>{prefs.left.mode !== 'pinned' && peek.left && <button className="sidebar-pin" onClick={() => mode('left', 'pinned')}>固定组件栏</button>}<div className="library-palette"><div className="panel-heading"><span>COMPONENTS</span></div><h2>构建你的界面</h2>
        <div className="component-list">{NODE_TYPES.map((type, i) => <button key={type} className="component-card" disabled={!!state.blocked || !!state.gesture || !!preview || !!behaviorPreview || state.doc.screens[0].nodes.length >= 1000}
          aria-label={`添加 ${CATALOG[type].label}`} draggable={!state.gesture && !behaviorPreview} onDragStart={e => { pointerDown.current = true; e.dataTransfer.setData('application/x-minecraft-gui-component', type); }} onClick={() => state.add(type)}>
          <span className="component-glyph">{CATALOG[type].glyph}</span><span><strong>{CATALOG[type].label}</strong><small>{CATALOG[type].subtitle}</small></span><span className="component-number">0{i + 1}</span>
        </button>)}</div>
        </div><div className="library-tree"><div className="layers-heading"><span>项目结构 · {state.doc.screens[0].id}</span><span>{state.doc.screens[0].nodes.length}</span></div>
        <div className="layers">{!state.doc.screens[0].nodes.length ? <p className="muted">组件会显示在这里</p> : [...state.doc.screens[0].nodes].reverse().map(node => <button key={node.id} disabled={!!behaviorPreview} className={node.id === state.selected ? 'layer selected' : 'layer'} aria-label={`选择 ${node.id}`} aria-pressed={node.id === state.selected} onClick={() => state.select(node.id)}><span>{CATALOG[node.type].glyph}</span><span>{node.id}<small>{CATALOG[node.type].label}</small></span><span>{node.state.visible ? '◦' : '–'}</span></button>)}</div>
        </div><div className="library-split" role="separator" aria-label="调整项目结构区域高度" onPointerDown={e => { if (e.button !== 0) return; const target = e.currentTarget, rect = target.parentElement!.getBoundingClientRect(); target.setPointerCapture(e.pointerId); const move = (event: PointerEvent) => setPrefs(p => ({ ...p, treeRatio: Math.min(0.8, Math.max(0.2, (event.clientY - rect.top) / rect.height)) })); const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); }; target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end); }}/></aside>
      <Inspector editTabs={editTabs} setEditTabs={setEditTabs} notify={notify} readOnly={!!preview || !!state.blocked || !!behaviorPreview} onMouseEnter={() => showPeek('right')} onMouseLeave={() => hidePeek('right')} onPin={prefs.right.mode !== 'pinned' && peek.right ? () => mode('right', 'pinned') : undefined} emptyControls={null}/>
      <main className="studio">
        <Canvas interaction={interaction} view={view} setView={setView} preview={preview} readOnly={!!state.blocked || !!behaviorPreview} behaviorPreview={behaviorPreview} behaviorMode={behaviorMode} editTabs={editTabs} onBehaviorTrigger={id => behaviorTrigger.current?.(id)} grid={grid} resources={resources} resourceGeneration={resourceGeneration} font={font}/>
        {libraryOpen && <div className="sidebar-resizer sidebar-resizer-left" role="separator" aria-label="调整组件栏宽度" onPointerDown={e => resizeSidebar('left', e)}/>}
        {inspectorOpen && <div className="sidebar-resizer sidebar-resizer-right" role="separator" aria-label="调整属性栏宽度" onPointerDown={e => resizeSidebar('right', e)}/>}
        <button onMouseEnter={() => showPeek('left')} onMouseLeave={() => hidePeek('left')} className="sidebar-toggle sidebar-toggle-left" aria-label={libraryOpen ? '收起组件栏' : '展开组件栏'} title={libraryOpen ? '收起组件栏' : '展开组件栏'} aria-expanded={libraryOpen} onClick={() => setLibraryOpen(!libraryOpen)}>{libraryOpen ? '‹' : '›'}</button>
        <button onMouseEnter={() => showPeek('right')} onMouseLeave={() => hidePeek('right')} className="sidebar-toggle sidebar-toggle-right" aria-label={inspectorOpen ? '收起属性栏' : '展开属性栏'} title={inspectorOpen ? '收起属性栏' : '展开属性栏'} aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(!inspectorOpen)}>{inspectorOpen ? '›' : '‹'}</button>
        {exportOpen && <ExportPanel {...exports} resourceRevision={resources.revision} onClose={() => setExportOpen(false)} currentJson={JSON.stringify(state.doc, null, 2) + '\n'}/>}
        {behaviorOpen && <BehaviorPanel preview={behaviorPreview} setPreview={setBehaviorPreview} mode={behaviorMode} setMode={setBehaviorMode} canClick={!preview} triggerRef={behaviorTrigger} close={() => setBehaviorOpen(false)} notify={notify}/>}
        <div className="studio-footer"><span><i/> {state.doc.screens[0].nodes.length} COMPONENTS</span><span data-testid="history-count">{state.past.length} undo / {state.future.length} redo</span><span>INTEGER COORDINATES</span></div>
        <details className="json-preview"><summary>查看项目 JSON <span>只读 / 当前已提交文档</span></summary><pre data-testid="project-json">{JSON.stringify(state.doc, null, 2)}</pre></details>
      </main>
    </div>
    <footer className={`statusbar ${message.error ? 'error' : ''}`}><div role={message.error ? 'alert' : 'status'}>{message.text}</div><span>{state.doc.screens[0].designSize.width} × {state.doc.screens[0].designSize.height} GUI px · 缩放 {Math.round(view.zoom * 100)}% · {saveStatus} · 资源 {resources.baseName ?? '中性预览'}{resources.overlayName ? ` · 覆盖：${resources.overlayName}` : ''}</span><span>Java 21 <b>·</b> Schema {state.doc.schemaVersion} <b>·</b> D</span></footer>
  </div>;
}
