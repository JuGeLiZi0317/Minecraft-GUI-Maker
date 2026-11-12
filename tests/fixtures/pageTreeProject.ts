import { createNode, emptyProject } from '../../src/domain/model';
import type { GuiProject } from '../../src/domain/schema';

export function pageTreeProject(): GuiProject {
  const project = emptyProject();
  project.schemaVersion = '0.55.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  const tabA = createNode('minecraft:creative-tab', 'page_tab_a', { x: 10, y: 10 });
  const tabB = createNode('minecraft:creative-tab', 'page_tab_b', { x: 40, y: 10 });
  if (tabA.type !== 'minecraft:creative-tab' || tabB.type !== 'minecraft:creative-tab') throw new Error('tab');
  tabA.props.groupId = 'pages'; tabA.props.contentIds = ['page_a_fill']; tabA.props.selected = true;
  tabB.props.groupId = 'pages'; tabB.props.contentIds = ['page_b_fill']; tabB.props.selected = false;
  const pageA = createNode('minecraft:fill', 'page_a_fill', { x: 20, y: 60 });
  const pageB = createNode('minecraft:fill', 'page_b_fill', { x: 100, y: 60 });
  if (pageA.type !== 'minecraft:fill' || pageB.type !== 'minecraft:fill') throw new Error('fill');
  pageA.props.color = '#FFAA3333'; pageB.props.color = '#FF3333AA';
  project.screens[0].nodes = [tabA, tabB, pageA, pageB];
  return project;
}
