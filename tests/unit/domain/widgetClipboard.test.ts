import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { createEditorStore } from '../../../src/editor/store';

function fixture() {
  const project = emptyProject();
  project.schemaVersion = '0.44.0'; project.entryScreenId = project.screens[0].id; project.screenTabGroups = [];
  const root = createNode('minecraft:scrollable-panel', 'panel', { x: 8, y: 8 });
  const child = createNode('minecraft:edit-box', 'input', { x: 0, y: 0 });
  child.bounds.w = 60; child.parentContainerId = root.id; child.alias = 'Seed Input';
  project.screens[0].nodes = [root, child];
  return createEditorStore(project);
}

describe('widget session clipboard', () => {
  it('copies complete container properties and remaps descendant parents in one undo transaction', () => {
    const store = fixture(); store.getState().select('panel');
    const before = structuredClone(store.getState().doc);
    expect(store.getState().copySelected()).toBe(true);
    expect(store.getState().past).toHaveLength(0);
    store.getState().pasteCopied();
    const state = store.getState(), nodes = state.doc.screens[0].nodes;
    expect(nodes).toHaveLength(4);
    expect(nodes[2].props).toEqual(nodes[0].props);
    expect(nodes[3]).toEqual({ ...nodes[1], id: nodes[3].id, parentContainerId: nodes[2].id });
    expect(state.selected).toBe(nodes[2].id);
    expect(state.past).toHaveLength(1);
    state.undo(); expect(store.getState().doc).toEqual(before);
    store.getState().redo(); expect(store.getState().doc.screens[0].nodes).toHaveLength(4);
  });

  it('retains an immutable copy and gives repeated pastes unique IDs', () => {
    const store = fixture(); store.getState().select('input'); store.getState().copySelected();
    const original = structuredClone(store.getState().doc.screens[0].nodes[1]);
    store.getState().updateNode('input', node => ({ ...node, alias: 'Changed' }));
    store.getState().pasteCopied(); store.getState().pasteCopied();
    const nodes = store.getState().doc.screens[0].nodes;
    expect(nodes[2].props).toEqual(original.props);
    expect(nodes[2].alias).toBe('Seed Input');
    expect(nodes[2].parentContainerId).toBe('panel');
    expect(new Set(nodes.map(node => node.id)).size).toBe(4);
  });

  it('rejects a deleted parent atomically', () => {
    const store = fixture(); store.getState().select('input'); store.getState().copySelected();
    store.getState().deleteSelected(true);
    store.getState().select('panel'); store.getState().deleteSelected(true);
    const before = store.getState();
    expect(() => before.pasteCopied()).toThrow('原父容器');
    expect(store.getState()).toBe(before);
  });

  it('assigns root copies to the explicit current Page without copying Bake membership', () => {
    const project = emptyProject(); project.schemaVersion = '0.44.0'; project.entryScreenId = project.screens[0].id; project.screenTabGroups = [];
    const fill = createNode('minecraft:fill', 'fill');
    const tab = createNode('minecraft:creative-tab', 'page');
    if (tab.type !== 'minecraft:creative-tab') throw new Error('fixture');
    Object.assign(tab.props, { groupId: 'pages', contentIds: [], selected: true });
    project.screens[0].nodes = [fill, tab];
    const store = createEditorStore(project); store.getState().select('fill'); store.getState().copySelected();
    store.getState().pasteCopied(['page']);
    const nodes = store.getState().doc.screens[0].nodes;
    expect(nodes[1].type === 'minecraft:creative-tab' && nodes[1].props.contentIds).toEqual([nodes[2].id]);
    expect(store.getState().doc.schemaVersion).toBe(project.schemaVersion);
  });

  it('rejects copying a bound CreativeTab without changing the document', () => {
    const project = emptyProject(); project.schemaVersion = '0.44.0'; project.entryScreenId = project.screens[0].id; project.screenTabGroups = [];
    const tab = createNode('minecraft:creative-tab', 'page');
    if (tab.type !== 'minecraft:creative-tab') throw new Error('fixture');
    Object.assign(tab.props, { groupId: 'pages', contentIds: [], selected: true });
    project.screens[0].nodes = [tab];
    const store = createEditorStore(project); store.getState().select('page');
    expect(() => store.getState().copySelected()).toThrow('CreativeTab');
    expect(store.getState().past).toHaveLength(0);
  });

  it('keeps old project versions and clipboard out of authority JSON', () => {
    const project = emptyProject(); project.screens[0].nodes = [createNode('minecraft:fill', 'fill')];
    const store = createEditorStore(project); store.getState().select('fill'); store.getState().copySelected(); store.getState().pasteCopied();
    expect(store.getState().doc.schemaVersion).toBe(project.schemaVersion);
    expect(JSON.stringify(store.getState().doc)).not.toContain('clipboard');
    const restored = createEditorStore(store.getState().doc); restored.getState().pasteCopied();
    expect(restored.getState().past).toHaveLength(0);
  });

  it('keeps Native Region persistent and clamps repeated copies inside the design area', () => {
    const project = emptyProject(); project.schemaVersion = '0.44.0'; project.entryScreenId = project.screens[0].id; project.screenTabGroups = [];
    const native = createNode('native_region', 'inventory');
    native.bounds.x = project.screens[0].designSize.width - native.bounds.w;
    native.bounds.y = project.screens[0].designSize.height - native.bounds.h;
    const tab = createNode('minecraft:creative-tab', 'page');
    if (tab.type !== 'minecraft:creative-tab') throw new Error('fixture');
    Object.assign(tab.props, { groupId: 'pages', contentIds: [], selected: true });
    project.screens[0].nodes = [native, tab];
    const store = createEditorStore(project); store.getState().select('inventory'); store.getState().copySelected(); store.getState().pasteCopied(['page']);
    const nodes = store.getState().doc.screens[0].nodes;
    expect(nodes[2].bounds).toEqual(native.bounds);
    expect(nodes[1].type === 'minecraft:creative-tab' && nodes[1].props.contentIds).toEqual([]);
  });

  it('rejects cross-Screen pastes without a partial transaction', () => {
    const store = fixture(); store.getState().select('panel'); store.getState().copySelected(); store.getState().addScreen();
    const before = store.getState();
    expect(() => before.pasteCopied()).toThrow('同一 Screen');
    expect(store.getState()).toBe(before);
  });
});

