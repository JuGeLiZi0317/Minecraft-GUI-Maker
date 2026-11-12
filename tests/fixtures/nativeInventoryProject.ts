import { createNode, emptyProject, literal } from '../../src/domain/model';

export function nativeInventoryProject() {
  const document = emptyProject();
  document.schemaVersion = '0.40.0'; document.entryScreenId = 'screen_main'; document.screenTabGroups = [];
  document.project.name = 'Q3B_Player_Inventory'; document.screens[0].title = literal('Native Player Inventory');
  document.screens[0].designSize = { width: 320, height: 240, unit: 'gui-px' };
  document.screens[0].background = { kind: 'panel', style: 'custom-bevel-1' };
  const region = createNode('native_region', 'node_inventory', { x: 24, y: 110 }); region.alias = '玩家背包区域';
  const title = createNode('minecraft:string-widget', 'node_title', { x: 24, y: 26 });
  if (title.type === 'minecraft:string-widget') { title.props.text = literal('Native Inventory · 27 + 9'); title.bounds.w = 240; title.props.align = 'left'; }
  document.screens[0].nodes = [region, title];
  return document;
}
