import { describe, expect, it } from 'vitest';
import { structuresInspectorProject } from '../../fixtures/structuresInspectorProject';
import { DEFAULT_EDITOR_LAYER_VIEW, editorLayerContext, editorLayerVisibility, pruneEditorLayerViews, type EditorLayerView, type EditorLayerViews } from '../../../src/domain/editorLayerVisibility';
import { createNode } from '../../../src/domain/model';
import { createEditorStore } from '../../../src/editor/store';
const view = (change: Partial<EditorLayerView> = {}): EditorLayerView => ({ ...DEFAULT_EDITOR_LAYER_VIEW, ...change });

describe('Q3-E editor layer masks', () => {
  it('edits all current Page groups independently of design initial visibility', () => {
    const doc = structuresInspectorProject(), before = JSON.stringify(doc), screen = doc.screens[0];
    const mask = editorLayerVisibility(screen, {}, view());
    for (const id of ['inspector_village', 'inspector_temple', 'inspector_end_city', 'input_temple']) expect(mask.canHit(id)).toBe(true);
    expect(mask.canHit('other_page_note')).toBe(false);
    expect(JSON.stringify(doc)).toBe(before);
  });
  it('hides a complete parent subtree and supports direct child hiding', () => {
    const screen = structuresInspectorProject().screens[0];
    const mask = editorLayerVisibility(screen, {}, view({ hiddenIds: ['inspector_temple', 'input_village'] }));
    for (const id of ['inspector_temple', 'input_temple', 'input_village']) {
      expect(mask.canHit(id)).toBe(false);
      expect(mask.display(screen.nodes.find(node => node.id === id)!).paint).toBe('none');
    }
    expect(mask.canHit('inspector_village')).toBe(true);
  });
  it('isolates same-scope siblings and preserves Persistent references', () => {
    const screen = structuresInspectorProject().screens[0];
    for (const target of ['village', 'temple', 'end_city']) {
      const mask = editorLayerVisibility(screen, {}, view({ soloId: `inspector_${target}` }));
      expect(mask.canHit(`input_${target}`)).toBe(true);
      for (const other of ['village', 'temple', 'end_city'].filter(id => id !== target)) expect(mask.canHit(`input_${other}`)).toBe(false);
      expect(mask.canHit('structure_selector')).toBe(true);
    }
    const reference = editorLayerVisibility(screen, {}, view({ soloId: 'inspector_village', otherPages: 'outline' }));
    expect(reference.display(screen.nodes.find(node => node.id === 'other_page_note')!).paint).toBe('outline');
  });
  it('temporarily reveals a hidden Solo target and its ancestors without replacing the hidden set', () => {
    const screen = structuresInspectorProject().screens[0];
    const state = view({ hiddenIds: ['inspector_temple', 'input_village'], soloId: 'input_temple' });
    const mask = editorLayerVisibility(screen, {}, state);
    expect(mask.canHit('inspector_temple')).toBe(true);
    expect(mask.canHit('input_temple')).toBe(true);
    expect(state.hiddenIds).toEqual(['inspector_temple', 'input_village']);
    const exited = editorLayerVisibility(screen, {}, { ...state, soloId: null });
    expect(exited.canHit('input_temple')).toBe(false);
    expect(exited.canHit('input_village')).toBe(false);
  });
  it.each(['current', 'outline', 'all'] as const)('keeps inactive Page references out of hit-testing in %s mode', otherPages => {
    const screen = structuresInspectorProject().screens[0];
    const mask = editorLayerVisibility(screen, { inspector_pages: 'page_other' }, view({ otherPages }));
    expect(mask.canHit('other_page_note')).toBe(true);
    expect(mask.canHit('input_village')).toBe(false);
    expect(mask.display(screen.nodes.find(node => node.id === 'input_village')!).paint).toBe(otherPages === 'current' ? 'none' : otherPages === 'outline' ? 'outline' : 'content');
    expect(mask.canHit('structure_selector')).toBe(true);
  });
  it('keeps Page-scoped view entries separate and removes deleted references', () => {
    const doc = structuresInspectorProject(), screen = doc.screens[0];
    const a = editorLayerContext(screen, {}), b = editorLayerContext(screen, { inspector_pages: 'page_other' });
    const entries: EditorLayerViews = { [a.key]: { ...a, view: view({ hiddenIds: ['input_village', 'missing'], soloId: 'missing' }) }, [b.key]: { ...b, view: view({ hiddenIds: ['other_page_note'] }) } };
    expect(a.key).not.toBe(b.key);
    const pruned = pruneEditorLayerViews(entries, doc);
    expect(pruned[a.key].view).toMatchObject({ hiddenIds: ['input_village'], soloId: null });
    expect(pruned[b.key].view.hiddenIds).toEqual(['other_page_note']);
    screen.nodes = screen.nodes.filter(node => node.id !== 'page_other');
    expect(pruneEditorLayerViews(pruned, doc)[b.key]).toBeUndefined();
  });
  it('preserves unrelated root Persistent nodes and document Undo/Redo independence', () => {
    const doc = structuresInspectorProject(), screen = doc.screens[0];
    const decoration = createNode('minecraft:fill', 'persistent_decoration', { x: 300, y: 280 });
    decoration.bounds.w = 40; decoration.bounds.h = 20; screen.nodes.push(decoration);
    expect(editorLayerVisibility(screen, {}, view({ soloId: 'structure_selector' })).canHit(decoration.id)).toBe(true);
    const context = editorLayerContext(screen, {}), entry: EditorLayerViews = { [context.key]: { ...context, view: view({ hiddenIds: ['inspector_temple'] }) } };
    const store = createEditorStore(doc);
    store.getState().updateNode('input_village', node => ({ ...node, alias: 'edited' }));
    store.getState().undo(); store.getState().redo();
    expect(pruneEditorLayerViews(entry, store.getState().doc)).toBe(entry);
  });
});
