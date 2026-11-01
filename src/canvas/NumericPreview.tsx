import { useEffect, useRef, useState } from 'react';
import { displayText } from '../domain/model';
import { allowsDraft, commitNumeric, initialNumericState, quantizeFraction, stepNumeric, type NumericEvent, type NumericState } from '../domain/numeric';
import type { NumericNode } from '../render/numericWidgets';

export function NumericPreview({ nodes, screenId, origin, zoom, family, onVisualChange }: {
  nodes: NumericNode[]; screenId: string; origin: { x: number; y: number }; zoom: number; family: string;
  onVisualChange: (states: Record<string, NumericState>) => void;
}) {
  const [states, setStates] = useState<Record<string, NumericState>>({}), [events, setEvents] = useState<NumericEvent[]>([]);
  const current = useRef(states), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onVisualChange(states); }, [states, onVisualChange]);
  const read = (n: NumericNode) => current.current[n.id] ?? initialNumericState(n.props);
  const write = (n: NumericNode, state: NumericState) => { current.current = { ...current.current, [n.id]: state }; setStates(current.current); };
  const emit = (n: NumericNode, value: number) => setEvents(old => [...old.slice(-49), { type: n.type === 'minecraft:numeric-input' ? 'numeric-commit' : 'slider-change', screenId, nodeId: n.id, value, phase: n.type === 'minecraft:numeric-input' ? 'commit' : 'change' }]);
  const commit = (n: NumericNode, blur = false) => {
    if (!alive.current || n.type !== 'minecraft:numeric-input') return;
    if (!n.state.enabled || !n.props.editable) { if (blur) write(n, { ...read(n), focused: false }); return; }
    const result = commitNumeric(n.props, read(n)); write(n, { ...result.state, focused: blur ? false : result.state.focused });
    if (result.changed) emit(n, result.state.value);
  };
  const change = (n: NumericNode, value: number) => {
    if (!alive.current || !n.state.enabled) return;
    const before = read(n); if (before.value === value) return;
    write(n, { ...before, value }); emit(n, value);
  };
  return <>
    {nodes.map(n => {
      const state = states[n.id] ?? initialNumericState(n.props), name = displayText(n.props.name) || n.id;
      const style = { position: 'absolute' as const, left: origin.x + n.bounds.x * zoom, top: origin.y + n.bounds.y * zoom, width: n.bounds.w * zoom, height: n.bounds.h * zoom, fontFamily: family, fontSize: 9 * zoom };
      if (n.type === 'minecraft:numeric-input') return <div key={n.id} style={style} className="numeric-live-input">
        <input aria-label={`数值输入 ${n.id}`} aria-description={`${name} ${n.props.format.unit}`} title={`${name}${n.props.format.unit ? ' (' + n.props.format.unit + ')' : ''}`} aria-invalid={!!state.error} aria-describedby={state.error ? `numeric-error-${n.id}` : undefined}
          inputMode={n.props.numericType === 'integer' ? 'numeric' : 'decimal'} maxLength={64} disabled={!n.state.enabled} readOnly={!n.props.editable} value={state.draft}
          style={{ fontFamily: family, fontSize: 9 * zoom, padding: `0 ${n.props.bordered ? 4 * zoom : 0}px`, color: state.error ? '#ff746e' : n.state.enabled ? (n.props.color ? '#' + n.props.color.slice(3) + n.props.color.slice(1, 3) : '#e0e0e0') : '#a0a0a0', textShadow: n.props.textShadow ? `${zoom}px ${zoom}px #383838` : 'none' }}
          onPointerDown={e => e.stopPropagation()} onFocus={() => write(n, { ...read(n), focused: true })}
          onChange={e => { if (allowsDraft(n.props, e.target.value)) write(n, { ...read(n), draft: e.target.value, error: null }); }}
          onBlur={() => commit(n, true)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commit(n); } }}/>
        {state.error && <span id={`numeric-error-${n.id}`} role="alert" className="numeric-live-error">{n.props.errorMessage}：{state.error}</span>}
      </div>;
      const fromMouse = (element: HTMLElement, clientX: number) => {
        const rect = element.getBoundingClientRect(), logical = (clientX - rect.left) / zoom;
        change(n, quantizeFraction(n.props, (logical - 4) / (n.bounds.w - 8)));
      };
      return <div key={n.id} style={style} className="numeric-live-slider" role="slider" aria-label={`滑块 ${n.id}`} aria-description={name} aria-valuemin={n.props.min} aria-valuemax={n.props.max} aria-valuenow={state.value} aria-valuetext={`${state.value} ${n.props.format.unit}`} aria-disabled={!n.state.enabled} tabIndex={n.state.enabled ? 0 : -1}
        onFocus={() => { if (n.state.enabled) write(n, { ...read(n), focused: true }); }} onBlur={() => write(n, { ...read(n), focused: false })}
        onPointerDown={e => { e.stopPropagation(); if (!n.state.enabled || e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); fromMouse(e.currentTarget, e.clientX); }}
        onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) fromMouse(e.currentTarget, e.clientX); }}
        onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) { fromMouse(e.currentTarget, e.clientX); e.currentTarget.releasePointerCapture(e.pointerId); } }}
        onPointerCancel={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); change(n, stepNumeric(n.props, read(n).value, e.key === 'ArrowLeft' ? -1 : 1)); } }}/>;
    })}
    <output className="numeric-preview-events" aria-label="数值事件预览" data-testid="numeric-preview-events" data-events={JSON.stringify(events)} aria-live="polite">
      {events.length ? `${events.at(-1)!.type} · ${events.at(-1)!.nodeId} = ${events.at(-1)!.value}` : '数值事件：暂无有效变更（仅模拟意图）'}
    </output>
  </>;
}
