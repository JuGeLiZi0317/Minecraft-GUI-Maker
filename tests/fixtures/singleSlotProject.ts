import { CATALOG_VERSION, TARGET } from '../../src/domain/catalog';
import { createNode, literal } from '../../src/domain/model';
import type { GuiNode, GuiProject } from '../../src/domain/schema';

/** Q5-D acceptance fixture: real, ghost-selection and visual-only 18×18 slots. */
export function singleSlotProject(): GuiProject {
  const nodes: GuiNode[] = [];
  const slot = (id: string, x: number, usage: 'inventory' | 'ghost_selection' | 'visual_only', placeholderItemId?: string) => {
    const node = createNode('minecraft:single_slot', id, { x, y: 48 });
    if (node.type !== 'minecraft:single_slot') throw new Error('fixture type');
    node.props.usage = usage;
    if (placeholderItemId) node.props.placeholderItemId = placeholderItemId;
    nodes.push(node);
  };
  slot('slot_inventory', 24, 'inventory');
  slot('slot_ghost', 64, 'ghost_selection', 'minecraft:iron_ingot');
  slot('slot_visual', 104, 'visual_only', 'minecraft:stone');

  return {
    format: 'minecraft-gui-maker', schemaVersion: '0.55.0', catalogVersion: CATALOG_VERSION,
    target: structuredClone(TARGET), project: { id: 'project_q5d', name: 'Q5D Single Slots', revision: 0 },
    entryScreenId: 'screen_main', screenTabGroups: [],
    screens: [{
      id: 'screen_main', title: literal('Single Slot Semantics'), base: 'screen',
      designSize: { width: 320, height: 180, unit: 'gui-px' }, placement: 'center', background: { kind: 'none' },
      nodes, variables: [], behaviors: [],
    }], assets: [],
  };
}
