import { createNode, emptyProject, literal } from '../../src/domain/model';
import type { GuiNode, GuiProject } from '../../src/domain/schema';

/** Q4-D representative demo: Button, CycleButton, Dropdown, Scrollable Panel, hidden and Page-owned nodes. */
export function tooltipProject(): GuiProject {
  const doc = emptyProject();
  doc.schemaVersion = '0.49.0';
  doc.entryScreenId = 'screen_main';
  doc.screenTabGroups = [];
  doc.project.name = 'TooltipDemo';
  const screen = doc.screens[0];
  screen.designSize = { width: 320, height: 180, unit: 'gui-px' };
  screen.title = literal('Tooltip Demo');

  const button = createNode('minecraft:button', 'demo_button', { x: 8, y: 8 });
  if (button.type === 'minecraft:button') { button.props.message = literal('提交'); button.props.tooltip = literal('提交按钮'); }
  const cycle = createNode('minecraft:cycle-button', 'demo_cycle', { x: 8, y: 36 });
  if (cycle.type === 'minecraft:cycle-button') {
    cycle.props.name = literal('时间模式');
    cycle.props.tooltip = { kind: 'translate', key: 'gui.customdim.time.tooltip', fallback: '设置维度的昼夜行为' };
  }
  const dropdown = createNode('minecraft:dropdown', 'demo_dropdown', { x: 8, y: 64 });
  if (dropdown.type === 'minecraft:dropdown') {
    dropdown.props.name = literal('时间');
    dropdown.props.options = [{ id: 'day', label: literal('白天'), disabled: false }, { id: 'night', label: literal('夜晚'), disabled: false }];
    dropdown.props.initialSelectedOptionId = 'day';
    dropdown.props.tooltip = literal('时间模式');
  }
  const panel = createNode('minecraft:scrollable-panel', 'demo_scroll', { x: 150, y: 8 });
  if (panel.type === 'minecraft:scrollable-panel') { panel.props.contentHeight = 260; panel.props.tooltip = literal('滚动区域'); }
  panel.bounds = { x: 150, y: 6, w: 150, h: 130 };
  const scrollButton = createNode('minecraft:button', 'demo_scroll_button', { x: 8, y: 40 });
  scrollButton.parentContainerId = 'demo_scroll'; scrollButton.bounds = { x: 8, y: 40, w: 120, h: 20 };
  if (scrollButton.type === 'minecraft:button') { scrollButton.props.message = literal('滚动按钮'); scrollButton.props.tooltip = literal('滚动按钮提示'); }
  const clippedButton = createNode('minecraft:button', 'demo_scroll_clipped', { x: 8, y: 125 });
  clippedButton.parentContainerId = 'demo_scroll'; clippedButton.bounds = { x: 8, y: 125, w: 120, h: 20 };
  if (clippedButton.type === 'minecraft:button') { clippedButton.props.message = literal('裁剪'); clippedButton.props.tooltip = literal('滚动后可见'); }
  const hidden = createNode('minecraft:button', 'demo_hidden', { x: 8, y: 120 });
  hidden.state.visible = false;
  if (hidden.type === 'minecraft:button') { hidden.props.message = literal('隐藏'); hidden.props.tooltip = literal('隐藏提示'); }
  const pageButton = createNode('minecraft:button', 'demo_page_button', { x: 190, y: 140 });
  pageButton.bounds = { x: 190, y: 140, w: 120, h: 20 };
  if (pageButton.type === 'minecraft:button') { pageButton.props.message = literal('第二页'); pageButton.props.tooltip = literal('第二页提示'); }

  const tabA = createNode('minecraft:creative-tab', 'page_a', { x: 8, y: 146 });
  const tabB = createNode('minecraft:creative-tab', 'page_b', { x: 40, y: 146 });
  if (tabA.type === 'minecraft:creative-tab') Object.assign(tabA.props, { name: 'A', groupId: 'demo_pages', selected: true, contentIds: ['demo_button', 'demo_cycle', 'demo_dropdown', 'demo_scroll', 'demo_scroll_button', 'demo_scroll_clipped'] });
  if (tabB.type === 'minecraft:creative-tab') Object.assign(tabB.props, { name: 'B', groupId: 'demo_pages', selected: false, contentIds: ['demo_page_button'] });
  const nodes: GuiNode[] = [button, cycle, dropdown, panel, scrollButton, clippedButton, hidden, pageButton, tabA, tabB];
  screen.nodes = nodes;
  return doc;
}
