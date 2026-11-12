import { createNode, emptyProject } from '../../src/domain/model';
import type { GuiProject } from '../../src/domain/schema';

export function tabOwnershipProject(): GuiProject {
  const project = emptyProject();
  project.schemaVersion = '0.55.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  const tabA = createNode('minecraft:creative-tab', 'owner_tab_a', { x: 10, y: 10 });
  const tabB = createNode('minecraft:creative-tab', 'owner_tab_b', { x: 40, y: 10 });
  if (tabA.type !== 'minecraft:creative-tab' || tabB.type !== 'minecraft:creative-tab') throw new Error('tab');
  tabA.props.groupId = 'owners'; tabA.props.contentIds = ['owner_content_a']; tabA.props.selected = true;
  tabB.props.groupId = 'owners'; tabB.props.contentIds = ['owner_content_b']; tabB.props.selected = false;
  const a = createNode('minecraft:fill', 'owner_content_a', { x: 20, y: 60 });
  const b = createNode('minecraft:fill', 'owner_content_b', { x: 100, y: 60 });
  const c = createNode('minecraft:fill', 'owner_content_c', { x: 180, y: 60 });
  if (a.type !== 'minecraft:fill' || b.type !== 'minecraft:fill' || c.type !== 'minecraft:fill') throw new Error('fill');
  a.props.color = '#FFAA3333'; b.props.color = '#FF3333AA'; c.props.color = '#FF33AA33';
  project.screens[0].nodes = [tabA, tabB, a, b, c];
  return project;
}
