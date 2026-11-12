import { useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { CATALOG } from '../domain/catalog';
import { displayText } from '../domain/model';
import type { GuiNode, TextSpec } from '../domain/schema';
import { editorStore } from '../editor/store';
import { useExportDraft } from '../exports/useExportDraft';
import { duplicateTranslationKeyUses, normalizeNamespaceCandidate, suggestedTranslationKey } from '../domain/localization';

/** Single-line text/number field with draft, IME guard and export-validate hook. */
export function Field({ label, value, onCommit, type = 'text', min, max, unit, placeholder }: { label: string; value: string | number; onCommit: (value: string, validateOnly?: boolean) => boolean | void; type?: string; min?: number; max?: number; unit?: string; placeholder?: string }) {
  const hintId = useId();
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null), applied = useRef(String(value)), composing = useRef(false);
  const apply = (validateOnly: boolean) => {
    const text = field.current?.value ?? draft;
    if (composing.current) throw new Error(`${label}：请先完成输入法组合输入`);
    if (text === applied.current) return;
    if (onCommit(text, validateOnly) === false) throw new Error(`${label}输入无效，请修正后再导出`);
    if (!validateOnly) { applied.current = text; setError(''); }
  };
  const validate = () => { try { apply(true); } catch (e) { setError((e as Error).message); throw e; } };
  const submit = () => { try { validate(); apply(false); } catch (e) { setError((e as Error).message); } };
  useExportDraft({ validate, commit: () => apply(false) });
  return <label className="field"><span>{label}{unit && <em className="field-unit">{unit}</em>}</span><input ref={field} aria-label={label} aria-invalid={!!error} aria-describedby={error ? `${hintId}-error` : unit ? `${hintId}-unit` : undefined} type={type} min={min} max={max} placeholder={placeholder} step={type === 'number' ? 1 : undefined} value={draft}
    onChange={e => { setDraft(e.target.value); setError(''); }} onBlur={submit}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
    onKeyDown={e => { if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); setDraft(String(value)); applied.current = String(value); setError(''); } }}/>
    {unit && <span id={`${hintId}-unit`} className="sr-only">单位：GUI 逻辑像素</span>}
    {error && <small id={`${hintId}-error`} className="field-error">{error}</small>}</label>;
}

export function MultiLineField({ label, value, onCommit }: { label: string; value: string | number; onCommit: (value: string, validateOnly?: boolean) => boolean | void }) {
  const [draft, setDraft] = useState(String(value)), [error, setError] = useState('');
  const field = useRef<HTMLTextAreaElement>(null), composing = useRef(false), applied = useRef(String(value));
  const apply = (dry: boolean) => {
    const text = field.current?.value ?? draft;
    if (text === applied.current) return;
    if (composing.current) throw new Error('请先完成输入法组合输入');
    if (onCommit(text, dry) === false) throw new Error('多行文字输入无效');
    if (!dry) applied.current = text;
  };
  useExportDraft({ validate: () => apply(true), commit: () => apply(false) });
  return <label className="field multiline-field"><span>{label}</span><textarea ref={field} aria-label={label} aria-invalid={!!error} rows={5} maxLength={4096} value={draft}
    onChange={e => { setDraft(e.target.value); setError(''); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
    onBlur={() => { try { apply(true); apply(false); setError(''); } catch (e) { setError((e as Error).message); } }}
    onKeyDown={e => { if (!e.nativeEvent.isComposing && e.key === 'Escape') { setDraft(String(value)); applied.current = String(value); setError(''); } }}/>
    {error && <small className="field-error" role="alert">{error}</small>}</label>;
}

/**
 * Literal / translatable editor shared by every TextSpec property.
 * The translation key is never rewritten implicitly: regenerating it is an explicit button.
 */
export function TextFields({ label, value, commit, multiline = false, owner, keySuffix = '' }: { label: string; value: TextSpec; commit: (value: TextSpec, validateOnly?: boolean) => boolean | void; multiline?: boolean; owner?: GuiNode; keySuffix?: string }) {
  const Editor = multiline ? MultiLineField : Field;
  const project = useStore(editorStore, state => state.doc.project);
  const doc = useStore(editorStore, state => state.doc);
  const suggestion = owner ? suggestedTranslationKey({ ...doc, project }, owner, keySuffix) : normalizeNamespaceCandidate(project.name).value ? { value: `gui.${normalizeNamespaceCandidate(project.name).value}.node`, reason: null } : normalizeNamespaceCandidate(project.name);
  const duplicates = value.kind === 'translate' ? duplicateTranslationKeyUses(doc, value.key) : [];
  const setMode = (mode: string) => {
    if (mode === 'literal') commit({ kind: 'literal', value: displayText(value), ...(value.kind === 'translate' ? { disabledKey: value.key } : value.disabledKey ? { disabledKey: value.disabledKey } : {}) });
    else {
      const key = value.kind === 'literal' ? value.disabledKey ?? suggestion.value : value.key;
      if (!key) return;
      commit({ kind: 'translate', key, fallback: displayText(value) });
    }
  };
  return <>
    <label className="field"><span>{owner ? `${CATALOG[owner.type].label} · ${label}` : label}显示方式</span><select aria-label={`${label}类型`} value={value.kind}
      onChange={e => setMode(e.target.value)}>
      <option value="literal">直接输入文字</option><option value="translate">使用翻译键</option>
    </select></label>
    {value.kind === 'literal' ? <><Editor key={value.value} label={label} value={value.value} onCommit={(v, dry) => commit({ ...value, value: v }, dry)}/>{suggestion.reason && <small role="status" className="field-error">{suggestion.reason}</small>}</>
      : <><Field key={value.key} label={`${label}翻译键`} value={value.key} onCommit={(v, dry) => commit({ ...value, key: v }, dry)}/>
        <Editor key={value.fallback} label={`${label}预览文字`} value={value.fallback} onCommit={(v, dry) => commit({ ...value, fallback: v }, dry)}/>
        <p className="field-note">{owner ? `${CATALOG[owner.type].label} · ${label}。` : `${label}。`}建议键：{suggestion.value ?? suggestion.reason ?? '无法生成'}{suggestion.reason && <span className="field-error"> · {suggestion.reason}</span>}</p>
        {suggestion.value && <button type="button" title={`将以 ${suggestion.value} 替换当前键 ${value.key}`} onClick={() => commit({ ...value, key: suggestion.value! })}>按当前命名重新生成（替换为 {suggestion.value}）</button>}
        {duplicates.length > 1 && <p role="alert" className="field-error">翻译键重复：{duplicates.map(use => `${use.alias ?? use.nodeId} (${use.type} · ${use.nodeId} · ${use.propertyPath})`).join('；')}</p>}
        <p className="field-note">设计器用这段文字预览；游戏中的实际文字由翻译键对应的语言文件决定。修改别名或项目名不会覆盖此键。</p></>}
  </>;
}