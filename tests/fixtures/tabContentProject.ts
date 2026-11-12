import { createNode, emptyProject } from '../../src/domain/model';
import type { GuiProject } from '../../src/domain/schema';

export function tabContentProject(): GuiProject {
  const project = emptyProject();
  project.schemaVersion = '0.55.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  const tab = createNode('minecraft:creative-tab', 'tab_main', { x: 10, y: 10 });
  if (tab.type !== 'minecraft:creative-tab') throw new Error('tab type');
  tab.props.groupId = 'tabs'; tab.props.contentIds = ['content_a', 'content_b']; tab.props.selected = true;
  const nodes = [tab, ...['content_a', 'content_b', 'content_c', 'content_d'].map((id, index) => {
    const node = createNode('minecraft:fill', id, { x: 12 + index * 20, y: 50 });
    if (node.type !== 'minecraft:fill') throw new Error('fill type');
    node.props.color = ['#FFAA0000', '#FF00AA00', '#FF0000AA', '#FFFFAA00'][index];
    return node;
  })];
  project.screens[0].nodes = nodes;
  return project;
}
