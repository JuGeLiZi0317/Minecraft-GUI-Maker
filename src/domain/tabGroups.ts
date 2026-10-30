import type { GuiNode } from './schema';
export type TabSelection = Record<string, { tabSelected?: boolean }>;
/** A managed node is visible only when its group's selected tab references it. */
export function tabVisibility(nodes: GuiNode[], preview?: TabSelection | null) {
  const managed = new Set<string>(), active = new Set<string>();
  for (const node of nodes) if (node.type === 'minecraft:creative-tab' && node.props.groupId) {
    for (const id of node.props.contentIds ?? []) { managed.add(id); if (preview?.[node.id]?.tabSelected ?? node.props.selected) active.add(id); }
  }
  return (id: string) => !managed.has(id) || active.has(id);
}

/** Group membership owns the default visibility of linked content in group previews. */
export function tabManaged(nodes: GuiNode[]) { const ids = new Set<string>(); for (const n of nodes) if (n.type === 'minecraft:creative-tab' && n.props.groupId) for (const id of n.props.contentIds ?? []) ids.add(id); return ids; }
