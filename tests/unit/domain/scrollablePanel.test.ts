import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { contentSize, contentViewport, containerChildRect, intersectBounds } from '../../../src/domain/scrollablePanel';
import { parseProject } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { buildBundle } from '../../../src/exports/bundle';
import { beginExport } from '../../../src/exports/snapshot';

describe('Scrollable Panel model and geometry', () => {
  it('moves an existing root node into a scrolled container in one undoable transaction', () => {
    const store = createEditorStore(); store.getState().add('minecraft:scrollable-panel', { x: 20, y: 20 });
    const panelId = store.getState().selected!;
    store.getState().updateNode(panelId, node => { if (node.type === 'minecraft:scrollable-panel') node.props.contentHeight = 240; return node; });
    store.getState().add('minecraft:button', { x: 34, y: 130 }); const childId = store.getState().selected!;
    const before = structuredClone(store.getState().doc), count = store.getState().past.length;
    store.getState().beginGesture(childId);
    store.getState().previewBounds({ x: 34, y: 54, w: 150, h: 20 });
    store.getState().commitGesture({ parentContainerId: panelId, scrollOffsets: { [panelId]: 100 } });
    const after = structuredClone(store.getState().doc), child = after.screens[0].nodes.find(node => node.id === childId)!;
    expect(child.parentContainerId).toBe(panelId); expect(child.bounds).toEqual({ x: 10, y: 130, w: 150, h: 20 });
    expect(store.getState().past).toHaveLength(count + 1);
    expect(parseProject(JSON.stringify(after))).toEqual(after);
    store.getState().undo(); expect(store.getState().doc).toEqual(before);
    store.getState().redo(); expect(store.getState().doc).toEqual(after);
    store.getState().setNodeContainer(childId, undefined, { [panelId]: 100 });
    const root = store.getState().doc.screens[0].nodes.find(node => node.id === childId)!;
    expect(root.parentContainerId).toBeUndefined(); expect(root.bounds).toEqual({ x: 34, y: 54, w: 150, h: 20 });
  });

  it('places a new palette item at the visible point and rejects unsupported children atomically', () => {
    const store = createEditorStore(); store.getState().add('minecraft:scrollable-panel', { x: 20, y: 20 });
    const panelId = store.getState().selected!;
    store.getState().updateNode(panelId, node => { if (node.type === 'minecraft:scrollable-panel') node.props.contentHeight = 240; return node; });
    const target = { parentContainerId: panelId, scrollOffsets: { [panelId]: 100 } }, before = structuredClone(store.getState().doc), count = store.getState().past.length;
    store.getState().add('minecraft:button', { x: 106, y: 64 }, target);
    const after = structuredClone(store.getState().doc), child = after.screens[0].nodes[1];
    expect(child.parentContainerId).toBe(panelId); expect(child.bounds).toEqual({ x: 7, y: 130, w: 150, h: 20 });
    expect(store.getState().past).toHaveLength(count + 1);
    store.getState().undo(); expect(store.getState().doc).toEqual(before);
    store.getState().redo(); expect(store.getState().doc).toEqual(after);
    const stable = store.getState().doc, history = store.getState().past;
    expect(() => store.getState().add('minecraft:fill', { x: 106, y: 64 }, target)).toThrow('不能放入容器');
    expect(store.getState().doc).toBe(stable); expect(store.getState().past).toBe(history);
  });

  it.each([[40, 32], [320, 180], [512, 512], [768, 512]])('adds a container on a new %i×%i Screen when another Screen contains W1-G scroll text', (width, height) => {
    const store = createEditorStore();
    store.getState().add('minecraft:fitting-multi-line-text-widget');
    const textScreen = structuredClone(store.getState().doc.screens[0]);
    store.getState().addScreen(); store.getState().resizeScreen(width, height);
    expect(() => store.getState().add('minecraft:scrollable-panel', { x: width - 1, y: height - 1 })).not.toThrow();
    const added = structuredClone(store.getState().doc);
    expect(added.schemaVersion).toBe('0.26.0');
    expect(added.screens[0]).toEqual(textScreen);
    const panel = added.screens[1].nodes[0];
    expect(panel.type).toBe('minecraft:scrollable-panel');
    expect(panel.bounds.x + panel.bounds.w).toBeLessThanOrEqual(width);
    expect(panel.bounds.y + panel.bounds.h).toBeLessThanOrEqual(height);
    expect(parseProject(JSON.stringify(added))).toEqual(added);
    store.getState().undo(); expect(store.getState().doc.screens[1].nodes).toHaveLength(0);
    store.getState().redo(); expect(store.getState().doc).toEqual(added);
  });

  it('preserves Schema 0.26 when adding W1-G text after a container, and reads both newer versions without rewriting text', () => {
    const store = createEditorStore(); store.getState().add('minecraft:scrollable-panel');
    store.getState().addScreen();
    expect(() => store.getState().add('minecraft:fitting-multi-line-text-widget')).not.toThrow();
    expect(store.getState().doc.schemaVersion).toBe('0.26.0');
    const document = store.getState().doc;
    expect(parseProject(JSON.stringify(document))).toEqual(document);
    const previous = structuredClone(document); previous.schemaVersion = '0.25.0'; previous.screens[0].nodes = [];
    expect(parseProject(JSON.stringify(previous))).toEqual(previous);
  });

  it.each([[39, 32], [40, 31]])('rejects a %i×%i design area with an explicit minimum-size reason and no partial edit', (width, height) => {
    const store = createEditorStore(); store.getState().resizeScreen(width, height);
    const before = store.getState().doc, history = store.getState().past;
    expect(() => store.getState().add('minecraft:scrollable-panel')).toThrow('至少需要 40×32');
    expect(store.getState().doc).toBe(before); expect(store.getState().past).toBe(history);
  });

  it('round trips a flat document with local child bounds and rejects invalid parent or overflow', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.26.0'; doc.entryScreenId = 'screen_main'; doc.screenTabGroups = [];
    const panel = createNode('minecraft:scrollable-panel', 'panel_1', { x: 20, y: 20 });
    const child = createNode('minecraft:button', 'button_1', { x: 8, y: 12 }); child.parentContainerId = panel.id;
    doc.screens[0].nodes.push(panel, child);
    expect(parseProject(JSON.stringify(doc))).toEqual(doc);
    const badParent = structuredClone(doc); badParent.screens[0].nodes[1].parentContainerId = 'missing';
    expect(() => parseProject(JSON.stringify(badParent))).toThrow();
    const overflow = structuredClone(doc); overflow.screens[0].nodes[1].bounds.x = 1000;
    expect(() => parseProject(JSON.stringify(overflow))).toThrow();
  });

  it('uses a shared viewport transform, bounded scroll range and rectangular clip intersection', () => {
    const panel = createNode('minecraft:scrollable-panel', 'panel_1');
    if (panel.type !== 'minecraft:scrollable-panel') throw Error('fixture');
    panel.bounds = { x: 30, y: 40, w: 180, h: 96 };
    panel.props.contentHeight = 240;
    const child = createNode('minecraft:button', 'button_1', { x: 5, y: 16 });
    expect(contentViewport(panel)).toEqual({ x: 34, y: 44, w: 164, h: 88 });
    expect(contentSize(panel).maxScroll).toBe(152);
    expect(containerChildRect(panel, child, 20)).toEqual({ x: 39, y: 40, w: child.bounds.w, h: child.bounds.h });
    expect(intersectBounds({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({ x: 5, y: 5, w: 5, h: 5 });
    expect(intersectBounds({ x: 0, y: 0, w: 2, h: 2 }, { x: 4, y: 4, w: 1, h: 1 })).toBeNull();
  });

  it('moves children between root and a container without changing absolute position and protects non-empty containers', () => {
    const store = createEditorStore();
    store.getState().add('minecraft:scrollable-panel', { x: 0, y: 0 });
    const panelId = store.getState().selected!;
    store.getState().add('minecraft:button', { x: 18, y: 20 });
    const buttonId = store.getState().selected!;
    const before = store.getState().doc.screens[0].nodes.find(n => n.id === buttonId)!.bounds;
    store.getState().setNodeContainer(buttonId, panelId);
    const child = store.getState().doc.screens[0].nodes.find(n => n.id === buttonId)!;
    expect(child.parentContainerId).toBe(panelId);
    expect(child.bounds.x).toBe(14);
    expect(child.bounds.y).toBe(16);
    store.getState().undo();
    expect(store.getState().doc.screens[0].nodes.find(n => n.id === buttonId)!.bounds).toEqual(before);
    store.getState().redo();
    store.getState().select(panelId);
    expect(() => store.getState().deleteSelected()).toThrow(/先将子节点移出/);
    store.getState().select(buttonId);
    store.getState().setNodeContainer(buttonId, undefined);
    expect(store.getState().doc.screens[0].nodes.find(n => n.id === buttonId)!.bounds).toEqual(before);
    store.getState().setNodeContainer(buttonId, panelId);
    store.getState().beginGesture(panelId); store.getState().previewBounds({ x: 0, y: 0, w: 80, h: 40 }); store.getState().commitGesture();
    expect(store.getState().doc.screens[0].nodes.find(n => n.id === panelId)!.bounds.w).toBe(180);
  });

  it('retains every child and local coordinate in a multi-Screen atomic bundle manifest', async () => {
    const doc = emptyProject(); doc.schemaVersion = '0.26.0'; doc.entryScreenId = 'screen_main'; doc.screenTabGroups = [];
    const panel = createNode('minecraft:scrollable-panel', 'panel_1', { x: 20, y: 20 });
    const child = createNode('minecraft:button', 'button_1', { x: 8, y: 12 }); child.parentContainerId = panel.id;
    doc.screens[0].nodes.push(panel, child);
    const second = structuredClone(doc.screens[0]); second.id = 'screen_second'; second.title = { kind: 'literal', value: 'Second' }; second.nodes = [];
    doc.screens.push(second);
    const bundle = await buildBundle(beginExport(doc), async () => new Uint8Array([1, 2, 3]));
    const record = bundle.manifest.screens[0].scrollablePanels[0];
    expect(record.nodeId).toBe('panel_1');
    expect(record.children).toEqual([expect.objectContaining({ nodeId: 'button_1', coordinateSpace: 'container-content-local', localBounds: child.bounds })]);
    expect(bundle.manifest.screens).toHaveLength(2);
    expect(bundle.manifest.versions.projectSchema).toBe('0.26.0');
  });
});
