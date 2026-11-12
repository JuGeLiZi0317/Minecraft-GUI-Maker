import type { BakeGroup, GuiNode, GuiScreen } from './schema';
import { actionsOf, sourcesOf } from './schema';

export type BakeMemberDiagnostic = { nodeId: string; eligible: boolean; reasons: string[] };
export type BakeGroupDiagnostic = { groupId: string; enabled: boolean; scope: { kind: 'persistent' } | { kind: 'page'; pageId: string }; bounds: { x: number; y: number; w: number; h: number } | null; members: BakeMemberDiagnostic[]; eligible: boolean; reasons: string[] };

function referencedNodeIds(screen: GuiScreen): Set<string> {
  const result = new Set<string>();
  for (const rule of screen.behaviors) {
    sourcesOf(rule).forEach(id => result.add(id));
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const object = value as Record<string, unknown>;
      if (typeof object.targetId === 'string') result.add(object.targetId);
      if (object.type === 'read-control-value' && typeof object.nodeId === 'string') result.add(object.nodeId);
      Object.values(object).forEach(visit);
    };
    actionsOf(rule).forEach(visit);
  }
  return result;
}

function pageMembership(screen: GuiScreen) {
  const map = new Map<string, Set<string>>();
  for (const page of screen.nodes) if (page.type === 'minecraft:creative-tab' && page.props.groupId && page.props.tabMode !== 'screen-navigation') {
    for (const id of page.props.contentIds ?? []) { const pages = map.get(id) ?? new Set<string>(); pages.add(page.id); map.set(id, pages); }
  }
  return map;
}

function overlapRange(ids: string[], candidates: GuiNode[]) {
  const order = candidates.map(node => node.id), positions = ids.map(id => order.indexOf(id)).sort((a, b) => a - b);
  return positions.some(position => position < 0) || positions.at(-1)! - positions[0] + 1 !== positions.length;
}

export function diagnoseBakeGroup(screen: GuiScreen, group: BakeGroup): BakeGroupDiagnostic {
  const members = group.memberIds.map(nodeId => {
    const node = screen.nodes.find(candidate => candidate.id === nodeId), reasons: string[] = [];
    if (!node) reasons.push('成员节点不存在于当前 Screen');
    else {
      if (node.type === 'native_region') reasons.push('Native Region / 真实 Slot 不参与 Bake');
      if (node.type !== 'minecraft:fill' && !(node.type === 'minecraft:image' && node.props.kind === 'embedded')) reasons.push('Static Bake 仅支持 Rectangle / Fill 与嵌入式 Image；游戏资源 Image/Sprite、文字与控件暂不支持');
      if (!node.state.visible) reasons.push('节点初始为隐藏状态');
      if (node.parentContainerId) reasons.push('容器子节点具有裁剪或滚动语义');
      if (referencedNodeIds(screen).has(node.id)) reasons.push('节点被 F2 行为引用，可能交互或改变外观');
      const pages = pageMembership(screen).get(node.id);
      if ((pages?.size ?? 0) > 1) reasons.push('节点同时属于多个互斥 Page');
    }
    return { nodeId, eligible: reasons.length === 0, reasons };
  });
  const found = group.memberIds.map(id => screen.nodes.find(node => node.id === id)).filter((node): node is GuiNode => !!node);
  const scopes = new Set(found.map(node => pageMembership(screen).get(node.id)?.values().next().value ?? 'persistent'));
  const reasons: string[] = [];
  if (scopes.size > 1) reasons.push('同一 Bake Group 的成员必须处于相同 Persistent 或单一 Page 显示范围');
  if (found.some(node => node.parentContainerId)) reasons.push('首版不支持容器裁剪和滚动坐标');
  if (found.length === group.memberIds.length && found.length) {
    const pageId = scopes.values().next().value as string;
    const inScope = screen.nodes.filter(node => !node.parentContainerId && (pageId === 'persistent' ? !pageMembership(screen).has(node.id) : !pageMembership(screen).has(node.id) || pageMembership(screen).get(node.id)?.has(pageId)));
    if (overlapRange(group.memberIds, inScope)) reasons.push('成员绘制顺序不连续；中间存在同屏节点，无法保持原始 Z-order');
  }
  const bounds = found.length ? {
    x: Math.min(...found.map(node => node.bounds.x)), y: Math.min(...found.map(node => node.bounds.y)),
    w: Math.max(...found.map(node => node.bounds.x + node.bounds.w)) - Math.min(...found.map(node => node.bounds.x)),
    h: Math.max(...found.map(node => node.bounds.y + node.bounds.h)) - Math.min(...found.map(node => node.bounds.y)),
  } : null;
  const pageId = [...scopes][0] ?? 'persistent';
  return { groupId: group.id, enabled: group.enabled, scope: pageId === 'persistent' ? { kind: 'persistent' } : { kind: 'page', pageId }, bounds, members, eligible: members.every(member => member.eligible) && reasons.length === 0, reasons };
}

export function diagnoseBakeCandidates(screen: GuiScreen) {
  const existing = new Set((screen.bakeGroups ?? []).flatMap(group => group.memberIds));
  const known = referencedNodeIds(screen), pages = pageMembership(screen);
  return screen.nodes.map(node => {
    const reasons: string[] = [];
    if (node.type === 'native_region') reasons.push('Native Region / 真实 Slot 不参与 Bake');
    else if (node.type !== 'minecraft:fill' && !(node.type === 'minecraft:image' && node.props.kind === 'embedded')) reasons.push('Static Bake 仅支持 Rectangle / Fill 与嵌入式 Image');
    if (!node.state.visible) reasons.push('节点初始为隐藏状态');
    if (node.parentContainerId) reasons.push('容器子节点具有裁剪或滚动语义');
    if (known.has(node.id)) reasons.push('被 F2 行为引用');
    if (pages.get(node.id)?.size && pages.get(node.id)!.size > 1) reasons.push('同时属于多个互斥 Page');
    if (existing.has(node.id)) reasons.push('已属于 Bake Group');
    return { nodeId: node.id, type: node.type, eligible: !reasons.length, reasons };
  });
}
