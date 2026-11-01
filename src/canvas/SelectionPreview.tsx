import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { displayText } from '../domain/model';
import { dropdownPlacement, moveOption, type SelectionEvent, type SelectionNode } from '../domain/selection';
import { drawSelectionWidget, selectionCell } from '../render/selectionWidgets';

function SelectionImage({ node, selected, family }: { node: SelectionNode; selected: string; family: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => { const ctx = ref.current?.getContext('2d'); if (ctx) { ctx.clearRect(0, 0, node.bounds.w, node.bounds.h); drawSelectionWidget(ctx, node, node.bounds.w, node.bounds.h, family, selected); } }, [node, selected, family]);
  return <canvas ref={ref} width={node.bounds.w} height={node.bounds.h} style={{ width: '100%', height: '100%', pointerEvents: 'none', position: 'absolute', inset: 0, imageRendering: 'pixelated' }} aria-hidden="true"/>;
}
type Open = { nodeId: string; active: string };
export function SelectionPreview({ nodes, screenId, design, origin, zoom, family }: { nodes: SelectionNode[]; screenId: string; design: { width: number; height: number }; origin: { x: number; y: number }; zoom: number; family: string }) {
  const [values, setValues] = useState<Record<string, string>>({}), [events, setEvents] = useState<SelectionEvent[]>([]), [open, setOpen] = useState<Open | null>(null);
  const root = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null), triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const state = useRef({ nodes, open, values, zoom }); state.current = { nodes, open, values, zoom };
  const release = useRef(new Set<number>());
  const scrollDrag = useRef<{ pointerId: number; y: number; scroll: number } | null>(null);
  const confirm = (node: SelectionNode, optionId: string, source: SelectionEvent['source']) => {
    if (!node.state.enabled || !node.props.options.some(o => o.id === optionId && !o.disabled)) return;
    const stored = state.current.values[node.id];
    const previous = node.props.options.some(o => o.id === stored && !o.disabled) ? stored : node.props.initialSelectedOptionId;
    if (previous === optionId) return;
    state.current.values = { ...state.current.values, [node.id]: optionId }; setValues(state.current.values);
    setEvents(old => [...old.slice(-49), { type: 'selection-change', screenId, nodeId: node.id, optionId, phase: 'confirm', source }]);
  };
  const close = (restore = true) => { const id = state.current.open?.nodeId; state.current.open = null; scrollDrag.current = null; setOpen(null); if (restore && id) triggers.current[id]?.focus(); };
  // Relayout and owner invalidation close the transient overlay; selection survives a resize.
  const layoutKey = JSON.stringify([origin, zoom, design, family, nodes.map(n => [n.id, n.bounds, n.state, n.props])]);
  useEffect(() => { close(false); }, [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const resize = () => close(false); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => {
    const consume = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const down = (e: PointerEvent) => {
      const current = state.current.open; if (!current) return;
      release.current.add(e.pointerId); consume(e);
      const node = state.current.nodes.find(n => n.id === current.nodeId); if (!node) { close(false); return; }
      const element = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-choice-option]') : null;
      if (element && list.current?.contains(element)) {
        const optionId = element.dataset.choiceOption!;
        if (e.button === 0 && node.props.options.some(o => o.id === optionId && !o.disabled)) { confirm(node, optionId, 'pointer'); close(); }
      } else if (list.current?.contains(e.target as Node)) {
        if (e.button === 0) scrollDrag.current = { pointerId: e.pointerId, y: e.clientY, scroll: list.current.scrollTop };
      } else close();
    };
    const up = (e: PointerEvent) => { if (scrollDrag.current?.pointerId === e.pointerId) scrollDrag.current = null; if (release.current.delete(e.pointerId) || state.current.open) consume(e); };
    const move = (e: PointerEvent) => { if (state.current.open || release.current.has(e.pointerId)) { e.stopImmediatePropagation(); if (e.buttons) e.preventDefault(); const drag = scrollDrag.current; if (drag?.pointerId === e.pointerId && list.current) list.current.scrollTop = drag.scroll + (e.clientY - drag.y) * list.current.scrollHeight / Math.max(1, list.current.clientHeight); } };
    const click = (e: MouseEvent) => { const blocked = state.current.open || (suppressClick.current && e.detail > 0); suppressClick.current = false; if (blocked) consume(e); };
    const mark = (e: PointerEvent) => { suppressClick.current = !!state.current.open || release.current.has(e.pointerId); };
    const wheel = (e: WheelEvent) => { if (!state.current.open) return; consume(e); if (list.current) list.current.scrollTop += e.deltaY * (e.deltaMode === 1 ? 20 * state.current.zoom : e.deltaMode === 2 ? list.current.clientHeight : 1); };
    const key = (e: KeyboardEvent) => {
      const current = state.current.open; if (!current) return;
      consume(e); const node = state.current.nodes.find(n => n.id === current.nodeId); if (!node) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'Tab') {
        const trigger = triggers.current[node.id];
        const scope = root.current?.parentElement;
        const controls = scope ? Array.from(scope.querySelectorAll<HTMLElement>('[data-selection-focus], .numeric-live-input input:not(:disabled), .numeric-live-slider[tabindex="0"]')).filter(el => el.tabIndex >= 0 && !el.matches(':disabled,[aria-disabled="true"]')) : [];
        const index = trigger ? controls.indexOf(trigger) : -1; close(false);
        if (controls.length) controls[(index + (e.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
      } else if (e.key === 'Enter' || e.key === ' ') { confirm(node, current.active, 'keyboard'); close(); }
      else {
        const enabled = node.props.options.filter(o => !o.disabled);
        const active = e.key === 'Home' ? enabled[0].id : e.key === 'End' ? enabled.at(-1)!.id : e.key === 'ArrowDown' || e.key === 'ArrowUp' ? moveOption(node.props.options, current.active, e.key === 'ArrowDown' ? 1 : -1) : current.active;
        const next = { ...current, active }; state.current.open = next; setOpen(next);
      }
    };
    const registrations: [string, EventListener][] = [['pointerdown', mark as EventListener], ['pointerdown', down as EventListener], ['pointerup', up as EventListener], ['pointercancel', up as EventListener], ['pointermove', move as EventListener], ['click', click as EventListener], ['wheel', wheel as EventListener], ['keydown', key as EventListener]];
    registrations.forEach(([type, fn]) => window.addEventListener(type, fn, { capture: true, passive: false }));
    return () => { registrations.forEach(([type, fn]) => window.removeEventListener(type, fn, true)); release.current.clear(); scrollDrag.current = null; };
  }, [screenId]);
  const suppressClick = useRef(false);
  const owner = open ? nodes.find(n => n.id === open.nodeId && n.type === 'minecraft:dropdown' && n.state.enabled) : undefined;
  const placement = owner?.type === 'minecraft:dropdown' ? dropdownPlacement(owner.bounds, design, owner.props.options.length, owner.props.visibleRows) : null;
  useLayoutEffect(() => {
    if (!open || !list.current) return;
    list.current.focus({ preventScroll: true });
    const element = list.current.querySelector<HTMLElement>(`[data-choice-option="${open.active}"]`);
    if (element) { const top = element.offsetTop, bottom = top + element.offsetHeight; if (top < list.current.scrollTop) list.current.scrollTop = top; else if (bottom > list.current.scrollTop + list.current.clientHeight) list.current.scrollTop = bottom - list.current.clientHeight; }
  }, [open]);
  return <div ref={root} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}>
    {nodes.map(node => {
      const stored = values[node.id];
      const selected = node.props.options.some(o => o.id === stored && !o.disabled) ? stored : node.props.initialSelectedOptionId;
      const style = { position: 'absolute' as const, left: origin.x + node.bounds.x * zoom, top: origin.y + node.bounds.y * zoom, width: node.bounds.w * zoom, height: node.bounds.h * zoom, pointerEvents: 'auto' as const };
      const enabled = node.props.options.filter(o => !o.disabled);
      const buttonStyle = { position: 'absolute' as const, background: 'transparent', padding: 0, margin: 0, border: 'none', borderRadius: 0, minWidth: 0, minHeight: 0, color: 'transparent' };
      return <div key={node.id} style={style} role={node.type === 'minecraft:radio-group' ? 'radiogroup' : undefined} aria-label={displayText(node.props.name)}>
        <SelectionImage node={node} selected={selected} family={family}/>
        {node.type === 'minecraft:radio-group' ? node.props.options.map((option, index) => {
          const cell = selectionCell(node, index);
          return <button key={option.id} data-selection-focus role="radio" aria-label={`${displayText(option.label)} (${index + 1}/${node.props.options.length})`} aria-checked={selected === option.id} disabled={!node.state.enabled || option.disabled} tabIndex={selected === option.id ? 0 : -1}
            style={{ ...buttonStyle, left: cell.x * zoom, top: cell.y * zoom, width: cell.w * zoom, height: cell.h * zoom }}
            onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); confirm(node, option.id, 'pointer'); }}
            onKeyDown={e => { e.stopPropagation(); let next: string | undefined; if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) next = moveOption(node.props.options, option.id, e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1); else if (e.key === 'Home') next = enabled[0].id; else if (e.key === 'End') next = enabled.at(-1)!.id; else if (e.key === ' ' || e.key === 'Enter') next = option.id; if (next) { e.preventDefault(); confirm(node, next, 'keyboard'); const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]'); buttons?.[node.props.options.findIndex(o => o.id === next)]?.focus(); } }}/>
        }) : <button ref={el => { triggers.current[node.id] = el; }} data-selection-focus style={{ ...buttonStyle, inset: 0, width: '100%', height: '100%' }} disabled={!node.state.enabled} aria-label={`${displayText(node.props.name)}: ${displayText(node.props.options.find(o => o.id === selected)!.label)}`} aria-haspopup="listbox" aria-expanded={open?.nodeId === node.id} aria-controls={`choices-${node.id}`}
          onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); const p = dropdownPlacement(node.bounds, design, node.props.options.length, node.props.visibleRows); if (p.h < 20) return; const next = { nodeId: node.id, active: selected }; state.current.open = next; setOpen(next); }}/ >}
      </div>;
    })}
    {owner && placement && open && <div ref={list} tabIndex={-1} id={`choices-${owner.id}`} role="listbox" aria-label={displayText(owner.props.name)} aria-activedescendant={`choice-${owner.id}-${open.active}`} style={{ position: 'absolute', pointerEvents: 'auto', zIndex: 2, left: origin.x + placement.x * zoom, top: origin.y + placement.y * zoom, width: placement.w * zoom, height: placement.h * zoom, overflowY: 'auto', background: '#b0b0b0', color: '#303030', fontFamily: family, fontSize: 9 * zoom, outline: '1px solid #555' }}>
      {owner.props.options.map((o, i) => <div key={o.id} id={`choice-${owner.id}-${o.id}`} role="option" aria-selected={(values[owner.id] ?? owner.props.initialSelectedOptionId) === o.id} aria-disabled={o.disabled} aria-label={`${displayText(o.label)} (${i + 1}/${owner.props.options.length})`} data-choice-option={o.id} style={{ boxSizing: 'border-box', height: 20 * zoom, padding: `${5 * zoom}px ${4 * zoom}px`, whiteSpace: 'nowrap', overflow: 'hidden', background: open.active === o.id ? '#d4d4d4' : undefined, color: o.disabled ? '#777' : '#' + owner.props.color.slice(3) + owner.props.color.slice(1, 3), textShadow: owner.props.textShadow ? `${zoom}px ${zoom}px #383838` : 'none' }}>{displayText(o.label)}</div>)}
    </div>}
    <output aria-label="选择事件预览" data-testid="selection-preview-events" data-events={JSON.stringify(events)} aria-live="polite" style={{ position: 'absolute', bottom: 30, left: 24, fontSize: 11 }}>{events.length ? `${events.at(-1)!.nodeId}: ${events.at(-1)!.optionId}` : '选择事件：暂无有效变更'}</output>
  </div>;
}
