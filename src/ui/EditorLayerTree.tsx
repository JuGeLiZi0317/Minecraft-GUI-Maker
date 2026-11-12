import { useEffect, useState } from 'react';
import type { GuiNode, GuiScreen } from '../domain/schema';
import { CATALOG } from '../domain/catalog';
import type { EditorLayerView, EditorNodeDisplay, OtherPageMode } from '../domain/editorLayerVisibility';

type LayerMask = { display: (node: GuiNode) => EditorNodeDisplay; pageActive: (node: GuiNode) => boolean };
export function EditorLayerControls({ view, disabled, onChange }: { view: EditorLayerView; disabled: boolean; onChange: (view: EditorLayerView) => void }) {
  return <div className="editor-layer-tools" aria-label="编辑图层显示">
    <label>Page 参考<select aria-label="设计态 Page 显示" value={view.otherPages} disabled={disabled} onChange={event => onChange({ ...view, otherPages: event.target.value as OtherPageMode })}>
      <option value="current">当前 Page</option><option value="outline">其他 Page 轮廓参考</option><option value="all">全部 Page 布局检查</option>
    </select></label>
    <label><input type="checkbox" aria-label="树中隐藏非当前 Page 控件" checked={!!view.hideOtherPageNodes} disabled={disabled} onChange={event => onChange({ ...view, hideOtherPageNodes: event.target.checked })}/>树中隐藏非当前 Page 控件</label>
    <div><span>{view.hiddenIds.length} 隐藏{view.soloId ? ` · Solo ${view.soloId}` : ''}</span>
      {view.soloId && <button type="button" disabled={disabled} onClick={() => onChange({ ...view, soloId: null })}>退出 Solo</button>}
      <button type="button" disabled={disabled || (!view.hiddenIds.length && !view.soloId)} onClick={() => onChange({ ...view, hiddenIds: [], soloId: null })}>恢复编辑显示</button>
    </div>
  </div>;
}

