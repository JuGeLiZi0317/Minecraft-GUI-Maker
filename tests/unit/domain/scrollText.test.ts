import { describe, expect, it, vi } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { parseProject, exportProject } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { clampScrollOffset, drawScrollText, scrollTextLayout, wrapScrollText } from '../../../src/render/scrollText';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';

describe('ReadOnlyScrollText', () => {
  it('wraps mixed text, explicit breaks, blank lines and long unbroken words without truncating content', () => {
    const measure = (text: string) => [...text].length * 5;
    expect(wrapScrollText('ab cd中文\nefgh\n\n', 15, measure)).toEqual(['ab', 'cd中', '文', 'efg', 'h', '', '']);
    expect(wrapScrollText('', 15, measure)).toEqual([]);
    const node = createNode('minecraft:fitting-multi-line-text-widget', 'scroll_1');
    if (node.type !== 'minecraft:fitting-multi-line-text-widget') throw new Error('unexpected node');
    node.props.text = { kind: 'literal', value: 'x'.repeat(200) }; node.bounds.h = 1;
    const layout = scrollTextLayout(node, measure);
    expect(layout.lines.join('')).toBe('x'.repeat(200)); expect(layout.overflow).toBe(true); expect(layout.maxScroll).toBeGreaterThan(0);
    expect(clampScrollOffset(-1, layout.maxScroll)).toBe(0); expect(clampScrollOffset(layout.maxScroll + 10, layout.maxScroll)).toBe(layout.maxScroll);
    expect(clampScrollOffset(Number.NaN, layout.maxScroll)).toBe(0);
    node.props.text = { kind: 'literal', value: '' }; expect(scrollTextLayout(node, measure)).toMatchObject({ lines: [], overflow: false, maxScroll: 0 });
  });

  it('draws all wrapped rows with a paired viewport clip and only draws the scrollbar for overflow', () => {
    const calls: string[] = [];
    const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn((...args: number[]) => { calls.push(`clip:${args.join(',')}`); }), clip: vi.fn(), measureText: (text: string) => ({ width: [...text].length * 5 }), fillText: vi.fn((text: string) => { calls.push(text); }), fillRect: vi.fn((x: number, y: number) => { calls.push(`fill:${x},${y}`); }), strokeRect: vi.fn(), fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: '', textAlign: '' } as unknown as CanvasRenderingContext2D;
    const node = createNode('minecraft:fitting-multi-line-text-widget', 'scroll_1'); if (node.type !== 'minecraft:fitting-multi-line-text-widget') throw new Error('unexpected node');
    node.bounds = { ...node.bounds, w: 30, h: 18 }; node.props.text = { kind: 'literal', value: 'A'.repeat(100) };
    const rows = scrollTextLayout(node, text => [...text].length * 5).lines.length;
    drawScrollText(ctx, node, 'monospace');
    expect(calls).toContain('clip:1,1,28,16'); expect(ctx.fillText).toHaveBeenCalledTimes(rows * 2); expect(calls).toContain('fill:30,0');
    node.props.textShadow = false; calls.length = 0; vi.mocked(ctx.fillText).mockClear(); drawScrollText(ctx, node, 'monospace');
    expect(ctx.fillText).toHaveBeenCalledTimes(rows);
    node.props.text = { kind: 'literal', value: 'short' }; calls.length = 0; drawScrollText(ctx, node, 'monospace'); expect(calls.some(call => call === 'fill:30,0')).toBe(false);
  });

  it('adds with Schema 0.24 shadow option, keeps old 0.23 projects readable, undo/redo, JSON strict and multi-Screen export intent', async () => {
    const store = createEditorStore(emptyProject()); store.getState().add('minecraft:fitting-multi-line-text-widget');
    const nodeId = store.getState().selected!; expect(store.getState().doc.schemaVersion).toBe('0.24.0');
    const oldWithoutShadow = structuredClone(store.getState().doc); oldWithoutShadow.schemaVersion = '0.23.0';
    const oldNode = oldWithoutShadow.screens[0].nodes[0]; if (oldNode.type === 'minecraft:fitting-multi-line-text-widget') delete oldNode.props.textShadow;
    expect(parseProject(exportProject(oldWithoutShadow))).toEqual(oldWithoutShadow);
    store.getState().updateNode(nodeId, node => node.type === 'minecraft:fitting-multi-line-text-widget' ? { ...node, props: { ...node.props, text: { kind: 'literal', value: 'first line\nsecond line '.repeat(10) } } } : node);
    const edited = structuredClone(store.getState().doc); store.getState().undo(); store.getState().redo(); expect(store.getState().doc).toEqual(edited);
    expect(parseProject(exportProject(edited))).toEqual(edited);
    const old = structuredClone(edited); old.schemaVersion = '0.22.0'; expect(() => parseProject(exportProject(old))).toThrow('Schema 0.23.0');
    const second = structuredClone(edited.screens[0]); second.id = 'screen_other'; second.title = { kind: 'literal', value: 'Other' }; second.nodes = [createNode('minecraft:fitting-multi-line-text-widget', 'scroll_other')]; edited.screens.push(second);
    const snapshot = beginExport(edited), reference = await referenceFor(snapshot), { buildSpecification } = await import('../../../src/exports/specification');
    const spec = buildSpecification(snapshot, reference, 'project.json'); expect(spec.version).toBe('0.18.0'); expect(spec.readOnlyScrollTextContract.scroll.initial).toContain('top');
    const renderer = (async (_snapshot: unknown, _ref: unknown, scale: number) => new Uint8Array([scale])) as never;
    const bundle = await buildBundle(snapshot, renderer); expect(bundle.manifest.version).toBe('0.22.0');
    expect(bundle.manifest.screens.map(screen => screen.readOnlyScrollTexts.map(item => item.nodeId))).toEqual([['node_1'], ['scroll_other']]);
  });
});
