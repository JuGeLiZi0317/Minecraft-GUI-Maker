import { useRef, useState } from 'react';
import { displayText, literal } from '../domain/model';
import type { GuiNode, StatusTextSpec } from '../domain/schema';
import { isStatusNode, renameStatusId, statusError, type StatusNode } from '../domain/statusIndicator';
import { useExportDraft } from '../exports/useExportDraft';

const shownText = (entry: StatusNode['props']['statuses'][number]): StatusTextSpec => entry.text ?? entry.label;

export function StatusFields({ node, update }: { node: StatusNode; update: (change: (node: GuiNode) => GuiNode, dry?: boolean) => boolean }) {
  const original = { statuses: node.props.statuses, initialStatusId: node.props.initialStatusId };
  const [draft, setDraft] = useState(structuredClone(original)), [error, setError] = useState('');
  const composing = useRef(false), applied = useRef(JSON.stringify(original));
  const dirty = JSON.stringify(draft) !== applied.current;
  const apply = (dry: boolean) => {
    if (!dirty) return;
    if (composing.current) throw new Error('请先完成输入法组合输入');
    const reason = statusError(draft); if (reason) throw new Error(reason);
    if (!update(n => { if (isStatusNode(n)) Object.assign(n.props, structuredClone(draft)); return n; }, dry)) throw new Error('状态列表无效');
    if (!dry) applied.current = JSON.stringify(draft);
  };
  useExportDraft({ validate: () => apply(true), commit: () => apply(false) });
  const patch = (statusId: string, change: (entry: StatusNode['props']['statuses'][number]) => StatusNode['props']['statuses'][number]) => setDraft(d => ({ ...d, statuses: d.statuses.map(entry => entry.statusId === statusId ? change(entry) : entry) }));
  const renameId = (previousId: string, statusId: string) => setDraft(d => renameStatusId(d, previousId, statusId));
  const addStatus = () => setDraft(d => { const base = 'status_new'; let statusId = base, index = 2; while (d.statuses.some(item => item.statusId === statusId)) statusId = `${base}_${index++}`; return { ...d, statuses: [...d.statuses, { statusId, label: literal('新状态'), color: '#FF808080' }] }; });
  return <section className="status-fields" aria-label="状态定义" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}>
    {draft.statuses.map((entry, index) => { const shown = shownText(entry); return <div className="status-field-row" key={entry.statusId} aria-label={`状态 ${index + 1}`}>
      <label className="field"><span>状态 ID（稳定标识）</span><input aria-label={`状态 ID ${index + 1}`} value={entry.statusId} onChange={e => renameId(entry.statusId, e.target.value)}/></label>
      <label className="field"><span>状态名称</span><input aria-label={`状态名称 ${index + 1}`} value={displayText(entry.label)} onChange={e => patch(entry.statusId, current => ({ ...current, label: current.label.kind === 'translate' ? { ...current.label, fallback: e.target.value } : literal(e.target.value), ...(current.text ? {} : { text: { kind: 'literal' as const, value: displayText(current.label) } }) }))}/></label>
      <label className="field"><span>显示文本模式</span><select aria-label={`显示文本模式 ${index + 1}`} value={shown.kind} onChange={e => patch(entry.statusId, current => {
        const shown = current.text ?? current.label;
        if (e.target.value === 'literal') return { ...current, text: { kind: 'literal', value: shown.kind === 'literal' ? shown.value : shown.fallback ?? `⟦${shown.key}⟧` } };
        return { ...current, text: { kind: 'translate', key: shown.kind === 'translate' ? shown.key : '', fallback: shown.kind === 'literal' ? shown.value : shown.fallback } };
      })}><option value="literal">Literal · 直接显示</option><option value="translate">Translation Key · 翻译键</option></select></label>
      {shown.kind === 'literal' ? <label className="field"><span>Literal 显示文本</span><input aria-label={`Literal 显示文本 ${index + 1}`} value={shown.value} onChange={e => patch(entry.statusId, current => ({ ...current, text: { kind: 'literal', value: e.target.value } }))}/></label> : <>
        <label className="field"><span>Translation Key</span><input aria-label={`Translation Key ${index + 1}`} value={shown.key} onChange={e => patch(entry.statusId, current => ({ ...current, text: { kind: 'translate', key: e.target.value, fallback: current.text?.kind === 'translate' ? current.text.fallback : undefined } }))}/></label>
        <label className="field"><span>Fallback 文本（可选）</span><input aria-label={`Translation fallback ${index + 1}`} value={entry.text?.kind === 'translate' ? entry.text.fallback ?? '' : ''} onChange={e => patch(entry.statusId, current => ({ ...current, text: { kind: 'translate', key: current.text?.kind === 'translate' ? current.text.key : '', ...(e.target.value ? { fallback: e.target.value } : {}) } }))}/></label>
      </>}
      <label className="field"><span>状态颜色 ARGB</span><input aria-label={`状态颜色 ${index + 1}`} value={entry.color} onChange={e => patch(entry.statusId, current => ({ ...current, color: e.target.value }))}/></label>
      <div><button disabled={index === 0} onClick={() => setDraft(d => { const statuses = [...d.statuses]; [statuses[index - 1], statuses[index]] = [statuses[index], statuses[index - 1]]; return { ...d, statuses }; })}>上移状态 {index + 1}</button>
        <button disabled={index === draft.statuses.length - 1} onClick={() => setDraft(d => { const statuses = [...d.statuses]; [statuses[index + 1], statuses[index]] = [statuses[index], statuses[index + 1]]; return { ...d, statuses }; })}>下移状态 {index + 1}</button>
        <button onClick={() => setDraft(d => ({ ...d, statuses: d.statuses.filter(item => item.statusId !== entry.statusId) }))}>删除状态 {index + 1}</button></div>
    </div>; })}
    <button disabled={draft.statuses.length >= 32} onClick={addStatus}>新增状态</button>
    <label className="field"><span>初始状态</span><select aria-label="初始状态" value={draft.initialStatusId} onChange={e => setDraft(d => ({ ...d, initialStatusId: e.target.value }))}><option value="" disabled>请选择</option>{!draft.statuses.some(item => item.statusId === draft.initialStatusId) && <option value={draft.initialStatusId} disabled>已删除：请选择替代状态</option>}{draft.statuses.map(item => <option key={item.statusId} value={item.statusId}>{displayText(item.label)} · {item.statusId}</option>)}</select></label>
    <button onClick={() => { try { apply(true); apply(false); setError(''); } catch (e) { setError((e as Error).message); } }}>应用状态定义</button>
    {error && <p role="alert" className="field-error">{error}</p>}
    <p className="field-note">状态 ID 可编辑但必须唯一；编辑器仅能同步更新本节点的 initialStatusId，不存在可追踪的业务绑定。历史 ID 不会自动重命名。名称、ID 与显示文本互相独立；应用整组状态会生成一条可撤销事务，离开节点前请应用。翻译键由游戏语言文件解析，预览显示 fallback 或 ⟦键名⟧，不会生成 lang JSON。</p>
  </section>;
}
