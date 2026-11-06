import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  COMPONENT_TYPES, EXPORT_ENTRIES, MENU_STRUCTURE, RESOURCE_STATE, RULES, SCREENS,
  MockCanvas, ThemeButton, useProtoTheme, type ProtoNode, type ProtoScreen,
} from '../shared';
import '../shared.css';
import './proto-h.css';

type ModuleId = 'screens' | 'structure' | 'components' | 'behavior';
type Visibility = 'gone' | 'expanded' | 'collapsed' | 'peeking';
type Interaction = 'idle' | 'pointerDown' | 'dragging' | 'resizing' | 'panelresize' | 'dnd';
type Phase = 'enter' | 'open' | 'exit';

const MODULES: { id: ModuleId; label: string; glyph: string }[] = [
  { id: 'screens', label: 'Screens', glyph: '▤' },
  { id: 'structure', label: '结构树', glyph: '⌘' },
  { id: 'components', label: '组件目录', glyph: '▥' },
  { id: 'behavior', label: 'Behavior', glyph: '⚡' },
];
/* Hover intent + animation tuning (centralized). */
const HOVER_ENTER_DELAY = 220;
const HOVER_LEAVE_DELAY = 350;
const HOVER_ZONE_RADIUS = 36;
const PEEK_ENTER_MS = 260;
const PEEK_EXIT_MS = 220;
const SIDE_ANIM_MS = 220;
const COLLAPSE_THRESHOLD = 120;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 264;
/* Panel stack geometry. */
const HEAD_H = 30;
const MIN_BODY = 64;
const MIN_PANEL = HEAD_H + MIN_BODY;
const SEP_H = 5;
const DEFAULT_PANEL_H = 220;

const IconPanelOpen = () => <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><line x1="6" y1="2.5" x2="6" y2="13.5" /><path d="M9 6l2.2 2L9 10" /></svg>;
const IconPanelClose = () => <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><line x1="6" y1="2.5" x2="6" y2="13.5" /><path d="M8.5 6L6.3 8l2.2 2" /></svg>;
const IconPin = () => <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M6 2h4M6.5 2v4L4.5 9h7L9.5 6V2" /><line x1="8" y1="9" x2="8" y2="14" /></svg>;
const IconPinOff = () => <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M6 2h4M6.5 2v4L4.5 9h7L9.5 6V2" /><line x1="8" y1="9" x2="8" y2="14" /><line x1="2.5" y1="2.5" x2="13.5" y2="13.5" /></svg>;

