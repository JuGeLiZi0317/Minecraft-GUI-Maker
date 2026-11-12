import { createNode, emptyProject } from '../../src/domain/model';
import type { GuiProject } from '../../src/domain/schema';

export function pageExportProject(): GuiProject {
  const project = emptyProject();
  project.schemaVersion = '0.55.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  const tabA = createNode('minecraft:creative-tab', 'page_tab_a', { x: 10, y: 10 });
  const tabB = createNode('minecraft:creative-tab', 'page_tab_b', { x: 40, y: 10 });
  if (tabA.type !== 'minecraft:creative-tab' || tabB.type !== 'minecraft:creative-tab') throw new Error('tab');
  tabA.props.groupId = 'pages'; tabA.props.contentIds = ['page_content_a']; tabA.props.selected = true;
  tabB.props.groupId = 'pages'; tabB.props.contentIds = ['page_content_b']; tabB.props.selected = false;
  const nodes = [tabA, tabB, ...['page_content_a', 'page_content_b', 'page_content_c', 'page_content_d'].map((id, index) => {
    const node = createNode('minecraft:fill', id, { x: 12 + index * 20, y: 50 });
    if (node.type !== 'minecraft:fill') throw new Error('fill');
    node.props.color = ['#FFAA0000', '#FF00AA00', '#FF0000AA', '#FFFFAA00'][index];
    return node;
  })];
  project.screens[0].nodes = nodes;
  return project;
}
