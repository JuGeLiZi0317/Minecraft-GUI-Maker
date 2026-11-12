import { createNode, emptyProject, literal } from '../../src/domain/model';

export function bakeProject(pageB = false) {
  const doc = emptyProject(); doc.schemaVersion = '0.40.0'; doc.entryScreenId = 'screen_main'; doc.screenTabGroups = [];
  doc.project.name = 'Q3C_Static_Bake'; const screen = doc.screens[0];
  screen.title = literal('Bento Static Chrome Demo');
  screen.designSize = { width: 320, height: 240, unit: 'gui-px' }; screen.background = { kind: 'panel', style: 'custom-bevel-1' };
  const tabA = createNode('minecraft:creative-tab', 'page_a', { x: 260, y: 10 }), tabB = createNode('minecraft:creative-tab', 'page_b', { x: 290, y: 10 });
  if (tabA.type === 'minecraft:creative-tab') Object.assign(tabA.props, { name: 'Page A', groupId: 'pages', contentIds: ['page_a_fill_1', 'page_a_fill_2'], selected: !pageB });
  if (tabB.type === 'minecraft:creative-tab') Object.assign(tabB.props, { name: 'Page B', groupId: 'pages', contentIds: ['page_b_fill_1', 'page_b_fill_2'], selected: pageB });
  const fill = (id: string, x: number, y: number, w: number, h: number, color: string) => {
    const node = createNode('minecraft:fill', id, { x, y }); node.bounds = { x, y, w, h };
    if (node.type === 'minecraft:fill') node.props.color = color; return node;
  };
  const p1 = fill('persistent_fill_1', 20, 45, 50, 30, '#80ff0000'), p2 = fill('persistent_fill_2', 45, 60, 40, 25, '#800000ff');
  const a1 = fill('page_a_fill_1', 120, 45, 45, 24, '#a0ffff00'), a2 = fill('page_a_fill_2', 145, 57, 34, 28, '#c000ffff');
  const b1 = fill('page_b_fill_1', 200, 45, 42, 28, '#b0ff8000'), b2 = fill('page_b_fill_2', 220, 58, 36, 34, '#9000ffff');
  const button = createNode('minecraft:button', 'dynamic_button', { x: 24, y: 100 });
  const edit = createNode('minecraft:edit-box', 'dynamic_edit', { x: 24, y: 130 });
  const title = createNode('minecraft:string-widget', 'demo_title', { x: 24, y: 24 });
  if (title.type === 'minecraft:string-widget') { title.props.text = literal('Bento · Static Chrome'); title.props.align = 'left'; title.bounds.w = 210; }
  const inventory = createNode('native_region', 'native_inventory', { x: 24, y: 155 });
  screen.nodes = [tabA, tabB, title, p1, p2, a1, a2, b1, b2, button, edit, inventory];
  return doc;
}
