import type { GuiNode, GuiScreen } from './schema';
import { pageOwnership } from './nativeRegion';

export const SINGLE_SLOT_SIZE = { w: 18, h: 18 } as const;
export const SINGLE_SLOT_CONTENT = { x: 1, y: 1, w: 16, h: 16 } as const;
export type SingleSlotUsage = 'inventory' | 'ghost_selection' | 'visual_only';
export type SingleSlotNode = Extract<GuiNode, { type: 'minecraft:single_slot' }>;

export function isSingleSlot(node: GuiNode): node is SingleSlotNode {
  return node.type === 'minecraft:single_slot';
}

export function singleSlots(screen: GuiScreen) {
  return screen.nodes.filter(isSingleSlot).map(node => {
    const ownership = pageOwnership(screen, node.id);
    return {
      nodeId: node.id,
      usage: node.props.usage,
      bounds: node.bounds, parentContainerId: node.parentContainerId ?? null,
      backgroundSize: SINGLE_SLOT_SIZE,
      content: SINGLE_SLOT_CONTENT,
      coordinateSpace: 'screen_local',
      ...ownership,
      placeholderItemId: node.props.placeholderItemId ?? null,
      visualOnly: node.props.usage === 'visual_only',
      realMenuSlot: node.props.usage === 'inventory',
      ghostSelection: node.props.usage === 'ghost_selection',
      identity: 'node ID is design identity; a real Menu Slot index is assigned by Menu.addSlot order, never inferred from node ID',
      preview: 'approximate 18x18 background and optional design-only placeholder; no ItemStack or Slot interaction',
    };
  });
}

export const SINGLE_SLOT_CONTRACT = {
  version: '1.0.0',
  type: 'minecraft:single_slot',
  size: SINGLE_SLOT_SIZE,
  content: SINGLE_SLOT_CONTENT,
  origin: 'top-left of the 18x18 slot BACKGROUND border in Screen design-local GUI pixels',
  geometry: 'Node movement translates the whole 18x18 frame; X/Y is never stretched. Content origin is +1/+1 with a 16x16 content box; local pixel geometry is fixed.',
  resize: 'forbidden; bounds.w and bounds.h are fixed at 18',
  identity: 'The node ID and alias are stable design identities. They are not Minecraft Slot indices or ItemStack identities.',
  usage: {
    inventory: 'A real container Slot must be created in the Java Menu with addSlot(...). The Menu slot index is assigned by addSlot order, not by node ID. GUI Maker creates no Slot/Menu.',
    ghost_selection: 'A non-consuming material-selection or marker slot. The Mod owns external item selection, the current Menu state, and any JEI/REI Ghost Ingredient compatibility layer. Do not implement this with a normal Button or Image. Do not assume JEI/REI integration merely because this intent is selected.',
    visual_only: 'Static 18x18 slot decoration only; no real Slot, hit target, focus target, item transfer, server transaction or network synchronization.',
  },
  placeholder: 'optional placeholderItemId is design preview only; it is not an ItemStack, does not consume items, and is never exported as item data',
  rowTemplate: 'visual_only is allowed as a repeated, non-interactive row decoration with row-local coordinates; inventory and ghost_selection are rejected because a Row Template has no reliable dynamic Menu Slot index or per-row external target identity. Never create repeated Menu Slots from template nodes.',
  pageOwnership: 'Screen-root only. A CreativeTab.contentIds reference owns Page visibility; no parallel page field. Page switching never creates a new Menu or Slot.',
  implementationNotes: 'Implementation Notes may describe the Java integration point but never override this contract; structured Schema/F2 takes precedence.',
  scope: 'No JEI/REI plugin, item selection business, server Menu generation, network transaction or ItemStack serialization is generated.',
} as const;
