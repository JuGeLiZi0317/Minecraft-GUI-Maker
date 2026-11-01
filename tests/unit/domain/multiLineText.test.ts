import { describe, expect, it } from 'vitest';
import { createNode, emptyProject, literal } from '../../../src/domain/model';
import { exportProject, parseProject } from '../../../src/domain/schema';
import { createEditorStore, currentScreen } from '../../../src/editor/store';
import { multiLineLayout } from '../../../src/render/multiLineText';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification, buildPrompt } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';

const fixture = () => {
  const store = createEditorStore(); store.getState().add('minecraft:multi-line-text-widget');
  return store;
};
const node = (text: string, width = 5, rows = 10) => {
  const n = createNode('minecraft:multi-line-text-widget', 'multi');
  if (n.type !== 'minecraft:multi-line-text-widget') throw new Error('fixture');
  n.props.text = literal(text); n.props.maxWidth = width; n.props.maxRows = rows; return n;
};
describe('W1-A MultiLineTextWidget', () => {
  it('word wraps, retains explicit empty lines, normalizes CRLF and drops extra rows without ellipsis', () => {
    const layout = multiLineLayout(node('hello world\r\n\n中文😀abcdef', 5, 4), t => Array.from(t).length);
    expect(layout.lines).toEqual(['hello', 'world', '', '中文😀ab']);
    expect(layout.height).toBe(36); expect(layout.width).toBe(5); expect(layout.truncated).toBe(true);
    expect(multiLineLayout(node(''), t => t.length).lines).toEqual([]);
    expect(multiLineLayout(node('a\n'), t => t.length).lines).toEqual(['a', '']);
    expect(multiLineLayout(node('12345'), t => t.length).truncated).toBe(false);
  });
  it('keeps an overwide Unicode glyph intact and uses retained lines for native width', () => {
    const layout = multiLineLayout(node('😀x\nlong ignored', 1, 1), () => 6);
    expect(layout.lines).toEqual(['😀']); expect(layout.width).toBe(1); expect(layout.widths).toEqual([6]);
    expect(multiLineLayout(node('aa\nb', 100), t => t.length).width).toBe(2);
  });
  it('upgrades add atomically and preserves old JSON exactly when merely reading', () => {
    const old = emptyProject(); expect(parseProject(exportProject(old))).toEqual(old);
    const store = fixture(), s = store.getState();
    expect(s.doc.schemaVersion).toBe('0.17.0'); expect(s.doc.entryScreenId).toBe('screen_main'); expect(s.past).toHaveLength(1);
    expect(parseProject(exportProject(s.doc))).toEqual(s.doc);
    s.undo(); expect(store.getState().doc).toEqual(old);
    store.getState().redo(); expect(store.getState().doc).toEqual(s.doc);
  });
  it.each(['version', 'geometry', 'shadow', 'right-align', 'rows', 'width', 'text', 'source', 'enabled'] as const)('strictly rejects invalid %s without replacing current project', kind => {
    const store = fixture(), original = store.getState().doc, bad = JSON.parse(exportProject(original)), n = bad.screens[0].nodes[0];
    if (kind === 'version') bad.schemaVersion = '0.14.0';
    if (kind === 'geometry') n.bounds.h++;
    if (kind === 'shadow') n.props.textShadow = 'false';
    if (kind === 'right-align') n.props.align = 'right';
    if (kind === 'rows') n.props.maxRows = 0;
    if (kind === 'width') n.props.maxWidth = 0;
    if (kind === 'text') n.props.text.value = 'x'.repeat(4097);
    if (kind === 'source') n.source.className = 'fake.MultiLineTextWidget';
    if (kind === 'enabled') n.state.enabled = true;
    expect(() => store.getState().importJson(JSON.stringify(bad))).toThrow(); expect(store.getState().doc).toBe(original);
  });
  it('synchronizes properties/geometry in one edit, snaps gesture rows, preserves opposite edge, and undoes', () => {
    const store = fixture(), id = currentScreen(store.getState()).nodes[0].id;
    store.getState().updateNode(id, n => { if (n.type === 'minecraft:multi-line-text-widget') n.props.maxRows = 3; return n; });
    expect(currentScreen(store.getState()).nodes[0].bounds.h).toBe(27);
    const before = exportProject(store.getState().doc), count = store.getState().past.length;
    store.getState().beginGesture(id); store.getState().previewBounds({ x: 16, y: 20, w: 100, h: 23 });
    expect(exportProject(store.getState().doc)).toBe(before); store.getState().commitGesture();
    const n = currentScreen(store.getState()).nodes[0];
    expect(n.bounds).toEqual({ x: 16, y: 25, w: 100, h: 18 }); expect(n.props).toMatchObject({ maxRows: 2, maxWidth: 100 });
    expect(store.getState().past).toHaveLength(count + 1);
    store.getState().undo(); expect(exportProject(store.getState().doc)).toBe(before);
    expect(() => store.getState().updateNode(id, n => ({ ...n, bounds: { ...n.bounds, h: 10 } }))).toThrow();
    store.getState().beginGesture(id); store.getState().previewBounds({ x: 0, y: 0, w: 10, h: 9 }); store.getState().cancelGesture();
    expect(exportProject(store.getState().doc)).toBe(before);
  });
  it('preserves new text-style schema through all older feature mutations and per-screen history', () => {
    const store = fixture(); store.getState().addScreen(); store.getState().add('minecraft:button');
    const second = store.getState().currentScreenId, button = currentScreen(store.getState()).nodes[0].id;
    store.getState().setEntryScreen(second); store.getState().setPanel(true); store.getState().setPanelBounds({ x: 1, y: 1, w: 100, h: 100 });
    store.getState().saveScreenTarget({ id: 'dest', name: 'Destination' });
    store.getState().saveBehavior({ id: 'rule', event: { type: 'button-click', sourceId: button }, action: { type: 'open_screen', targetScreenId: 'dest' } });
    store.getState().add('minecraft:creative-tab'); const tab = store.getState().selected!;
    store.getState().createScreenTabGroup(tab);
    expect(store.getState().doc.schemaVersion).toBe('0.17.0'); expect(parseProject(exportProject(store.getState().doc))).toEqual(store.getState().doc);
  });
  it('accepts exact text/row/width budgets and rejects an oversized reservation atomically', () => {
    const store = fixture(), id = store.getState().selected!;
    store.getState().resizeScreen(8192, 2304);
    store.getState().updateNode(id, n => {
      if (n.type === 'minecraft:multi-line-text-widget') {
        n.bounds.x = 0; n.bounds.y = 0; n.props.maxWidth = 8192; n.props.maxRows = 256; n.props.text = literal('x'.repeat(4096));
      }
      return n;
    });
    const doc = store.getState().doc; expect(parseProject(exportProject(doc))).toEqual(doc);
    expect(() => store.getState().updateNode(id, n => { if (n.type === 'minecraft:multi-line-text-widget') n.props.maxRows = 257; return n; })).toThrow();
    expect(store.getState().doc).toBe(doc);
  });
  it('creates a valid reservation on a tiny screen and avoids project navigation IDs', () => {
    const doc = emptyProject(); doc.screens[0].designSize = { width: 1, height: 9, unit: 'gui-px' };
    doc.schemaVersion = '0.14.0'; doc.entryScreenId = doc.screens[0].id;
    doc.screenTabGroups = [{ id: 'node_1', name: 'Group', tabs: [{ id: 'tab', name: 'Tab', targetScreenId: doc.screens[0].id }] }];
    const store = createEditorStore(doc); store.getState().add('minecraft:multi-line-text-widget');
    const n = currentScreen(store.getState()).nodes[0]; expect(n.id).not.toBe('node_1');
    expect(n.bounds).toEqual({ x: 0, y: 0, w: 1, h: 9 }); expect(n.props).toMatchObject({ maxWidth: 1, maxRows: 1 });
  });
  it('exports native construction and limitations for a widget on a non-first screen; rejects whole failed bundle', async () => {
    const store = fixture(); store.getState().addScreen(); store.getState().add('minecraft:multi-line-text-widget');
    const doc = store.getState().doc, snapshot = beginExport(doc), ref = await referenceFor(snapshot);
    const spec = buildSpecification(snapshot, ref, 'project.json'), prompt = buildPrompt(spec);
    expect(spec.version).toBe('0.7.0'); expect(spec.facts.gameRuntimeVerified).toBe(false);
    expect(spec.designIntent.widgetContracts.multiLineTextWidget?.geometry).toContain('NEVER call setSize');
    expect(spec.designIntent.screens[1].nodes[0].sourcePath).toBe('/screens/1/nodes/0');
    expect(prompt).toContain('setMaxRows'); expect(prompt).toContain('PENDING');
    const render = async () => new Uint8Array([1]);
    const bundle = await buildBundle(snapshot, render, render);
    expect(bundle.manifest.screens).toHaveLength(2); expect(bundle.manifest.reference.documentSha256).toBe(ref.documentSha256);
    expect(bundle.manifest.versions.implementationSpecification).toBe('0.7.0');
    await expect(buildBundle(snapshot, async (_s, _r, _p, id) => { if (id === doc.screens[1].id) throw new Error('W1 render failure'); return render(); }, render)).rejects.toThrow('W1 render failure');
  });
});
