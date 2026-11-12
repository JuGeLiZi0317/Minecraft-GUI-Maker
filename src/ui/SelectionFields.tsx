import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { displayText, literal } from '../domain/model';
import { isSelectionNode, selectionError, type SelectionNode } from '../domain/selection';
import { collectOptionReferences, formatOptionReference, type OptionReference } from '../domain/optionReferences';
import { editorStore } from '../editor/store';
import { useExportDraft } from '../exports/useExportDraft';
import type { GuiNode, TextSpec } from '../domain/schema';
import { Field, TextFields } from './TextSpecField';

const OPTION_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const MAX_OPTIONS = 100;
type OptionRow = { id: string; text: TextSpec; disabled: boolean; origId: string };

const optionLabel = (index: number, kind: 'selection' | 'cycle') => `${kind === 'cycle' ? '选项文字' : '选项名称'} ${index + 1}`;

function nextOptionId(rows: OptionRow[]): string {
  const used = new Set(rows.map(row => row.id));
  let id = `option_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
  while (used.has(id)) id = `option_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
  return id;
}

/** Shared row editor: stable option IDs, per-option Literal/Translatable text, reorder, copy, delete. */
function OptionRows({ rows, kind, onChange, references, owner }: { rows: OptionRow[]; kind: 'selection' | 'cycle'; onChange: (rows: OptionRow[]) => void; references: Map<string, OptionReference[]>; owner: GuiNode }) {
  const blockedBy = (optionId: string) => references.get(optionId) ?? [];
  const rename = (index: number, value: string) => {
    const row = rows[index];
    if (!OPTION_ID.test(value)) throw new Error('选项 ID 必须以字母开头，只能包含字母、数字、下划线或连字符（1–64 字符）');
    if (rows.some((other, i) => i !== index && other.id === value)) throw new Error('选项 ID 必须唯一');
    const refs = row.origId && row.origId !== value ? blockedBy(row.origId) : [];
    if (refs.length) throw new Error(`选项 ${row.origId} 已被规则引用，不能改 ID：${refs.map(formatOptionReference).join('；')}`);
    onChange(rows.map((entry, i) => i === index ? { ...entry, id: value } : entry));
  };
  const remove = (index: number) => {
    const row = rows[index], refs = blockedBy(row.origId);
    if (refs.length) throw new Error(`选项 ${row.origId} 已被规则引用，不能删除：${refs.map(formatOptionReference).join('；')}`);
    if (rows.length <= 1) throw new Error('至少保留一个选项');
    onChange(rows.filter((_, i) => i !== index));
  };
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const copy = (index: number) => {
    if (rows.length >= MAX_OPTIONS) throw new Error(`最多 ${MAX_OPTIONS} 个选项`);
    const row = rows[index], id = nextOptionId(rows);
    onChange([...rows.slice(0, index + 1), { ...row, id, origId: '', text: structuredClone(row.text) }, ...rows.slice(index + 1)]);
  };
  return <fieldset className="option-rows"><legend>选项（{rows.length}/{MAX_OPTIONS}）</legend>
    {rows.map((row, index) => {
      const refs = blockedBy(row.origId);
      return <div key={`${row.origId || 'new'}-${index}`} className="option-row" data-testid="option-row">
        <Field label={`选项 ID ${index + 1}`} value={row.id} onCommit={value => { rename(index, value); }}/>
        <TextFields label={optionLabel(index, kind)} owner={owner} keySuffix={`option_${row.id}`} value={row.text} commit={(value, dry) => { if (dry) return true; if (kind === 'selection' && value.kind === 'literal' && !value.value.trim() && !row.disabled) throw new Error('选项文本不能为空'); onChange(rows.map((entry, i) => i === index ? { ...entry, text: value } : entry)); }}/>
        {kind === 'selection' && <label className="check"><input type="checkbox" aria-label={`禁用选项 ${row.id}`} checked={row.disabled} onChange={event => onChange(rows.map((entry, i) => i === index ? { ...entry, disabled: event.target.checked } : entry))}/>禁用</label>}
        {refs.length > 0 && <p className="field-note option-refs" role="status">被引用：{refs.map(reference => `${reference.ruleId}（${reference.kind}${reference.path}）`).join('；')}。改 ID 或删除会被阻止。</p>}
        <div className="option-row-actions">
          <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>上移选项 {index + 1}</button>
          <button type="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>下移选项 {index + 1}</button>
          <button type="button" disabled={rows.length >= MAX_OPTIONS} onClick={() => copy(index)}>复制选项 {index + 1}</button>
          <button type="button" disabled={rows.length <= 1 || refs.length > 0} title={refs.length ? '先解除引用' : undefined} onClick={() => remove(index)}>删除选项 {index + 1}</button>
        </div>
      </div>;
    })}
    <button type="button" disabled={rows.length >= MAX_OPTIONS} onClick={() => onChange([...rows, { id: nextOptionId(rows), origId: '', text: literal(`选项 ${rows.length + 1}`), disabled: false }])}>新增选项</button>
  </fieldset>;
}

