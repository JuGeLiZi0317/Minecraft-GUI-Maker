import { visibleTreeItems, treeItemText, TREE_VIEW_COLORS, TREE_VIEW_DISCLOSURE_WIDTH, TREE_VIEW_INDENT, TREE_VIEW_LABEL_FONT_SIZE, TREE_VIEW_LABEL_INSET, TREE_VIEW_ROW_HEIGHT, type TreeViewNode } from '../domain/treeView';

export function drawTreeView(ctx: CanvasRenderingContext2D, node: TreeViewNode, width: number, height: number, family: string, expandedIds = node.props.initialExpandedIds, selectedId = node.props.initialSelectedItemId, scrollTop = 0) {
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
  ctx.fillStyle = TREE_VIEW_COLORS.background; ctx.fillRect(0, 0, width, height);
  const rows = visibleTreeItems(node.props.items, expandedIds), start = Math.max(0, Math.floor(scrollTop / TREE_VIEW_ROW_HEIGHT));
  const end = Math.min(rows.length, Math.ceil((scrollTop + height) / TREE_VIEW_ROW_HEIGHT));
  const contentHeight = rows.length * TREE_VIEW_ROW_HEIGHT, hasOverflow = contentHeight > height, rowWidth = Math.max(0, width - (hasOverflow ? 8 : 0));
  ctx.font = `${TREE_VIEW_LABEL_FONT_SIZE}px ${family}`; ctx.textBaseline = 'middle';
  for (let index = start; index < end; index++) {
    const row = rows[index], y = index * TREE_VIEW_ROW_HEIGHT - scrollTop;
    if (row.item.id === selectedId) { ctx.fillStyle = TREE_VIEW_COLORS.selected; ctx.fillRect(1, y, rowWidth - 2, TREE_VIEW_ROW_HEIGHT); }
    const left = TREE_VIEW_LABEL_INSET + row.depth * TREE_VIEW_INDENT;
    if (row.hasChildren) {
      const isOpen = expandedIds.includes(row.item.id); ctx.fillStyle = row.item.disabled ? TREE_VIEW_COLORS.disabledDisclosure : TREE_VIEW_COLORS.disclosure;
      ctx.beginPath();
      if (isOpen) { ctx.moveTo(left + 2, y + 6); ctx.lineTo(left + 10, y + 6); ctx.lineTo(left + 6, y + 11); }
      else { ctx.moveTo(left + 4, y + 4); ctx.lineTo(left + 9, y + 8); ctx.lineTo(left + 4, y + 12); }
      ctx.closePath(); ctx.fill();
    }
    const labelOffset = TREE_VIEW_DISCLOSURE_WIDTH + 1;
    ctx.save(); ctx.beginPath(); ctx.rect(left + labelOffset, y, Math.max(0, rowWidth - left - labelOffset - 4), TREE_VIEW_ROW_HEIGHT); ctx.clip();
    ctx.fillStyle = row.item.disabled ? TREE_VIEW_COLORS.disabled : row.item.selectable ? TREE_VIEW_COLORS.label : TREE_VIEW_COLORS.unselectable;
    ctx.fillText(treeItemText(row.item.label), left + labelOffset, y + TREE_VIEW_ROW_HEIGHT / 2, Math.max(0, rowWidth - left - labelOffset - 5));
    ctx.restore();
  }
  if (hasOverflow) {
    const thumbHeight = Math.max(8, height * height / contentHeight), thumbY = Math.max(0, Math.min(height - thumbHeight, scrollTop / (contentHeight - height) * (height - thumbHeight)));
    ctx.fillStyle = TREE_VIEW_COLORS.scrollbarTrack; ctx.fillRect(width - 6, 1, 4, Math.max(0, height - 2));
    ctx.fillStyle = TREE_VIEW_COLORS.scrollbarThumb; ctx.fillRect(width - 6, thumbY + 1, 4, thumbHeight);
  }
  ctx.strokeStyle = TREE_VIEW_COLORS.border; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
  ctx.restore();
}
