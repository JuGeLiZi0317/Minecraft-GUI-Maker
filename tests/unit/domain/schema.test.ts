import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from '../../../src/domain/catalog';
import { createNode, emptyProject } from '../../../src/domain/model';
import { exportProject, MAX_JSON_BYTES, parseProject } from '../../../src/domain/schema';
import { NATIVE_PANEL_16, panelTextureSide } from '../../../src/domain/panel';

const fixture = () => { const doc = emptyProject(); doc.screens[0].nodes = NODE_TYPES.filter(type => type !== 'minecraft:checkbox' && type !== 'minecraft:cycle-button' && type !== 'minecraft:creative-tab').map((type, i) => createNode(type, `node_${i}`)); return doc; };
describe('strict portable project contract', () => {
  it('preserves 0.1.0 projects and accepts only valid 0.2.0 custom panel designs', () => {
    const old = emptyProject(); expect(parseProject(exportProject(old))).toEqual(old);
    const panel = structuredClone(old); panel.schemaVersion = '0.2.0'; panel.screens[0].background = { kind: 'panel', style: 'custom-bevel-1' };
    expect(parseProject(exportProject(panel))).toEqual(panel);
    const wrong = structuredClone(panel); wrong.schemaVersion = '0.1.0'; expect(() => exportProject(wrong)).toThrow('0.2.0');
    const small = structuredClone(panel); small.screens[0].designSize.width = 7; expect(() => exportProject(small)).toThrow('8 GUI');
    const unknown = JSON.parse(JSON.stringify(panel)); unknown.screens[0].background.style = 'minecraft-beacon'; expect(() => parseProject(JSON.stringify(unknown))).toThrow();
  });
  it('requires 0.3.0 for supplied panel styles and chooses square texture limits', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.3.0'; doc.screens[0].background = { kind: 'panel', style: NATIVE_PANEL_16 };
    expect(parseProject(exportProject(doc))).toEqual(doc);
    doc.schemaVersion = '0.2.0'; expect(() => exportProject(doc)).toThrow('0.3.0');
    for (const [size, side] of [[320, 512], [512, 512], [513, 768], [768, 768], [769, 1024], [1024, 1024]]) expect(panelTextureSide(size, 180)).toBe(side);
    expect(() => panelTextureSide(1025, 180)).toThrow('超过 1024');
  });
  it('round-trips four catalog types and translation/extension data without framework objects', () => {
    const doc = fixture();
    doc.screens[0].title = { kind: 'translate', key: 'gui.title', fallback: 'Title' };
    doc.extensions = { 'org.example': { enabled: true, list: [1, 'two', null] } };
    expect(parseProject(exportProject(doc))).toEqual(doc);
  });
  const invalid: [string, (doc: any) => void][] = [
    ['future schema', d => d.schemaVersion = '9.0.0'],
    ['wrong Minecraft', d => d.target.minecraft = '1.21.2'],
    ['wrong NeoForge', d => d.target.loader.version = '21.1.234'],
    ['wrong Java', d => d.target.java = 17],
    ['wrong catalog', d => d.catalogVersion = 'unknown'],
    ['unknown component', d => d.screens[0].nodes[0].type = 'minecraft:dropdown'],
    ['unknown source category', d => d.screens[0].nodes[0].source.category = 'fabric'],
    ['spoofed class', d => d.screens[0].nodes[0].source.className = 'net.minecraft.Unverified'],
    ['wrong draw member', d => d.screens[0].nodes[3].source.member = 'unknown'],
    ['unknown node field', d => d.screens[0].nodes[0].scaleX = 2],
    ['unknown props', d => d.screens[0].nodes[0].props.unknown = 1],
    ['fraction coordinate', d => d.screens[0].nodes[0].bounds.x = 1.5],
    ['negative position', d => d.screens[0].nodes[0].bounds.y = -1],
    ['zero size', d => d.screens[0].nodes[0].bounds.w = 0],
    ['below catalog minimum', d => d.screens[0].nodes[0].bounds.w = 8],
    ['outside screen', d => d.screens[0].nodes[0].bounds.x = 319],
    ['duplicate node id', d => d.screens[0].nodes[1].id = d.screens[0].nodes[0].id],
    ['screen id collision', d => d.screens[0].nodes[0].id = 'screen_main'],
    ['invalid id', d => d.screens[0].nodes[0].id = 'bad id'],
    ['dangling reference', d => d.screens[0].nodes[0].events.press = 'missing_behavior'],
    ['unsupported event', d => d.screens[0].nodes[3].events.press = 'missing_behavior'],
    ['UTF-16 max length', d => { d.screens[0].nodes[1].props.value = '😀'; d.screens[0].nodes[1].props.maxLength = 1; }],
    ['invalid color', d => d.screens[0].nodes[3].props.color = '#FFF'],
    ['multiple screens', d => d.screens.push(d.screens[0])],
    ['unsupported behavior data', d => d.screens[0].behaviors = [{ id: 'close', steps: [{ op: 'closeScreen' }] }]],
    ['unsupported assets', d => d.assets.push({ id: 'image' })],
  ];
  it.each(invalid)('rejects %s without changing input', (_name, mutate) => {
    const doc = fixture(); mutate(doc); const before = JSON.stringify(doc);
    expect(() => parseProject(before)).toThrow(); expect(JSON.stringify(doc)).toBe(before);
  });
  it('rejects syntax errors, excessive depth, size and infinity', () => {
    for (const json of ['{', '', 'null', '[]', '1e400', '['.repeat(40) + '0' + ']'.repeat(40), ' '.repeat(MAX_JSON_BYTES + 1)]) expect(() => parseProject(json)).toThrow();
  });
  it('accepts audited boundary dimensions and rejects node count >1000', () => {
    const doc = fixture(); doc.screens[0].nodes[0].bounds = { x: 170, y: 160, w: 150, h: 20 };
    expect(parseProject(exportProject(doc))).toEqual(doc);
    doc.screens[0].nodes = Array.from({ length: 1001 }, (_, i) => createNode('minecraft:fill', `node_${i}`));
    expect(() => exportProject(doc)).toThrow();
  });
});
