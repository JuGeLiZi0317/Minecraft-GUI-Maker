import { Fragment, useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { useHoverIntent } from './hoverIntent';
import { HoverPeekTrigger } from './HoverPeekTrigger';
import { MODULE_IDS, type ModuleId, type WorkspacePreferences } from './workspacePreferences';

const MODULES: Record<ModuleId, { label: string; glyph: string }> = {
  screens: { label: 'Screens', glyph: '▤' }, structure: { label: '结构树', glyph: '⌘' }, components: { label: '组件目录', glyph: '▥' }, behavior: { label: '行为', glyph: '◇' },
};
type Props = { prefs: WorkspacePreferences; setPrefs: React.Dispatch<React.SetStateAction<WorkspacePreferences>>; open: boolean; setOpen: (open: boolean) => void; width: number; onResize: (event: PointerEvent<HTMLDivElement>) => void; blocked: boolean; hidden: boolean; reveal: number; selectedNodeId?: string | null; children: Record<ModuleId, ReactNode> };

export function HybridSidebar({ prefs, setPrefs, open, setOpen, width, onResize, blocked, hidden, reveal, selectedNodeId, children }: Props) {
  const anchor = useRef<HTMLButtonElement>(null), panel = useRef<HTMLElement>(null);
  const hasPanels = prefs.openedModules.length > 0;
  const hover = useHoverIntent(anchor, panel, prefs.left.mode, hasPanels, blocked || hidden);
  const expanded = (open || hover.peek) && hasPanels;
  useEffect(() => { if (reveal && prefs.left.mode === 'auto') hover.show(); }, [reveal]);
  useEffect(() => { if (hidden) hover.reset(); }, [hidden]);
  // Gesture transitions also reveal a reselected node whose stable ID did not change.
  useEffect(() => {
    if (!expanded || hidden || !selectedNodeId || !prefs.openedModules.includes('structure') || prefs.collapsedModules.structure) return;
    const frame = requestAnimationFrame(() => {
      const structure = panel.current?.querySelector<HTMLElement>('[data-module="structure"]');
      const row = structure?.querySelector<HTMLElement>(`[data-layer-node="${CSS.escape(selectedNodeId)}"]`);
      const body = structure?.querySelector<HTMLElement>('.hybrid-module-body');
      if (!row || !body) return;
      row.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      const toolbar = body.querySelector<HTMLElement>('.editor-layer-tools');
      const visibleTop = Math.max(body.getBoundingClientRect().top, toolbar?.getBoundingClientRect().bottom ?? 0);
      const rowTop = row.getBoundingClientRect().top;
      if (rowTop < visibleTop) body.scrollTop += rowTop - visibleTop;
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedNodeId, expanded, hidden, blocked, prefs.openedModules, prefs.collapsedModules.structure]);
  const ordered = [...prefs.openedModules, ...MODULE_IDS.filter(id => !prefs.openedModules.includes(id))];
  const toggle = (id: ModuleId) => {
    const opening = !prefs.openedModules.includes(id);
    if (opening && prefs.left.mode === 'auto') hover.show();
    setPrefs(p => ({ ...p, openedModules: opening ? [...p.openedModules, id] : p.openedModules.filter(item => item !== id) }));
  };
  const openSidebar = () => { if (!hasPanels) setPrefs(p => ({ ...p, openedModules: ['structure', 'components'], left: { ...p.left, mode: 'pinned' } })); else if (prefs.left.mode === 'auto') hover.show(); else setOpen(true); };
  const resize = (a: ModuleId, b: ModuleId) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return; event.preventDefault();
    const originalHeights = { ...prefs.panelHeights }, measuredHeights = { ...originalHeights };
    for (const id of prefs.openedModules) {
      if (prefs.collapsedModules[id]) continue;
      const height = panel.current?.querySelector<HTMLElement>(`[data-module="${id}"]`)?.getBoundingClientRect().height;
      if (height) measuredHeights[id] = Math.round(height);
    }
    const start = event.clientY, first = measuredHeights[a], total = first + measuredHeights[b];
    const move = (e: globalThis.PointerEvent) => { const next = Math.round(Math.max(94, Math.min(total - 94, first + e.clientY - start))); setPrefs(p => ({ ...p, panelHeights: { ...p.panelHeights, ...measuredHeights, [a]: next, [b]: total - next } })); };
    const finish = (cancel: boolean) => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', abort); window.removeEventListener('blur', abort); if (cancel) setPrefs(p => ({ ...p, panelHeights: originalHeights })); };
    const up = () => finish(false), abort = () => finish(true);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', abort); window.addEventListener('blur', abort);
  };
  return <div className={`hybrid-sidebar ${open ? "is-pinned" : "is-floating"} ${expanded ? "is-expanded" : "is-closed"}`} data-testid="hybrid-sidebar" data-peek={hover.peek} hidden={hidden}>
    <nav className="hybrid-rail" aria-label="工作区模块">
      {MODULE_IDS.map(id => <button type="button" key={id} title={`${MODULES[id].label}（点击切换）`} aria-label={`${MODULES[id].label} 模块`} aria-pressed={prefs.openedModules.includes(id)} onClick={() => toggle(id)}>{MODULES[id].glyph}</button>)}
      <span className="hybrid-rail-divider"/>
      <button type="button" title={expanded ? '收起组件栏' : '展开组件栏'} aria-label={expanded ? '收起组件栏' : '展开组件栏'} aria-expanded={expanded} onClick={() => { if (expanded) { hover.reset(); if (prefs.left.mode !== 'auto') setOpen(false); } else openSidebar(); }}>{expanded ? '‹' : '›'}</button>
      <button type="button" aria-label={prefs.left.mode === 'auto' ? '固定侧栏' : '启用侧栏自动隐藏'} title={prefs.left.mode === 'auto' ? '固定侧栏' : '启用侧栏自动隐藏'} onClick={() => { hover.reset(); setPrefs(p => ({ ...p, left: { ...p.left, mode: p.left.mode === 'auto' ? 'pinned' : 'auto' } })); }}>{prefs.left.mode === 'auto' ? '📌' : '◌'}</button>
    </nav>
    <HoverPeekTrigger anchor={anchor} visible={!hidden && prefs.left.mode === 'auto' && hasPanels} expanded={hover.peek} onToggle={() => { if (hover.peek) hover.reset(); else openSidebar(); }}/>
    <aside ref={panel} className="library hybrid-panels" aria-label="模块侧栏" inert={!expanded} aria-hidden={!expanded} style={{ width }}>
      <div className="hybrid-panel-stack" data-testid="hybrid-panel-stack">
        {ordered.map((id) => {
          const visible = prefs.openedModules.includes(id), collapsed = prefs.collapsedModules[id], next = visible ? prefs.openedModules[prefs.openedModules.indexOf(id) + 1] : undefined;
          return <Fragment key={id}><section className="hybrid-module" data-module={id} hidden={!visible} style={{ flex: collapsed ? '0 0 32px' : `1 1 ${prefs.panelHeights[id]}px`, minHeight: collapsed ? 32 : 94 }} aria-label={MODULES[id].label}>
            <header className="hybrid-module-head"><strong>{MODULES[id].label}</strong><span className="hybrid-grow"/>
              <button type="button" title={`${collapsed ? '展开' : '折叠'}${MODULES[id].label}`} aria-label={`${collapsed ? '展开' : '折叠'}${MODULES[id].label}`} aria-expanded={!collapsed} onClick={() => setPrefs(p => ({ ...p, collapsedModules: { ...p.collapsedModules, [id]: !p.collapsedModules[id] } }))}>{collapsed ? '▸' : '▾'}</button>
              <button type="button" title={`关闭${MODULES[id].label}模块`} aria-label={`关闭${MODULES[id].label}模块`} onClick={() => toggle(id)}>×</button>
            </header><div className="hybrid-module-body" hidden={collapsed}>{children[id]}</div>
          </section>{next && !collapsed && !prefs.collapsedModules[next] && <div className="hybrid-panel-resizer" role="separator" aria-orientation="horizontal" aria-label={`调整 ${MODULES[id].label} 与 ${MODULES[next].label} 高度`} onPointerDown={resize(id, next)}/>}</Fragment>;
        })}
      </div>
    </aside>{open && expanded && <div className="hybrid-width-resizer sidebar-resizer-left" role="separator" aria-orientation="vertical" aria-label="调整组件栏宽度" onPointerDown={onResize}/>}
  </div>;
}
