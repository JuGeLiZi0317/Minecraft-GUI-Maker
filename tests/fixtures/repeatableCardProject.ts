import { CATALOG_VERSION, TARGET } from '../../src/domain/catalog';
import { createNode, literal } from '../../src/domain/model';
import type { GuiNode, GuiProject } from '../../src/domain/schema';

/** Q5-B.2-A acceptance card: 109×66 row template made only from ordinary controls. */
export function repeatableCardProject(): GuiProject {
  const nodes: GuiNode[] = [];
  const list = createNode('minecraft:repeatable-list', 'material_layers', { x: 100, y: 70 });
  if (list.type !== 'minecraft:repeatable-list') throw new Error('fixture type');
  list.bounds = { x: 100, y: 70, w: 125, h: 74 };
  list.props.rowHeight = 66;
  list.props.rowGap = 0;
  list.props.padding = 4;
  list.props.templateId = 'material_card';
  list.props.dataSource = { mode: 'external', bindingKey: 'generator.material_cards' };
  nodes.push(list);

  const child = (type: Parameters<typeof createNode>[0], id: string, x: number, y: number, w: number, h: number) => {
    const node = createNode(type, id, { x, y });
    node.bounds = { x, y, w, h };
    node.parentContainerId = 'material_layers';
    nodes.push(node);
    return node;
  };
  const background = child('minecraft:fill', 'card_background', 0, 0, 109, 66);
  if (background.type === 'minecraft:fill') background.props.color = '#FF202A36';
  const bar = child('minecraft:fill', 'card_status_bar', 0, 0, 4, 66);
  if (bar.type === 'minecraft:fill') bar.props.color = '#FF54B56A';
  const number = child('minecraft:string-widget', 'card_number', 7, 4, 18, 14);
  if (number.type === 'minecraft:string-widget') { number.props.text = literal('01'); number.props.align = 'left'; number.props.color = '#FFE0E8F1'; }
  const name = child('minecraft:edit-box', 'card_name', 27, 4, 76, 14);
  if (name.type === 'minecraft:edit-box') { name.props.value = 'Copper'; name.props.narration = literal('材料名称'); }
  const value = child('minecraft:edit-box', 'card_value', 27, 21, 76, 14);
  if (value.type === 'minecraft:edit-box') { value.props.value = '12'; value.props.narration = literal('数量'); }
  const on = child('minecraft:button', 'card_toggle', 7, 41, 34, 18);
  if (on.type === 'minecraft:button') on.props.message = literal('ON');
  const controls: [string, string][] = [['card_up', '↑'], ['card_down', '↓'], ['card_copy', '⧉'], ['card_delete', '×']];
  controls.forEach(([id, text], index) => {
    const button = child('minecraft:button', id, 45 + index * 16, 41, 14, 18);
    if (button.type === 'minecraft:button') button.props.message = literal(text);
  });

  const other = createNode('minecraft:button', 'outside_button', { x: 250, y: 70 });
  other.bounds = { x: 250, y: 70, w: 80, h: 20 };
  if (other.type === 'minecraft:button') other.props.message = literal('Outside');
  nodes.push(other);

  return {
    format: 'minecraft-gui-maker', schemaVersion: '0.52.0', catalogVersion: CATALOG_VERSION,
    target: structuredClone(TARGET), project: { id: 'project_q5b2a', name: 'Q5B2A Material Card', revision: 0 },
    entryScreenId: 'screen_main', screenTabGroups: [],
    screens: [{
      id: 'screen_main', title: literal('Material Card Template'), base: 'screen',
      designSize: { width: 380, height: 290, unit: 'gui-px' }, placement: 'center', background: { kind: 'none' },
      nodes, variables: [], behaviors: [],
    }], assets: [],
  };
}
