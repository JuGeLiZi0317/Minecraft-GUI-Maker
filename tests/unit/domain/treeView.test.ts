import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { exportProject, parseProject, projectSchema } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { TREE_VIEW_RUNTIME_CONTRACT, nextTreeItemId, nextTreeOrder, renameTreeItemId, treeFocusAfterCollapse, treeFocusAfterEdit, treeItemIdError, treeParentAllowed, treeViewError, visibleTreeItems, type TreeViewNode } from '../../../src/domain/treeView';
import { beginExport } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';
import { drawTreeView } from '../../../src/render/treeView';
import { vi } from 'vitest';

const tree = () => createNode('minecraft:tree-view', 'tree_main') as TreeViewNode;
const baseProps = () => structuredClone(tree().props);

describe('Tree View data and lifecycle contract', () => {
  it('freezes the runtime rendering defaults and independent focus/selection rules', () => {
    expect(TREE_VIEW_RUNTIME_CONTRACT.version).toBe('1.1.0');
    expect(TREE_VIEW_RUNTIME_CONTRACT.renderingDefaults).toMatchObject({ rowHeightGuiPx: 18, indentPerLevelGuiPx: 13, disclosureHitWidthGuiPx: 13, textShadow: false });
    expect(TREE_VIEW_RUNTIME_CONTRACT.scroll).toContain('9 GUI px per notch');
    expect(TREE_VIEW_RUNTIME_CONTRACT.interaction).toContain('Hidden selection is retained');
    expect(TREE_VIEW_RUNTIME_CONTRACT.focus).toContain('does not otherwise move focus');
  });

  it('draws only rows visible from the configured initial expansion for Canvas and PNG callers', () => {
    const node = tree(), labels: string[] = [];
    const context = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillRect: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), strokeRect: vi.fn(), fillText: (text: string) => labels.push(text),
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: '', textAlign: '' } as unknown as CanvasRenderingContext2D;
    drawTreeView(context, node, node.bounds.w, node.bounds.h, 'monospace');
    expect(labels).toEqual(['Root', 'Branch', 'Leaf A', 'Leaf B', 'Other']);
    labels.length = 0; drawTreeView(context, node, node.bounds.w, node.bounds.h, 'monospace', ['item_root']);
    expect(labels).toEqual(['Root', 'Branch', 'Other']);
  });

  it('validates stable item identity, parent ownership, ordering, initial expansion and selection', () => {
    const props = baseProps();
    expect(treeViewError(props)).toBeNull();
    expect(visibleTreeItems(props.items, props.initialExpandedIds).map(row => [row.item.id, row.depth])).toEqual([
      ['item_root', 0], ['item_branch', 1], ['item_leaf_a', 2], ['item_leaf_b', 2], ['item_other', 0],
    ]);
    const duplicate = structuredClone(props); duplicate.items[1].id = duplicate.items[0].id;
    expect(treeViewError(duplicate)).toMatch(/唯一/);
    const dangling = structuredClone(props); dangling.items[1].parentId = 'not_there';
    expect(treeViewError(dangling)).toMatch(/父级不存在/);
    const cycle = structuredClone(props); cycle.items[0].parentId = 'item_branch'; cycle.items[0].order = 2;
    expect(treeViewError(cycle)).toMatch(/成环/);
    const duplicateOrder = structuredClone(props); duplicateOrder.items[4].order = 0;
    expect(treeViewError(duplicateOrder)).toMatch(/排序号不能重复/);
    const badSelected = structuredClone(props); badSelected.initialSelectedItemId = 'item_root';
    expect(treeViewError(badSelected)).toMatch(/可选择/);
    const badExpansion = structuredClone(props); badExpansion.initialExpandedIds.push('item_leaf_a');
    expect(treeViewError(badExpansion)).toMatch(/有子项/);
  });

  it('renames item IDs transactionally and remaps child, expansion and selection references', () => {
    const props = baseProps();
    const renamed = renameTreeItemId(props, 'item_branch', 'terrain');
    expect(renamed.items.find(item => item.id === 'terrain')?.parentId).toBe('item_root');
    expect(renamed.items.filter(item => item.parentId === 'terrain').map(item => item.id)).toEqual(['item_leaf_a', 'item_leaf_b']);
    expect(renamed.initialExpandedIds).toEqual(['item_root', 'terrain']);
    expect(renamed.initialSelectedItemId).toBe('item_leaf_a');
    expect(treeViewError(renamed)).toBeNull();
    // The source document is not mutated.
    expect(props.items.some(item => item.id === 'item_branch')).toBe(true);
    // Renaming the root repairs every child parentId, while renaming the selected leaf repairs the selection.
    const root = renameTreeItemId(props, 'item_root', 'world');
    expect(root.items.find(item => item.id === 'item_branch')?.parentId).toBe('world');
    expect(root.initialExpandedIds).toContain('world');
    expect(renameTreeItemId(props, 'item_leaf_a', 'plains').initialSelectedItemId).toBe('plains');
  });

  it('rejects illegal or duplicate IDs and derives readable unique defaults', () => {
    const props = baseProps();
    expect(treeItemIdError(props.items, 'item_root')).toContain('必须唯一');
    expect(treeItemIdError(props.items, 'item_root', 'item_root')).toBeNull();
    expect(treeItemIdError(props.items, '1bad')).toContain('字母开头');
    expect(treeItemIdError(props.items, 'bad id')).toContain('字母开头');
    expect(nextTreeItemId(props.items)).toBe('tree_item');
    expect(nextTreeItemId(props.items, 'item_branch')).toBe('item_branch_item');
    const occupied = [...props.items, { ...props.items[0], id: 'tree_item', parentId: null, order: 5 }];
    expect(nextTreeItemId(occupied)).toBe('tree_item_2');
    // Deleting a middle sibling leaves an order gap; the next add must not collide.
    const gapped = props.items.map(item => item.id === 'item_leaf_b' ? { ...item, order: 2 } : item);
    expect(nextTreeOrder(gapped, 'item_branch')).toBe(3);
    expect(nextTreeOrder(gapped, null)).toBe(2);
    expect(nextTreeOrder(gapped, null, 'item_other')).toBe(1);
    expect(nextTreeOrder([], null)).toBe(0);
    const invalid = structuredClone(props); invalid.items[2].id = '1 bad';
    expect(treeViewError(invalid)).toMatch(/格式无效/);
  });

  it('checks cycle/depth bounds and moves focus away from hidden or disabled rows', () => {
    const props = baseProps();
    expect(treeParentAllowed('item_root', 'item_leaf_a', props.items)).toBe(false);
    expect(treeFocusAfterCollapse('item_leaf_a', 'item_root', props.items)).toBe('item_root');
    const disabled = props.items.map(item => item.id === 'item_leaf_a' ? { ...item, disabled: true } : item);
    expect(treeFocusAfterEdit('item_leaf_a', disabled, props.initialExpandedIds)).toBe('item_branch');
    const deep: typeof props.items = props.items.slice(0, 1).map(item => ({ ...item, parentId: null, order: 0 }));
    for (let index = 1; index < 16; index++) deep.push({ ...props.items[1], id: `level_${index}`, parentId: index === 1 ? 'item_root' : `level_${index - 1}`, order: 0 });
    const tooDeep = [...deep, { ...props.items[1], id: 'level_16', parentId: 'level_15', order: 0 }];
    expect(treeViewError({ items: deep, initialExpandedIds: deep.slice(0, -1).map(item => item.id), initialSelectedItemId: 'level_15' })).toBeNull();
    expect(treeViewError({ items: tooDeep, initialExpandedIds: tooDeep.slice(0, -1).map(item => item.id), initialSelectedItemId: 'level_16' })).toMatch(/层级/);
  });

  it('requires Schema 0.28.0 and round-trips the whole tree without converting legacy documents', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.28.0'; doc.entryScreenId = 'screen_main'; doc.screenTabGroups = [];
    doc.screens[0].nodes.push(tree(), createNode('minecraft:collapsible-panel', 'collapse_main'));
    expect(projectSchema.safeParse(doc).success).toBe(true);
    expect(parseProject(exportProject(doc))).toEqual(doc);
    const older = structuredClone(doc); older.schemaVersion = '0.27.0';
    expect(projectSchema.safeParse(older).success).toBe(false);
    const legacy = emptyProject(); expect(parseProject(exportProject(legacy))).toEqual(legacy);
  });

  it('commits edits as undoable transactions and keeps Schema 0.28 when older widgets are added', () => {
    const store = createEditorStore(); store.getState().add('minecraft:tree-view');
    expect(store.getState().doc.schemaVersion).toBe('0.28.0');
    const before = structuredClone(store.getState().doc);
    store.getState().updateNode('node_1', node => {
      if (node.type === 'minecraft:tree-view') node.props.items[1].label = { kind: 'literal', value: 'Renamed' };
      return node;
    });
    const renamed = store.getState().doc.screens[0].nodes[0]; expect(renamed.type === 'minecraft:tree-view' && renamed.props.items[1].label).toEqual({ kind: 'literal', value: 'Renamed' });
    store.getState().undo(); expect(store.getState().doc).toEqual(before);
    store.getState().redo(); const redone = store.getState().doc.screens[0].nodes[0]; expect(redone.type === 'minecraft:tree-view' && redone.props.items[1].label).toEqual({ kind: 'literal', value: 'Renamed' });
    store.getState().add('minecraft:button'); expect(store.getState().doc.schemaVersion).toBe('0.28.0');
  });

  it('includes every Screen tree in the same ZIP manifest and Agent specification', async () => {
    const doc = emptyProject(); doc.schemaVersion = '0.28.0'; doc.entryScreenId = 'screen_main'; doc.screenTabGroups = [];
    doc.screens[0].nodes.push(tree(), createNode('minecraft:collapsible-panel', 'collapse_main'));
    const second = structuredClone(doc.screens[0]); second.id = 'screen_settings'; second.title = { kind: 'literal', value: 'Settings' };
    second.nodes = [createNode('minecraft:tree-view', 'tree_settings')]; doc.screens.push(second);
    const renderer = async (_snapshot: unknown, _reference: unknown, scale: number, screenId: string) => new Uint8Array([scale, screenId.length]);
    const bundle = await buildBundle(beginExport(doc), renderer as never);
    expect(bundle.manifest.screens.map((screen: { treeViews: { nodeId: string }[] }) => screen.treeViews.map(treeView => treeView.nodeId))).toEqual([['tree_main'], ['tree_settings']]);
    const specFile = bundle.files.find(file => file.name.endsWith('.implementation.json'))!;
    const spec = JSON.parse(new TextDecoder().decode(specFile.bytes));
    expect(spec.version).toBe('0.18.0');
    expect(spec.treeViewContract.nodes.map((node: { nodeId: string }) => node.nodeId)).toEqual(['tree_main', 'tree_settings']);
    expect(spec.treeViewContract.version).toBe('1.1.0');
    expect(spec.treeViewContract.renderingDefaults.disclosureHitWidthGuiPx).toBe(13);
    expect(spec.collapsiblePanelContract.version).toBe('1.1.0');
    expect(spec.collapsiblePanelContract.headerLayout.textInsetLeftGuiPx).toBe(6);
    expect(spec.collapsiblePanelContract.nestedScrollableWheel.defaultStepGuiPxPerNotch).toBe(9);
    expect(spec.treeViewContract.initialPng).toContain('initial expanded rows');
  });
});