function App() {
  const { theme, toggle } = useProtoTheme();
  const [opened, setOpened] = useState<ModuleId[]>(['structure']);
  const [mode, setMode] = useState<'pinned' | 'auto'>('pinned');
  const [collapsed, setCollapsed] = useState(false);
  const [peek, setPeek] = useState(false);
  const [peekRender, setPeekRender] = useState(false);
  const [peekPhase, setPeekPhase] = useState<Phase>('enter');
  const [sideRender, setSideRender] = useState(true);
  const [sidePhase, setSidePhase] = useState<Phase>('open');
  const [preferredWidth, setPreferredWidth] = useState(DEFAULT_WIDTH);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [modCollapsed, setModCollapsed] = useState<Partial<Record<ModuleId, boolean>>>({});
  const [heights, setHeights] = useState<Record<ModuleId, number>>({ screens: DEFAULT_PANEL_H, structure: DEFAULT_PANEL_H, components: DEFAULT_PANEL_H, behavior: DEFAULT_PANEL_H });
  const [interaction, setInteraction] = useState<Interaction>('idle');
  const [screens, setScreens] = useState<ProtoScreen[]>(() => SCREENS.map(s => ({ ...s, nodes: [...s.nodes] })));
  const [screenId, setScreenId] = useState(SCREENS[0].id);
  const [selected, setSelected] = useState<string | null>(null);
  const [grid, setGrid] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [resourceOpen, setResourceOpen] = useState(false);
  const [compFilter, setCompFilter] = useState('');
  const [status, setStatus] = useState('Prototype H.2 · Hybrid Workspace · 模拟数据');

  const screen = screens.find(s => s.id === screenId)!;
  const node = screen.nodes.find(n => n.id === selected) ?? null;
  const rules = RULES[screenId] ?? [];
  const badges = useMemo(() => Object.fromEntries(rules.map(r => [r.source, r.id])), [rules]);
  const width = liveWidth ?? preferredWidth;
  const hasModules = opened.length > 0;
  const visibility: Visibility = !hasModules ? 'gone'
    : mode === 'pinned' && !collapsed ? 'expanded'
    : peek ? 'peeking' : 'collapsed';

  // live refs for controller gating (single source of truth for peek eligibility)
  const gate = useRef({ mode, collapsed, hasModules, visibility });
  gate.current = { mode, collapsed, hasModules, visibility };

  // ---- peek mount/animation lifecycle ----
  useEffect(() => {
    if (peek) {
      setPeekRender(true); setPeekPhase('enter');
      const raf = requestAnimationFrame(() => setPeekPhase('open'));
      return () => cancelAnimationFrame(raf);
    }
    if (peekRender) {
      setPeekPhase('exit');
      const t = setTimeout(() => setPeekRender(false), PEEK_EXIT_MS + 40);
      return () => clearTimeout(t);
    }
  }, [peek]); // eslint-disable-line react-hooks/exhaustive-deps
  // ---- sidebar width animation lifecycle (single interactive instance invariant) ----
  useEffect(() => {
    if (visibility === 'expanded') {
      setSideRender(true); setSidePhase('enter');
      const raf = requestAnimationFrame(() => setSidePhase('open'));
      return () => cancelAnimationFrame(raf);
    }
    if (sideRender) {
      setSidePhase('exit');
      const t = setTimeout(() => setSideRender(false), SIDE_ANIM_MS + 40);
      return () => clearTimeout(t);
    }
  }, [visibility]); // eslint-disable-line react-hooks/exhaustive-deps
  // invariant: expanded or gone never keeps a logical peek
  useEffect(() => { if (visibility === 'expanded' || visibility === 'gone') setPeek(false); }, [visibility]);

  // ---- global interaction tracking ----
  const buttons = useRef(0);
  const canvasGesture = useRef(false);
  const resizing = useRef(false);
  const panelResizing = useRef(false);
  const dnd = useRef(false);
  const paused = () => resizing.current || panelResizing.current || dnd.current || canvasGesture.current;
  useEffect(() => {
    const down = (e: PointerEvent) => {
      buttons.current = e.buttons || 1;
      setInteraction(panelResizing.current ? 'panelresize' : resizing.current ? 'resizing' : canvasGesture.current ? 'dragging' : 'pointerDown');
      hover.current.cancelEnter();
      if (buttons.current !== 0 && hover.current.inEnterZone(e.clientX, e.clientY)) hover.current.suppress = true;
    };
    const move = (e: PointerEvent) => {
      buttons.current = e.buttons;
      hover.current.onMove(e.clientX, e.clientY);
      setInteraction(panelResizing.current ? 'panelresize' : resizing.current ? 'resizing' : dnd.current ? 'dnd' : canvasGesture.current ? 'dragging' : (e.buttons ? 'pointerDown' : 'idle'));
    };
    const up = (e: PointerEvent) => {
      buttons.current = e.buttons;
      canvasGesture.current = false;
      setInteraction(panelResizing.current ? 'panelresize' : resizing.current ? 'resizing' : 'idle');
      hover.current.onMove(e.clientX, e.clientY);
    };
    const cancel = () => { buttons.current = 0; canvasGesture.current = false; dnd.current = false; if (resizing.current) { resizing.current = false; setLiveWidth(null); } setInteraction('idle'); };
    const dragStart = () => { dnd.current = true; setInteraction('dnd'); hover.current.cancelEnter(); hover.current.cancelLeave(); };
    const dragEnd = () => {
      dnd.current = false; setInteraction('idle'); hover.current.resync();
      const p = lastPoint.current;
      if (peekLive.current && p && !hover.current.inLeaveZone(p.x, p.y) && !hover.current.inEnterZone(p.x, p.y)) hover.current.scheduleClose();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('blur', cancel);
    window.addEventListener('dragstart', dragStart, true);
    window.addEventListener('dragend', dragEnd, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('dragstart', dragStart, true);
      window.removeEventListener('dragend', dragEnd, true);
    };
  }, []);

  // ---- hover intent controller: circular enter zone (radius HOVER_ZONE_RADIUS), union leave zone ----
  const railRef = useRef<HTMLElement | null>(null);
  const peekRef = useRef<HTMLElement | null>(null);
  const expandBtnRef = useRef<HTMLButtonElement | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const peekLive = useRef(false);
  useEffect(() => { peekLive.current = peek; }, [peek]);
  const hover = useRef({
    inside: false, unionInside: false, suppress: false,
    enterTimer: 0 as ReturnType<typeof setTimeout> | undefined,
    leaveTimer: 0 as ReturnType<typeof setTimeout> | undefined,
    zoneCenter() {
      const b = expandBtnRef.current?.getBoundingClientRect();
      return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null;
    },
    inEnterZone(x: number, y: number) {
      const c = this.zoneCenter();
      return !!c && Math.hypot(x - c.x, y - c.y) <= HOVER_ZONE_RADIUS;
    },
    inLeaveZone(x: number, y: number) {
      const r = railRef.current?.getBoundingClientRect();
      const p = peekRef.current?.getBoundingClientRect();
      const inRail = !!r && x >= r.left - 2 && x <= r.right + 12 && y >= r.top && y <= r.bottom;
      const inPeek = !!p && x >= p.left && x <= p.right && y >= p.top && y <= p.bottom;
      return inRail || inPeek;
    },
    cancelEnter() { if (this.enterTimer) clearTimeout(this.enterTimer); this.enterTimer = undefined; },
    cancelLeave() { if (this.leaveTimer) clearTimeout(this.leaveTimer); this.leaveTimer = undefined; },
    peekAllowed() {
      const g = gate.current;
      return g.hasModules && g.visibility !== 'expanded' && (g.mode === 'auto' || g.collapsed);
    },
    scheduleClose() {
      this.cancelEnter();
      if (buttons.current === 0 && !paused()) this.suppress = false;
      this.cancelLeave();
      this.leaveTimer = setTimeout(() => {
        const activeEl = document.activeElement as HTMLElement | null;
        const editingInside = !!activeEl && !!peekRef.current?.contains(activeEl) && !!activeEl.matches('input, textarea, select, [contenteditable="true"]');
        const menuOpen = !!peekRef.current?.querySelector('details[open]');
        if (!editingInside && !menuOpen && !paused()) setPeek(false);
      }, HOVER_LEAVE_DELAY);
    },
    resync() {
      const p = lastPoint.current; if (!p) return;
      if (this.unionInside && !this.inLeaveZone(p.x, p.y)) { this.unionInside = false; this.inside = false; this.scheduleClose(); }
      else if (!this.unionInside && this.inLeaveZone(p.x, p.y)) { this.unionInside = true; this.cancelLeave(); }
    },
    onMove(x: number, y: number) {
      lastPoint.current = { x, y };
      const entered = this.inEnterZone(x, y);
      const inUnion = this.inLeaveZone(x, y);
      if (entered && !this.inside) {
        this.inside = true;
        if (!this.unionInside) this.suppress = false;
        if (!(this.suppress || buttons.current !== 0 || paused()) && this.peekAllowed()) {
          this.cancelLeave(); this.cancelEnter();
          this.enterTimer = setTimeout(() => { if (this.peekAllowed() && buttons.current === 0 && !paused()) setPeek(true); }, HOVER_ENTER_DELAY);
        }
      } else if (!entered && this.inside && !inUnion) {
        this.inside = false;
        this.scheduleClose();
      }
      if (!this.unionInside && inUnion) { this.unionInside = true; this.cancelLeave(); }
      else if (this.unionInside && !inUnion) {
        this.unionInside = false;
        if (!entered) this.inside = false;
        this.scheduleClose();
      }
    },
  });
  useEffect(() => () => { hover.current.cancelEnter(); hover.current.cancelLeave(); }, []);

  const collapseSidebar = useCallback(() => {
    hover.current.cancelEnter(); hover.current.cancelLeave();
    hover.current.suppress = true; setPeek(false); setCollapsed(true);
  }, []);
  const closeAllModules = useCallback(() => {
    hover.current.cancelEnter(); hover.current.cancelLeave();
    hover.current.suppress = true; setPeek(false); setOpened([]);
  }, []);
  const pinSidebar = useCallback(() => {
    // pin cancels pending hover timers, peek state and any exiting instance's interactivity
    hover.current.cancelEnter(); hover.current.cancelLeave();
    hover.current.suppress = true; hover.current.inside = false;
    setPeek(false); setMode('pinned'); setCollapsed(false);
  }, []);
  const toggleMode = useCallback(() => {
    setMode(m => {
      const next = m === 'pinned' ? 'auto' : 'pinned';
      hover.current.cancelEnter(); hover.current.cancelLeave();
      if (next === 'auto') { hover.current.suppress = true; hover.current.inside = false; }
      else { hover.current.suppress = true; hover.current.inside = false; setPeek(false); setCollapsed(false); }
      return next;
    });
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (resizing.current || panelResizing.current) { resizing.current = false; panelResizing.current = false; setLiveWidth(null); setInteraction('idle'); return; }
        if (peek) collapseSidebar();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [peek, collapseSidebar]);

  // ---- sidebar width resize ----
  const startResize = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX, startW = preferredWidth;
    resizing.current = true; setInteraction('resizing');
    const move = (ev: PointerEvent) => { if (resizing.current) setLiveWidth(Math.max(60, Math.min(MAX_WIDTH, startW + (ev.clientX - startX)))); };
    const finish = (_ev: PointerEvent, cancelled: boolean) => {
      if (!resizing.current) return;
      resizing.current = false;
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', upEv); window.removeEventListener('pointercancel', cancelEv);
      setInteraction('idle');
      setLiveWidth(current => {
        if (cancelled || current === null) return null;
        if (current < COLLAPSE_THRESHOLD) { setCollapsed(true); return null; }
        setPreferredWidth(current); return null;
      });
    };
    const upEv = (ev: PointerEvent) => finish(ev, false);
    const cancelEv = (ev: PointerEvent) => finish(ev, true);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', upEv); window.addEventListener('pointercancel', cancelEv);
  }, [preferredWidth]);

  // ---- panel stack height resize (real pointer events, adjacent transfer only) ----
  const startHeightDrag = useCallback((a: ModuleId, b: ModuleId) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startA = heights[a], startB = heights[b], total = startA + startB;
    panelResizing.current = true; setInteraction('panelresize');
    const move = (ev: PointerEvent) => {
      if (!panelResizing.current) return;
      const delta = ev.clientY - startY;
      const a2 = Math.max(MIN_PANEL, Math.min(total - MIN_PANEL, startA + delta));
      setHeights(h => ({ ...h, [a]: Math.round(a2), [b]: Math.round(total - a2) }));
    };
    const finish = (_ev: PointerEvent, cancelled: boolean) => {
      if (!panelResizing.current) return;
      panelResizing.current = false;
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', upEv); window.removeEventListener('pointercancel', cancelEv);
      setInteraction('idle');
      if (cancelled) setHeights(h => ({ ...h, [a]: startA, [b]: startB }));
    };
    const upEv = (ev: PointerEvent) => finish(ev, false);
    const cancelEv = (ev: PointerEvent) => finish(ev, true);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', upEv); window.addEventListener('pointercancel', cancelEv);
  }, [heights]);

  // ---- height allocation: keep stored heights; proportionally fit only when overflow would occur ----
  useEffect(() => {
    const stack = stackRef.current; if (!stack || visibility === 'gone') return;
    const avail = stack.clientHeight;
    const unfolded = opened.filter(m => !modCollapsed[m]);
    const folded = opened.length - unfolded.length;
    const seps = Math.max(0, unfolded.length - 1) * SEP_H;
    const sumH = unfolded.reduce((s, m) => s + heights[m], 0);
    const used = sumH + folded * HEAD_H + seps;
    const minUsed = unfolded.length * MIN_PANEL + folded * HEAD_H + seps;
    if (used > avail && minUsed <= avail && sumH > 0) {
      const target = avail - folded * HEAD_H - seps;
      setHeights(h => {
        const n = { ...h };
        unfolded.forEach(m => { n[m] = Math.max(MIN_PANEL, Math.round(h[m] * target / sumH)); });
        return n;
      });
    }
  }, [opened, modCollapsed, visibility]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- module operations ----
  const toggleModule = (id: ModuleId) => {
    const opening = !opened.includes(id);
    setOpened(list => (list.includes(id) ? list.filter(m => m !== id) : [...list, id]));
    if (opening) {
      setCollapsed(false);
      if (mode === 'auto') setPeek(true);
    }
    setStatus(`模块 ${id} ${opening ? '打开' : '关闭'}`);
  };
  const addNode = (type: string, label: string) => {
    const id = `${type.split(':')[1]}_${screen.nodes.length + 1}`;
    const n: ProtoNode = { id, type, label, x: 24 + (screen.nodes.length % 4) * 16, y: 24 + (screen.nodes.length % 4) * 14, w: 120, h: 20 };
    setScreens(list => list.map(s => (s.id === screenId ? { ...s, nodes: [...s.nodes, n] } : s)));
    setSelected(id);
    setStatus(`模拟添加：${id}（侧栏模式不变：${mode}）`);
  };
  const patchNode = (patch: Partial<ProtoNode>) => {
    if (!node) return;
    setScreens(list => list.map(s => (s.id === screenId ? { ...s, nodes: s.nodes.map(n => (n.id === node.id ? { ...n, ...patch } : n)) } : s)));
  };
  const menuClick = (entry: string) => setStatus(`模拟：${entry}`);

  const moduleBody = (id: ModuleId) => (
    <div className="proto-body">
      {id === 'screens' && <div className="proto-list">
        {screens.map(s => <button key={s.id} type="button" aria-pressed={s.id === screenId} onClick={() => { setScreenId(s.id); setSelected(null); }}>{s.title}<small>{s.nodes.length}</small></button>)}
        <button type="button" onClick={() => { const nid = `screen_${screens.length + 1}`; setScreens(p => [...p, { id: nid, title: `新屏 ${p.length + 1}`, nodes: [] }]); setScreenId(nid); setStatus(`模拟：新增画布 ${nid}`); }}>+ Screen（模拟）</button>
      </div>}
      {id === 'structure' && <div className="proto-list">
        {screen.nodes.filter(n => !n.parent).map(n => (
          <span key={n.id}>
            <button type="button" aria-pressed={selected === n.id} onClick={() => setSelected(n.id)}>{n.id}<small>{n.label}</small></button>
            {screen.nodes.filter(c => c.parent === n.id).map(c => <button key={c.id} type="button" className="indent" aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}>{c.id}<small>{c.label}</small></button>)}
          </span>
        ))}
      </div>}
      {id === 'components' && <div className="proto-list">
        <label className="proto-field" style={{ marginBottom: 4 }}><span>过滤组件</span>
          <input aria-label="过滤组件" value={compFilter} onChange={e => setCompFilter(e.target.value)} placeholder="输入关键字…" /></label>
        {COMPONENT_TYPES.filter(c => !compFilter || c.label.toLowerCase().includes(compFilter.toLowerCase())).map(c => (
          <button key={c.type} type="button" draggable onDragStart={e => e.dataTransfer.setData('text/plain', c.type)} onClick={() => addNode(c.type, c.label)}>
            <span aria-hidden="true">{c.glyph}</span>{c.label}
          </button>
        ))}
      </div>}
      {id === 'behavior' && <div className="proto-list">
        {rules.length === 0 && <p className="proto-note">当前 Screen 没有 F2 规则。</p>}
        {rules.map(r => <button key={r.id} type="button" onClick={() => { setSelected(r.source); setStatus(`定位规则 ${r.id} · 来源 ${r.source}`); }}>{r.id}<small>{r.event}</small></button>)}
      </div>}
    </div>
  );

  const stack = (peeking: boolean) => (
    <div className="proto-h-stack" ref={peeking ? undefined : stackRef} data-stack={peeking ? 'peek' : 'main'}>
      {opened.map((id, idx) => {
        const meta = MODULES.find(m => m.id === id)!;
        const folded = !!modCollapsed[id];
        const next = opened[idx + 1];
        const nextFolded = next ? !!modCollapsed[next] : true;
        return (
          <Fragment key={id}>
            <section className={`proto-h-module ${folded ? 'collapsed-mod' : ''}`} data-module={id}
              style={folded ? { flex: '0 0 auto' } : { flex: `0 0 ${heights[id]}px` }} aria-label={meta.label}>
              <div className="proto-h-module-head">
                <span aria-hidden="true">{meta.glyph}</span><strong>{meta.label}</strong><span className="grow" />
                <button type="button" aria-label={folded ? `展开 ${meta.label}` : `折叠 ${meta.label}`} aria-pressed={folded}
                  onClick={() => setModCollapsed(m => ({ ...m, [id]: !m[id] }))}>{folded ? '▸' : '▾'}</button>
                <button type="button" aria-label={`关闭 ${meta.label}`} onClick={() => toggleModule(id)}>✕</button>
              </div>
              {moduleBody(id)}
            </section>
            {next && !folded && !nextFolded && (
              <div className="proto-h-vresizer" role="separator" aria-label={`调整 ${meta.label} 与 ${MODULES.find(m => m.id === next)!.label} 高度`}
                onPointerDown={startHeightDrag(id, next)} />
            )}
          </Fragment>
        );
      })}
      <div className="proto-h-stack-spacer" />
    </div>
  );

  const sidebarHead = (peeking: boolean) => (
    <div className="proto-h-module-head proto-h-sidebar-head">
      <strong>模块侧栏</strong><span className="grow" />
      {peeking && <button type="button" aria-label="固定侧栏并展开" title="固定侧栏并展开" onClick={pinSidebar}><IconPin /></button>}
      <button type="button" aria-label="关闭全部模块" title="关闭全部模块（清空 openedModules）" onClick={closeAllModules}>✕</button>
    </div>
  );

  return (
    <div className="proto-app" data-visibility={visibility} data-mode={mode} data-interaction={interaction}
      data-peek={peek ? 'true' : 'false'} data-peek-phase={peekRender ? peekPhase : 'closed'} data-side-phase={sideRender ? sidePhase : 'closed'}
      data-modules={opened.join(',')} data-width={width}
      style={{ '--ph-hover-d': `${HOVER_ZONE_RADIUS * 2}px` } as React.CSSProperties}
      onContextMenu={e => e.preventDefault()}>
      <header className="proto-card proto-topbar">
        <span className="proto-brand"><i>▧</i>Minecraft GUI Maker <small style={{ color: 'var(--text-3)', fontSize: 10 }}>Prototype H.2 · Hybrid</small></span>
        <nav className="proto-tabs" aria-label="Screen 切换">
          {screens.map(s => <button key={s.id} type="button" aria-pressed={s.id === screenId} onClick={() => { setScreenId(s.id); setSelected(null); }}>{s.title}</button>)}
        </nav>
        <span className="proto-spacer" />
        <label className="proto-chip"><input type="checkbox" aria-label="显示网格" checked={grid} onChange={e => setGrid(e.target.checked)} style={{ width: 12, height: 12 }} />网格</label>
        <div style={{ position: 'relative' }}>
          <button type="button" aria-expanded={resourceOpen} onClick={() => setResourceOpen(v => !v)}>资源包检查</button>
          {resourceOpen && <div className="proto-popover" role="dialog" aria-label="资源包检查">
            <strong style={{ fontSize: 11 }}>资源 · {RESOURCE_STATE.base}</strong>
            <div className="proto-section"><h4>Sprite 诊断</h4>{RESOURCE_STATE.diagnostics.map(d => <p className="proto-note" key={d}>{d}</p>)}</div>
          </div>}
        </div>
        <button type="button" className="primary" onClick={() => setExportOpen(true)}>导出</button>
        <nav className="proto-menus" aria-label="原型菜单">
          {Object.entries(MENU_STRUCTURE).map(([name, entries]) => (
            <details key={name}><summary>{name}</summary><div>{entries.map(entry => <button key={entry} type="button" onClick={() => menuClick(entry)}>{entry}</button>)}</div></details>
          ))}
        </nav>
        <ThemeButton theme={theme} toggle={toggle} />
      </header>

      <div className="proto-h-body">
        <nav className="proto-card proto-h-rail" ref={railRef as React.RefObject<HTMLElement>} aria-label="Navigation Rail">
          {MODULES.map(m => (
            <button key={m.id} type="button" title={`${m.label}（点击切换）`} aria-label={`${m.label} 模块`} aria-pressed={opened.includes(m.id)} onClick={() => toggleModule(m.id)}>{m.glyph}</button>
          ))}
          <span className="proto-h-rail-sep" aria-hidden="true" />
          <button type="button" title="收起侧栏（保留模块与宽度）" aria-label="收起侧栏" onClick={collapseSidebar}><IconPanelClose /></button>
          <button type="button" ref={expandBtnRef} className="proto-h-hover-anchor" title="展开侧栏" aria-label="展开侧栏"
            onClick={() => { setCollapsed(false); if (mode === 'auto') setPeek(true); }}><IconPanelOpen /></button>
          <button type="button" title={mode === 'pinned' ? '取消固定（自动隐藏）' : '固定侧栏'} aria-label={mode === 'pinned' ? '取消固定（自动隐藏）' : '固定侧栏'} aria-pressed={mode === 'pinned'}
            onClick={toggleMode}>{mode === 'pinned' ? <IconPin /> : <IconPinOff />}</button>
          <span className="proto-h-rail-spacer" />
        </nav>

        {sideRender && visibility !== 'gone' && (
          <>
            <aside className="proto-card proto-h-sidebar" data-phase={sidePhase}
              style={{ flex: `0 0 ${sidePhase === 'open' ? width : 0}px`, opacity: sidePhase === 'open' ? 1 : 0 }} aria-label="模块侧栏">
              {sidebarHead(false)}
              {stack(false)}
            </aside>
            {visibility === 'expanded' && sidePhase === 'open' && (
              <div className="proto-h-resizer" role="separator" aria-label="调整模块侧栏宽度" data-active={interaction === 'resizing'} onPointerDown={startResize} />
            )}
          </>
        )}
        {peekRender && (
          <aside className="proto-card proto-h-peek" ref={peekRef as React.RefObject<HTMLElement>} data-phase={peekPhase} style={{ width: preferredWidth }} aria-label="模块侧栏（Peek）">
            {sidebarHead(true)}
            {stack(true)}
          </aside>
        )}

        <main className="proto-card proto-h-canvas-card">
          <div className="proto-h-canvas-head">
            <strong style={{ color: 'var(--text-1)', fontSize: 11 }}>{screen.title}</strong>
            <span>320 × 180 GUI px</span><span className="grow" />
            <span className="proto-chip">200%</span>
            <button type="button" onClick={() => menuClick('新增画布')}>+ Screen</button>
          </div>
          <MockCanvas nodes={screen.nodes} selected={selected} grid={grid} badges={badges}
            onSelect={id => setSelected(id)} onGesture={() => { canvasGesture.current = true; setInteraction('dragging'); }} />
          {exportOpen && (
            <aside className="proto-drawer" role="dialog" aria-label="导出结果">
              <div className="proto-card-head"><strong>导出 · 同一快照派生物</strong><span className="grow" /><button type="button" aria-label="关闭导出" onClick={() => setExportOpen(false)}>✕</button></div>
              <div className="proto-body">
                <span className="proto-chip">批次 EXP-H-001</span>
                <div className="proto-list" style={{ marginTop: 8 }}>{EXPORT_ENTRIES.map(e => <button key={e.label} type="button" onClick={() => menuClick(`下载 ${e.label}`)}><span className="proto-chip">{e.kind}</span>{e.label}</button>)}</div>
              </div>
            </aside>
          )}
        </main>

        <aside className={`proto-card proto-h-inspector ${inspectorOpen ? '' : 'collapsed'}`} aria-label="Inspector">
          <div className="proto-card-head"><strong>Inspector</strong><span className="grow" />
            <button type="button" aria-label={inspectorOpen ? '折叠属性栏' : '展开属性栏'} aria-pressed={!inspectorOpen} onClick={() => setInspectorOpen(v => !v)}>{inspectorOpen ? '›' : '‹'}</button>
          </div>
          <div className="proto-body">
            {!node && <>
              <div className="proto-field"><span>项目</span><input aria-label="项目名称" defaultValue="Untitled interface" /></div>
              <div className="proto-grid2">
                <label className="proto-field"><span>设计区宽</span><input aria-label="设计区宽" type="number" defaultValue={320} /></label>
                <label className="proto-field"><span>设计区高</span><input aria-label="设计区高" type="number" defaultValue={180} /></label>
              </div>
              <p className="proto-note">未选择组件。在画布或结构模块中选择组件。</p>
            </>}
            {node && <>
              <div className="proto-card-head" style={{ border: 0, padding: 0, minHeight: 0, marginBottom: 6 }}><strong>{node.id}</strong><span className="proto-chip">{node.label}</span></div>
              <div className="proto-grid2">
                {(['x', 'y', 'w', 'h'] as const).map(key => (
                  <label className="proto-field" key={key}><span>{key.toUpperCase()}</span>
                    <input aria-label={`${node.id} ${key}`} type="number" value={node[key]} onChange={e => patchNode({ [key]: Number(e.target.value) } as Partial<ProtoNode>)} /></label>
                ))}
              </div>
              <div className="proto-section"><h4>关联行为</h4>
                {rules.filter(r => r.source === node.id).map(r => <div className="proto-rule" key={r.id}><strong>{r.id}</strong> · {r.event}<br />{r.actions.join('；')}</div>)}
                {rules.filter(r => r.source === node.id).length === 0 && <p className="proto-note">该组件没有已配置的关联规则。</p>}
              </div>
            </>}
          </div>
        </aside>
      </div>

      <footer className="proto-card proto-statusbar">
        <span role="status">{status}</span><span className="grow" />
        <span>侧栏 {visibility} · {opened.join('/') || '无'}</span><span>{screen.id} · 320 × 180</span><span>Schema 0.38.0（模拟）</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
