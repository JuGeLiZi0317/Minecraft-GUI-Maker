import { describe, expect, it } from 'vitest';
import { createEditorStore, currentScreen, screenById } from '../../../src/editor/store';
import { emptyProject } from '../../../src/domain/model';
import { exportProject } from '../../../src/domain/schema';
import { PANEL_STYLE, NATIVE_PANEL_16 } from '../../../src/domain/panel';

describe('document transactions', () => {
  it('creates independent screens in one versioned transaction, protects bindings and restores history', () => {
    const store = createEditorStore();
    store.getState().saveScreenTarget({ id: 'destination', name: 'Destination' });
    const old = structuredClone(store.getState().doc);
    store.getState().addScreen();
    expect(store.getState().doc.schemaVersion).toBe('0.12.0');
    expect(store.getState().doc.screens).toHaveLength(2);
    expect(store.getState().doc.screens[0].screenTargets).toEqual(old.screens[0].screenTargets);
    const second = store.getState().currentScreenId;
    store.getState().add('minecraft:button');
    expect(store.getState().doc.screens[0].nodes).toHaveLength(0);
    expect(store.getState().doc.screens[1].nodes).toHaveLength(1);
    const button = store.getState().doc.screens[1].nodes[0].id;
    store.getState().setPanel(true);
    store.getState().saveBehavior({ id: 'rule_second', event: { type: 'button-click', sourceId: button }, action: { type: 'set-visible', targetId: button, visible: false } });
    expect(store.getState().doc.screens[0].behaviors).toHaveLength(0);
    expect(store.getState().doc.screens[0].background.kind).toBe('none');
    expect(store.getState().doc.screens[1].behaviors).toHaveLength(1);
    store.getState().switchScreen(old.screens[0].id);
    store.getState().saveScreenTarget({ id: 'destination', name: 'Destination', boundScreenId: second });
    expect(() => store.getState().deleteScreen(second)).toThrow('解除绑定');
    store.getState().renameScreen(second, 'Changed');
    expect(store.getState().doc.screens[0].screenTargets![0].boundScreenId).toBe(second);
    store.getState().saveScreenTarget({ id: 'destination', name: 'Destination' });
    store.getState().deleteScreen(second); expect(store.getState().doc.screens).toHaveLength(1);
    store.getState().undo(); expect(store.getState().doc.screens).toHaveLength(2);
    store.getState().redo(); expect(store.getState().doc.screens).toHaveLength(1);
    const invalid = structuredClone(old); invalid.screens.push({ ...structuredClone(old.screens[0]), id: 'screen_x' });
    expect(() => store.getState().importJson(JSON.stringify(invalid))).toThrow();
    const invalidBinding = structuredClone(store.getState().doc);
    invalidBinding.screens[0].screenTargets![0].boundScreenId = 'missing_screen';
    const stable = store.getState().doc;
    expect(() => store.getState().importJson(JSON.stringify(invalidBinding))).toThrow();
    expect(store.getState().doc).toBe(stable);
  });
  it('switches isolated screen fixtures without changing history or the design', () => {
    const store = createEditorStore();
    const doc = structuredClone(store.getState().doc);
    const second = structuredClone(doc.screens[0]); second.id = 'screen_other'; doc.screens.push(second);
    // A test-only fixture: the public schema still rejects multi-screen documents.
    store.setState({ doc, selected: null });
    const before = store.getState().doc;
    store.getState().switchScreen('screen_other');
    expect(currentScreen(store.getState()).id).toBe('screen_other');
    expect(store.getState().doc).toBe(before);
    expect(store.getState().past).toHaveLength(0);
    expect(() => store.getState().switchScreen('missing')).toThrow();
    expect(store.getState().currentScreenId).toBe('screen_other');
  });
  it('tracks the current screen outside the document and safely follows import and history', () => {
    const store = createEditorStore();
    const original = store.getState().doc;
    expect(currentScreen(store.getState()).id).toBe('screen_main');
    expect(() => screenById(original, 'missing')).toThrow('Screen 不存在');
    const other = structuredClone(original); other.screens[0].id = 'screen_other';
    store.getState().importJson(JSON.stringify(other));
    expect(store.getState().currentScreenId).toBe('screen_other');
    expect(store.getState().doc).not.toHaveProperty('currentScreenId');
    store.getState().undo(); expect(store.getState().currentScreenId).toBe('screen_main');
    store.getState().redo(); expect(store.getState().currentScreenId).toBe('screen_other');
    store.getState().restoreLocal(original); expect(store.getState().currentScreenId).toBe('screen_main');
  });
  it.each(['minecraft:checkbox', 'minecraft:cycle-button'] as const)('upgrades %s with its creation and does not downgrade on deletion or panel changes', type => {
    const old = emptyProject(); old.schemaVersion = '0.3.0'; const store = createEditorStore(old);
    store.getState().add(type); const added = store.getState().doc;
    expect(added.schemaVersion).toBe('0.17.0'); expect(store.getState().past).toHaveLength(1);
    store.getState().undo(); expect(store.getState().doc).toEqual(old);
    store.getState().redo(); expect(store.getState().doc).toEqual(added);
    store.getState().deleteSelected(); expect(store.getState().doc.schemaVersion).toBe('0.17.0');
    store.getState().setPanel(true); expect(store.getState().doc.schemaVersion).toBe('0.17.0');
  });
  it('enabling a panel upgrades only that edit, supports undo, redo and rejects an invalid resize atomically', () => {
    const store = createEditorStore(), before = store.getState().doc;
    store.getState().setPanel(true, PANEL_STYLE);
    const panel = store.getState().doc;
    expect(panel.schemaVersion).toBe('0.2.0'); expect(panel.screens[0].background).toEqual({ kind: 'panel', style: 'custom-bevel-1' });
    expect(store.getState().past).toHaveLength(1);
    const stable = store.getState(); expect(() => store.getState().resizeScreen(7, 20)).toThrow(); expect(store.getState()).toBe(stable);
    store.getState().undo(); expect(store.getState().doc).toEqual(before);
    store.getState().redo(); expect(store.getState().doc).toEqual(panel);
  });
  it('new texture-backed panel uses schema 0.3 while preserving old styles until explicitly changed', () => {
    const store = createEditorStore(); store.getState().setPanel(true, PANEL_STYLE);
    const old = store.getState().doc; store.getState().setPanel(true);
    expect(store.getState().doc.schemaVersion).toBe('0.3.0');
    expect(store.getState().doc.screens[0].background).toEqual({ kind: 'panel', style: NATIVE_PANEL_16 });
    store.getState().undo(); expect(store.getState().doc).toEqual(old);
  });
  it('even importing the same valid document is a separate atomic history transaction', () => {
    const store = createEditorStore();
    store.getState().importJson(exportProject(store.getState().doc));
    expect(store.getState().past).toHaveLength(1);
    store.getState().undo(); expect(store.getState().future).toHaveLength(1);
  });
  it('one drag commits one integer history item; undo/redo restores document and selection', () => {
    const store = createEditorStore(); store.getState().add('minecraft:button');
    const before = store.getState().doc, id = store.getState().selected!;
    store.getState().beginGesture(id);
    for (let i = 0; i < 100; i++) store.getState().previewBounds({ x: 20 + i / 10, y: 30.2, w: 150, h: 20 });
    expect(store.getState().doc).toBe(before); expect(store.getState().past).toHaveLength(1);
    store.getState().commitGesture();
    const after = store.getState().doc;
    expect(after.screens[0].nodes[0].bounds).toEqual({ x: 30, y: 30, w: 150, h: 20 });
    expect(store.getState().past).toHaveLength(2);
    store.getState().undo(); expect(store.getState().doc).toEqual(before); expect(store.getState().selected).toBe(id);
    store.getState().redo(); expect(store.getState().doc).toEqual(after);
  });
  it('resize has one transaction and constrained dimensions', () => {
    const store = createEditorStore(); store.getState().add('minecraft:fill'); const id = store.getState().selected!;
    store.getState().beginGesture(id); store.getState().previewBounds({ x: 16, y: 16, w: 105.6, h: 45.2 }); store.getState().commitGesture();
    expect(store.getState().doc.screens[0].nodes[0].bounds).toEqual({ x: 16, y: 16, w: 106, h: 45 });
    expect(store.getState().past).toHaveLength(2);
    store.getState().beginGesture(id); store.getState().previewBounds({ x: -10, y: 200, w: 5, h: -1 }); store.getState().commitGesture();
    expect(store.getState().doc.screens[0].nodes[0].bounds).toEqual({ x: 0, y: 179, w: 5, h: 1 });
  });
  it('cancel, no-op and non-finite gesture previews leave no history', () => {
    const store = createEditorStore(); store.getState().add('minecraft:button'); const before = store.getState();
    store.getState().beginGesture(before.selected!); store.getState().previewBounds({ x: 99, y: 99, w: 160, h: 40 }); store.getState().cancelGesture();
    expect(store.getState().doc).toBe(before.doc); expect(store.getState().past).toBe(before.past);
    store.getState().beginGesture(before.selected!); store.getState().previewBounds({ x: NaN, y: 1, w: 1, h: 1 }); store.getState().commitGesture();
    expect(store.getState().past).toBe(before.past);
  });
  it('invalid imports preserve all state including active draft/history/selection', () => {
    const store = createEditorStore(); store.getState().add('minecraft:button'); store.getState().beginGesture(store.getState().selected!);
    const before = store.getState();
    expect(() => store.getState().importJson('{bad')).toThrow(); expect(store.getState()).toBe(before);
    store.getState().cancelGesture(); const next = store.getState();
    const bad = structuredClone(next.doc); bad.screens[0].nodes[0].bounds.x = -1;
    expect(() => store.getState().importJson(JSON.stringify(bad))).toThrow(); expect(store.getState()).toBe(next);
  });
  it('atomic import is one undoable snapshot and retains imported revision/extensions', () => {
    const store = createEditorStore(); store.getState().add('minecraft:button'); const before = store.getState();
    const imported = emptyProject(); imported.project.revision = 42; imported.extensions = { 'test.example': { preserve: ['yes'] } };
    store.getState().importJson(exportProject(imported));
    expect(store.getState().doc).toEqual(imported); expect(store.getState().selected).toBeNull(); expect(store.getState().past).toHaveLength(2);
    store.getState().undo(); expect(store.getState().doc).toEqual(before.doc); expect(store.getState().selected).toBe(before.selected);
    store.getState().redo(); expect(store.getState().doc).toEqual(imported);
  });
  it('deletion and property changes undo; new edit clears redo; caller cannot mutate old snapshots', () => {
    const store = createEditorStore(); store.getState().add('minecraft:button'); const id = store.getState().selected!, original = store.getState().doc;
    store.getState().updateNode(id, n => { n.state.visible = false; return n; });
    expect(original.screens[0].nodes[0].state.visible).toBe(true);
    store.getState().deleteSelected(); expect(store.getState().doc.screens[0].nodes).toHaveLength(0);
    store.getState().undo(); expect(store.getState().selected).toBe(id); expect(store.getState().doc.screens[0].nodes).toHaveLength(1);
    store.getState().add('minecraft:fill'); expect(store.getState().future).toHaveLength(0);
    expect(() => store.getState().updateNode(id, n => ({ ...n, bounds: { ...n.bounds, w: 0 } }))).toThrow();
  });
  it('bounds edits reject fractional values and history is bounded at 100', () => {
    const store = createEditorStore(); store.getState().add('minecraft:fill'); const id = store.getState().selected!, before = store.getState();
    expect(() => store.getState().updateNode(id, n => ({ ...n, bounds: { ...n.bounds, x: 1.2 } }))).toThrow(); expect(store.getState()).toBe(before);
    for (let i = 0; i < 105; i++) store.getState().add('minecraft:fill');
    expect(store.getState().past).toHaveLength(100);
  });
});
