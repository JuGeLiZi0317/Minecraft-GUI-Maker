import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { parseProject } from '../../../src/domain/schema';
import { tabVisibility } from '../../../src/domain/tabGroups';

describe('H2-B groups', () => {
  it('keeps mutual exclusion, stable references, shared content and history', () => {
    const s = createEditorStore(); s.getState().add('minecraft:creative-tab'); s.getState().add('minecraft:creative-tab'); s.getState().add('minecraft:fill'); s.getState().add('minecraft:fill'); s.getState().add('minecraft:string-widget');
    const before = structuredClone(s.getState().doc); s.getState().configureTab('node_1', 'group_a', ['node_3', 'node_5'], false); s.getState().configureTab('node_2', 'group_a', ['node_4', 'node_5'], false);
    const doc = structuredClone(s.getState().doc); expect(doc.schemaVersion).toBe('0.11.0'); expect(parseProject(JSON.stringify(doc))).toEqual(doc);
    const visible = tabVisibility(doc.screens[0].nodes); expect([visible('node_3'), visible('node_4'), visible('node_5')]).toEqual([true, false, true]);
    const next = tabVisibility(doc.screens[0].nodes, { node_1: { tabSelected: false }, node_2: { tabSelected: true } }); expect([next('node_3'), next('node_4'), next('node_5')]).toEqual([false, true, true]);
    const bad = structuredClone(doc); bad.schemaVersion = '0.10.0'; expect(() => parseProject(JSON.stringify(bad))).toThrow();
    s.getState().select('node_3'); expect(() => s.getState().deleteSelected()).toThrow('标签内容引用');
    s.getState().configureTab('node_2', 'group_a', ['node_4', 'node_5'], true); let tabs = s.getState().doc.screens[0].nodes; expect(tabs[0].type === 'minecraft:creative-tab' && tabs[0].props.selected).toBe(false);
    s.getState().undo(); expect(s.getState().doc).toEqual(doc); s.getState().undo(); s.getState().undo(); expect(s.getState().doc).toEqual(before);
  });
  it('rejects duplicate initial selection, missing references and cross-group ownership', () => {
    const s = createEditorStore(); s.getState().add('minecraft:creative-tab'); s.getState().add('minecraft:creative-tab'); s.getState().add('minecraft:fill');
    s.getState().configureTab('node_1', 'group_a', ['node_3'], true); s.getState().configureTab('node_2', 'group_a', ['node_3'], false); const before = structuredClone(s.getState().doc);
    expect(() => s.getState().configureTab('node_2', 'group_b', ['node_3'], true)).toThrow('多个标签组'); expect(s.getState().doc).toEqual(before);
    expect(() => s.getState().configureTab('node_2', 'group_a', ['missing'], false)).toThrow();
    const invalid = structuredClone(before); const a = invalid.screens[0].nodes[1]; if (a.type === 'minecraft:creative-tab') a.props.selected = true; expect(() => parseProject(JSON.stringify(invalid))).toThrow('有且仅有一个'); expect(() => s.getState().importJson(JSON.stringify(invalid))).toThrow(); expect(s.getState().doc).toEqual(before);
    s.getState().configureTab('node_1', 'group_a', [], true); s.getState().configureTab('node_2', 'group_a', [], false); s.getState().select('node_3'); s.getState().deleteSelected(); expect(s.getState().doc.screens[0].nodes.some(n => n.id === 'node_3')).toBe(false); s.getState().undo(); expect(s.getState().doc.screens[0].nodes.some(n => n.id === 'node_3')).toBe(true);
  });
});
