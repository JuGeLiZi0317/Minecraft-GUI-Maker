import { useRef, useState } from 'react';
import { displayText, literal } from '../domain/model';
import { isSelectionNode, selectionError, type SelectionNode } from '../domain/selection';
import type { GuiNode } from '../domain/schema';
import { useExportDraft } from '../exports/useExportDraft';

export function SelectionFields({ node, update }: { node: SelectionNode; update: (change: (node: GuiNode) => GuiNode, dry?: boolean) => boolean }) {
  const configuration = { name: node.props.name, options: node.props.options, initialSelectedOptionId: node.props.initialSelectedOptionId, ...(node.type === 'minecraft:radio-group' ? { orientation: node.props.orientation } : { visibleRows: node.props.visibleRows }) };
  const [draft, setDraft] = useState(structuredClone(configuration)), [error, setError] = useState('');
  const composing = useRef(false), applied = useRef(JSON.stringify(configuration));
  const apply = (dry: boolean) => {
    if (JSON.stringify(draft) === applied.current) return;
    if (composing.current) throw new Error('请先完成输入法组合输入');
    const reason = selectionError(draft); if (reason) throw new Error(reason);
    if (!update(n => { if (isSelectionNode(n)) Object.assign(n.props, structuredClone(draft)); return n; }, dry)) throw new Error('选项或布局无效');
    if (!dry) applied.current = JSON.stringify(draft);
  };
  useExportDraft({ validate: () => apply(true), commit: () => apply(false) });
  return <section aria-label="选择选项" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}>
    <label className="field"><span>组名／控件名称</span><input aria-label="选择控件名称" value={displayText(draft.name)} onChange={e => setDraft({ ...draft, name: draft.name.kind === 'translate' ? { ...draft.name, fallback: e.target.value } : literal(e.target.value) })}/></label>
    {draft.options.map((option, index) => <div key={option.id} aria-label={`选项 ${option.id}`}>
      <code>{option.id}</code><input aria-label={`选项文字 ${option.id}`} value={displayText(option.label)} onChange={e => setDraft({ ...draft, options: draft.options.map(o => o.id === option.id ? { ...o, label: o.label.kind === 'translate' ? { ...o.label, fallback: e.target.value } : literal(e.target.value) } : o) })}/>
      <label><input type="checkbox" aria-label={`禁用选项 ${option.id}`} checked={option.disabled} onChange={e => setDraft({ ...draft, options: draft.options.map(o => o.id === option.id ? { ...o, disabled: e.target.checked } : o) })}/>禁用</label>
      <button disabled={index === 0} onClick={() => { const options = [...draft.options]; [options[index - 1], options[index]] = [options[index], options[index - 1]]; setDraft({ ...draft, options }); }}>上移 {option.id}</button>
      <button disabled={index === draft.options.length - 1} onClick={() => { const options = [...draft.options]; [options[index + 1], options[index]] = [options[index], options[index + 1]]; setDraft({ ...draft, options }); }}>下移 {option.id}</button>
      <button onClick={() => setDraft({ ...draft, options: draft.options.filter(o => o.id !== option.id) })}>删除 {option.id}</button>
    </div>)}
    <button disabled={draft.options.length >= 100} onClick={() => { const id = `option_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`; setDraft({ ...draft, options: [...draft.options, { id, label: literal('Option'), disabled: false }] }); }}>新增选项</button>
    <label className="field"><span>初始选择</span><select aria-label="初始选择" value={draft.initialSelectedOptionId} onChange={e => setDraft({ ...draft, initialSelectedOptionId: e.target.value })}><option value="" disabled>请选择</option>{!draft.options.some(o => o.id === draft.initialSelectedOptionId) && <option value={draft.initialSelectedOptionId} disabled>已删除：请选择替代项</option>}{draft.options.map(o => <option key={o.id} value={o.id} disabled={o.disabled}>{displayText(o.label)} ({o.id})</option>)}</select></label>
    {'orientation' in draft && <label>布局<select aria-label="单选组布局" value={draft.orientation} onChange={e => setDraft({ ...draft, orientation: e.target.value as 'vertical' | 'horizontal' })}><option value="vertical">纵向</option><option value="horizontal">横向</option></select></label>}
    {'visibleRows' in draft && <label>最大可见行数<input aria-label="下拉可见行数" type="number" min={1} max={12} value={draft.visibleRows} onChange={e => setDraft({ ...draft, visibleRows: Number(e.target.value) })}/></label>}
    <button onClick={() => { try { apply(true); apply(false); setError(''); } catch (e) { setError((e as Error).message); } }}>应用选择选项</button>
    {error && <p role="alert">{error}</p>}
    <p className="field-note">整组原子提交；删除或禁用初值须明确替换。单选组每项至少20px，增加选项前先扩展对应尺寸。离开节点前请应用选项，未应用草稿不会保存。事件仅为未绑定的 selection-change 意图。</p>
  </section>;
}
