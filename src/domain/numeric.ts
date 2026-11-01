/** W1-B: six-place fixed-point domain. All authoritative numbers are canonical decimals. */
export type NumericConfig = { min: number; max: number; step: number; initialValue: number; numericType: 'integer' | 'decimal'; format: { decimals: number; unit: string } };
export const NUMERIC_SCALE = 1_000_000;
export function units(value: number): number | null {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000 || Number(value.toFixed(6)) !== value) return null;
  return Math.round(value * NUMERIC_SCALE);
}
export function numericError(c: NumericConfig): string | null {
  const values = [c.min, c.max, c.step, c.initialValue], scaled = values.map(units);
  if (scaled.some(n => n === null)) return '数值须有限、绝对值不超过 10亿、最多6位小数';
  if (c.min > c.max || c.step <= 0) return '需要 min ≤ max 且 step > 0';
  if (c.numericType === 'integer' && !values.every(Number.isInteger)) return '整数模式的范围、步进和初值必须为整数';
  if (!Number.isInteger(c.format.decimals) || c.format.decimals < 0 || c.format.decimals > 6 || values.some(v => Number(v.toFixed(c.format.decimals)) !== v)) return '显示小数位必须为0–6，且足以无损显示范围、步进和初值';
  return validValue(c, c.initialValue) ? null : '初值须在范围内，位于 min 锚定步进网格或显式 max 端点';
}
export function validValue(c: NumericConfig, value: number): boolean {
  const v = units(value), lo = units(c.min), hi = units(c.max), step = units(c.step);
  return v !== null && lo !== null && hi !== null && step !== null && step > 0 && v >= lo && v <= hi && (v === hi || (v - lo) % step === 0);
}
export function formatNumber(c: NumericConfig, value: number) { return (Object.is(value, -0) ? 0 : value).toFixed(c.format.decimals); }
export function allowsDraft(c: NumericConfig, text: string) { return text.length <= 64 && (c.numericType === 'integer' ? /^-?\d*$/ : /^-?\d*(?:\.\d*)?$/).test(text); }
export function parseNumericDraft(c: NumericConfig, text: string): { value: number; error: null } | { value: null; error: string } {
  if (!allowsDraft(c, text) || !(c.numericType === 'integer' ? /^-?\d+$/ : /^-?(?:\d+(?:\.\d*)?|\.\d+)$/).test(text)) return { value: null, error: '请输入完整数值；不接受指数、空白或单位' };
  const value = Number(text), u = units(value);
  // Check textual precision too: Number("0.00000001") must never round into a valid value.
  if (u === null || (text.split('.')[1]?.length ?? 0) > 6) return { value: null, error: '数值须有限且最多6位小数' };
  if (value < c.min || value > c.max) return { value: null, error: `数值必须在 ${c.min} 到 ${c.max} 之间` };
  if (!validValue(c, value)) return { value: null, error: `数值须按 ${c.step} 步进（锚点 ${c.min}），或等于最大值 ${c.max}` };
  return { value: Object.is(value, -0) ? 0 : value, error: null };
}
/** Nearest legal grid point or explicit max endpoint; ties choose the larger value. */
export function quantizeFraction(c: NumericConfig, fraction: number): number {
  const lo = units(c.min)!, hi = units(c.max)!, step = units(c.step)!;
  if (lo === hi || !Number.isFinite(fraction)) return c.min;
  const raw = lo + Math.max(0, Math.min(1, fraction)) * (hi - lo);
  const index = Math.min(Math.floor((hi - lo) / step), Math.max(0, Math.floor((raw - lo) / step + 0.5)));
  const grid = lo + index * step;
  return (Math.abs(hi - raw) <= Math.abs(grid - raw) ? hi : grid) / NUMERIC_SCALE;
}
export function stepNumeric(c: NumericConfig, value: number, direction: -1 | 1): number {
  const lo = units(c.min)!, hi = units(c.max)!, step = units(c.step)!, v = units(value)!;
  if (lo === hi) return c.min;
  const index = Math.floor((v - lo) / step);
  const next = direction > 0 ? Math.min(hi, lo + (index + 1) * step) : v === hi && (hi - lo) % step !== 0 ? lo + index * step : Math.max(lo, lo + (index - 1) * step);
  return next / NUMERIC_SCALE;
}
export function numericFraction(c: NumericConfig, value: number) { return c.min === c.max ? 0 : (units(value)! - units(c.min)!) / (units(c.max)! - units(c.min)!); }

