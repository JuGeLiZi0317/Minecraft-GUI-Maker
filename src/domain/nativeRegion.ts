import { sameScreenPages } from './sameScreenPages';
import type { GuiNode, GuiScreen } from './schema';

export const PLAYER_INVENTORY_KIND = 'minecraft:player_inventory' as const;
export const PLAYER_INVENTORY_SIZE = { w: 162, h: 76 } as const;
export const PLAYER_INVENTORY_ROWS = [0, 18, 36, 58] as const;
/** Positions are relative to the 18px background border origin, NOT Slot.x/y. */
export function playerInventorySlots() {
  return PLAYER_INVENTORY_ROWS.flatMap((y, row) => Array.from({ length: 9 }, (_, column) => ({
    row, column, background: { x: column * 18, y, w: 18, h: 18 },
    content: { x: column * 18 + 1, y: y + 1, w: 16, h: 16 },
    playerInventoryIndex: row === 3 ? column : 9 + row * 9 + column,
  })));
}
export function isNativeRegion(node: GuiNode): node is Extract<GuiNode, { type: 'native_region' }> { return node.type === 'native_region'; }

export type PageOwnership = { persistent: boolean; pageGroupId: string | null; pageIds: string[] };

/**
 * Page membership comes only from CreativeTab.contentIds. A region referenced by no Page is
 * Persistent; referencing Pages in the same Screen all display it. No parallel field exists.
 */
export function pageOwnership(screen: GuiScreen, nodeId: string): PageOwnership {
  const pages = sameScreenPages(screen).filter(page => page.contentIds.includes(nodeId));
  return { persistent: pages.length === 0, pageGroupId: pages[0]?.groupId ?? null, pageIds: pages.map(page => page.id) };
}

export function nativeRegions(screen: GuiScreen) {
  return screen.nodes.filter(isNativeRegion).map(node => {
    const ownership = pageOwnership(screen, node.id);
    return { nodeId: node.id, kind: node.props.kind, bounds: node.bounds,
      coordinateSpace: 'screen_local', ...ownership, slotCount: 36,
      visibilityGate: 'active Page membership AND ancestor visibility',
      slots: playerInventorySlots(), menuSlotIndices: 'assigned by AbstractContainerMenu.addSlot order; never inferred from node ID or playerInventoryIndex',
      preview: 'deterministic approximate background only; no items or Slot interaction',
    };
  });
}
export const NATIVE_REGION_CONTRACT = {
  version: '1.1.0', kind: PLAYER_INVENTORY_KIND, fixedSize: PLAYER_INVENTORY_SIZE,
  origin: 'top-left of first 18x18 slot BACKGROUND border in Screen design-local GUI pixels',
  contentOffset: { x: 1, y: 1 }, contentSize: 16, pitch: 18, rowBackgroundOffsets: PLAYER_INVENTORY_ROWS,
  hotbarGap: '4 GUI px between third-row background end at y=54 and hotbar background start at y=58',
  nativeCoordinates: 'Slot.x = designOriginX - leftPos + region.x + column*18 + 1; Slot.y = designOriginY - topPos + region.y + rowBackgroundOffset + 1. The native render pass adds leftPos/topPos once.',
  designOrigin: 'floor((GUI logical viewport - designSize)/2) on each axis; never physical framebuffer pixels',
  containerRequirement: 'Use AbstractContainerMenu + AbstractContainerScreen or an equivalent native container mechanism. Create real Slot objects in the Java Menu against the real player Inventory. Match server/client slot ordering and normal native constraints.',
  identity: 'playerInventoryIndex = 9+row*9+column for main rows; column for hotbar. Menu Slot index is assigned by addSlot order, not that inventory index and never the GUI node ID.',
  pagePolicy: 'Screen-root only. Native Region referenced by no Page is Persistent and visible on every Page; once listed in a CreativeTab.contentIds it is shown only on the Pages of that Screen that reference it (members of one Page Group may share it). Page switching never opens a new Screen, never rebuilds the Menu and never re-creates Slots: it is the same Screen/Menu instance. On an inactive Page the region and its slot backgrounds must not be drawn, hit-tested or focusable. F2 actions can never target a Native Region; Page membership is structural, not runtime visibility.',
  pageGating: 'Client implementation: keep the real Slot objects and the Menu alive for every Page; gate rendering and hit testing with Slot.isActive() (and skip any Mod-drawn slot background) according to the active Page. Slot.isActive() is client-side only; if the server must authoritatively reject clicks on an inactive Page, add an explicit Menu-side gate — GUI Maker generates no server logic. Items stay synchronized by the Menu; hiding is a render/interaction gate, not an inventory transfer.',
  pageSwitching: 'The game implementation must define what happens to carried items, an in-progress drag and quick-craft when the owning Page becomes inactive (recommended: block the Page switch while a carried stack is non-empty, or keep the region visible until the drag completes).',
  designPng: 'Design PNG and reference PNG render the initial selected Page only. A region owned solely by a non-initial Page is therefore absent from the design PNG, exactly like every other Page-owned widget; export strategy is unchanged.',
  backgroundOwnership: 'Draw slot backgrounds exactly once. Reference PNG is not a runtime Slot implementation. If a supplied static background already contains these borders, skip a second region background draw. Panel-only export does NOT bake region borders.',
  scope: 'GUI Maker creates no Slot, Inventory, ItemStack or Menu. No business container, NBT, shift-click, item transfer or server synchronization is generated or claimed verified.',
  preview: 'Canvas and reference PNG share deterministic approximate 18x18 bevel backgrounds; no vanilla texture-pixel-equivalence claim',
} as const;