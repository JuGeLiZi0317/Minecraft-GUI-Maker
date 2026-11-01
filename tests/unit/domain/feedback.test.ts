import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { parseProject } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { captureVisual } from '../../../src/exports/visualSnapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { LayeredResources } from '../../../src/resources/layered';
import { readFileSync } from 'node:fs';
import { drawPreviewText } from '../../../src/render/previewFont';

describe('user feedback corrections', () => {
  it('renders multiline shadow only when explicitly enabled', () => {
    const n = createNode('minecraft:multi-line-text-widget', 'shadow_label');
    if (n.type !== 'minecraft:multi-line-text-widget') throw Error();
    n.props.text = { kind: 'literal', value: 'one\ntwo' };
    let draws = 0;
    const ctx = { save() {}, restore() {}, measureText: (s: string) => ({ width: s.length }), fillText: () => draws++, fillStyle: '' } as unknown as CanvasRenderingContext2D;
    drawPreviewText(ctx, n, n.bounds.w, n.bounds.h, 'monospace'); expect(draws).toBe(2);
    n.props.textShadow = true; draws = 0;
    drawPreviewText(ctx, n, n.bounds.w, n.bounds.h, 'monospace'); expect(draws).toBe(4);
  });
  it('ships a valid three-screen manual acceptance project with explicit edge cases', () => {
    const doc = parseProject(readFileSync('tests/fixtures/feedback-numeric-acceptance.json', 'utf8'));
    expect(doc.screens).toHaveLength(3);
    const nodes = doc.screens[2].nodes;
    expect(nodes.some(n => n.type === 'minecraft:slider' && n.props.min === n.props.max)).toBe(true);
    expect(nodes.some(n => n.type === 'minecraft:numeric-input' && !n.state.enabled)).toBe(true);
    expect(nodes.some(n => n.type === 'minecraft:numeric-input' && n.props.format.decimals === 6)).toBe(true);
  });
  it('uses centered dark unshadowed defaults only for newly created text nodes', () => {
    for (const type of ['minecraft:string-widget', 'minecraft:multi-line-text-widget'] as const) {
      const node = createNode(type, 'label');
      expect(node.props).toMatchObject({ align: 'center', color: '#FF404040' });
      expect('textShadow' in node.props ? node.props.textShadow ?? false : false).toBe(false);
    }
    const old = emptyProject(); old.schemaVersion = '0.15.0'; old.entryScreenId = old.screens[0].id; old.screenTabGroups = [];
    const node = createNode('minecraft:multi-line-text-widget', 'multi');
    if (node.type !== 'minecraft:multi-line-text-widget') throw Error();
    node.props.textShadow = true; node.props.align = 'left'; node.props.color = '#FFE0E0E0'; old.screens[0].nodes.push(node);
    expect(parseProject(JSON.stringify(old))).toEqual(old);
    node.props.textShadow = false;
    expect(() => parseProject(JSON.stringify(old))).toThrow('0.17.0');
  });
  it('rejects smuggled color, upgrades explicit edits once and restores exact history', () => {
    const old = emptyProject(); const button = createNode('minecraft:button', 'button');
    if (button.type !== 'minecraft:button') throw Error();
    delete button.props.color; old.screens[0].nodes.push(button);
    const store = createEditorStore(old);
    store.getState().updateNode('button', n => { if (n.type === 'minecraft:button') n.props.color = '#80404040'; return n; });
    expect(store.getState().doc.schemaVersion).toBe('0.17.0');
    expect(store.getState().past).toHaveLength(1);
    const next = structuredClone(store.getState().doc); next.schemaVersion = '0.16.0';
    expect(() => parseProject(JSON.stringify(next))).toThrow('0.17.0');
    store.getState().undo(); expect(store.getState().doc).toEqual(old);
    store.getState().redo(); expect(store.getState().doc.screens[0].nodes[0].props).toHaveProperty('color', '#80404040');
  });
  it('exports structured numeric contracts and explicit optional native runtime policy', async () => {
    const store = createEditorStore(); store.getState().add('minecraft:slider');
    store.getState().setRuntimePolicy(true);
    const snapshot = beginExport(store.getState().doc), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json');
    expect(spec.numericRuntimeContract.configuration.scale).toBe(1000000);
    expect(spec.numericRuntimeContract.runtime.eventsBound).toBe(false);
    expect(spec.designIntent.navigationLifecycle.escapeAndSystemBack).toContain('close-current-screen');
    expect(spec.designIntent.rendering.nativeScreenBackground).toContain('renderBackground');
    store.getState().undo(); expect(store.getState().doc.runtimePolicy).toBeUndefined();
  });
  it('captures derived selected sprites per page with explicit missing-resource diagnostics', async () => {
    const doc = emptyProject(); doc.schemaVersion = '0.14.0'; doc.entryScreenId = doc.screens[0].id;
    doc.screens.push({ ...structuredClone(doc.screens[0]), id: 'second' });
    doc.screenTabGroups = [{ id: 'group', name: 'Pages', tabs: [{ id: 'first', name: 'First', targetScreenId: doc.screens[0].id }, { id: 'next', name: 'Next', targetScreenId: 'second' }] }];
    for (const [i, screen] of doc.screens.entries()) {
      const tab = createNode('minecraft:creative-tab', `tab_${i}`);
      if (tab.type !== 'minecraft:creative-tab') throw Error();
      tab.props = { ...tab.props, selected: false, column: i === 0 ? 1 : 7, tabMode: 'screen-navigation', navigationGroupId: 'group', navigationTabId: i === 0 ? 'first' : 'next' };
      screen.nodes.push(tab);
    }
    const resources = new LayeredResources(), visual = await captureVisual(resources, beginExport(doc));
    expect(Object.keys(visual.manifest.sprites)).toContain('minecraft:container/creative_inventory/tab_top_selected_1');
    expect(Object.keys(visual.manifest.sprites)).toContain('minecraft:container/creative_inventory/tab_top_selected_7');
    expect(visual.manifest.screens).toHaveLength(2);
    for (const page of visual.manifest.screens) expect(page.diagnostics).toHaveLength(1);
    visual.dispose(); resources.close();
    const snapshot = beginExport(doc), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json');
    expect(spec.designIntent.screens[1].nodes[0].drawLayer).toBe('after-panel');
  });
  it('synchronizes same navigation identity atomically and preserves IDs and selection state', () => {
    const store = createEditorStore(); store.getState().add('minecraft:creative-tab');
    const nodeId = store.getState().selected!, first = store.getState().currentScreenId;
    store.getState().addScreen(); const second = store.getState().currentScreenId;
    store.getState().switchScreen(first); const groupId = store.getState().createScreenTabGroup(nodeId);
    const tabId = store.getState().doc.screenTabGroups![0].tabs[0].id;
    store.getState().switchScreen(second); store.getState().add('minecraft:creative-tab'); const other = store.getState().selected!;
    store.getState().configureCreativeTabNavigation(other, groupId, tabId);
    store.getState().updateNode(other, n => { if (n.type === 'minecraft:creative-tab') { n.props.column = 7; n.bounds.x = 80; } return n; });
    const before = structuredClone(store.getState().doc);
    store.getState().syncNavigationTabLayout(other);
    expect(store.getState().doc.screens[0].nodes[0]).toMatchObject({ id: nodeId, bounds: { x: 80 }, props: { column: 7 } });
    store.getState().undo(); expect(store.getState().doc).toEqual(before);
  });
});
