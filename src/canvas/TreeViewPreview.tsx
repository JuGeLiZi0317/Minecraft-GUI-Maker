import { useLayoutEffect, useRef, useState } from 'react';
import { displayText } from '../domain/model';
import { treeChildren, treeItemText, TREE_VIEW_COLORS, TREE_VIEW_DISCLOSURE_WIDTH, TREE_VIEW_INDENT, TREE_VIEW_LABEL_FONT_SIZE, TREE_VIEW_LABEL_INSET, TREE_VIEW_ROW_HEIGHT, visibleTreeItems, type TreeItem, type TreeViewNode } from '../domain/treeView';

export type TreeSelectionEvent = { type: 'tree-selection-change'; screenId: string; nodeId: string; itemId: string; phase: 'confirm'; source: 'pointer' | 'keyboard' };

export function TreeViewPreview({ nodes, activeNodeIds, screenId, resetKey, origin, zoom, clipInsets = {} }: {
  nodes: TreeViewNode[]; activeNodeIds: string[]; screenId: string; resetKey: number; origin: { x: number; y: number }; zoom: number;
  clipInsets?: Record<string, { top: number; right: number; bottom: number; left: number }>;
}) {
  const [states, setStates] = useState<Record<string, { expandedIds: string[]; selectedId: string; focusedId: string }>>({});
  const [events, setEvents] = useState<TreeSelectionEvent[]>([]);
  const activeIds = useRef(new Set(activeNodeIds)); activeIds.current = new Set(activeNodeIds);
  const roots = useRef<Record<string, HTMLDivElement | null>>({}), rows = useRef<Record<string, Record<string, HTMLDivElement | null>>>({});
  const currentState = (node: TreeViewNode) => states[node.id] ?? { expandedIds: node.props.initialExpandedIds, selectedId: node.props.initialSelectedItemId, focusedId: node.props.initialSelectedItemId };
  useLayoutEffect(() => {
    setStates(Object.fromEntries(nodes.map(node => [node.id, { expandedIds: [...node.props.initialExpandedIds], selectedId: node.props.initialSelectedItemId, focusedId: node.props.initialSelectedItemId }])));
  }, [screenId, resetKey]);
  useLayoutEffect(() => {
    setStates(previous => {
      let changed = Object.keys(previous).length !== nodes.length;
      const next: typeof previous = {};
      for (const node of nodes) {
        const old = previous[node.id];
        if (!old) {
          changed = true;
          next[node.id] = { expandedIds: [...node.props.initialExpandedIds], selectedId: node.props.initialSelectedItemId, focusedId: node.props.initialSelectedItemId };
          continue;
        }
        const itemIds = new Set(node.props.items.map(item => item.id));
        const expandableIds = new Set(node.props.items.filter(item => node.props.items.some(child => child.parentId === item.id)).map(item => item.id));
        const expandedIds = old.expandedIds.filter(id => expandableIds.has(id));
        const selectedId = node.props.items.some(item => item.id === old.selectedId && !item.disabled && item.selectable) ? old.selectedId : node.props.initialSelectedItemId;
        const visibleIds = new Set(visibleTreeItems(node.props.items, expandedIds).map(row => row.item.id));
        const focusedId = itemIds.has(old.focusedId) && visibleIds.has(old.focusedId) ? old.focusedId : selectedId;
        const same = selectedId === old.selectedId && focusedId === old.focusedId && expandedIds.length === old.expandedIds.length && expandedIds.every((id, index) => id === old.expandedIds[index]);
        changed ||= !same;
        next[node.id] = same ? old : { expandedIds, selectedId, focusedId };
      }
      return changed ? next : previous;
    });
  }, [nodes]);
  useLayoutEffect(() => {
    for (const node of nodes) {
      const root = roots.current[node.id];
      if (root && (!activeIds.current.has(node.id) || !node.state.enabled) && root.contains(document.activeElement)) root.blur();
    }
  }, [nodes, activeNodeIds.join('|')]);

  const update = (nodeId: string, change: (state: { expandedIds: string[]; selectedId: string; focusedId: string }) => { expandedIds: string[]; selectedId: string; focusedId: string }) => {
    const node = nodes.find(item => item.id === nodeId); if (!node) return;
    setStates(previous => { const next = change(previous[nodeId] ?? { expandedIds: [...node.props.initialExpandedIds], selectedId: node.props.initialSelectedItemId, focusedId: node.props.initialSelectedItemId }); return { ...previous, [nodeId]: next }; });
  };
  const focusRow = (node: TreeViewNode, itemId: string) => {
    const element = rows.current[node.id]?.[itemId], viewport = roots.current[node.id];
    if (element && viewport) {
      const top = element.offsetTop, bottom = top + element.offsetHeight;
      if (top < viewport.scrollTop) viewport.scrollTop = top;
      else if (bottom > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = bottom - viewport.clientHeight;
    }
  };
  const select = (node: TreeViewNode, item: TreeItem, source: TreeSelectionEvent['source']) => {
    if (item.disabled || !item.selectable) return;
    const state = currentState(node);
    if (state.selectedId === item.id) return;
    update(node.id, current => ({ ...current, selectedId: item.id, focusedId: item.id }));
    setEvents(previous => [...previous.slice(-49), { type: 'tree-selection-change', screenId, nodeId: node.id, itemId: item.id, phase: 'confirm', source }]);
  };
  const toggleExpanded = (node: TreeViewNode, itemId: string) => {
    const state = currentState(node), isOpen = state.expandedIds.includes(itemId), descendants = new Set<string>(), queue = [itemId];
    while (queue.length) { const parent = queue.shift()!; for (const child of node.props.items) if (child.parentId === parent && !descendants.has(child.id)) { descendants.add(child.id); queue.push(child.id); } }
    update(node.id, current => ({ ...current, expandedIds: isOpen ? current.expandedIds.filter(id => id !== itemId) : [...current.expandedIds, itemId], focusedId: isOpen && descendants.has(current.focusedId) ? itemId : current.focusedId }));
  };
  const handleKey = (event: React.KeyboardEvent<HTMLDivElement>, node: TreeViewNode) => {
    const state = currentState(node), visible = visibleTreeItems(node.props.items, state.expandedIds), index = visible.findIndex(row => row.item.id === state.focusedId), row = visible[index];
    let focusId: string | undefined;
    if (event.key === 'ArrowDown' && visible.length) focusId = visible[Math.min(visible.length - 1, Math.max(0, index) + 1)].item.id;
    else if (event.key === 'ArrowUp' && visible.length) focusId = visible[Math.max(0, index <= 0 ? 0 : index - 1)].item.id;
    else if (event.key === 'Home' && visible.length) focusId = visible[0].item.id;
    else if (event.key === 'End' && visible.length) focusId = visible[visible.length - 1].item.id;
    else if (event.key === 'ArrowLeft' && row) {
      const children = treeChildren(node.props.items, row.item.id);
      if (children.length && state.expandedIds.includes(row.item.id)) { event.preventDefault(); toggleExpanded(node, row.item.id); return; }
      focusId = row.item.parentId ?? undefined;
    } else if (event.key === 'ArrowRight' && row) {
      const children = treeChildren(node.props.items, row.item.id);
      if (children.length && !state.expandedIds.includes(row.item.id)) { event.preventDefault(); toggleExpanded(node, row.item.id); return; }
      focusId = children[0]?.id;
    } else if ((event.key === 'Enter' || event.key === ' ') && row) {
      event.preventDefault(); select(node, row.item, 'keyboard'); return;
    } else return;
    if (focusId) { event.preventDefault(); update(node.id, current => ({ ...current, focusedId: focusId! })); focusRow(node, focusId); }
  };

  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 31 }}>
    {nodes.map(node => {
      const state = currentState(node), visible = visibleTreeItems(node.props.items, state.expandedIds), clip = clipInsets[node.id];
      const active = activeIds.current.has(node.id);
      const style: React.CSSProperties = { position: 'absolute', left: origin.x + node.bounds.x * zoom, top: origin.y + node.bounds.y * zoom, width: node.bounds.w * zoom, height: node.bounds.h * zoom, pointerEvents: active ? 'auto' : 'none', visibility: active ? 'visible' : 'hidden', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box', background: TREE_VIEW_COLORS.background, color: TREE_VIEW_COLORS.label, border: `1px solid ${TREE_VIEW_COLORS.border}`, fontFamily: 'Minecraft, monospace', fontSize: `${TREE_VIEW_LABEL_FONT_SIZE * zoom}px`, ...(clip ? { clipPath: `inset(${clip.top}px ${clip.right}px ${clip.bottom}px ${clip.left}px)` } : {}) };
      return <div key={node.id} ref={element => { roots.current[node.id] = element; }} data-tree-view-scroll={node.id} role="tree" tabIndex={node.state.enabled ? 0 : -1} aria-disabled={!node.state.enabled || undefined} aria-label={displayText(node.props.name)} aria-activedescendant={`tree-${node.id}-${state.focusedId}`} style={style}
        onWheel={event => { if (active && node.state.enabled) event.stopPropagation(); }}
        onFocus={event => { if (!node.state.enabled) { event.currentTarget.blur(); return; } if (!visible.some(row => row.item.id === state.focusedId)) update(node.id, current => ({ ...current, focusedId: node.props.initialSelectedItemId })); }}
        onKeyDown={event => { if (active && node.state.enabled) handleKey(event, node); }}>
        {visible.map((entry, index) => {
          const item = entry.item, expanded = state.expandedIds.includes(item.id), label = treeItemText(item.label);
          return <div key={item.id} ref={element => { (rows.current[node.id] ??= {})[item.id] = element; }} id={`tree-${node.id}-${item.id}`} role="treeitem" aria-label={`${label}${item.disabled ? '（已禁用）' : !item.selectable ? '（不可选择）' : ''}`} aria-level={entry.depth + 1} aria-posinset={entry.position} aria-setsize={entry.setSize} aria-selected={state.selectedId === item.id} data-disabled={item.disabled || undefined} aria-expanded={entry.hasChildren ? expanded : undefined}
            onClick={() => { if (!active || !node.state.enabled) return; roots.current[node.id]?.focus(); update(node.id, current => ({ ...current, focusedId: item.id })); focusRow(node, item.id); select(node, item, 'pointer'); }}
            style={{ height: TREE_VIEW_ROW_HEIGHT * zoom, minHeight: TREE_VIEW_ROW_HEIGHT * zoom, display: 'flex', alignItems: 'center', boxSizing: 'border-box', whiteSpace: 'nowrap', overflow: 'hidden', paddingLeft: `${(TREE_VIEW_LABEL_INSET + entry.depth * TREE_VIEW_INDENT) * zoom}px`, background: state.selectedId === item.id ? TREE_VIEW_COLORS.selected : undefined, color: item.disabled ? TREE_VIEW_COLORS.disabled : item.selectable ? TREE_VIEW_COLORS.label : TREE_VIEW_COLORS.unselectable, cursor: item.disabled || !item.selectable ? 'default' : 'pointer' }}>
            {entry.hasChildren ? <button type="button" tabIndex={-1} aria-label={`${label}，${expanded ? '收起' : '展开'}`} aria-expanded={expanded} disabled={!node.state.enabled} onClick={event => { event.stopPropagation(); if (!active || !node.state.enabled) return; roots.current[node.id]?.focus(); toggleExpanded(node, item.id); }} style={{ width: TREE_VIEW_DISCLOSURE_WIDTH * zoom, height: TREE_VIEW_ROW_HEIGHT * zoom, padding: 0, border: 0, background: 'transparent', color: item.disabled ? TREE_VIEW_COLORS.disabledDisclosure : TREE_VIEW_COLORS.disclosure, fontSize: `${8 * zoom}px`, lineHeight: 1, flex: '0 0 auto' }}>{expanded ? '▾' : '▸'}</button> : <span aria-hidden="true" style={{ width: TREE_VIEW_DISCLOSURE_WIDTH * zoom, flex: '0 0 auto' }}/>}
            <span style={{ marginLeft: `${zoom}px`, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            {index === -1 && null}
          </div>;
        })}
      </div>;
    })}
    <output aria-label="树形选择事件预览" data-testid="tree-view-events" data-events={JSON.stringify(events)} aria-live="polite" style={{ position: 'absolute', bottom: 30, left: 24, fontSize: 11, pointerEvents: 'none' }}>{events.length ? `${events.at(-1)!.nodeId}: ${events.at(-1)!.itemId}` : '树形选择事件：暂无有效变更'}</output>
  </div>;
}