function useOptionReferences(controlId: string) {
  const screen = useStore(editorStore, state => state.doc.screens.find(item => item.id === state.currentScreenId));
  return screen ? collectOptionReferences(screen, controlId) : new Map<string, OptionReference[]>();
}

function renameReferences(rows: OptionRow[], references: Map<string, OptionReference[]>): string | null {
  for (const row of rows) {
    if (!row.origId || row.origId === row.id) continue;
    const refs = references.get(row.origId) ?? [];
    if (refs.length) return `选项 ${row.origId} 已被规则引用，不能改 ID：${refs.map(formatOptionReference).join('；')}`;
  }
  return null;
}

export function SelectionFields({ node, update }: { node: SelectionNode; update: (change: (node: GuiNode) => GuiNode, dry?: boolean) => boolean }) {
  const [draft, setDraft] = useState(() => ({ name: node.props.name, rows: node.props.options.map(option => ({ id: option.id, origId: option.id, text: option.label, disabled: option.disabled })) as OptionRow[], initialId: node.props.initialSelectedOptionId, orientation: node.type === 'minecraft:radio-group' ? node.props.orientation : undefined, visibleRows: node.type === 'minecraft:dropdown' ? node.props.visibleRows : undefined }));
  const [error, setError] = useState('');
  const composing = useRef(false), applied = useRef(JSON.stringify({ name: node.props.name, options: node.props.options, initial: node.props.initialSelectedOptionId }));
  const references = useOptionReferences(node.id);
  const apply = (dry: boolean) => {
    if (composing.current) throw new Error('请先完成输入法组合输入');
    const duplicate = draft.rows.length !== new Set(draft.rows.map(row => row.id)).size;
    if (duplicate) throw new Error('选项 ID 必须唯一');
    const renameIssue = renameReferences(draft.rows, references); if (renameIssue) throw new Error(renameIssue);
    const reason = selectionError({ options: draft.rows.map(row => ({ id: row.id, disabled: row.disabled })), initialSelectedOptionId: draft.initialId });
    if (reason) throw new Error(reason);
    if (!update(n => {
      if (!isSelectionNode(n)) return n;
      const options = draft.rows.map(row => ({ id: row.id, label: structuredClone(row.text), disabled: row.disabled }));
      if (n.type === 'minecraft:radio-group') return { ...n, props: { ...n.props, name: draft.name, options, initialSelectedOptionId: draft.initialId, orientation: draft.orientation ?? n.props.orientation } };
      return { ...n, props: { ...n.props, name: draft.name, options, initialSelectedOptionId: draft.initialId, visibleRows: draft.visibleRows ?? n.props.visibleRows } };
    }, dry)) throw new Error('选项或布局无效');
    if (!dry) { applied.current = JSON.stringify({ name: draft.name, options: draft.rows.map(row => ({ id: row.id, label: row.text, disabled: row.disabled })), initial: draft.initialId }); setError(''); }
  };
  useExportDraft({ validate: () => apply(true), commit: () => apply(false) });
  return <section aria-label="选择选项" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}>
    <TextFields label="选择控件名称" owner={node} keySuffix="name" value={draft.name} commit={(value, dry) => { if (dry) return true; setDraft({ ...draft, name: value }); }}/>
    <OptionRows rows={draft.rows} kind="selection" references={references} owner={node} onChange={rows => setDraft({ ...draft, rows })}/>
    <label className="field"><span>初始选择</span><select aria-label="初始选择" value={draft.initialId} onChange={e => setDraft({ ...draft, initialId: e.target.value })}><option value="" disabled>请选择</option>{!draft.rows.some(row => row.id === draft.initialId) && <option value={draft.initialId} disabled>已删除：请选择替代项</option>}{draft.rows.map((row, index) => <option key={row.id} value={row.id} disabled={row.disabled}>{displayText(row.text) || `选项 ${index + 1}`}</option>)}</select></label>
    {draft.orientation !== undefined && <label>布局<select aria-label="单选组布局" value={draft.orientation} onChange={e => setDraft({ ...draft, orientation: e.target.value as 'vertical' | 'horizontal' })}><option value="vertical">纵向</option><option value="horizontal">横向</option></select></label>}
    {draft.visibleRows !== undefined && <label>最大可见行数<input aria-label="下拉可见行数" type="number" min={1} max={12} value={draft.visibleRows} onChange={e => setDraft({ ...draft, visibleRows: Number(e.target.value) })}/></label>}
    <button onClick={() => { try { apply(true); apply(false); setError(''); } catch (e) { setError((e as Error).message); } }}>应用选择选项</button>
    {error && <p role="alert">{error}</p>}
    <p className="field-note">整组原子提交；删除或禁用初值须明确替换。选项 ID 是稳定标识，文本可独立选择直接输入或翻译键；被 F2 / Switch / 共享映射 / 命名映射 / 互斥可见性引用的选项不能改 ID 或删除。单选组每项至少 20px。事件仅为未绑定的 selection-change 意图。</p>
  </section>;
}

