import { behaviorReadDependencies, actionsOf, behaviorLeafActions, sourcesOf, type GuiProject } from './schema';
import { isSelectionNode } from './selection';
import { isStatusNode } from './statusIndicator';

export type DeletionTarget = { kind: 'node' | 'screen'; screenId: string; nodeId?: string };
export type DeletionPlan = { document: GuiProject; rules: { screenId: string; ruleId: string }[]; nodeIds: string[]; targetIds: string[]; tabIds: string[]; mappingChanges: { mapId: string; removedPairs: number }[]; entryReplacement?: string };

/** Detach dependencies in document order, then remove their owners. The caller commits the whole result once. */
export function planDeletion(document: GuiProject, target: DeletionTarget): DeletionPlan {
  const next = structuredClone(document), owner = next.screens.find(screen => screen.id === target.screenId);
  if (!owner) throw new Error('Screen 不存在');
  const removedNodes = new Set<string>(), removedTargets = new Map<string, Set<string>>(), removedTabs = new Set<string>();
  const plan: DeletionPlan = { document: next, rules: [], nodeIds: [], targetIds: [], tabIds: [], mappingChanges: [] };
  if (target.kind === 'node') {
    if (!target.nodeId || !owner.nodes.some(node => node.id === target.nodeId)) throw new Error('组件不存在');
    if (owner.nodes.some(node => node.parentContainerId === target.nodeId)) throw new Error('容器仍包含子节点，请先将子节点移出容器');
    removedNodes.add(target.nodeId);
  } else {
    if (next.screens.length <= 1) throw new Error('必须保留至少一个 Screen');
    owner.nodes.forEach(node => removedNodes.add(node.id));
    for (const screen of next.screens) {
      const ids = new Set((screen.screenTargets ?? []).filter(item => item.boundScreenId === owner.id).map(item => item.id));
      removedTargets.set(screen.id, ids); plan.targetIds.push(...ids);
    }
    for (const group of next.screenTabGroups ?? []) {
      for (const tab of group.tabs) if (tab.targetScreenId === owner.id) { removedTabs.add(`${group.id}/${tab.id}`); plan.tabIds.push(tab.id); }
    }
    for (const screen of next.screens) for (const node of screen.nodes) {
      if (node.type === 'minecraft:creative-tab' && removedTabs.has(`${node.props.navigationGroupId}/${node.props.navigationTabId}`)) removedNodes.add(node.id);
    }
    if (next.entryScreenId === owner.id) { plan.entryReplacement = next.screens.find(screen => screen.id !== owner.id)!.id; next.entryScreenId = plan.entryReplacement; }
  }
  for (const screen of next.screens) {
    const targets = removedTargets.get(screen.id);
    screen.behaviors = screen.behaviors.filter(rule => {
      const affected = (target.kind === 'screen' && screen.id === owner.id) || sourcesOf(rule).some(id => removedNodes.has(id))
        || actionsOf(rule).some(action => behaviorReadDependencies(action).some(read => removedNodes.has(read.nodeId)))
        || actionsOf(rule).flatMap(behaviorLeafActions).some(action => action.type === 'open_screen' ? targets?.has(action.targetScreenId) : action.type === 'set-exclusive-visible' ? action.mapping.some(mapping => removedNodes.has(mapping.targetId)) : removedNodes.has(action.targetId));
      if (affected) plan.rules.push({ screenId: screen.id, ruleId: rule.id });
      return !affected;
    });
    if (screen.screenTargets && targets?.size) screen.screenTargets = screen.screenTargets.filter(item => !targets.has(item.id));
    const removedSelectedGroups = new Set(screen.nodes.filter(node => removedNodes.has(node.id) && node.type === 'minecraft:creative-tab' && node.props.selected).flatMap(node => node.type === 'minecraft:creative-tab' && node.props.groupId ? [node.props.groupId] : []));
    screen.nodes = screen.nodes.filter(node => !removedNodes.has(node.id));
    if (screen.bakeGroups) screen.bakeGroups = screen.bakeGroups.flatMap(group => {
      const memberIds = group.memberIds.filter(id => !removedNodes.has(id));
      return memberIds.length ? [{ ...group, memberIds }] : [];
    });
    if (!(target.kind === 'screen' && screen.id === owner.id)) {
      const options = new Set(screen.nodes.filter(isSelectionNode).flatMap(node => node.props.options.map(option => option.id)));
      const statuses = new Set(screen.nodes.filter(isStatusNode).flatMap(node => node.props.statuses.map(status => status.statusId)));
      for (const map of screen.behaviorMaps ?? []) {
        const count = map.mappings.length;
        map.mappings = map.mappings.filter(pair => options.has(pair.optionId) && statuses.has(pair.statusId));
        if (count !== map.mappings.length) plan.mappingChanges.push({ mapId: map.id, removedPairs: count - map.mappings.length });
      }
    }
    for (const node of screen.nodes) if (node.type === 'minecraft:creative-tab') {
      if (node.props.contentIds) node.props.contentIds = node.props.contentIds.filter(id => !removedNodes.has(id));
      if (node.props.groupId && removedSelectedGroups.delete(node.props.groupId)) node.props.selected = true;
    }
  }
  if (target.kind === 'screen') {
    if (next.screenTabGroups) next.screenTabGroups = next.screenTabGroups.map(group => ({ ...group, tabs: group.tabs.filter(tab => !removedTabs.has(`${group.id}/${tab.id}`)) })).filter(group => group.tabs.length > 0);
    next.screens = next.screens.filter(screen => screen.id !== owner.id);
  }
  plan.nodeIds = [...removedNodes];
  return plan;
}
