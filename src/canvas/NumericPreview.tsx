import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { displayText } from '../domain/model';
import { allowsDraft, commitNumeric, initialNumericState, quantizeFraction, stepNumeric, type NumericEvent, type NumericState, type SliderChangeEvent } from '../domain/numeric';
import type { NumericNode } from '../render/numericWidgets';

export function NumericPreview({ nodes, activeNodeIds, screenId, origin, zoom, family, onVisualChange, onSliderValueChange, runtimeValues, clipInsets = {} }: {
  nodes: NumericNode[]; screenId: string; origin: { x: number; y: number }; zoom: number; family: string;
  activeNodeIds: string[];
  clipInsets?: Record<string, { top: number; right: number; bottom: number; left: number }>;
  onSliderValueChange?: (event: SliderChangeEvent) => void;
  runtimeValues?: Record<string, number>;
  onVisualChange: (states: Record<string, NumericState>) => void;
}) {
  const [states, setStates] = useState<Record<string, NumericState>>({}), [events, setEvents] = useState<NumericEvent[]>([]);
  const controlled = useRef(runtimeValues); controlled.current = runtimeValues;
  const current = useRef(states), alive = useRef(true), activeIds = useRef(new Set(activeNodeIds)); activeIds.current = new Set(activeNodeIds);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onVisualChange(states); }, [states, onVisualChange]);
  useEffect(() => {
    for (const wrapper of document.querySelectorAll<HTMLElement>('[data-numeric-node-id]')) {
      if (!activeIds.current.has(wrapper.dataset.numericNodeId ?? '') && wrapper.contains(document.activeElement)) wrapper.querySelector('input')?.blur();
    }
    for (const element of document.querySelectorAll<HTMLElement>('.numeric-live-slider[data-pointer-id]')) {
      const wrapper = element.closest<HTMLElement>('[data-numeric-node-id]');
      if (wrapper && activeIds.current.has(wrapper.dataset.numericNodeId ?? '')) continue;
      const pointerId = Number(element.dataset.pointerId);
      if (Number.isInteger(pointerId)) element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId }));
    }
  }, [activeNodeIds.join('|')]);
  const read = (n: NumericNode) => { const state = current.current[n.id] ?? initialNumericState(n.props); return n.type === 'minecraft:slider' && controlled.current?.[n.id] !== undefined ? { ...state, value: controlled.current[n.id] } : state; };
  const write = (n: NumericNode, state: NumericState) => { current.current = { ...current.current, [n.id]: state }; setStates(current.current); };
  const emit = (n: NumericNode, value: number) => {
    if (n.type === 'minecraft:slider') {
      const event: SliderChangeEvent = { type: 'slider-change', screenId, nodeId: n.id, value, phase: 'change' };
      setEvents(old => [...old.slice(-49), event]); onSliderValueChange?.(event);
    } else setEvents(old => [...old.slice(-49), { type: 'numeric-commit', screenId, nodeId: n.id, value, phase: 'commit' }]);
  };
  const commit = (n: NumericNode, blur = false) => {
    if (!alive.current || n.type !== 'minecraft:numeric-input') return;
    if (!n.state.enabled || !n.props.editable) { if (blur) write(n, { ...read(n), focused: false }); return; }
    const result = commitNumeric(n.props, read(n)); write(n, { ...result.state, focused: blur ? false : result.state.focused });
    if (result.changed) emit(n, result.state.value);
  };
  const change = (n: NumericNode, value: number) => {
    if (!alive.current || !activeIds.current.has(n.id) || !n.state.enabled) return;
    const before = read(n); if (before.value === value) return;
    if (n.type === 'minecraft:slider' && controlled.current) controlled.current = { ...controlled.current, [n.id]: value };
    write(n, { ...before, value }); emit(n, value);
  };
  return <>
    {nodes.map(n => {
      const active = activeIds.current.has(n.id);
      const state = read(n), name = displayText(n.props.name) || n.id;
      const clip = clipInsets[n.id], style = { position: 'absolute' as const, left: origin.x + n.bounds.x * zoom, top: origin.y + n.bounds.y * zoom, width: n.bounds.w * zoom, height: n.bounds.h * zoom, fontFamily: family, fontSize: 9 * zoom, display: active ? undefined : 'none', ...(clip ? { clipPath: `inset(${clip.top}px ${clip.right}px ${clip.bottom}px ${clip.left}px)` } : {}) };
      if (n.type === 'minecraft:numeric-input') return <div key={n.id} data-numeric-node-id={n.id} style={style} className="numeric-live-input">
        <input aria-label={`数值输入 ${n.id}`} aria-description={`${name} ${n.props.format.unit}`} title={`${name}${n.props.format.unit ? ' (' + n.props.format.unit + ')' : ''}`} aria-invalid={!!state.error} aria-describedby={state.error ? `numeric-error-${n.id}` : undefined}
          inputMode={n.props.numericType === 'integer' ? 'numeric' : 'decimal'} maxLength={64} disabled={!n.state.enabled} readOnly={!n.props.editable} value={state.draft}
          style={{ fontFamily: family, fontSize: 9 * zoom, padding: `0 ${n.props.bordered ? 4 * zoom : 0}px`, color: state.error ? '#ff746e' : n.state.enabled ? (n.props.color ? '#' + n.props.color.slice(3) + n.props.color.slice(1, 3) : '#e0e0e0') : '#a0a0a0', textShadow: n.props.textShadow ? `${zoom}px ${zoom}px #383838` : 'none' }}
          onPointerDown={e => e.stopPropagation()} onFocus={() => write(n, { ...read(n), focused: true })}
          onChange={e => { if (activeIds.current.has(n.id) && allowsDraft(n.props, e.target.value)) write(n, { ...read(n), draft: e.target.value, error: null }); }}
          onBlur={e => { const interrupted = e.currentTarget.dataset.blurReason === 'lifecycle' || !activeIds.current.has(n.id) || !n.state.enabled || !n.props.editable; delete e.currentTarget.dataset.blurReason; if (interrupted) write(n, { ...read(n), focused: false }); else commit(n, true); }}
          onKeyDown={e => { e.stopPropagation(); if (activeIds.current.has(n.id) && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commit(n); } }}/>
        {state.error && <span id={`numeric-error-${n.id}`} role="alert" className="numeric-live-error">{n.props.errorMessage}：{state.error}</span>}
      </div>;
      const fromMouse = (element: HTMLElement, clientX: number) => {
        const rect = element.getBoundingClientRect(), logical = (clientX - rect.left) / zoom;
        change(n, quantizeFraction(n.props, (logical - 4) / (n.bounds.w - 8)));
      };
      return <div key={n.id} style={style} className="numeric-live-slider" role="slider" aria-label={`滑块 ${n.id}`} aria-description={name} aria-valuemin={n.props.min} aria-valuemax={n.props.max} aria-valuenow={state.value} aria-valuetext={`${state.value} ${n.props.format.unit}`} aria-disabled={!n.state.enabled} tabIndex={n.state.enabled ? 0 : -1}
        onFocus={() => { if (n.state.enabled) write(n, { ...read(n), focused: true }); }} onBlur={() => write(n, { ...read(n), focused: false })}
        onPointerDown={e => { e.stopPropagation(); if (!active || !n.state.enabled || e.button !== 0) return; e.preventDefault(); e.currentTarget.dataset.pointerId = String(e.pointerId); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); fromMouse(e.currentTarget, e.clientX); }}
        onPointerMove={e => { if (active && e.currentTarget.hasPointerCapture(e.pointerId)) fromMouse(e.currentTarget, e.clientX); }}
        onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) { if (active) fromMouse(e.currentTarget, e.clientX); e.currentTarget.releasePointerCapture(e.pointerId); } delete e.currentTarget.dataset.pointerId; }}
        onPointerCancel={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); delete e.currentTarget.dataset.pointerId; }}
        onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); change(n, stepNumeric(n.props, read(n).value, e.key === 'ArrowLeft' ? -1 : 1)); } }}/>;
    })}
    <output className="numeric-preview-events" aria-label="数值事件预览" data-testid="numeric-preview-events" data-events={JSON.stringify(events)} aria-live="polite">
      {events.length ? `${events.at(-1)!.type} · ${events.at(-1)!.nodeId} = ${events.at(-1)!.value}` : '数值事件：暂无有效变更（仅模拟意图）'}
    </output>
  </>;
}