export function CycleOptionFields({ node, update }: { node: Extract<GuiNode, { type: 'minecraft:cycle-button' }>; update: (change: (node: GuiNode) => GuiNode, dry?: boolean) => boolean }) {
  const [draft, setDraft] = useState(() => ({ rows: node.props.options.map(option => ({ id: option.id, origId: option.id, text: option.text, disabled: false })) as OptionRow[], initialId: node.props.initialOptionId }));
  const [error, setError] = useState('');
  const references = useOptionReferences(node.id);
  const apply = (dry: boolean) => {
    if (draft.rows.length !== new Set(draft.rows.map(row => row.id)).size) throw new Error('选项 ID 必须唯一');
    const renameIssue = renameReferences(draft.rows, references); if (renameIssue) throw new Error(renameIssue);
    if (!draft.rows.some(row => row.id === draft.initialId)) throw new Error('初始选项必须引用现有选项');
    if (!update(n => n.type === 'minecraft:cycle-button' ? { ...n, props: { ...n.props, options: draft.rows.map(row => ({ id: row.id, text: structuredClone(row.text) })), initialOptionId: draft.initialId } } : n, dry)) throw new Error('循环按钮选项无效');
    if (!dry) setError('');
  };
  useExportDraft({ validate: () => apply(true), commit: () => apply(false) });
  return <section aria-label="循环按钮选项">
    <OptionRows rows={draft.rows} kind="cycle" references={references} owner={node} onChange={rows => setDraft({ ...draft, rows })}/>
    <label className="field"><span>初始选项</span><select aria-label="初始选项" value={draft.initialId} onChange={e => setDraft({ ...draft, initialId: e.target.value })}>{draft.rows.map(row => <option key={row.id} value={row.id}>{row.id} · {displayText(row.text)}</option>)}</select></label>
    <button onClick={() => { try { apply(true); apply(false); setError(''); } catch (e) { setError((e as Error).message); } }}>应用循环按钮选项</button>
    {error && <p role="alert">{error}</p>}
    <p className="field-note">最多 {MAX_OPTIONS} 个选项。选项 ID 是稳定设计标识，与显示文本分开；文本可独立使用直接输入或翻译键，游戏内由语言文件解析。交互预览点击循环、Shift+点击反向。</p>
  </section>;
}