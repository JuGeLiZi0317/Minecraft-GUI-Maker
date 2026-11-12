import type { GuiNode } from './schema';
import { isCollapsiblePanelNode, isContainerNode } from './collapsiblePanel';
import { tabManaged, tabVisibility } from './tabGroups';

type VisibilityState = Record<string, { visible?: boolean; tabSelected?: boolean }>;

/** Page ownership supplies the legacy default. F2 overrides it, then Page and ancestors gate it. */
export function effectiveRuntimeVisibility(nodes: GuiNode[], state?: VisibilityState | null, expanded: Readonly<Record<string, boolean>> | null = {}) {
  const managed = tabManaged(nodes), active = tabVisibility(nodes, state);
  const ownVisible = (node: GuiNode) => (state?.[node.id]?.visible ?? (managed.has(node.id) ? true : node.state.visible)) && active(node.id);
  return (node: GuiNode) => {
    if (!ownVisible(node)) return false;
    const visited = new Set<string>([node.id]);
    let parentId = node.parentContainerId;
    while (parentId) {
      if (visited.has(parentId)) return false;
      visited.add(parentId);
      const parent = nodes.find(candidate => candidate.id === parentId);
      if (!parent || !isContainerNode(parent) || !ownVisible(parent)) return false;
      if (expanded && isCollapsiblePanelNode(parent) && !(expanded[parent.id] ?? parent.props.initialExpanded)) return false;
      parentId = parent.parentContainerId;
    }
    return true;
  };
}
