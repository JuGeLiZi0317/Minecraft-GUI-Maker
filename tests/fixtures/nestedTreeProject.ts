import { createNode, emptyProject, literal } from '../../src/domain/model';
import type { GuiProject } from '../../src/domain/schema';

export function nestedTreeProject(): GuiProject {
  const project = emptyProject();
  project.schemaVersion = '0.55.0';
  project.entryScreenId = 'screen_main';
  project.screenTabGroups = [];
  project.project.name = 'Nested Tree';
  const panel = createNode('minecraft:scrollable-panel', 'outer_panel', { x: 20, y: 20 });
  panel.bounds = { x: 20, y: 20, w: 220, h: 130 };
  if (panel.type === 'minecraft:scrollable-panel') panel.props.contentHeight = 180;
  const inner = createNode('minecraft:collapsible-panel', 'inner_panel', { x: 8, y: 8 });
  inner.bounds = { x: 8, y: 8, w: 150, h: 90 };
  inner.parentContainerId = 'outer_panel';
  const button = createNode('minecraft:button', 'deep_button', { x: 12, y: 34 });
  button.bounds = { ...button.bounds, w: 60, h: 18 };
  button.parentContainerId = 'inner_panel';
  if (button.type === 'minecraft:button') button.props.message = literal('Deep');
  project.screens[0].nodes = [panel, inner, button];
  return project;
}
