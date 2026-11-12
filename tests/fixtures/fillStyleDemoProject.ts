import { createNode, emptyProject, literal } from '../../src/domain/model';

export function fillStyleDemoProject() {
  const doc = emptyProject(); doc.schemaVersion = '0.42.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
  doc.project.name = 'Q3C1_Static_Frames_Demo'; const screen = doc.screens[0];
  screen.title = literal('Static Frame Styles'); screen.designSize = { width: 320, height: 240, unit: 'gui-px' };
  screen.background = { kind: 'panel', style: 'custom-bevel-1' };
  const title = createNode('minecraft:string-widget', 'demo_title', { x: 22, y: 24 });
  if (title.type === 'minecraft:string-widget') { title.props.text = literal('Village Trade · Frame Study'); title.props.align = 'left'; title.bounds.w = 240; }
  const rectangle = (id: string, x: number, y: number, w: number, h: number, props: { color: string; stylePreset?: 'plain' | 'framed' | 'bevel_raised' | 'bevel_inset'; borderColor?: string; highlightColor?: string; shadowColor?: string }) => {
    const node = createNode('minecraft:fill', id, { x, y });
    if (node.type === 'minecraft:fill') { node.bounds = { x, y, w, h }; node.props = { ...node.props, ...props }; }
    return node;
  };
  const plain = rectangle('demo_plain', 22, 46, 90, 65, { color: '#FF65748D' });
  const framed = rectangle('demo_framed', 130, 46, 72, 48, { color: '#C0C48D54', stylePreset: 'framed', borderColor: '#C0302821' });
  const raised = rectangle('demo_raised', 22, 120, 72, 30, { color: '#A0737F94', stylePreset: 'bevel_raised', borderColor: '#FF303641', highlightColor: '#FFE1E6EE', shadowColor: '#FF3F4652' });
  const inset = rectangle('demo_inset', 116, 120, 72, 30, { color: '#805B6473', stylePreset: 'bevel_inset', borderColor: '#FF292E38', highlightColor: '#FFE0E4EA', shadowColor: '#FF343A44' });
  const button = createNode('minecraft:button', 'demo_button', { x: 48, y: 63 });
  if (button.type === 'minecraft:button') button.props.message = literal('Trade');
  const inventory = createNode('native_region', 'demo_player_inventory', { x: 24, y: 163 });
  screen.nodes = [title, plain, framed, raised, inset, button, inventory];
  return doc;
}