export type NumericEvent = { type: 'numeric-commit' | 'slider-change'; screenId: string; nodeId: string; value: number; phase: 'commit' | 'change' };
export type NumericState = { value: number; draft: string; error: string | null; focused: boolean };
export const initialNumericState = (c: NumericConfig): NumericState => ({ value: c.initialValue, draft: formatNumber(c, c.initialValue), error: null, focused: false });
export function commitNumeric(c: NumericConfig, state: NumericState): { state: NumericState; changed: boolean } {
  const parsed = parseNumericDraft(c, state.draft);
  if (parsed.error !== null) return { state: { ...state, error: parsed.error }, changed: false };
  return { state: { ...state, value: parsed.value, draft: formatNumber(c, parsed.value), error: null }, changed: state.value !== parsed.value };
}

export const NUMERIC_RUNTIME_CONTRACT = {
  scale: 1000000, bounds: 'finite canonical decimals <=6 fractional places, absolute value <=1e9; never silently repair authoritative JSON',
  grid: 'min+k*step <=max, plus explicit max endpoint even off-grid; min==max is a single legal value; nearest ties choose larger',
  arithmetic: 'parse decimal exactly into scaled long integers (1e6), use integer differences/modulo/index arithmetic; no repeated floating addition; browser accepts canonical JS numbers only; game use BigDecimal.valueOf(number).movePointRight(6).longValueExact()',
  format: 'fixed decimals 0..6, enough to preserve all configured numbers; unit is display/narration metadata, never parsed as editable numeric text',
  numericInput: 'compose native EditBox with setFilter for <=64-char partial decimal grammar, setResponder for draft only; Enter and focus-loss commit; invalid commit retains draft/error and last valid value; unchanged values emit no commit, including Enter followed by blur/Tab; screen removal discards draft without commit',
  inputGrammar: 'integer: -?digits; decimal: optional minus and one dot, ASCII digits only; partial empty/-/./-. allowed; complete values must parse, fit range/grid, <=6 fractional places; no exponent/plus/comma/whitespace/NaN/Infinity; no clamp or snap on submit',
  slider: 'subclass native AbstractSliderButton; keep native mouse onClick/onDrag and track/8px handle rendering; applyValue quantizes incoming fraction then rewrites protected value to canonical fraction; suppress unchanged callbacks and initialization; override keyPressed left/right to one adjacent legal value and return true; disabled blocks all changes',
  sliderEndpoints: 'mouse fraction=(mouseX-(x+4))/(width-8), clamp 0..1; width>=9 and height>=9; min==max avoids division and stays at normalized0; left/right only (other navigation to Screen); no wheel change; value changes emit immediately, release emits no duplicate final event',
  extendedSlider: 'not selected: stock zero-anchored snapping differs; applyValue is empty and keyPressed changes value but returns false; do not substitute without adapting all semantics',
  events: 'strong typed unbound intents only: numeric-commit or slider-change {screenId,nodeId,value,phase}; no F2 numeric dataflow/business binding/scripts; implementer explicitly supplies consumer',
  lifecycle: 'all value/draft/error/focus/capture/events are PreviewSession memory; every directed open_screen including self rebuilds from design initialValue; reset/close discards without submitting; exports always use initialValue',
  shadow: 'Numeric Input uses audited NeoForge EditBox.setTextShadow(boolean); Slider has explicit props.textShadow/color; custom text draw required when differing from native; preserve native track/handle and input',
  verification: 'W1-B Minecraft runtime PENDING until actual exported ZIP -> Codex implementation -> target game validation',
} as const;
