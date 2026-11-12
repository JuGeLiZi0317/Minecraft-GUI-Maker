import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { activePageIds, persistentWidgetIds, sameScreenPages } from '../../../src/domain/sameScreenPages';

describe('Q3-A same-Screen Pages contract', () => {
  it('derives stable Pages and persistent widgets from the compatible CreativeTab model', () => {
    const screen = emptyProject().screens[0];
    const persistent = createNode('minecraft:string-widget', 'persistent');
    const a = createNode('minecraft:edit-box', 'input_a');
    const b = createNode('minecraft:numeric-input', 'input_b');
    const c = createNode('minecraft:checkbox', 'input_c');
    const tabA = createNode('minecraft:creative-tab', 'page_a');
    const tabB = createNode('minecraft:creative-tab', 'page_b');
    const tabC = createNode('minecraft:creative-tab', 'page_c');
    if (tabA.type !== 'minecraft:creative-tab' || tabB.type !== 'minecraft:creative-tab' || tabC.type !== 'minecraft:creative-tab') throw new Error('fixture');
    Object.assign(tabA.props, { groupId: 'main_pages', contentIds: [a.id], selected: true });
    Object.assign(tabB.props, { groupId: 'main_pages', contentIds: [b.id], selected: false });
    Object.assign(tabC.props, { groupId: 'main_pages', contentIds: [c.id], selected: false });
    screen.nodes = [persistent, a, b, c, tabA, tabB, tabC];

    expect(sameScreenPages(screen)).toEqual([
      { id: 'page_a', groupId: 'main_pages', contentIds: ['input_a'], initial: true },
      { id: 'page_b', groupId: 'main_pages', contentIds: ['input_b'], initial: false },
      { id: 'page_c', groupId: 'main_pages', contentIds: ['input_c'], initial: false },
    ]);
    expect(persistentWidgetIds(screen)).toEqual(['persistent']);
    expect(activePageIds(screen.nodes)).toEqual({ main_pages: 'page_a' });
    expect(activePageIds(screen.nodes, { page_a: { tabSelected: false }, page_c: { tabSelected: true } })).toEqual({ main_pages: 'page_c' });
  });
});
