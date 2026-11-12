import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { NODE_TYPES } from '../../../src/domain/catalog';
import { createEditorStore } from '../../../src/editor/store';
import { parseProject } from '../../../src/domain/schema';
import { behaviorNodeLabel } from '../../../src/domain/behaviorLabels';
import { registerBehaviorBlocks, setBlockContext } from '../../../src/behavior/blocks';
import { blocklyProject, sharedStatusRule } from '../../fixtures/blocklyProject';
import { beginExport } from '../../../src/exports/snapshot';

registerBehaviorBlocks();
describe('editor node aliases', () => {
  it.each(NODE_TYPES)('%s supports aliases without changing runtime props or identity', type => {
    const store = createEditorStore(); store.getState().add(type);
    const before = structuredClone(store.getState().doc), node = before.screens[0].nodes[0];
    store.getState().updateNode(node.id, n => ({ ...n, alias: '自定义控件' }));
    const saved = structuredClone(store.getState().doc), renamed = saved.screens[0].nodes[0];
    expect(saved.schemaVersion).toBe(type === 'native_region' ? '0.40.0' : '0.39.0');
    expect(renamed).toEqual({ ...node, alias: '自定义控件' });
    expect(behaviorNodeLabel(renamed)).toContain('自定义控件');
    expect(parseProject(JSON.stringify(saved))).toEqual(saved);
    expect(JSON.parse(beginExport(saved).projectJson)).toEqual(saved);
    store.getState().undo(); expect(store.getState().doc).toEqual(before);
    store.getState().redo(); expect(store.getState().doc).toEqual(saved);
    store.getState().updateNode(node.id, n => { delete n.alias; return n; });
    expect(store.getState().doc.screens[0].nodes[0]).toEqual(node);
    expect(store.getState().doc.schemaVersion).toBe(type === 'native_region' ? '0.40.0' : '0.39.0');
    store.getState().addScreen(); expect(store.getState().doc.schemaVersion).toBe(type === 'native_region' ? '0.40.0' : '0.39.0');
  });
  it('rejects invalid aliases atomically; opening old projects does not migrate', () => {
    const doc = blocklyProject(), store = createEditorStore(doc), before = structuredClone(store.getState().doc);
    expect(before).toEqual(doc);
    for (const alias of ['', '   ', 'x'.repeat(129)]) {
      expect(() => store.getState().updateNode('node_22', n => ({ ...n, alias }))).toThrow();
      expect(store.getState().doc).toEqual(before);
    }
    const invalid = structuredClone(doc); invalid.screens[0].nodes[0].alias = '旧版本不能承载新字段';
    expect(() => parseProject(JSON.stringify(invalid))).toThrow('0.39.0');
  });
  it('uses aliases in Blockly, disambiguates duplicates, preserves stable behavior references', () => {
    const store = createEditorStore(blocklyProject()); store.getState().saveBehavior(sharedStatusRule());
    const rules = structuredClone(store.getState().doc.screens[0].behaviors);
    for (const id of ['node_22','node_23']) store.getState().updateNode(id, n => ({ ...n, alias: '选择 · 来源' }));
    const screen = store.getState().doc.screens[0], workspace = new Blockly.Workspace();
    try {
      setBlockContext(workspace, screen);
      const block = workspace.newBlock('gui_on_selection_single');
      const options = (block.getField('SOURCE') as Blockly.FieldDropdown).getOptions(false);
      expect(options).toContainEqual([behaviorNodeLabel(screen.nodes[0], screen), 'node_22']);
      expect(options).toContainEqual([behaviorNodeLabel(screen.nodes[1], screen), 'node_23']);
      expect(screen.behaviors).toEqual(rules);
      const unique = structuredClone(screen); unique.nodes[0].alias = '完整 · 别名';
      setBlockContext(workspace, unique);
      expect((block.getField('SOURCE') as Blockly.FieldDropdown).getOptions(false)).toContainEqual(['完整 · 别名', 'node_22']);
      const restored = createEditorStore(parseProject(beginExport(store.getState().doc).projectJson));
      expect(restored.getState().doc).toEqual(store.getState().doc);
    } finally { workspace.dispose(); }
  });
});
