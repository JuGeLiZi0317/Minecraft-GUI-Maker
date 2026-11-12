import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { parseProject } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { implementationNotesForScreen } from '../../../src/domain/implementationNotes';

describe('Q5-C implementation notes', () => {
  it('requires Schema 0.53.0 only when a note is explicitly present and keeps absent notes absent', () => {
    const old = emptyProject();
    old.schemaVersion = '0.52.0';
    old.entryScreenId = old.screens[0].id;
    const node = createNode('minecraft:button', 'button_1');
    node.implementationNotes = '模式 1 启用两个数值框；模式 2 禁用但保留值。';
    old.screens[0].nodes.push(node);
    expect(() => parseProject(JSON.stringify(old))).toThrow(/0\.53\.0/);

    const clean = emptyProject();
    const store = createEditorStore(clean);
    store.getState().add('minecraft:button');
    expect(JSON.stringify(store.getState().doc)).not.toContain('implementationNotes');
  });

  it('stores Screen and node notes atomically with Undo/Redo and clears empty notes', () => {
    const store = createEditorStore(emptyProject());
    store.getState().add('minecraft:button');
    const nodeId = store.getState().selected!;
    const before = store.getState().doc;
    store.getState().updateNode(nodeId, node => ({ ...node, implementationNotes: '第一行\nSecond <tag> & "quote"' }));
    expect(store.getState().doc.screens[0].nodes[0].implementationNotes).toBe('第一行\nSecond <tag> & "quote"');
    expect(store.getState().doc.schemaVersion).toBe('0.53.0');
    store.getState().setScreenNotes('右侧来自 Biome Registry；关闭后重置。');
    expect(store.getState().doc.screens[0].implementationNotes).toContain('Biome Registry');
    store.getState().undo();
    expect(store.getState().doc.screens[0].implementationNotes).toBeUndefined();
    store.getState().redo();
    expect(store.getState().doc.screens[0].implementationNotes).toContain('Biome Registry');
    store.getState().updateNode(nodeId, node => { delete node.implementationNotes; return node; });
    expect(store.getState().doc.screens[0].nodes[0].implementationNotes).toBeUndefined();
    store.getState().setScreenNotes('');
    expect(store.getState().doc.screens[0].implementationNotes).toBeUndefined();
    store.getState().undo(); store.getState().undo(); store.getState().undo(); store.getState().undo();
    expect(store.getState().doc).toEqual(before);
  });

  it('keeps notes through Screen rename and removes the note with a deleted node', () => {
    const store = createEditorStore(emptyProject());
    store.getState().add('minecraft:button');
    const id = store.getState().selected!;
    store.getState().setScreenNotes('Screen note');
    store.getState().updateNode(id, node => ({ ...node, implementationNotes: 'Node note' }));
    store.getState().renameScreen('screen_main', 'Renamed screen');
    expect(store.getState().doc.screens[0].title).toEqual({ kind: 'literal', value: 'Renamed screen' });
    expect(store.getState().doc.screens[0].implementationNotes).toBe('Screen note');
    store.getState().deleteSelected();
    expect(store.getState().doc.screens[0].nodes).toHaveLength(0);
    expect(store.getState().doc.screens[0].implementationNotes).toBe('Screen note');
  });

  it('enforces 4096 characters and exports Screen/node notes grouped by stable identity', () => {
    const project = emptyProject();
    project.schemaVersion = '0.53.0';
    project.entryScreenId = project.screens[0].id;
    project.screenTabGroups = [];
    project.screens[0].implementationNotes = 'Screen note';
    const node = createNode('minecraft:string-widget', 'widget_1');
    node.implementationNotes = 'A'.repeat(4096);
    project.screens[0].nodes.push(node);
    expect(() => parseProject(JSON.stringify(project))).not.toThrow();
    node.implementationNotes = 'A'.repeat(4097);
    expect(() => parseProject(JSON.stringify(project))).toThrow();
    node.implementationNotes = 'Widget note';
    const doc = parseProject(JSON.stringify(project));
    expect(implementationNotesForScreen(doc.screens[0])).toEqual({
      screenId: 'screen_main', note: 'Screen note',
      nodes: [{ nodeId: 'widget_1', type: 'minecraft:string-widget', alias: null, parentContainerId: null, note: 'Widget note' }],
    });
  });
});
