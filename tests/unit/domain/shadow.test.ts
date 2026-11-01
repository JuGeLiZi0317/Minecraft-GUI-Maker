import { emptyProject } from '../../../src/domain/model';
import { legacyNode } from '../legacyNode';
import { describe, expect, it, vi } from 'vitest';
import { createNode } from '../../../src/domain/model';
import { parseProject } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { drawPreviewText } from '../../../src/render/previewFont';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildPrompt, buildSpecification } from '../../../src/exports/specification';

const types = ['minecraft:button', 'minecraft:edit-box', 'minecraft:string-widget', 'minecraft:checkbox', 'minecraft:cycle-button'] as const;
describe('D-Shadow version and rendering', () => {
  it.each(types)('edits %s atomically and preserves undo, redo and round trip', async type => {
    const initial = emptyProject(); initial.schemaVersion = type === 'minecraft:checkbox' || type === 'minecraft:cycle-button' ? '0.4.0' : '0.1.0'; initial.screens[0].nodes.push(legacyNode(type, 'node_1')); const store = createEditorStore(initial);
    const old = structuredClone(store.getState().doc), id = old.screens[0].nodes[0].id;
    store.getState().updateNode(id, n => { if (n.type !== 'minecraft:fill' && n.type !== 'minecraft:creative-tab') n.props.textShadow = true; return n; });
    const updated = structuredClone(store.getState().doc);
    expect(updated.schemaVersion).toBe('0.5.0'); expect(updated.screens[0].nodes[0].props).toHaveProperty('textShadow', true);
    store.getState().undo(); expect(store.getState().doc).toEqual(old);
    store.getState().redo(); expect(store.getState().doc).toEqual(updated);
    expect(parseProject(JSON.stringify(updated))).toEqual(updated);
    const bad = structuredClone(updated); bad.schemaVersion = old.schemaVersion;
    expect(() => store.getState().importJson(JSON.stringify(bad))).toThrow(); expect(store.getState().doc).toEqual(updated);
    const snap = beginExport(updated), spec = buildSpecification(snap, await referenceFor(snap), 'project.json');
    expect(spec.designIntent.nodes[0].textShadow).toBe(true); expect(buildPrompt(spec)).toContain('"textShadow": true');
    store.getState().updateNode(id, n => { if (n.type !== 'minecraft:fill' && n.type !== 'minecraft:creative-tab') n.props.textShadow = false; return n; });
    expect(store.getState().doc.screens[0].nodes[0].props).toHaveProperty('textShadow', false);
  });
  it.each(types)('draws %s shadow separately without measuring twice', type => {
    const n = createNode(type, 'node_1'); if ((n.type === 'minecraft:fill' || n.type === 'minecraft:creative-tab')) throw Error('unexpected');
    const calls: Array<[string, number, number]> = [];
    const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), measureText: vi.fn(() => ({ width: 10 })), fillText: (s: string, x: number, y: number) => calls.push([s,x,y]), fillStyle: '', globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
    n.props.textShadow = true; drawPreviewText(ctx, n, n.bounds.w, n.bounds.h, 'monospace');
    expect(calls.length).toBeGreaterThanOrEqual(2); expect(calls[0][1]).toBe(calls[1][1] + 1); expect(calls[0][2]).toBe(calls[1][2] + 1);
    calls.length = 0; n.props.textShadow = false; drawPreviewText(ctx, n, n.bounds.w, n.bounds.h, 'monospace'); expect(calls.length).toBe(1);
  });
  it('never downgrades 0.5 when adding H1 or changing panel', () => {
    const store = createEditorStore(); store.getState().add('minecraft:button');
    store.getState().updateNode('node_1', n => { if (n.type !== 'minecraft:fill' && n.type !== 'minecraft:creative-tab') n.props.textShadow = true; return n; });
    store.getState().add('minecraft:checkbox'); store.getState().setPanel(true); expect(store.getState().doc.schemaVersion).toBe('0.17.0');
  });
});