export function EditorLayerTree({ screen, selected, bindings, view, mask, disabled, onSelect, onChange, focusRootId }: {
  screen: GuiScreen; selected: string | null; bindings: { nodeId: string; label: string; details: string }[];
  view: EditorLayerView; mask: LayerMask; disabled: boolean; onSelect: (id: string) => void; onChange: (view: EditorLayerView) => void; focusRootId?: string;
}) {
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  useEffect(() => { setCollapsedIds([]); }, [screen.id, focusRootId]);
  useEffect(() => {
    if (!selected) return;
    const ancestors: string[] = [];
    let current = screen.nodes.find(node => node.id === selected);
    const seen = new Set<string>();
    while (current?.parentContainerId && !seen.has(current.parentContainerId)) {
      seen.add(current.parentContainerId); ancestors.push(current.parentContainerId);
      current = screen.nodes.find(node => node.id === current!.parentContainerId);
    }
    if (ancestors.length) setCollapsedIds(previous => previous.filter(id => !ancestors.includes(id)));
  }, [selected, screen.nodes]);
  const treeVisible = (node: GuiNode) => !view.hideOtherPageNodes || node.type === 'minecraft:creative-tab' || mask.pageActive(node);
  const render = (node: GuiNode, depth = 0): React.ReactNode => {
    const display = mask.display(node), binding = bindings.find(item => item.nodeId === node.id);
    const hidden = view.hiddenIds.includes(node.id), solo = view.soloId === node.id;
    const lockedSet = new Set(view.lockedIds ?? []);
    let lockedAncestor: string | null = null;
    const seenLock = new Set<string>();
    let lockCursor: GuiNode | undefined = node;
    while (lockCursor && !seenLock.has(lockCursor.id)) {
      seenLock.add(lockCursor.id);
      if (lockedSet.has(lockCursor.id)) { lockedAncestor = lockCursor.id; break; }
      lockCursor = lockCursor.parentContainerId ? screen.nodes.find(candidate => candidate.id === lockCursor!.parentContainerId) : undefined;
    }
    const locked = !!lockedAncestor, inheritedLock = locked && lockedAncestor !== node.id;
    const children = screen.nodes.filter(child => child.parentContainerId === node.id).reverse();
    const collapsed = collapsedIds.includes(node.id);
    const toggle = (expand: boolean) => setCollapsedIds(previous => expand ? previous.filter(id => id !== node.id) : [...new Set([...previous, node.id])]);
    const note = display.reason === 'hidden' ? (hidden ? '编辑态隐藏' : '祖先编辑态隐藏') : display.reason === 'solo' ? 'Solo 排除' : display.reason === 'page' ? '非活动 Page · 仅参考' : display.reason === 'locked' ? (inheritedLock ? '随主控件锁定' : '编辑态锁定') : '';
    return <div key={node.id}>
      <div className={`layer-row ${display.hit ? '' : 'editor-layer-muted'}`} data-layer-node={node.id} data-editor-display={display.paint}>
        {children.length ? <button type="button" className="layer-collapse" aria-label={`${collapsed ? '展开' : '折叠'} ${node.id}`} aria-expanded={!collapsed} title={collapsed ? '展开子节点' : '折叠子节点'} disabled={disabled} onClick={() => toggle(collapsed)}><span aria-hidden="true">{collapsed ? '▸' : '▾'}</span></button> : <span className="layer-collapse-spacer" aria-hidden="true"/>}
        <button type="button" style={depth ? { paddingLeft: 12 + depth * 12 } : undefined} disabled={disabled || locked} className={node.id === selected ? 'layer selected' : 'layer'} aria-label={`选择 ${node.id}`} aria-describedby={`binding-description-${screen.id}-${node.id}`} aria-pressed={node.id === selected} onClick={() => onSelect(node.id)}>
          <span aria-hidden="true">{CATALOG[node.type].glyph}</span><span title={`${node.alias ?? node.id} · ${node.id}`}>{node.alias ?? node.id}<small>{CATALOG[node.type].label}{node.parentContainerId ? ' · 子节点' : ''}</small>
            <small id={`binding-description-${screen.id}-${node.id}`} className="behavior-binding-badge" data-testid={`binding-${node.id}`} title={binding?.details}>{binding?.label}</small>{note && <small className="editor-layer-note">{note}</small>}
          </span><span aria-hidden="true" title={node.state.visible ? '设计初态：显示' : '设计初态：隐藏'}>{node.state.visible ? '◦' : '–'}</span>
        </button>
        <button type="button" className="layer-view-action" aria-label={`${hidden ? '编辑态显示' : '编辑态隐藏'} ${node.id}`} title={view.soloId ? '退出 Solo 后调整隐藏集合' : hidden ? '恢复此节点编辑显示' : '临时隐藏此节点及子树'} aria-pressed={hidden} disabled={disabled || !!view.soloId} onClick={() => onChange({ ...view, hiddenIds: hidden ? view.hiddenIds.filter(id => id !== node.id) : [...view.hiddenIds, node.id] })}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"/><circle cx="10" cy="10" r="2"/>{hidden && <path d="M3 3l14 14"/>}</svg>
        </button>
        <button type="button" className="layer-lock-action" aria-label={inheritedLock ? `随 ${lockedAncestor} 锁定 ${node.id}` : locked ? `解锁 ${node.id}` : `锁定 ${node.id}`} aria-pressed={locked} title={inheritedLock ? `子控件随主控件 ${lockedAncestor} 锁定；请先解锁主控件` : locked ? '解锁控件及其子控件' : '锁定控件及其子控件'} disabled={disabled || inheritedLock} onClick={() => onChange({ ...view, lockedIds: locked && !inheritedLock ? (view.lockedIds ?? []).filter(id => id !== node.id) : [...new Set([...(view.lockedIds ?? []), node.id])] })}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="9" width="10" height="8" rx="1"/><path d={locked ? 'M7 9V7a3 3 0 0 1 6 0v2' : 'M7 9V7a3 3 0 0 1 5.5-1.5'}/></svg>
        </button>
        <button type="button" className="layer-view-action" aria-label={`Solo ${node.id}`} aria-pressed={solo} title={mask.pageActive(node) ? '独占同作用域的同级子树' : '先切换到该节点所属 Page'} disabled={disabled || !mask.pageActive(node)} onClick={() => onChange({ ...view, soloId: solo ? null : node.id })}>S</button>
      </div>
      {!collapsed && children.filter(treeVisible).map(child => render(child, depth + 1))}
    </div>;
  };
  if (focusRootId) {
    const root = screen.nodes.find(node => node.id === focusRootId);
    return <><p className="field-note" data-testid="template-tree-focus">Row Template 编辑模式 · 仅显示模板成员</p>{root ? render(root) : <p className="muted">Row Template 已不存在</p>}</>;
  }
  return <>{screen.nodes.length ? screen.nodes.filter(node => !node.parentContainerId && treeVisible(node)).reverse().map(node => render(node)) : <p className="muted">尚无组件</p>}</>;
}
