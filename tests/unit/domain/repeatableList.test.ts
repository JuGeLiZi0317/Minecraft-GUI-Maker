import { describe, expect, it } from 'vitest';
import { repeatableListProject } from '../../fixtures/repeatableListProject';
import { parseProject } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { createNode } from '../../../src/domain/model';
import { tabVisibility } from '../../../src/domain/tabGroups';
import { REPEATABLE_LIST_RUNTIME_CONTRACT, repeatableContentSize, repeatableScrollOffset, repeatableViewport } from '../../../src/domain/repeatableList';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';

const fixture = () => repeatableListProject();

describe('Q5-B Repeatable List / Row Template', () => {
  it('validates the external-data list and fixed row template geometry', () => {
    const doc = parseProject(JSON.stringify(fixture()));
    const repeater = doc.screens[0].nodes.find(node => node.type === 'minecraft:repeatable-list')!;
    expect(repeater.props.rowHeight).toBe(34);
    expect(repeater.props.templateId).toBe('material_row');
    expect(repeater.props.dataSource).toEqual({ mode: 'external', bindingKey: 'generator.material_layers' });
    expect(repeatableViewport(repeater)).toEqual({ x: 104, y: 64, w: 148, h: 162 });
    expect(repeatableContentSize(repeater, 0)).toMatchObject({ height: 0, maxScroll: 0 });
    expect(repeatableContentSize(repeater, 1)).toMatchObject({ height: 34, maxScroll: 0 });
    expect(repeatableContentSize(repeater, 3)).toMatchObject({ height: 102, maxScroll: 0 });
    expect(repeatableContentSize(repeater, 10)).toMatchObject({ height: 340, maxScroll: 178 });
    expect(repeatableContentSize(repeater, 100)).toMatchObject({ height: 3400, maxScroll: 3238 });
    expect(repeatableScrollOffset(repeater, 99999, 10)).toBe(178);
    expect(REPEATABLE_LIST_RUNTIME_CONTRACT.identity.businessItemKey).toContain('never use the visible row index');
  });

  it('rejects a template child outside the fixed row or viewport and duplicate template IDs', () => {
    const outside = fixture();
    const child = outside.screens[0].nodes.find(node => node.id === 'material_block')!;
    child.bounds.y = 30;
    expect(() => parseProject(JSON.stringify(outside))).toThrow(/固定行高/);

    const duplicate = fixture();
    const second = structuredClone(duplicate.screens[0].nodes.find(node => node.id === 'material_layers')!);
    if (second.type !== 'minecraft:repeatable-list') throw new Error('fixture type');
    second.id = 'material_layers_2';
    second.bounds = { ...second.bounds, y: 240 };
    duplicate.screens[0].nodes.push(second);
    expect(() => parseProject(JSON.stringify(duplicate))).toThrow(/Row Template ID/);
  });

  it('keeps preview row count out of authority JSON and supports undo/redo of template edits', () => {
    const store = createEditorStore(fixture());
    const before = store.getState().doc;
    expect(JSON.stringify(before)).not.toContain('previewRows');
    store.getState().updateNode('material_label', node => node.type === 'minecraft:string-widget'
      ? { ...node, props: { ...node.props, text: { kind: 'literal', value: '材料层' } } }
      : node);
    const changed = store.getState().doc;
    expect(JSON.stringify(changed)).not.toContain('previewRows');
    expect((changed.screens[0].nodes.find(node => node.id === 'material_label') as Extract<typeof changed.screens[number]['nodes'][number], { type: 'minecraft:string-widget' }>).props.text).toEqual({ kind: 'literal', value: '材料层' });
    store.getState().undo();
    expect(store.getState().doc).toEqual(before);
    store.getState().redo();
    expect(store.getState().doc).toEqual(changed);
  });

  it('accepts Page ownership but rejects unsupported template members and horizontal overflow', () => {
    const page = fixture();
    const tab = createNode('minecraft:creative-tab', 'page_a', { x: 0, y: 0 });
    if (tab.type === 'minecraft:creative-tab') { tab.props.groupId = 'group_a'; tab.props.contentIds = ['material_layers']; tab.props.selected = true; }
    page.screens[0].nodes.push(tab);
    const tabB = createNode('minecraft:creative-tab', 'page_b', { x: 40, y: 0 });
    if (tabB.type === 'minecraft:creative-tab') { tabB.props.groupId = 'group_a'; tabB.props.contentIds = []; tabB.props.selected = false; }
    page.screens[0].nodes.push(tabB);
    expect(() => parseProject(JSON.stringify(page))).not.toThrow();
    expect(tabVisibility(page.screens[0].nodes)('material_layers')).toBe(true);
    expect(tabVisibility(page.screens[0].nodes, { page_a: { tabSelected: false }, page_b: { tabSelected: true } })('material_layers')).toBe(false);

    for (const type of ['native_region', 'minecraft:creative-tab', 'minecraft:scrollable-panel', 'minecraft:repeatable-list'] as const) {
      const invalid = fixture();
      const child = createNode(type, 'bad_child', { x: 0, y: 0 });
      child.parentContainerId = 'material_layers';
      invalid.screens[0].nodes.push(child);
      expect(() => parseProject(JSON.stringify(invalid))).toThrow();
    }

    const overflow = fixture();
    const child = overflow.screens[0].nodes.find(node => node.id === 'material_block')!;
    child.bounds.x = 100;
    expect(() => parseProject(JSON.stringify(overflow))).toThrow(/视口宽度/);
  });

  it('rejects out-of-bounds Inspector/store edits atomically', () => {
    const store = createEditorStore(fixture());
    const before = store.getState().doc;
    expect(() => store.getState().updateNode('material_block', node => ({ ...node, bounds: { ...node.bounds, x: 100 } }))).toThrow();
    expect(store.getState().doc).toEqual(before);
  });

  it('reorders template members in the authoritative array with Undo/Redo', () => {
    const store = createEditorStore(fixture());
    const before = store.getState().doc.screens[0].nodes.map(node => node.id);
    store.getState().moveNode('material_label', 'later');
    const later = store.getState().doc.screens[0].nodes.map(node => node.id);
    expect(later.indexOf('material_label')).toBe(before.indexOf('material_label') + 1);
    store.getState().undo();
    expect(store.getState().doc.screens[0].nodes.map(node => node.id)).toEqual(before);
    store.getState().redo();
    expect(store.getState().doc.screens[0].nodes.map(node => node.id)).toEqual(later);
  });

  it('exports the list runtime contract and template child identities into the implementation spec', async () => {
    const snap = beginExport(parseProject(JSON.stringify(fixture())));
    const spec = buildSpecification(snap, await referenceFor(snap), 'project.json');
    expect(spec.designIntent.screen.repeatableLists[0]).toMatchObject({
      nodeId: 'material_layers', templateId: 'material_row', designPreviewRows: 3, templateOnly: true, expandedInstances: false,
      children: expect.arrayContaining([expect.objectContaining({ nodeId: 'material_block', type: 'minecraft:edit-box' })]),
    });
    expect(spec.repeatableListContract).toMatchObject({ version: '1.0.0', design: { template: expect.stringContaining('exactly one') }, identity: { templateId: expect.any(String) } });
    expect(spec.implementationRequirements.join('\n')).toContain('never use the visible row index as business identity');
  });
});
