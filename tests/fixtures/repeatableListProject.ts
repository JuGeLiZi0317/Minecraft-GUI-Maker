import { CATALOG_VERSION, TARGET } from '../../src/domain/catalog';
import { createNode, literal } from '../../src/domain/model';
import type { GuiNode, GuiProject } from '../../src/domain/schema';

/** Q5-B acceptance fixture: CustomDim material layers as an external-data list. */
export function repeatableListProject(): GuiProject {
  const nodes: GuiNode[] = [];
  const repeater = createNode('minecraft:repeatable-list', 'material_layers', { x: 100, y: 60 });
  if (repeater.type !== 'minecraft:repeatable-list') throw new Error('fixture repeater type');
  repeater.bounds = { x: 100, y: 60, w: 164, h: 170 };
  const repeaterProps = repeater.props;
  repeaterProps.rowHeight = 34;
  repeaterProps.rowGap = 0;
  repeaterProps.padding = 4;
  repeaterProps.templateId = 'material_row';
  repeaterProps.dataSource = { mode: 'external', bindingKey: 'generator.material_layers' };
  nodes.push(repeater);

  const child = (type: Parameters<typeof createNode>[0], id: string, x: number, y: number, w: number, h: number) => {
    const node = createNode(type, id, { x, y });
    node.bounds = { x, y, w, h };
    node.parentContainerId = 'material_layers';
    nodes.push(node);
    return node;
  };
  const marker = child('minecraft:fill', 'material_marker', 0, 0, 6, 34);
  if (marker.type === 'minecraft:fill') marker.props.color = '#FF54B56A';
  const label = child('minecraft:string-widget', 'material_label', 8, 2, 56, 14);
  if (label.type === 'minecraft:string-widget') { label.props.text = literal('材料'); label.props.align = 'left'; label.props.color = '#FFE0E8F1'; }
  const block = child('minecraft:edit-box', 'material_block', 8, 18, 64, 14);
  if (block.type === 'minecraft:edit-box') { block.props.value = 'minecraft:stone'; block.props.narration = literal('Block ID'); block.props.hint = literal('block id'); }
  const thickness = child('minecraft:numeric-input', 'material_thickness', 78, 2, 44, 14);
  if (thickness.type === 'minecraft:numeric-input') { thickness.props.name = literal('厚度'); thickness.props.initialValue = 1; thickness.props.min = 1; thickness.props.max = 64; thickness.props.step = 1; }
  const up = child('minecraft:button', 'material_up', 78, 18, 14, 14);
  if (up.type === 'minecraft:button') up.props.message = literal('↑');
  const down = child('minecraft:button', 'material_down', 94, 18, 14, 14);
  if (down.type === 'minecraft:button') down.props.message = literal('↓');
  const remove = child('minecraft:button', 'material_delete', 110, 18, 14, 14);
  if (remove.type === 'minecraft:button') remove.props.message = literal('×');

  const add = createNode('minecraft:button', 'material_add', { x: 100, y: 234 });
  add.bounds = { x: 100, y: 234, w: 164, h: 20 };
  if (add.type === 'minecraft:button') add.props.message = literal('添加材料');
  nodes.push(add);

  return {
    format: 'minecraft-gui-maker', schemaVersion: '0.51.0', catalogVersion: CATALOG_VERSION,
    target: structuredClone(TARGET), project: { id: 'project_q5b', name: 'Q5B Material Layers', revision: 0 },
    entryScreenId: 'screen_main', screenTabGroups: [],
    screens: [{
      id: 'screen_main', title: literal('CustomDim MainGUI · Material Layers'), base: 'screen',
      designSize: { width: 380, height: 290, unit: 'gui-px' }, placement: 'center', background: { kind: 'none' },
      nodes, variables: [], behaviors: [],
    }], assets: [],
  };
}
