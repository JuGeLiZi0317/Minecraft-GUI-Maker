import { describe, expect, it } from 'vitest';
import { repeatableListError, isRepeatableChildType } from '../../../src/domain/repeatableList';
import { isScrollableChildType } from '../../../src/domain/scrollablePanel';
import { createNode, emptyProject } from '../../../src/domain/model';
import { parseProject } from '../../../src/domain/schema';
import { repeatableVisualSlotProject } from '../../fixtures/repeatableVisualSlotProject';

describe('Q5-E2 composition constraints', () => {
  it('allows safe leaf layout types in Scrollable/Collapsible content', () => {
    for (const type of ['minecraft:fill', 'minecraft:image', 'minecraft:status-indicator', 'minecraft:progress-bar', 'minecraft:cycle-button'] as const) expect(isScrollableChildType(type)).toBe(true);
    for (const type of ['native_region', 'minecraft:creative-tab', 'minecraft:tree-view', 'minecraft:single_slot', 'minecraft:repeatable-list'] as const) expect(isScrollableChildType(type)).toBe(false);
  });

  it('allows visual-only Single Slot and CycleButton in Row Template, rejects inventory/ghost', () => {
    expect(isRepeatableChildType('minecraft:cycle-button')).toBe(true);
    expect(isRepeatableChildType('minecraft:single_slot')).toBe(true);
    const project = repeatableVisualSlotProject(), list = project.screens[0].nodes.find(node => node.id === 'material_layers')!;
    if (list.type !== 'minecraft:repeatable-list') throw new Error('list');
    const slot = project.screens[0].nodes.find(node => node.id === 'row_slot_visual')!;
    expect(repeatableListError(list, project.screens[0].nodes)).toBeNull();
    if (slot.type === 'minecraft:single_slot') slot.props.usage = 'inventory';
    expect(repeatableListError(list, project.screens[0].nodes)).toContain('真实 Inventory Slot');
    if (slot.type === 'minecraft:single_slot') slot.props.usage = 'ghost_selection';
    expect(repeatableListError(list, project.screens[0].nodes)).toContain('Ghost Selection');
  });

  it('keeps visual-only Single Slot out of Scrollable/Collapsible and non-visual Single Slot out of Row Template at Schema level', () => {
    const project = repeatableVisualSlotProject(), slot = project.screens[0].nodes.find(node => node.id === 'row_slot_visual')!;
    if (slot.type !== 'minecraft:single_slot') throw new Error('slot');
    slot.parentContainerId = 'some_panel';
    project.screens[0].nodes.push(createNode('minecraft:scrollable-panel', 'some_panel'));
    expect(() => parseProject(JSON.stringify(project))).toThrow(/visual_only Single Slot 仅可放入 Row Template/);
    slot.parentContainerId = 'material_layers'; slot.props.usage = 'inventory';
    expect(() => parseProject(JSON.stringify(project))).toThrow(/真实 Menu Slot/);
  });
});

describe('Q5-E2 actual container schema path', () => {
  const projectWith = (parentType: 'minecraft:scrollable-panel' | 'minecraft:collapsible-panel', childType: Parameters<typeof createNode>[0]) => {
    const project = emptyProject();
    project.schemaVersion = '0.55.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
    const parent = createNode(parentType, 'parent', { x: 10, y: 10 });
    if (parent.type === 'minecraft:scrollable-panel') parent.props.contentHeight = 120;
    const child = createNode(childType, 'child', { x: 4, y: 4 });
    child.parentContainerId = 'parent';
    project.screens[0].nodes.push(parent, child);
    return project;
  };

  it('accepts unlocked leaf types inside both container kinds and rejects semantic exclusions', () => {
    for (const parentType of ['minecraft:scrollable-panel', 'minecraft:collapsible-panel'] as const) {
      for (const childType of ['minecraft:fill', 'minecraft:image', 'minecraft:status-indicator', 'minecraft:progress-bar', 'minecraft:cycle-button'] as const) {
        const project = projectWith(parentType, childType);
        expect(() => parseProject(JSON.stringify(project))).not.toThrow();
      }
      for (const childType of ['native_region', 'minecraft:tree-view', 'minecraft:creative-tab', 'minecraft:single_slot', 'minecraft:repeatable-list'] as const) {
        const project = projectWith(parentType, childType);
        expect(() => parseProject(JSON.stringify(project))).toThrow();
      }
    }
  });
});
