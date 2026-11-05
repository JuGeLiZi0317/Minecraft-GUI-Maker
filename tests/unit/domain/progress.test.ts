import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { createNode, emptyProject } from '../../../src/domain/model';
import { progressError, progressFraction, progressGeometry } from '../../../src/domain/progress';
import { exportProject, parseProject } from '../../../src/domain/schema';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';
import { buildZip } from '../../../src/exports/zip';
import { buildPrompt, PROGRESS_BAR_CONTRACT } from '../../../src/exports/specification';
import { drawProgressBar, progressText } from '../../../src/render/progressBar';

const make = () => {
  const node = createNode('minecraft:progress-bar', 'progress_1');
  if (node.type !== 'minecraft:progress-bar') throw Error('fixture');
  return node;
};
describe('W1-D Progress Bar math and draw contract', () => {
  it('rejects invalid finite range atomically and supports min=max', () => {
    const n = make(); expect(progressError(n.props)).toBeNull();
    expect(progressError({ ...n.props, min: Infinity })).toContain('有限');
    expect(progressError({ ...n.props, min: 2, max: 1 })).toContain('最小值');
    expect(progressError({ ...n.props, initialValue: 101 })).toContain('有效范围');
    expect(progressFraction({ min: 9, max: 9 }, 9)).toBe(1);
    expect(progressFraction({ min: -1e308, max: 1e308 }, 0)).toBe(.5);
    expect(progressFraction({ min: 0, max: 100 }, NaN)).toBe(0);
    expect(progressFraction({ min: 0, max: 100 }, -1)).toBe(0);
    expect(progressFraction({ min: 0, max: 100 }, 101)).toBe(1);
  });
  it.each([
    ['left-to-right', { fx: 2, fy: 2, fw: 4, fh: 7 }],
    ['right-to-left', { fx: 6, fy: 2, fw: 4, fh: 7 }],
    ['bottom-to-top', { fx: 2, fy: 6, fw: 8, fh: 3 }],
    ['top-to-bottom', { fx: 2, fy: 2, fw: 8, fh: 3 }],
  ] as const)('maps %s to clipped fill geometry', (direction, expected) => {
    const g = progressGeometry(12, 11, .5, direction, 2); expect(g).toMatchObject(expected); expect(g.fx + g.fw).toBeLessThanOrEqual(10); expect(g.fy + g.fh).toBeLessThanOrEqual(9);
  });
  it('handles zero/fill/tiny bounds and deterministic labels', () => {
    expect(progressGeometry(1, 1, 0, 'left-to-right', 0)).toMatchObject({ fw: 0, fh: 1 });
    expect(progressGeometry(1, 1, 1, 'left-to-right', 0)).toMatchObject({ fw: 1, fh: 1 });
    expect(progressGeometry(2, 1, 1, 'bottom-to-top', 1)).toMatchObject({ iw: 0, ih: 0, fw: 0, fh: 0 });
    const node = make(); expect(progressText(node)).toBe('50%'); node.props.display = 'value'; expect(progressText(node)).toBe('50'); node.props.display = 'none'; expect(progressText(node)).toBe('');
  });
  it('renders only clipped rectangles and optional text, without any interaction dependency', () => {
    const calls: unknown[][] = [], ctx = { save: () => calls.push(['save']), restore: () => calls.push(['restore']), beginPath: () => calls.push(['beginPath']), rect: (...a: number[]) => calls.push(['rect', ...a]), clip: () => calls.push(['clip']), fillRect: (...a: number[]) => calls.push(['fillRect', ...a]), fillText: (...a: unknown[]) => calls.push(['fillText', ...a]), set fillStyle(v: string) { calls.push(['color', v]); }, set font(v: string) { calls.push(['font', v]); }, set textAlign(v: string) { calls.push(['align', v]); }, set textBaseline(v: string) { calls.push(['baseline', v]); } } as unknown as CanvasRenderingContext2D;
    drawProgressBar(ctx, make(), 160, 12, 'monospace'); expect(calls.filter(c => c[0] === 'fillRect')).toHaveLength(4); expect(calls.some(c => c[0] === 'fillText' && c[1] === '50%')).toBe(true);
  });
});

