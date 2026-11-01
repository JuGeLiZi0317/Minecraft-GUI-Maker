import type { GuiNode, ScreenTabGroup } from './schema';

export type CreativeTabNode = Extract<GuiNode, { type: 'minecraft:creative-tab' }>;
export const isScreenNavigationTab = (node: GuiNode): boolean => node.type === 'minecraft:creative-tab' && node.props.tabMode === 'screen-navigation';

export function screenNavigationSelected(node: GuiNode, screenId: string, groups: ScreenTabGroup[] = []) {
  if (node.type !== 'minecraft:creative-tab' || !isScreenNavigationTab(node)) return null;
  return groups.find(group => group.id === node.props.navigationGroupId)?.tabs.find(tab => tab.id === node.props.navigationTabId)?.targetScreenId === screenId;
}

export function navigationTarget(node: GuiNode, groups: ScreenTabGroup[] = []) {
  if (node.type !== 'minecraft:creative-tab' || !isScreenNavigationTab(node)) return null;
  return groups.find(group => group.id === node.props.navigationGroupId)?.tabs.find(tab => tab.id === node.props.navigationTabId) ?? null;
}
