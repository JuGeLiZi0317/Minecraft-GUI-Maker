import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { emptyProject } from '../../../src/domain/model';
import { panelBounds } from '../../../src/domain/panel';
import { parseProject } from '../../../src/domain/schema';

describe('H2-P independent panel', () => {
  it('keeps legacy geometry implicit and upgrades in one reversible transaction', () => {
    const legacy = emptyProject(); legacy.schemaVersion = '0.3.0'; legacy.screens[0].background = { kind: 'panel', style: 'supplied-panel-16' };
    const store = createEditorStore(legacy); expect(panelBounds(store.getState().doc.screens[0])).toEqual({ x: 0, y: 0, w: 320, h: 180 });
    const bounds = { x: 10, y: 28, w: 300, h: 140 }; store.getState().setPanelBounds(bounds);
    const saved = structuredClone(store.getState().doc); expect(saved.schemaVersion).toBe('0.9.0'); expect(panelBounds(saved.screens[0])).toEqual(bounds); expect(store.getState().past).toHaveLength(1);
    expect(parseProject(JSON.stringify(saved))).toEqual(saved);
    store.getState().undo(); expect(store.getState().doc).toEqual(legacy); store.getState().redo(); expect(store.getState().doc).toEqual(saved);
    store.getState().add('minecraft:checkbox'); store.getState().setPanel(true); expect(store.getState().doc.schemaVersion).toBe('0.9.0');
    store.getState().saveScreenTarget({ id: 'screen_other', name: 'Other' }); expect(store.getState().doc.schemaVersion).toBe('0.9.0');
  });
  it('atomically rejects legacy fields, invalid bounds and design-area shrink', () => {
    const store = createEditorStore(); store.getState().setPanel(true); store.getState().setPanelBounds({ x: 4, y: 28, w: 200, h: 100 });
    const before = structuredClone(store.getState().doc), old = structuredClone(before); old.schemaVersion = '0.8.0';
    expect(() => parseProject(JSON.stringify(old))).toThrow('0.9.0');
    expect(() => store.getState().setPanelBounds({ x: 300, y: 28, w: 30, h: 100 })).toThrow();
    expect(() => store.getState().resizeScreen(100, 100)).toThrow(); expect(store.getState().doc).toEqual(before);
  });
});
