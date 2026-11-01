import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { createNode, emptyProject } from '../../../src/domain/model';
import { exportProject, parseProject } from '../../../src/domain/schema';
import { dropdownPlacement, isSelectionNode, moveOption } from '../../../src/domain/selection';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';
import { buildPrompt, buildSpecification } from '../../../src/exports/specification';

describe('W1-C bounded selection composites', () => {
  it.each(['minecraft:radio-group', 'minecraft:dropdown'] as const)('adds %s with stable identity, history, JSON and no downgrade', type => {
    const s = createEditorStore(); s.getState().add(type); const doc = s.getState().doc;
    expect(doc.schemaVersion).toBe('0.18.0'); expect(parseProject(exportProject(doc))).toEqual(doc);
    s.getState().undo(); expect(s.getState().doc).toEqual(emptyProject()); s.getState().redo(); expect(s.getState().doc).toEqual(doc);
    const id = doc.screens[0].nodes[0].id;
    s.getState().updateNode(id, n => { if (isSelectionNode(n)) { n.props.options.reverse(); n.props.options[0].label = n.props.options[1].label; } return n; });
    expect(s.getState().doc.screens[0].nodes[0].id).toBe(id);
    const n = s.getState().doc.screens[0].nodes[0]; if (!isSelectionNode(n)) throw Error(); expect(n.props.initialSelectedOptionId).toBe('option_1');
    s.getState().add('minecraft:slider'); s.getState().add('minecraft:multi-line-text-widget'); s.getState().addScreen(); s.getState().setRuntimePolicy(true); s.getState().setPanel(true);
    expect(s.getState().doc.schemaVersion).toBe('0.18.0'); s.getState().restoreLocal(parseProject(exportProject(s.getState().doc)));
  });
  it.each(['duplicate', 'empty', 'disabled', 'missing', 'reference', 'version', 'geometry', 'event', 'unknown'] as const)('rejects %s atomically', reason => {
    const s = createEditorStore(); s.getState().add('minecraft:radio-group'); const before = s.getState().doc, bad = structuredClone(before), node = bad.screens[0].nodes[0];
    if (!isSelectionNode(node)) throw Error();
    if (reason === 'duplicate') node.props.options[1].id = node.props.options[0].id;
    if (reason === 'empty') node.props.options = [];
    if (reason === 'disabled') node.props.options.forEach(o => { o.disabled = true; });
    if (reason === 'missing') node.props.initialSelectedOptionId = 'absent';
    if (reason === 'reference') node.props.options[0].disabled = true;
    if (reason === 'version') bad.schemaVersion = '0.17.0';
    if (reason === 'geometry') node.bounds.h = 59;
    if (reason === 'event') (node.events as any).change = 'open_screen';
    if (reason === 'unknown') (node.props as any).selectedOptionId = 'option_2';
    expect(() => s.getState().importJson(JSON.stringify(bad))).toThrow(); expect(s.getState().doc).toBe(before);
  });
  it('requires explicit replacement and keeps option IDs owner scoped', () => {
    const s = createEditorStore(); s.getState().add('minecraft:dropdown'); const id = s.getState().selected!;
    expect(() => s.getState().updateNode(id, n => { if (isSelectionNode(n)) n.props.options.shift(); return n; })).toThrow();
    s.getState().updateNode(id, n => { if (isSelectionNode(n)) { n.props.options.shift(); n.props.initialSelectedOptionId = 'option_2'; } return n; });
    s.getState().add('minecraft:dropdown'); expect(parseProject(exportProject(s.getState().doc))).toEqual(s.getState().doc);
  });
  it('skips disabled options, wraps in both directions and keeps active selection independent', () => {
    const options = [{ id: 'a', disabled: false }, { id: 'b', disabled: true }, { id: 'c', disabled: false }];
    expect(moveOption(options, 'a', 1)).toBe('c'); expect(moveOption(options, 'c', 1)).toBe('a'); expect(moveOption(options, 'a', -1)).toBe('c');
    expect(options[0].id).toBe('a'); expect(moveOption([{ id: 'a', disabled: false }], 'a', 1)).toBe('a');
  });
  it('places bounded root popup up/down independently from Panel with scrolling and tiny viewport', () => {
    const b = { x: 200, y: 150, w: 100, h: 20 }, screen = { width: 320, height: 180 };
    expect(dropdownPlacement(b, screen, 30, 5)).toMatchObject({ x: 200, y: 50, h: 100, up: true });
    expect(dropdownPlacement({ ...b, y: 10 }, screen, 30, 5)).toMatchObject({ y: 30, h: 100, up: false });
    expect(dropdownPlacement({ x: 0, y: 0, w: 20, h: 20 }, { width: 20, height: 20 }, 1, 1).h).toBe(0);
  });
  it('reads every prior empty schema unchanged', () => {
    for (let i = 1; i <= 17; i++) { const doc = emptyProject(); doc.schemaVersion = `0.${i}.0` as typeof doc.schemaVersion; if (i >= 13) doc.entryScreenId = doc.screens[0].id; if (i >= 14) doc.screenTabGroups = []; expect(parseProject(exportProject(doc))).toEqual(doc); }
  });
  it('exports full options, typed event responsibilities and atomic multi-Screen snapshot', async () => {
    const s = createEditorStore(); s.getState().add('minecraft:radio-group'); s.getState().addScreen(); s.getState().add('minecraft:dropdown');
    const snapshot = beginExport(s.getState().doc), reference = await referenceFor(snapshot), spec = buildSpecification(snapshot, reference, 'project.json');
    expect(spec.version).toBe('0.7.0'); expect(spec.designIntent.selectionEvents).toHaveLength(2); expect(buildPrompt(spec)).toContain('matching release');
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([1]));
    expect(bundle.manifest.version).toBe('0.12.0'); expect(bundle.manifest.screens.map(s => s.selectionControls[0].options.length)).toEqual([3, 3]);
    expect(bundle.manifest.screens.every(s => s.selectionControls[0].popupInDesignPng === false)).toBe(true);
    await expect(buildBundle(snapshot, async (_s, _r, _p, screenId) => { if (screenId === snapshot.document.screens[1].id) throw Error('second Screen failure'); return new Uint8Array([1]); })).rejects.toThrow('second Screen failure');
    expect(createNode('minecraft:dropdown', 'stable').id).toBe('stable');
  });
});
