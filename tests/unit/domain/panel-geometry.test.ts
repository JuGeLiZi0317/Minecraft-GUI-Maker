import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { emptyProject } from '../../../src/domain/model';
import { panelBounds } from '../../../src/domain/panel';
import { parseProject } from '../../../src/domain/schema';

describe('H2-P independent panel', () => {
  it('applies a matching design-area and Panel resize atomically after rejection, with undo/redo', () => {
    const store = createEditorStore(); store.getState().setPanel(true);
    store.getState().setPanelBounds({ x: 10, y: 10, w: 300, h: 160 });
    const before = store.getState().doc, history = store.getState().past.length;
    expect(() => store.getState().resizeScreen(200, 120)).toThrow('配套调整');
    expect(store.getState().doc).toBe(before); expect(store.getState().past).toHaveLength(history);
    store.getState().setScreenGeometry(200, 120, { x: 8, y: 8, w: 180, h: 100 });
    const after = store.getState().doc;
    expect(after.screens[0].designSize).toMatchObject({ width: 200, height: 120 });
    expect(after.screens[0].background).toMatchObject({ bounds: { x: 8, y: 8, w: 180, h: 100 } });
    expect(store.getState().past).toHaveLength(history + 1);
    store.getState().undo(); expect(store.getState().doc).toEqual(before);
    store.getState().redo(); expect(store.getState().doc).toEqual(after);
    expect(() => store.getState().addScreen()).not.toThrow();
  });
  it('retains newer Schema features and rejects combined invalid changes without partial writes', () => {
    const store = createEditorStore(); store.getState().setPanel(true); store.getState().add('minecraft:button');
    store.getState().updateNode('node_1', node => ({ ...node, alias: '保留别名' }));
    store.getState().setScreenGeometry(400, 240, { x: 10, y: 10, w: 380, h: 220 });
    expect(store.getState().doc.schemaVersion).toBe('0.39.0');
    const before = store.getState().doc;
    expect(() => store.getState().setScreenGeometry(8, 8, { x: 0, y: 0, w: 8, h: 8 })).toThrow('组件超出');
    expect(store.getState().doc).toBe(before);
    expect(() => store.getState().setScreenGeometry(400, 240, { x: 0, y: 0, w: NaN, h: 100 })).toThrow('Panel');
    expect(store.getState().doc).toBe(before);
  });
  it('keeps legacy geometry implicit and upgrades in one reversible transaction', () => {
    const legacy = emptyProject(); legacy.schemaVersion = '0.3.0'; legacy.screens[0].background = { kind: 'panel', style: 'supplied-panel-16' };
    const store = createEditorStore(legacy); expect(panelBounds(store.getState().doc.screens[0])).toEqual({ x: 0, y: 0, w: 320, h: 180 });
    const bounds = { x: 10, y: 28, w: 300, h: 140 }; store.getState().setPanelBounds(bounds);
    const saved = structuredClone(store.getState().doc); expect(saved.schemaVersion).toBe('0.9.0'); expect(panelBounds(saved.screens[0])).toEqual(bounds); expect(store.getState().past).toHaveLength(1);
    expect(parseProject(JSON.stringify(saved))).toEqual(saved);
    store.getState().undo(); expect(store.getState().doc).toEqual(legacy); store.getState().redo(); expect(store.getState().doc).toEqual(saved);
    store.getState().add('minecraft:checkbox'); store.getState().setPanel(true); expect(store.getState().doc.schemaVersion).toBe('0.17.0');
    store.getState().saveScreenTarget({ id: 'screen_other', name: 'Other' }); expect(store.getState().doc.schemaVersion).toBe('0.17.0');
  });
  it('atomically rejects legacy fields, invalid bounds and design-area shrink', () => {
    const store = createEditorStore(); store.getState().setPanel(true); store.getState().setPanelBounds({ x: 4, y: 28, w: 200, h: 100 });
    const before = structuredClone(store.getState().doc), old = structuredClone(before); old.schemaVersion = '0.8.0';
    expect(() => parseProject(JSON.stringify(old))).toThrow('0.9.0');
    expect(() => store.getState().setPanelBounds({ x: 300, y: 28, w: 30, h: 100 })).toThrow();
    expect(() => store.getState().resizeScreen(100, 100)).toThrow(); expect(store.getState().doc).toEqual(before);
  });
  it('repairs stale in-memory Panel geometry before adding a Screen', () => {
    const store = createEditorStore(); store.getState().setPanel(true); store.getState().setPanelBounds({ x: 10, y: 10, w: 100, h: 80 });
    const historyBefore = store.getState().past.length;
    const stale = structuredClone(store.getState().doc);
    if (stale.screens[0].background.kind === 'panel') stale.screens[0].background.bounds = { x: 300, y: 170, w: 40, h: 20 };
    store.setState({ doc: stale }); // Simulates an old live workspace surviving an application update.
    expect(() => store.getState().addScreen()).not.toThrow();
    expect(store.getState().doc.screens[0].background).toMatchObject({ kind: 'panel', bounds: { x: 0, y: 0, w: 320, h: 180 } });
    expect(store.getState().doc.screens).toHaveLength(2);
    expect(store.getState().past).toHaveLength(historyBefore + 1);
    store.getState().undo(); expect(store.getState().doc.screens).toHaveLength(1);
    expect(store.getState().doc.screens[0].background).toMatchObject({ kind: 'panel', bounds: { x: 0, y: 0, w: 320, h: 180 } });
  });
});
