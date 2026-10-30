import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { parseProject } from '../../../src/domain/schema';
import { spriteForNode, beforePanel } from '../../../src/render/spritePreview';

describe('H2-A CreativeTab', () => {
  it('upgrades transactionally and preserves fixed geometry and older projects', () => {
    const store = createEditorStore(); const original = structuredClone(store.getState().doc);
    store.getState().add('minecraft:creative-tab'); const added = structuredClone(store.getState().doc), node = added.screens[0].nodes[0];
    expect(added.schemaVersion).toBe('0.10.0'); expect(node.bounds).toMatchObject({ w: 26, h: 32 }); expect(parseProject(JSON.stringify(added))).toEqual(added);
    const old = structuredClone(added); old.schemaVersion = '0.9.0'; expect(() => parseProject(JSON.stringify(old))).toThrow();
    const wrong = structuredClone(added); wrong.screens[0].nodes[0].bounds.w = 27; expect(() => parseProject(JSON.stringify(wrong))).toThrow();
    store.getState().undo(); expect(store.getState().doc).toEqual(original); store.getState().redo(); expect(store.getState().doc).toEqual(added);
    store.getState().updateNode(node.id, n => n.type === 'minecraft:creative-tab' ? { ...n, props: { ...n.props, column: 7, selected: true } } : n);
    const edited = structuredClone(store.getState().doc); store.getState().undo(); expect(store.getState().doc).toEqual(added); store.getState().redo(); expect(store.getState().doc).toEqual(edited);
    store.getState().setPanel(true); store.getState().setPanelBounds({ x: 0, y: 28, w: 320, h: 152 }); expect(store.getState().doc.schemaVersion).toBe('0.10.0');
  });
  it('selects all fourteen top sprites and only unselected tabs draw before the panel', () => {
    const store = createEditorStore(); store.getState().add('minecraft:creative-tab');
    for (const selected of [false, true]) for (let column = 1; column <= 7; column++) {
      const node = structuredClone(store.getState().doc.screens[0].nodes[0]); if (node.type !== 'minecraft:creative-tab') throw Error('wrong type');
      node.props.selected = selected; node.props.column = column;
      expect(spriteForNode(node)).toBe(`minecraft:container/creative_inventory/tab_top_${selected ? 'selected' : 'unselected'}_${column}`); expect(beforePanel(node)).toBe(!selected);
    }
  });
});
