import { describe, expect, it } from 'vitest';
import { emptyProject } from '../../../src/domain/model';
import { parseProject, exportProject } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { nativeInventoryProject } from '../../fixtures/nativeInventoryProject';
import { playerInventorySlots, nativeRegions } from '../../../src/domain/nativeRegion';
import { beginExport } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';
import { tabVisibility } from '../../../src/domain/tabGroups';

describe('Q3-B native player inventory', () => {
  it('creates one fixed native node and upgrades only on explicit creation', () => {
    const old = emptyProject(), store = createEditorStore(old);
    expect(store.getState().doc).toEqual(old);
    store.getState().add('native_region', { x: 24, y: 80 });
    const doc = store.getState().doc;
    expect(doc.schemaVersion).toBe('0.40.0'); expect(doc.screens[0].nodes).toHaveLength(1);
    expect(doc.screens[0].nodes[0]).toMatchObject({ type: 'native_region', props: { kind: 'minecraft:player_inventory' }, bounds: { x: 24, y: 80, w: 162, h: 76 } });
    expect(parseProject(exportProject(doc))).toEqual(doc);
    store.getState().undo(); expect(store.getState().doc).toEqual(old); store.getState().redo(); expect(store.getState().doc).toEqual(doc);
    store.getState().updateNode('node_1', node => ({ ...node, alias: 'Inventory' }));
    store.getState().add('minecraft:button'); store.getState().addScreen();
    expect(store.getState().doc.schemaVersion).toBe('0.40.0');
  });
  it.each([
    ['kind', (node: Record<string, any>) => { node.props.kind = 'minecraft:chest'; }],
    ['width', (node: Record<string, any>) => { node.bounds.w = 163; }],
    ['height', (node: Record<string, any>) => { node.bounds.h = 75; }],
    ['negative', (node: Record<string, any>) => { node.bounds.x = -1; }],
    ['overflow', (node: Record<string, any>) => { node.bounds.x = 200; }],
    ['fraction', (node: Record<string, any>) => { node.bounds.y = 0.5; }],
    ['hidden', (node: Record<string, any>) => { node.state.visible = false; }],
    ['business', (node: Record<string, any>) => { node.props.items = []; }],
  ])('rejects illegal %s atomically on import', (_, mutate) => {
    const store = createEditorStore(nativeInventoryProject()), before = store.getState().doc;
    const invalid = structuredClone(before); mutate(invalid.screens[0].nodes[0]);
    expect(() => store.getState().importJson(JSON.stringify(invalid))).toThrow(); expect(store.getState().doc).toBe(before);
  });
  it('enforces dimensions and ownership through property edits, gestures, containers and Page bindings', () => {
    const store = createEditorStore(nativeInventoryProject());
    const before = store.getState().doc;
    expect(() => store.getState().updateNode('node_inventory', node => ({ ...node, bounds: { ...node.bounds, w: 200 } }))).toThrow('162×76');
    expect(store.getState().doc).toBe(before);
    store.getState().beginGesture('node_inventory'); store.getState().previewBounds({ x: 40, y: 80, w: 200, h: 100 }); store.getState().commitGesture();
    expect(store.getState().doc.screens[0].nodes[0].bounds).toEqual({ x: 40, y: 80, w: 162, h: 76 });
    store.getState().add('minecraft:scrollable-panel'); const container = store.getState().selected!;
    expect(() => store.getState().setNodeContainer('node_inventory', container)).toThrow();
    store.getState().add('minecraft:creative-tab'); const tab = store.getState().selected!;
    // B1.14: Page membership is allowed from Schema 0.48.0 and upgrades only on this explicit save.
    store.getState().configureTab(tab, 'pages', ['node_inventory'], true);
    expect(store.getState().doc.schemaVersion).toBe('0.48.0');
    store.getState().undo();
    store.getState().configureTab(tab, 'pages', ['node_title'], true);
    const nodes = store.getState().doc.screens[0].nodes;
    expect(tabVisibility(nodes, { [tab]: { tabSelected: false } })('node_inventory')).toBe(true);
    const invalid = structuredClone(store.getState().doc); invalid.screens[0].nodes[0].parentContainerId = container;
    expect(() => parseProject(JSON.stringify(invalid))).toThrow('Screen 根级归属');
    store.getState().add('minecraft:button');
    expect(() => store.getState().saveBehavior({ id: 'hide_inventory', event: { type: 'button-click', sourceId: store.getState().selected! }, action: { type: 'set-visible', targetId: 'node_inventory', visible: false } })).toThrow('Native Region');
  });
  it('freezes all 36 backgrounds, content origins, centers, indices and complete bounding box', () => {
    const slots = playerInventorySlots(); expect(slots).toHaveLength(36);
    for (let row = 0; row < 4; row++) for (let column = 0; column < 9; column++) {
      const y = [0, 18, 36, 58][row], slot = slots[row * 9 + column];
      expect(slot.background).toEqual({ x: column * 18, y, w: 18, h: 18 });
      expect(slot.content).toEqual({ x: column * 18 + 1, y: y + 1, w: 16, h: 16 });
      expect([slot.content.x + 8, slot.content.y + 8]).toEqual([column * 18 + 9, y + 9]);
      expect(slot.playerInventoryIndex).toBe(row === 3 ? column : 9 + row * 9 + column);
    }
    expect(slots[0].content).toEqual({ x: 1, y: 1, w: 16, h: 16 });
    expect(slots[35].content).toEqual({ x: 145, y: 59, w: 16, h: 16 });
    expect(slots[27].background.y - (slots[18].background.y + 18)).toBe(4);
    expect(Math.max(...slots.map(slot => slot.background.x + 18))).toBe(162);
    expect(Math.max(...slots.map(slot => slot.background.y + 18))).toBe(76);
  });
  it('exports one authoritative native node and explicit native-container intent', async () => {
    const doc = nativeInventoryProject(), bundle = await buildBundle(beginExport(doc), async () => new Uint8Array([1]), async () => new Uint8Array([1]));
    const json = bundle.files.find(file => file.name === bundle.manifest.authority.file)!;
    expect(JSON.parse(new TextDecoder().decode(json.bytes))).toEqual(doc);
    expect(bundle.manifest.screens).toHaveLength(1); expect(bundle.manifest.screens[0].nativeRegions).toEqual(nativeRegions(doc.screens[0]));
    expect(bundle.manifest.screens[0].nativeRegions[0].slots).toHaveLength(36);
    const spec = JSON.parse(new TextDecoder().decode(bundle.files.find(file => file.name.endsWith('.implementation.json'))!.bytes));
    expect(spec.designIntent.nodes).toHaveLength(2); expect(spec.designIntent.screens[0].nativeRegions).toHaveLength(1);
    expect(spec.implementationRequirements.join(' ')).toContain('AbstractContainerMenu');
    expect(spec.implementationRequirements.join(' ')).toContain('leftPos');
    expect(spec.implementationRequirements.join(' ')).toContain('do not make 36 fake');
    const legacy = emptyProject(); expect(parseProject(exportProject(legacy))).toEqual(legacy);
    const wrongVersion = nativeInventoryProject(); wrongVersion.schemaVersion = '0.39.0';
    expect(() => parseProject(JSON.stringify(wrongVersion))).toThrow('0.40.0');
  });
});
