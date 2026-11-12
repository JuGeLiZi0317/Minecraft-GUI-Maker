import { createNode, emptyProject } from '../../src/domain/model';
import type { GuiProject } from '../../src/domain/schema';

export function pageRepeatableProject(): GuiProject {
  const project = emptyProject();
  project.schemaVersion = '0.55.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  const tabA = createNode('minecraft:creative-tab', 'page_a_tab', { x: 10, y: 10 });
  const tabB = createNode('minecraft:creative-tab', 'page_b_tab', { x: 40, y: 10 });
  if (tabA.type !== 'minecraft:creative-tab' || tabB.type !== 'minecraft:creative-tab') throw new Error('tab');
  tabA.props.groupId = 'pages'; tabA.props.contentIds = ['page_a_fill']; tabA.props.selected = true;
  tabB.props.groupId = 'pages'; tabB.props.contentIds = ['page_b_list']; tabB.props.selected = false;
  const fill = createNode('minecraft:fill', 'page_a_fill', { x: 20, y: 50 });
  const list = createNode('minecraft:repeatable-list', 'page_b_list', { x: 20, y: 50 });
  list.bounds = { x: 20, y: 50, w: 120, h: 80 };
  if (list.type === 'minecraft:repeatable-list') { list.props.rowHeight = 20; list.props.rowGap = 0; list.props.padding = 4; }
  project.screens[0].nodes = [tabA, tabB, fill, list];
  return project;
}
