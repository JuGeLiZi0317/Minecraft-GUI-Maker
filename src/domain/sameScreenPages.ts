import type { GuiNode, GuiScreen } from './schema';

export type SameScreenPage = { id: string; groupId: string; contentIds: string[]; initial: boolean };

/**
 * Q3-A deliberately reuses the H2-B authority model. A CreativeTab node ID is
 * the stable Page ID; groupId scopes the Page Group to its owning Screen;
 * contentIds are explicit Page ownership; all other nodes are persistent.
 */
export function sameScreenPages(screen: GuiScreen): SameScreenPage[] {
  return screen.nodes.flatMap(node => node.type === 'minecraft:creative-tab' && node.props.groupId
    ? [{ id: node.id, groupId: node.props.groupId, contentIds: [...(node.props.contentIds ?? [])], initial: node.props.selected }]
    : []);
}

export function persistentWidgetIds(screen: GuiScreen): string[] {
  const owned = new Set(sameScreenPages(screen).flatMap(page => page.contentIds));
  return screen.nodes.filter(node => node.type !== 'minecraft:creative-tab' && !owned.has(node.id)).map(node => node.id);
}

export function activePageIds(nodes: GuiNode[], selection?: Record<string, { tabSelected?: boolean }> | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const node of nodes) if (node.type === 'minecraft:creative-tab' && node.props.groupId && (selection?.[node.id]?.tabSelected ?? node.props.selected)) result[node.props.groupId] = node.id;
  return result;
}

export const SAME_SCREEN_PAGE_RUNTIME_CONTRACT = {
  screenInstance: 'one Screen/Menu instance and one PreviewSession',
  switchLifecycle: 'select-page-only; never open_screen; never navigation lifecycle',
  inactivePage: 'not-drawn; not-hit-tested; excluded-from-focus-traversal; retains-last-runtime-state',
  persistentWidgets: 'nodes-unowned-by-any-page; always-subject-to-their-normal-visible/enabled-state',
  runtimeReads: 'same-Screen inactive-page controls remain readable at last valid value; reads never trigger rules',
  editorSelection: 'session-only; excluded-from-document-history-and-IndexedDB',
  runtimeSelection: 'PreviewSession-only; excluded-from-authority-JSON-and-IndexedDB',
} as const;
