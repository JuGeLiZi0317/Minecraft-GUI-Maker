import { createNode, emptyProject, literal } from '../../src/domain/model';
import type { Behavior, GuiNode } from '../../src/domain/schema';

export function structuresInspectorProject(selectionType: 'minecraft:radio-group' | 'minecraft:dropdown' = 'minecraft:radio-group') {
  const doc = emptyProject();
  doc.schemaVersion = '0.44.0';
  doc.entryScreenId = 'screen_main';
  doc.screenTabGroups = [];
  doc.project.name = 'StructuresInspector';
  const screen = doc.screens[0];
  screen.designSize = { width: 480, height: 320, unit: 'gui-px' };
  screen.title = literal('Structures Inspector');
  screen.background = { kind: 'panel', style: 'custom-bevel-1' };
  const selector = createNode(selectionType, 'structure_selector', { x: 16, y: 64 });
  if (selector.type !== 'minecraft:radio-group' && selector.type !== 'minecraft:dropdown') throw new Error('Invalid selector');
  selector.alias = 'Structure Selector';
  selector.bounds = { x: 16, y: 64, w: 140, h: selectionType === 'minecraft:radio-group' ? 72 : 20 };
  const choices = ['village', 'temple', 'end_city'] as const;
  selector.props.options = choices.map(id => ({ id, label: literal(id), disabled: false }));
  selector.props.initialSelectedOptionId = 'village';
  const summary = createNode('minecraft:string-widget', 'selection_summary', { x: 184, y: 48 });
  if (summary.type === 'minecraft:string-widget') { summary.props.text = literal('Selected village'); summary.props.align = 'left'; summary.bounds.w = 240; }
  const nodes: GuiNode[] = [selector, summary];
  for (const [index, choice] of choices.entries()) {
    const panel = createNode(choice === 'temple' ? 'minecraft:collapsible-panel' : 'minecraft:scrollable-panel', `inspector_${choice}`, { x: 180, y: 76 });
    panel.bounds = { x: 180, y: 76, w: 260, h: 180 };
    panel.alias = `${choice} Inspector`;
    panel.state.visible = index === 0;
    if (panel.type === 'minecraft:scrollable-panel' || panel.type === 'minecraft:collapsible-panel') panel.props.backgroundColor = ['#FF203040', '#FF403020', '#FF204030'][index];
    if (panel.type === 'minecraft:scrollable-panel') panel.props.contentHeight = 220;
    if (panel.type === 'minecraft:collapsible-panel') panel.props.title = literal('TempleInspector');
    const input = createNode('minecraft:numeric-input', `input_${choice}`, { x: 12, y: 32 });
    input.parentContainerId = panel.id;
    if (input.type === 'minecraft:numeric-input') { input.props.name = literal(`${choice} parameter`); input.props.initialValue = (index + 1) * 10; }
    nodes.push(panel, input);
  }
  const tabA = createNode('minecraft:creative-tab', 'page_structures', { x: 20, y: 8 });
  const tabB = createNode('minecraft:creative-tab', 'page_other', { x: 52, y: 8 });
  const note = createNode('minecraft:string-widget', 'other_page_note', { x: 180, y: 80 });
  if (note.type === 'minecraft:string-widget') note.props.text = literal('Other Page');
  if (tabA.type === 'minecraft:creative-tab') Object.assign(tabA.props, { name: 'Structures', groupId: 'inspector_pages', selected: true, contentIds: ['selection_summary', ...choices.map(choice => `inspector_${choice}`)] });
  if (tabB.type === 'minecraft:creative-tab') Object.assign(tabB.props, { name: 'Other', groupId: 'inspector_pages', selected: false, contentIds: ['other_page_note'] });
  nodes.push(tabA, tabB, note);
  screen.nodes = nodes;
  screen.behaviors = choices.map(choice => ({
    id: `show_${choice}`,
    event: { type: 'selection-change', sourceId: selector.id },
    eventBindings: [{ type: 'selection-change', sourceId: selector.id, payloadType: 'OptionId' }],
    actions: [{
      type: 'if',
      condition: { type: 'compare', valueType: 'OptionId', operator: 'equals', left: { type: 'read-control-value', nodeId: selector.id }, right: { type: 'constant', value: choice } },
      thenActions: [{ type: 'set-visible', targetId: `inspector_${choice}`, visible: true }, { type: 'set-text', targetId: summary.id, text: `Selected ${choice}` }],
      elseActions: [{ type: 'set-visible', targetId: `inspector_${choice}`, visible: false }],
    }],
  } satisfies Behavior));
  return doc;
}
