import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { literal } from '../domain/model';
import type { GuiNode, StatusTextSpec, TextSpec } from '../domain/schema';
import { isStatusNode, renameStatusId, statusError, statusLabel, type StatusNode } from '../domain/statusIndicator';
import { collectStatusReferences, formatStatusReference, type StatusReference } from '../domain/statusReferences';
import { useExportDraft } from '../exports/useExportDraft';
import { editorStore } from '../editor/store';
import { Field, TextFields } from './TextSpecField';

type StatusEntry = StatusNode['props']['statuses'][number];
type StatusDraft = StatusEntry & { origId: string };
const STATUS_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/** StatusTextSpec allows an omitted fallback; the shared TextSpec editor always carries one. */
const toTextSpec = (text: StatusTextSpec): TextSpec => text.kind === 'literal' ? text : { kind: 'translate', key: text.key, fallback: text.fallback ?? '' };

export function StatusFields({ node, update }: { node: StatusNode; update: (change: (node: GuiNode) => GuiNode, dry?: boolean) => boolean }) {
  const doc = useStore(editorStore, state => state.doc);
  const screenId = useStore(editorStore, state => state.currentScreenId);
  const screen = doc.screens.find(item => item.id === screenId);
  const references = screen ? collectStatusReferences(screen, node.id) : new Map<string, StatusReference[]>();
  const original = { statuses: node.props.statuses, initialStatusId: node.props.initialStatusId };
  const [draft, setDraft] = useState(() => ({
    statuses: node.props.statuses.map(entry => ({ ...structuredClone(entry), origId: entry.statusId })) as StatusDraft[],
    initialStatusId: node.props.initialStatusId,
  }));
  const [error, setError] = useState('');
  const composing = useRef(false), applied = useRef(JSON.stringify(original));
  const bareStatuses = draft.statuses.map(({ origId: _origId, ...entry }) => entry);
  const dirty = JSON.stringify({ statuses: bareStatuses, initialStatusId: draft.initialStatusId }) !== applied.current;

  const apply = (dry: boolean) => {
    if (!dirty) return;
    if (composing.current) throw new Error('请先完成输入法组合输入');
    const reason = statusError({ statuses: bareStatuses, initialStatusId: draft.initialStatusId });
    if (reason) throw new Error(reason);
    for (const row of draft.statuses) {
      if (!row.origId || row.origId === row.statusId) continue;
      const refs = references.get(row.origId) ?? [];
      if (refs.length) throw new Error(`状态 ${row.origId} 已被规则引用，不能改 ID：${refs.map(formatStatusReference).join('；')}`);
    }
    if (!update(n => { if (isStatusNode(n)) { n.props.statuses = structuredClone(bareStatuses); n.props.initialStatusId = draft.initialStatusId; } return n; }, dry)) throw new Error('状态列表无效');
    if (!dry) { applied.current = JSON.stringify({ statuses: bareStatuses, initialStatusId: draft.initialStatusId }); setDraft(d => ({ ...d, statuses: d.statuses.map(row => ({ ...row, origId: row.statusId })) })); setError(''); }
  };
  useExportDraft({ validate: () => apply(true), commit: () => apply(false) });

  const patch = (statusId: string, change: (entry: StatusDraft) => StatusDraft) => setDraft(d => ({ ...d, statuses: d.statuses.map(entry => entry.statusId === statusId ? change(entry) : entry) }));
  const commitId = (row: StatusDraft, raw: string) => {
    const next = raw.trim();
    if (next === row.statusId) return;
    if (!STATUS_ID.test(next)) throw new Error('状态 ID 必须以字母开头，只能包含字母、数字、下划线或连字符（1–64 字符）');
    if (draft.statuses.some(entry => entry.statusId === next)) throw new Error(`状态 ID 必须唯一：${next}`);
    const refs = row.origId ? references.get(row.origId) ?? [] : [];
    if (refs.length) throw new Error(`状态 ${row.origId} 已被规则引用，不能改 ID：${refs.map(formatStatusReference).join('；')}`);
    setDraft(d => renameStatusId(d, row.statusId, next) as typeof d);
  };
  const addStatus = () => setDraft(d => {
    let statusId = 'status_new', index = 2;
    while (d.statuses.some(entry => entry.statusId === statusId)) statusId = `status_new_${index++}`;
    return { ...d, statuses: [...d.statuses, { statusId, origId: '', label: literal('新状态'), color: '#FF808080' }] };
  });
  const remove = (row: StatusDraft) => {
    const refs = row.origId ? references.get(row.origId) ?? [] : [];
    if (refs.length) throw new Error(`状态 ${row.origId} 已被规则引用，不能删除：${refs.map(formatStatusReference).join('；')}`);
    if (draft.statuses.length <= 1) throw new Error('至少保留一个状态');
    setDraft(d => ({ ...d, statuses: d.statuses.filter(entry => entry.statusId !== row.statusId) }));
  };

  return <section className="status-fields" aria-label="状态定义" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}>
    {draft.statuses.map((row, index) => {
      const refs = row.origId ? references.get(row.origId) ?? [] : [];
      return <details className="status-entry" key={row.statusId} data-testid="status-row" data-status-id={row.statusId}>
        <summary>
          <span className="status-color-chip" style={{ background: `#${row.color.slice(3)}` }} aria-hidden="true"/>
          <span>{statusLabel(row)} · {row.statusId}</span>
        </summary>
        <div className="status-entry-body">
          <Field label={`状态 ID ${index + 1}`} value={row.statusId} onCommit={value => commitId(row, value)}/>
          <p className="field-note">{refs.length ? `被引用：${refs.map(formatStatusReference).join('；')}。改 ID 或删除会被阻止。` : '未被任何规则或共享映射引用，可安全修改 ID。'}</p>
          <TextFields label={`状态名称 ${index + 1}`} owner={node} keySuffix={`status_${row.statusId}`} value={row.label} commit={(value, dry) => { if (dry) return true; patch(row.statusId, current => ({ ...current, label: value })); }}/>
          <label className="check"><input type="checkbox" aria-label={`独立显示文本 ${index + 1}`} checked={!!row.text} onChange={event => patch(row.statusId, current => {
            if (event.target.checked) return { ...current, text: structuredClone(current.label) };
            const next = { ...current }; delete next.text; return next;
          })}/>独立显示文本（覆盖状态名称）</label>
          {row.text && <TextFields label={`状态显示文本 ${index + 1}`} owner={node} keySuffix={`status_${row.statusId}_display`} value={toTextSpec(row.text)} commit={(value, dry) => { if (dry) return true; patch(row.statusId, current => ({ ...current, text: value })); }}/>}
          <Field label={`状态颜色 ${index + 1}`} value={row.color} onCommit={value => { patch(row.statusId, current => ({ ...current, color: value.trim() })); }}/>
          <div className="status-entry-actions">
            <button type="button" disabled={index === 0} onClick={() => setDraft(d => { const statuses = [...d.statuses]; [statuses[index - 1], statuses[index]] = [statuses[index], statuses[index - 1]]; return { ...d, statuses }; })}>上移状态 {index + 1}</button>
            <button type="button" disabled={index === draft.statuses.length - 1} onClick={() => setDraft(d => { const statuses = [...d.statuses]; [statuses[index + 1], statuses[index]] = [statuses[index], statuses[index + 1]]; return { ...d, statuses }; })}>下移状态 {index + 1}</button>
            <button type="button" disabled={refs.length > 0 || draft.statuses.length <= 1} title={refs.length ? '先解除规则引用' : undefined} onClick={() => { try { remove(row); } catch (e) { setError((e as Error).message); } }}>删除状态 {index + 1}</button>
          </div>
        </div>
      </details>;
    })}
    <button disabled={draft.statuses.length >= 32} onClick={addStatus}>新增状态</button>
    <label className="field"><span>初始状态</span><select aria-label="初始状态" value={draft.initialStatusId} onChange={e => setDraft(d => ({ ...d, initialStatusId: e.target.value }))}><option value="" disabled>请选择</option>{!draft.statuses.some(entry => entry.statusId === draft.initialStatusId) && <option value={draft.initialStatusId} disabled>已删除：请选择替代状态</option>}{draft.statuses.map(entry => <option key={entry.statusId} value={entry.statusId}>{statusLabel(entry)} · {entry.statusId}</option>)}</select></label>
    <button onClick={() => { try { apply(true); apply(false); setError(''); } catch (e) { setError((e as Error).message); } }}>应用状态定义</button>
    {error && <p role="alert" className="field-error">{error}</p>}
    <p className="field-note">状态 ID 可编辑但必须唯一；改名会同步本节点的 initialStatusId，不自动重写 set-status、内联映射或共享 behaviorMaps 中的引用。名称与显示文本都是 Literal / Translation Key 二选一；游戏内由语言文件解析，预览显示 fallback 或 ⟦键名⟧，不会生成 lang JSON。应用整组状态会生成一条可撤销事务。</p>
  </section>;
}
