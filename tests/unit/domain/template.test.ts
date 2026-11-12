import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { capturePersonalTemplate, parsePersonalTemplate } from '../../../src/domain/template';
import { repeatableCardProject } from '../../fixtures/repeatableCardProject';
import { repeatableVisualSlotProject } from '../../fixtures/repeatableVisualSlotProject';
import { createNode } from '../../../src/domain/model';
import { parseProject } from '../../../src/domain/schema';

describe('Q5-E personal templates', () => {
  it('captures the selected container and descendants with a relative root', () => {
    const project = repeatableCardProject();
    const template = capturePersonalTemplate(parseProject(JSON.stringify(project)).screens[0], 'material_layers', 'Card list', 'reusable');
    expect(template.format).toBe('minecraft-gui-maker-template');
    expect(template.nodes[0]).toMatchObject({ id: 'material_layers', bounds: { x: 0, y: 0 }, type: 'minecraft:repeatable-list' });
    expect(template.nodes[0].parentContainerId).toBeUndefined();
    expect(template.nodes.length).toBe(project.screens[0].nodes.filter(node => node.id === 'material_layers' || node.parentContainerId === 'material_layers').length);
    expect(template.resourceDependencies).toEqual([]);
    expect(parsePersonalTemplate(JSON.stringify(template)).name).toBe('Card list');
  });

  it('rejects F2 events, Native Region and non-visual Single Slot templates', () => {
    const project = repeatableCardProject();
    const button = project.screens[0].nodes.find(node => node.id === 'card_toggle')!;
    (button.events as Record<string, string>).click = 'clicked';
    expect(() => capturePersonalTemplate(project.screens[0], 'card_toggle', 'event')).toThrow(/F2 事件/);

    const withRegion = repeatableCardProject();
    withRegion.screens[0].nodes.push(createNode('native_region', 'inventory'));
    expect(() => capturePersonalTemplate(withRegion.screens[0], 'inventory', 'inventory')).toThrow(/Native Region/);

    const withSlot = repeatableVisualSlotProject();
    const slot = withSlot.screens[0].nodes.find(node => node.id === 'row_slot_visual')!;
    if (slot.type === 'minecraft:single_slot') slot.props.usage = 'inventory';
    expect(() => capturePersonalTemplate(withSlot.screens[0], 'row_slot_visual', 'slot')).toThrow(/visual_only/);
  });

  it('lists image resource dependencies without assuming they exist', () => {
    const project = repeatableCardProject();
    const image = createNode('minecraft:image', 'template_image', { x: 8, y: 8 });
    project.screens[0].nodes.push(image);
    const template = capturePersonalTemplate(project.screens[0], 'template_image', 'image');
    expect(template.resourceDependencies).toEqual(['minecraft:textures/gui/container/dispenser.png']);
  });

  it('inserts atomically with new IDs, remapped parents and undo', () => {
    const project = parseProject(JSON.stringify(repeatableCardProject()));
    const template = capturePersonalTemplate(project.screens[0], 'material_layers', 'Card list');
    const store = createEditorStore(project);
    store.getState().addScreen();
    const id = store.getState().insertTemplate(template, undefined, { x: 12, y: 20 });
    const screen = store.getState().doc.screens.at(-1)!;
    const root = screen.nodes.find(node => node.id === id)!;
    expect(root).toMatchObject({ type: 'minecraft:repeatable-list', bounds: { x: 12, y: 20, w: 125, h: 74 } });
    const children = screen.nodes.filter(node => node.parentContainerId === id);
    expect(children).toHaveLength(template.nodes.length - 1);
    expect(children.every(child => !template.nodes.some(old => old.id === child.id))).toBe(true);
    expect(children.map(child => child.bounds)).toEqual(template.nodes.slice(1).map(node => node.bounds));
    store.getState().undo();
    expect(store.getState().doc.screens.at(-1)!.nodes).toHaveLength(0);
  });

  it('allows a visual-only single slot template into a Row Template but rejects containers', () => {
    const project = parseProject(JSON.stringify(repeatableVisualSlotProject()));
    const slotTemplate = capturePersonalTemplate(project.screens[0], 'row_slot_visual', 'Visual slot');
    const store = createEditorStore(project);
    const id = store.getState().insertTemplate(slotTemplate, 'material_layers', { x: 4, y: 4 });
    const inserted = store.getState().doc.screens[0].nodes.find(node => node.id === id)!;
    expect(inserted).toMatchObject({ type: 'minecraft:single_slot', parentContainerId: 'material_layers', props: { usage: 'visual_only' } });
    const before = JSON.stringify(store.getState().doc);
    expect(() => store.getState().insertTemplate(capturePersonalTemplate(project.screens[0], 'material_layers', 'List'), 'material_layers')).toThrow(/Row Template/);
    expect(JSON.stringify(store.getState().doc)).toBe(before);
  });
});
