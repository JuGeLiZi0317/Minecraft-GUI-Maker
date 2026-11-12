import { describe, expect, it } from 'vitest';
import { singleSlotProject } from '../../fixtures/singleSlotProject';
import { parseProject } from '../../../src/domain/schema';
import { createNode, emptyProject } from '../../../src/domain/model';
import { createEditorStore } from '../../../src/editor/store';
import { SINGLE_SLOT_CONTRACT, singleSlots } from '../../../src/domain/singleSlot';
import { tabVisibility } from '../../../src/domain/tabGroups';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';

const fixture = () => singleSlotProject();

describe('Q5-D native single slot', () => {
  it('validates fixed 18×18 geometry, three usages and design-only placeholders', () => {
    const doc = parseProject(JSON.stringify(fixture()));
    const slots = doc.screens[0].nodes.filter(node => node.type === 'minecraft:single_slot');
    expect(slots.map(node => node.props.usage)).toEqual(['inventory', 'ghost_selection', 'visual_only']);
    expect(slots.every(node => node.bounds.w === 18 && node.bounds.h === 18)).toBe(true);
    expect(slots[1].props.placeholderItemId).toBe('minecraft:iron_ingot');
    expect(singleSlots(doc.screens[0])).toHaveLength(3);
    expect(SINGLE_SLOT_CONTRACT.usage.ghost_selection).toContain('non-consuming');
    expect(SINGLE_SLOT_CONTRACT.rowTemplate).toContain('rejected');
  });

  it('leaves a pre-0.55 project unchanged until a Single Slot is created', () => {
    const old = emptyProject(); old.schemaVersion = '0.54.0'; old.entryScreenId = old.screens[0].id; old.screenTabGroups = [];
    const parsed = parseProject(JSON.stringify(old));
    expect(parsed.schemaVersion).toBe('0.54.0');
    expect(JSON.stringify(parsed)).not.toContain('single_slot');
    expect(parsed.screens[0].nodes).toHaveLength(0);
  });

  it('rejects resizing, containers and pre-0.55 documents', () => {
    const resized = fixture();
    const slot = resized.screens[0].nodes.find(node => node.id === 'slot_inventory')!;
    slot.bounds = { ...slot.bounds, w: 19 };
    expect(() => parseProject(JSON.stringify(resized))).toThrow(/18×18/);

    const nested = fixture();
    const child = nested.screens[0].nodes.find(node => node.id === 'slot_ghost')!;
    child.parentContainerId = 'slot_visual';
    expect(() => parseProject(JSON.stringify(nested))).toThrow(/Menu Slot|Row Template/);

    const old = fixture(); old.schemaVersion = '0.54.0';
    expect(() => parseProject(JSON.stringify(old))).toThrow(/0\.55\.0/);
  });

  it('keeps Page ownership and creation/undo semantics', () => {
    const page = fixture();
    const tab = createNode('minecraft:creative-tab', 'page_a', { x: 0, y: 0 });
    if (tab.type === 'minecraft:creative-tab') { tab.props.groupId = 'group_a'; tab.props.contentIds = ['slot_visual']; tab.props.selected = true; }
    page.screens[0].nodes.push(tab);
    expect(() => parseProject(JSON.stringify(page))).not.toThrow();
    expect(tabVisibility(page.screens[0].nodes)('slot_visual')).toBe(true);
    expect(tabVisibility(page.screens[0].nodes, { page_a: { tabSelected: false } })('slot_visual')).toBe(false);

    const store = createEditorStore(emptyProject());
    store.getState().add('minecraft:single_slot');
    const id = store.getState().selected!;
    const created = store.getState().doc.screens[0].nodes[0];
    expect(created).toMatchObject({ type: 'minecraft:single_slot', bounds: { w: 18, h: 18 }, props: { usage: 'inventory' } });
    expect(store.getState().doc.schemaVersion).toBe('0.55.0');
    store.getState().updateNode(id, node => node.type === 'minecraft:single_slot' ? { ...node, props: { ...node.props, usage: 'ghost_selection' } } : node);
    expect(store.getState().doc.schemaVersion).toBe('0.55.0');
    store.getState().undo();
    const restored = store.getState().doc.screens[0].nodes[0];
    if (restored.type !== 'minecraft:single_slot') throw new Error('restored type');
    expect(restored.props.usage).toBe('inventory');
  });

  it('exports single slots and their contract in the implementation specification', async () => {
    const snap = beginExport(parseProject(JSON.stringify(fixture())));
    const spec = buildSpecification(snap, await referenceFor(snap), 'project.json');
    expect(spec.designIntent.screen.singleSlots).toHaveLength(3);
    expect(spec.designIntent.screen.singleSlots[1]).toMatchObject({
      nodeId: 'slot_ghost', usage: 'ghost_selection', ghostSelection: true,
      content: { x: 1, y: 1, w: 16, h: 16 }, placeholderItemId: 'minecraft:iron_ingot',
    });
    expect(spec.designIntent.singleSlotContract).toMatchObject({ version: '1.0.0', size: { w: 18, h: 18 } });
    expect(spec.implementationRequirements.join('\n')).toContain('JEI/REI');
  });
});