describe('W1-D schema, history, persistence, PNG/ZIP specification', () => {
  it('adds a stable node once, upgrades only on explicit add, and round-trips edits through undo/redo', () => {
    const store = createEditorStore(), oldJson = exportProject(store.getState().doc); store.getState().add('minecraft:progress-bar');
    const node = store.getState().selected!, doc = store.getState().doc; expect(doc.schemaVersion).toBe('0.19.0'); expect(parseProject(exportProject(doc))).toEqual(doc);
    store.getState().updateNode(node, n => n.type === 'minecraft:progress-bar' ? { ...n, props: { ...n.props, initialValue: 75 } } : n);
    store.getState().undo(); expect(store.getState().doc.screens[0].nodes[0].id).toBe(node); store.getState().redo();
    const beforeResize = exportProject(store.getState().doc); store.getState().beginGesture(node); store.getState().previewBounds({ x: 20, y: 22, w: 180, h: 16 });
    expect(exportProject(store.getState().doc)).toBe(beforeResize); store.getState().commitGesture(); expect(store.getState().doc.screens[0].nodes[0].bounds).toEqual({ x: 20, y: 22, w: 180, h: 16 });
    const saved = parseProject(exportProject(store.getState().doc)); expect(saved.screens[0].nodes[0]).toMatchObject({ id: node, props: { initialValue: 75 } });
    expect(parseProject(oldJson).schemaVersion).toBe('0.1.0');
  });
  it.each([{ min: NaN }, { min: Infinity }, { min: 2, max: 1 }, { initialValue: -1 }, { borderThickness: 17 }])('rejects invalid authority $min/$max/$initialValue/$borderThickness', patch => {
    const doc = emptyProject(); doc.schemaVersion = '0.19.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = []; const node = make(); Object.assign(node.props, patch); doc.screens[0].nodes.push(node);
    expect(() => parseProject(JSON.stringify(doc))).toThrow(); expect(node.id).toBe('progress_1');
  });
  it('rejects a Progress node smuggled into an older Schema without rewriting it', () => {
    const doc = emptyProject(), node = make(); doc.schemaVersion = '0.18.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = []; doc.screens[0].nodes.push(node);
    const json = JSON.stringify(doc); expect(() => parseProject(json)).toThrow('0.19.0'); expect(JSON.stringify(doc)).toBe(json);
  });
  it('retains pre-0.19 projects and exports initial-only, all-Screen Progress Bar contract in one ZIP batch', async () => {
    const store = createEditorStore(); store.getState().add('minecraft:progress-bar'); store.getState().addScreen(); store.getState().add('minecraft:progress-bar');
    const snap = beginExport(store.getState().doc), ref = await referenceFor(snap), renderer = async () => new Uint8Array([137, 80, 78, 71]);
    const bundle = await buildBundle(snap, renderer, renderer); expect(bundle.manifest.version).toBe('0.22.0'); expect(bundle.manifest.screens.map(s => s.progressControls[0].initialValue)).toEqual([50, 50]);
    const implementation = JSON.parse(new TextDecoder().decode(bundle.files.find(f => f.name.endsWith('.implementation.json'))!.bytes));
    expect(implementation.version).toBe('0.18.0'); expect(implementation.designIntent.progressBars).toHaveLength(2); expect(implementation.progressBarContract).toEqual(PROGRESS_BAR_CONTRACT);
    expect(implementation.designIntent.screens[1].nodes[0].sourcePath).toBe('/screens/1/nodes/0'); expect(buildPrompt(implementation)).toContain('GuiGraphics#fill');
    const zip = await buildZip(bundle.files); expect(zip.type).toBe('application/zip'); expect(zip.size).toBeGreaterThan(1000);
    expect(ref.documentSha256).toBe(bundle.manifest.authority.sha256);
    store.getState().add('minecraft:string-widget'); expect(store.getState().doc.schemaVersion).toBe('0.19.0'); expect(parseProject(exportProject(store.getState().doc))).toEqual(store.getState().doc);
  });
});
