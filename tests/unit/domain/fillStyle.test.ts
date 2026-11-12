import { describe, expect, it } from 'vitest';
import { fillEdgeStyle, fillPaintRects, fillStyleSizeError, hasCustomFillEdges } from '../../../src/domain/fillStyle';
import { createNode, emptyProject } from '../../../src/domain/model';
import { createEditorStore } from '../../../src/editor/store';
import { parseProject } from '../../../src/domain/schema';

function fill(w = 9, h = 9) {
  const node = createNode('minecraft:fill', 'fill_style');
  if (node.type !== 'minecraft:fill') throw new Error('test fixture type mismatch');
  node.bounds = { ...node.bounds, w, h };
  return node;
}

function colorAt(node: ReturnType<typeof fill>, x: number, y: number) {
  return fillPaintRects(node).filter(rect => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h).at(-1)?.color;
}

describe('Rectangle static pixel styles', () => {
  it('preserves legacy Plain geometry and ARGB fill semantics', () => {
    const node = fill(1, 2); node.props.color = '#804080C0';
    expect(fillPaintRects(node)).toEqual([{ x: 0, y: 0, w: 1, h: 2, color: '#804080C0' }]);
    expect(fillStyleSizeError(node)).toBeNull();
  });

  it('draws Framed edges inward as four 1px integer strips', () => {
    const node = fill(5, 4); node.props.stylePreset = 'framed'; node.props.borderColor = '#FF112233';
    const rects = fillPaintRects(node);
    expect(rects.slice(1)).toEqual([
      { x: 0, y: 0, w: 5, h: 1, color: '#FF112233' },
      { x: 0, y: 3, w: 5, h: 1, color: '#FF112233' },
      { x: 0, y: 1, w: 1, h: 2, color: '#FF112233' },
      { x: 4, y: 1, w: 1, h: 2, color: '#FF112233' },
    ]);
    expect(colorAt(node, 2, 1)).toBe(node.props.color);
  });

  it('places raised and inset highlights on opposite inner edges', () => {
    const node = fill(5, 5); node.props.stylePreset = 'bevel_raised';
    node.props.borderColor = '#FF010203'; node.props.highlightColor = '#FFEEEEEE'; node.props.shadowColor = '#FF444444';
    expect(colorAt(node, 2, 1)).toBe('#FFEEEEEE'); expect(colorAt(node, 1, 2)).toBe('#FFEEEEEE');
    expect(colorAt(node, 2, 3)).toBe('#FF444444'); expect(colorAt(node, 3, 2)).toBe('#FF444444');
    node.props.stylePreset = 'bevel_inset';
    expect(colorAt(node, 2, 1)).toBe('#FF444444'); expect(colorAt(node, 1, 2)).toBe('#FF444444');
    expect(colorAt(node, 2, 3)).toBe('#FFEEEEEE'); expect(colorAt(node, 3, 2)).toBe('#FFEEEEEE');
    for (const rect of fillPaintRects(node)) expect(rect.x + rect.w).toBeLessThanOrEqual(node.bounds.w), expect(rect.y + rect.h).toBeLessThanOrEqual(node.bounds.h);
  });

  it('rejects undersized frames and bevels without producing negative rectangles', () => {
    const node = fill(2, 2); node.props.stylePreset = 'framed';
    expect(fillStyleSizeError(node)).toContain('3×3'); expect(() => fillPaintRects(node)).toThrow('3×3');
    node.bounds = { ...node.bounds, w: 4, h: 4 }; node.props.stylePreset = 'bevel_raised';
    expect(fillStyleSizeError(node)).toContain('5×5'); expect(() => fillPaintRects(node)).toThrow('5×5');
  });

  it('keeps legacy imports unchanged and upgrades only explicit style edits', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.41.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
    const node = fill(); doc.screens[0].nodes = [node];
    const imported = parseProject(JSON.stringify(doc));
    expect(imported.schemaVersion).toBe('0.41.0'); expect(imported.screens[0].nodes[0]).not.toHaveProperty('props.stylePreset');
    const store = createEditorStore(imported);
    store.getState().updateNode(node.id, current => current.type === 'minecraft:fill' ? { ...current, props: { ...current.props, color: '#FF123456' } } : current);
    expect(store.getState().doc.schemaVersion).toBe('0.41.0');
    store.getState().updateNode(node.id, current => current.type === 'minecraft:fill' ? { ...current, props: { ...current.props, stylePreset: 'framed', borderColor: '#FF010203' } } : current);
    expect(store.getState().doc.schemaVersion).toBe('0.42.0');
    store.getState().undo(); expect(store.getState().doc.schemaVersion).toBe('0.41.0');
    store.getState().redo(); expect(store.getState().doc.screens[0].nodes[0]).toMatchObject({ props: { stylePreset: 'framed', borderColor: '#FF010203' } });
  });
});

describe('Rectangle plain per-edge borders', () => {
  it('defaults each edge to the fill color and 1px without writing fields', () => {
    const node = fill(12, 10); node.props.color = '#FF123456';
    expect(hasCustomFillEdges(node)).toBe(false);
    expect(fillEdgeStyle(node)).toEqual({
      top: { color: '#FF123456', width: 1 }, right: { color: '#FF123456', width: 1 },
      bottom: { color: '#FF123456', width: 1 }, left: { color: '#FF123456', width: 1 },
    });
    expect(fillPaintRects(node)).toEqual([{ x: 0, y: 0, w: 12, h: 10, color: '#FF123456' }]);
  });

  it('draws four inward strips with independent colors and widths', () => {
    const node = fill(12, 10); node.props.color = '#FF000000';
    node.props.edgeTopColor = '#FFFF0000'; node.props.edgeTopWidth = 2;
    node.props.edgeRightColor = '#FF00FF00'; node.props.edgeRightWidth = 3;
    node.props.edgeBottomColor = '#FF0000FF'; node.props.edgeBottomWidth = 2;
    node.props.edgeLeftColor = '#FFFFFFFF'; node.props.edgeLeftWidth = 1;
    expect(fillPaintRects(node)).toEqual([
      { x: 0, y: 0, w: 12, h: 10, color: '#FF000000' },
      { x: 0, y: 0, w: 12, h: 2, color: '#FFFF0000' },
      { x: 0, y: 8, w: 12, h: 2, color: '#FF0000FF' },
      { x: 0, y: 2, w: 1, h: 6, color: '#FFFFFFFF' },
      { x: 9, y: 2, w: 3, h: 6, color: '#FF00FF00' },
    ]);
    expect(fillStyleSizeError(node)).toBeNull();
  });

  it('rejects edge widths that exceed the rectangle', () => {
    const node = fill(8, 6); node.props.edgeTopWidth = 4; node.props.edgeBottomWidth = 3;
    expect(fillStyleSizeError(node)).toContain('宽度之和');
    expect(() => fillPaintRects(node)).toThrow('宽度之和');
  });

  it('requires 0.54.0 for explicit edge fields and upgrades only on edit', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.53.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
    const node = fill(); doc.screens[0].nodes = [node];
    expect(() => parseProject(JSON.stringify(doc))).not.toThrow();
    (node.props as Record<string, unknown>).edgeTopWidth = 2;
    expect(() => parseProject(JSON.stringify(doc))).toThrow(/0\.54\.0/);
  });
});
