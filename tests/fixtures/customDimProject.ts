import { createNode, emptyProject, literal } from '../../src/domain/model';
import type { Behavior, GuiNode, GuiProject, TextSpec } from '../../src/domain/schema';

const tr = (key: string, fallback: string): TextSpec => ({ kind: 'translate', key, fallback });

/** Q4-E representative CustomDim project: three time modes, Structures title, three statuses and tooltips. */
export function customDimProject(): GuiProject {
  const doc = emptyProject();
  doc.schemaVersion = '0.49.0'; doc.entryScreenId = 'screen_main'; doc.screenTabGroups = [];
  doc.project.name = 'CustomDim'; doc.project.localizationNamespace = 'customdim';
  const screen = doc.screens[0];
  screen.designSize = { width: 480, height: 270, unit: 'gui-px' };
  screen.title = tr('gui.customdim.screen.title', '自定义维度');
  const mode = createNode('minecraft:cycle-button', 'time_mode', { x: 12, y: 12 });
  if (mode.type === 'minecraft:cycle-button') {
    mode.props.name = tr('gui.customdim.time.name', '时间模式');
    mode.props.options = [
      { id: 'always_day', text: tr('gui.customdim.time.always_day', '永昼') },
      { id: 'always_night', text: tr('gui.customdim.time.always_night', '永夜') },
      { id: 'normal', text: tr('gui.customdim.time.normal', '昼夜循环') },
    ];
    mode.props.initialOptionId = 'always_day';
    mode.props.tooltip = tr('gui.customdim.time.tooltip', '设置维度的昼夜行为');
  }
  const button = createNode('minecraft:button', 'apply_button', { x: 12, y: 44 });
  if (button.type === 'minecraft:button') { button.props.message = tr('gui.customdim.apply', '应用'); button.props.tooltip = tr('gui.customdim.tooltip.button', '应用当前设置'); }
  const conflictA = createNode('minecraft:button', 'conflict_a', { x: 12, y: 74 }); conflictA.bounds = { x: 12, y: 74, w: 100, h: 20 };
  if (conflictA.type === 'minecraft:button') conflictA.props.tooltip = tr('gui.customdim.shared', '第一处');
  const conflictB = createNode('minecraft:button', 'conflict_b', { x: 120, y: 74 }); conflictB.bounds = { x: 120, y: 74, w: 100, h: 20 };
  if (conflictB.type === 'minecraft:button') conflictB.props.tooltip = tr('gui.customdim.shared', '第二处');
  const status = createNode('minecraft:status-indicator', 'status', { x: 12, y: 104 });
  if (status.type === 'minecraft:status-indicator') {
    status.props.statuses = [
      { statusId: 'running', label: tr('gui.customdim.status.running', '运行'), color: '#FF54B56A' },
      { statusId: 'stopped', label: tr('gui.customdim.status.stopped', '停止'), color: '#FF808080' },
      { statusId: 'warning', label: tr('gui.customdim.status.warning', '警告'), color: '#FFFFB347' },
    ];
    status.props.initialStatusId = 'running';
  }
  const panel = createNode('minecraft:collapsible-panel', 'structures_panel', { x: 250, y: 12 }); panel.bounds = { x: 250, y: 12, w: 200, h: 120 };
  if (panel.type === 'minecraft:collapsible-panel') panel.props.title = tr('gui.customdim.structures.title', 'Structures Inspector');
  const summary = createNode('minecraft:string-widget', 'summary', { x: 250, y: 148 });
  if (summary.type === 'minecraft:string-widget') summary.props.text = literal('Selected');
  const pageText = createNode('minecraft:string-widget', 'page_b_text', { x: 250, y: 180 });
  if (pageText.type === 'minecraft:string-widget') pageText.props.text = tr('gui.customdim.page_b', '第二页仅在设计资源中');
  const tabA = createNode('minecraft:creative-tab', 'page_a', { x: 12, y: 236 }); tabA.bounds = { x: 12, y: 236, w: 26, h: 32 };
  const tabB = createNode('minecraft:creative-tab', 'page_b', { x: 44, y: 236 }); tabB.bounds = { x: 44, y: 236, w: 26, h: 32 };
  if (tabA.type === 'minecraft:creative-tab') Object.assign(tabA.props, { name: 'A', groupId: 'pages', selected: true, contentIds: ['time_mode', 'apply_button', 'conflict_a', 'conflict_b', 'status', 'structures_panel', 'summary'] });
  if (tabB.type === 'minecraft:creative-tab') Object.assign(tabB.props, { name: 'B', groupId: 'pages', selected: false, contentIds: ['page_b_text'] });
  const nodes: GuiNode[] = [mode, button, conflictA, conflictB, status, panel, summary, pageText, tabA, tabB];
  screen.nodes = nodes;
  screen.textMappings = [{ id: 'status_text', name: 'Status text', inputType: 'OptionId', outputType: 'Text', entries: [{ key: 'day', value: tr('gui.customdim.mapping.day', '白天') }], fallback: tr('gui.customdim.mapping.fallback', '未知') }];
  screen.behaviors = [{ id: 'result_text', event: { type: 'button-click', sourceId: 'apply_button' }, action: { type: 'set-text', targetId: 'summary', value: tr('gui.customdim.behavior.result', '已应用') } }] as Behavior[];
  return doc;
}
