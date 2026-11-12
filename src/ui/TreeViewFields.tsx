import { useState } from 'react';
import { displayText, literal } from '../domain/model';
import type { GuiNode } from '../domain/schema';
import {
  isTreeViewNode, nextTreeItemId, nextTreeOrder, reconcileTreeViewProps, renameTreeItemId, treeChildren, treeDescendantIds,
  treeItemIdError, treeItemInternalReferences, treeViewError, type TreeItem, type TreeViewNode,
} from '../domain/treeView';
import { Field, TextFields } from './TextSpecField';

/** Tree View data rows: stable IDs are editable; labels are Literal/Translation Key TextSpec. */
export function TreeViewFields({ node, update }: { node: TreeViewNode; update: (change: (node: GuiNode) => GuiNode, dry?: boolean) => boolean }) {
  const [draft, setDraft] = useState({ parentId: '', id: '', label: '新树项' });
  const [error, setError] = useState('');
  const editProps = (change: (props: TreeViewNode['props']) => TreeViewNode['props'], dry = false) => update(current => {
    if (!isTreeViewNode(current)) return current;
    const props = reconcileTreeViewProps(change(structuredClone(current.props)));
    const reason = treeViewError(props); if (reason) throw new Error(reason);
    return { ...current, props };
  }, dry);

  const add = (parentId: string | null, explicitId = '', label = '新树项') => {
    const id = explicitId.trim() || nextTreeItemId(node.props.items, parentId);
    const reason = treeItemIdError(node.props.items, id); if (reason) throw new Error(reason);
    const item: TreeItem = { id, label: literal(label.trim() || '新树项'), parentId, order: nextTreeOrder(node.props.items, parentId), selectable: true, disabled: false };
    if (!editProps(props => ({ ...props, items: [...props.items, item], initialSelectedItemId: props.items.some(existing => existing.selectable && !existing.disabled) ? props.initialSelectedItemId : item.id }))) throw new Error('树项新增无效');
  };
  const rename = (item: TreeItem, raw: string, dry = false) => {
    const next = raw.trim();
    if (next === item.id) return true;
    const reason = treeItemIdError(node.props.items, next, item.id); if (reason) throw new Error(reason);
    return editProps(props => renameTreeItemId(props, item.id, next), dry);
  };
  const remove = (itemId: string) => {
    const removeIds = new Set([itemId, ...treeDescendantIds(itemId, node.props.items)]);
    if (!editProps(props => ({ ...props, items: props.items.filter(item => !removeIds.has(item.id)), initialExpandedIds: props.initialExpandedIds.filter(id => !removeIds.has(id)) }))) throw new Error('删除树项无效');
  };
  const reorder = (item: TreeItem, delta: -1 | 1) => {
    const siblings = treeChildren(node.props.items, item.parentId), index = siblings.findIndex(entry => entry.id === item.id), target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    const orders = new Map(siblings.map((entry, order) => [entry.id, order]));
    editProps(props => ({ ...props, items: props.items.map(entry => entry.parentId === item.parentId ? { ...entry, order: orders.get(entry.id)! } : entry) }));
  };
  const eligible = node.props.items.filter(item => item.selectable && !item.disabled);
  const parentsWithChildren = new Set(node.props.items.flatMap(item => item.parentId === null ? [] : [item.parentId]));
  const depthOf = (itemId: string) => {
    const byId = new Map(node.props.items.map(item => [item.id, item]));
    let depth = 0, current = byId.get(itemId);
    while (current?.parentId) { depth++; current = byId.get(current.parentId); }
    return depth;
  };

  return <section className="tree-view-fields" aria-label="树形视图配置">
    <TextFields label="控件名称" owner={node} keySuffix="name" value={node.props.name} commit={(value, dry) => editProps(props => ({ ...props, name: value }), dry)}/>
    <label className="field"><span>初始选中</span><select aria-label="初始选中树项" value={node.props.initialSelectedItemId} onChange={event => editProps(props => ({ ...props, initialSelectedItemId: event.target.value }))}>{eligible.map(item => <option key={item.id} value={item.id}>{item.id} · {displayText(item.label)}</option>)}</select></label>
    <fieldset className="tree-item-list"><legend>树项（{node.props.items.length}/256）</legend>
      {node.props.items.map(item => {
        const siblings = treeChildren(node.props.items, item.parentId), index = siblings.findIndex(entry => entry.id === item.id);
        const internal = treeItemInternalReferences(node.props, item.id);
        return <details key={item.id} className="tree-item-editor" data-testid="tree-item" data-item-id={item.id}>
          <summary style={{ paddingLeft: `${Math.min(depthOf(item.id), 8) * 10}px` }}>{item.id} · {displayText(item.label)}</summary>
          <div className="section-body">
            <Field label={`树项 ID ${item.id}`} value={item.id} onCommit={(value, dry) => rename(item, value, dry)}/>
            <TextFields label={`显示名称 ${item.id}`} owner={node} keySuffix={`item_${item.id}`} value={item.label} commit={(value, dry) => editProps(props => ({ ...props, items: props.items.map(entry => entry.id === item.id ? { ...entry, label: value } : entry) }), dry)}/>
            {internal.length > 0 && <p className="field-note">内部引用：{internal.join('、')}。改 ID 会在同一事务内自动重映射。</p>}
            <label className="field"><span>父项</span><select aria-label={`${item.id} 父项`} value={item.parentId ?? ''} onChange={event => {
              const parentId = event.target.value || null;
              if (parentId !== null && (parentId === item.id || treeDescendantIds(item.id, node.props.items).has(parentId))) return;
              const order = nextTreeOrder(node.props.items, parentId, item.id);
              editProps(props => ({ ...props, items: props.items.map(entry => entry.id === item.id ? { ...entry, parentId, order } : entry) }));
            }}><option value="">根项</option>{node.props.items.filter(candidate => candidate.id !== item.id && !treeDescendantIds(item.id, node.props.items).has(candidate.id)).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.id} · {displayText(candidate.label)}</option>)}</select></label>
            <p className="field-note">同级顺序：{index + 1}/{siblings.length}</p>
            <div className="tree-row-actions"><button type="button" disabled={index === 0} onClick={() => reorder(item, -1)}>上移 {item.id}</button><button type="button" disabled={index === siblings.length - 1} onClick={() => reorder(item, 1)}>下移 {item.id}</button>
              <button type="button" disabled={node.props.items.length >= 256} onClick={() => { try { add(item.id); setError(''); } catch (e) { setError((e as Error).message); } }}>添加子项 {item.id}</button><button type="button" disabled={node.props.items.length - treeDescendantIds(item.id, node.props.items).size < 1} onClick={() => { try { remove(item.id); setError(''); } catch (e) { setError((e as Error).message); } }}>删除此项及子树 {item.id}</button></div>
            <label className="check"><input type="checkbox" aria-label={`${item.id} 允许选择`} checked={item.selectable} onChange={event => editProps(props => ({ ...props, items: props.items.map(entry => entry.id === item.id ? { ...entry, selectable: event.target.checked } : entry) }))}/>允许选择</label>
            <label className="check"><input type="checkbox" aria-label={`${item.id} 禁用`} checked={item.disabled} onChange={event => editProps(props => ({ ...props, items: props.items.map(entry => entry.id === item.id ? { ...entry, disabled: event.target.checked } : entry) }))}/>禁用</label>
          </div>
        </details>;
      })}
    </fieldset>
    <details className="tree-add">
      <summary>新增树项（可指定可读 ID）</summary>
      <div className="tree-add-body">
        <label className="field"><span>父项</span><select aria-label="新树项父项" value={draft.parentId} onChange={event => setDraft({ ...draft, parentId: event.target.value })}><option value="">根项</option>{node.props.items.map(item => <option key={item.id} value={item.id}>{item.id} · {displayText(item.label)}</option>)}</select></label>
        <label className="field"><span>树项 ID（可选，留空自动生成）</span><input aria-label="新树项 ID" value={draft.id} onChange={event => setDraft({ ...draft, id: event.target.value })}/></label>
        <label className="field"><span>显示名称</span><input aria-label="新树项名称" value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })}/></label>
        <button type="button" disabled={node.props.items.length >= 256} onClick={() => { try { add(draft.parentId || null, draft.id, draft.label); setDraft({ parentId: draft.parentId, id: '', label: '新树项' }); setError(''); } catch (e) { setError((e as Error).message); } }}>新增树项</button>
        {error && <p role="alert" className="field-error">{error}</p>}
      </div>
    </details>
    <div className="tree-initial-expanded"><span>初始展开</span>{[...parentsWithChildren].map(id => <label key={id} className="check"><input type="checkbox" aria-label={`${id} 初始展开`} checked={node.props.initialExpandedIds.includes(id)} onChange={event => editProps(props => ({ ...props, initialExpandedIds: event.target.checked ? [...props.initialExpandedIds, id] : props.initialExpandedIds.filter(value => value !== id) }))}/>{id}</label>)}</div>
    <p className="field-note">最多 256 项、16 层。树项 ID 是稳定标识，改名会同步子项 parentId、初始展开与初始选中；标签文本可独立选择直接输入或翻译键。当前 F2 不接受树项 ID 引用，因此不存在规则引用。展开只控制可见行，选择需单独确认；Tree View 事件是未绑定的实现意图。</p>
  </section>;
}
