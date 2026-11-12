import { createNode } from '../../src/domain/model';
import type { GuiProject } from '../../src/domain/schema';
import { repeatableCardProject } from './repeatableCardProject';

/** Q5-E2: visual-only Single Slot is a repeated row decoration, never a real Menu Slot. */
export function repeatableVisualSlotProject(): GuiProject {
  const project = repeatableCardProject();
  const node = createNode('minecraft:single_slot', 'row_slot_visual', { x: 88, y: 4 });
  if (node.type !== 'minecraft:single_slot') throw new Error('fixture type');
  node.props.usage = 'visual_only';
  node.props.placeholderItemId = 'minecraft:iron_ingot';
  node.parentContainerId = 'material_layers';
  project.schemaVersion = '0.55.0';
  project.screens[0].nodes.push(node);
  return project;
}
