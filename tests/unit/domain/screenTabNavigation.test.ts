import { describe, expect, it } from 'vitest';
import { emptyProject } from '../../../src/domain/model';
import { navigationTarget, screenNavigationSelected } from '../../../src/domain/screenTabNavigation';
import { parseProject } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';

describe('project CreativeTab Screen navigation', () => {
  it('upgrades atomically, shares one ordered definition, derives selection by Screen ID and protects targets', () => {
    const store = createEditorStore();
    store.getState().add('minecraft:creative-tab');
    const firstId = store.getState().currentScreenId;
    store.getState().addScreen(); const secondId = store.getState().currentScreenId;
    store.getState().addScreen(); const thirdId = store.getState().currentScreenId;
    store.getState().setEntryScreen(firstId);
    store.getState().switchScreen(firstId);
    const firstNode = store.getState().doc.screens[0].nodes.find(node => node.type === 'minecraft:creative-tab')!.id;
    const historyBefore = store.getState().past.length;
    const groupId = store.getState().createScreenTabGroup(firstNode);
    expect(store.getState().doc.schemaVersion).toBe('0.14.0');
    expect(store.getState().past).toHaveLength(historyBefore + 1);
    const created = structuredClone(store.getState().doc);
    store.getState().undo(); expect(store.getState().doc.schemaVersion).toBe('0.13.0');
    store.getState().redo(); expect(store.getState().doc).toEqual(created);
    const group = store.getState().doc.screenTabGroups![0];
    const [firstTab] = group.tabs;
    store.getState().saveScreenTabGroup({ ...group, tabs: [...group.tabs, { id: 'navtab_2', name: 'Options', targetScreenId: secondId }, { id: 'navtab_3', name: 'About', targetScreenId: thirdId }] });
    for (const screenId of [firstId, secondId, thirdId]) {
      store.getState().switchScreen(screenId);
      const existing = store.getState().currentScreenId === firstId ? firstNode : null;
      for (const tabId of [firstTab.id, 'navtab_2', 'navtab_3']) {
        let nodeId = existing;
        if (!nodeId || (store.getState().currentScreenId === firstId && tabId !== firstTab.id)) {
          store.getState().add('minecraft:creative-tab'); nodeId = store.getState().selected;
        }
        if (!nodeId) throw new Error('CreativeTab creation failed');
        if (tabId !== firstTab.id || screenId !== firstId) store.getState().configureCreativeTabNavigation(nodeId, groupId, tabId);
      }
    }
    const doc = store.getState().doc;
    expect(parseProject(JSON.stringify(doc))).toEqual(doc);
    for (const screen of doc.screens) for (const node of screen.nodes) if (node.type === 'minecraft:creative-tab' && node.props.tabMode === 'screen-navigation') {
      const selected = screenNavigationSelected(node, screen.id, doc.screenTabGroups);
      expect(selected).toBe(doc.screenTabGroups![0].tabs.find(tab => tab.id === node.props.navigationTabId)?.targetScreenId === screen.id);
      expect(navigationTarget(node, doc.screenTabGroups)?.targetScreenId).toBeDefined();
    }
    expect(() => store.getState().deleteScreen(secondId)).toThrow('CreativeTab');
    expect(store.getState().doc).toEqual(doc);
    expect(store.getState().past.length).toBeGreaterThan(historyBefore);
  });

  it('rejects navigation fields in old schema and cross-mode H2-B mixtures', () => {
    const old = emptyProject(); old.schemaVersion = '0.13.0'; old.entryScreenId = old.screens[0].id;
    const tab = { id: 'tab_a', type: 'minecraft:creative-tab' as const, bounds: { x: 0, y: 0, w: 26, h: 32 }, source: { category: 'screen-internal' as const, className: 'net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen' }, state: { visible: true }, props: { name: 'Tab', column: 1, selected: false, tabMode: 'screen-navigation' as const, navigationGroupId: 'group_a', navigationTabId: 'tab_a' }, events: {} };
    old.screens[0].nodes.push(tab as typeof old.screens[0]['nodes'][number]);
    expect(() => parseProject(JSON.stringify(old))).toThrow('0.14.0');
    const current = structuredClone(old); current.schemaVersion = '0.14.0'; current.screenTabGroups = [{ id: 'group_a', name: 'Main', tabs: [{ id: 'tab_a', name: 'Tab', targetScreenId: current.screens[0].id }] }];
    const currentTab = current.screens[0].nodes[0]; if (currentTab.type === 'minecraft:creative-tab') { currentTab.props.groupId = 'content_group'; currentTab.props.contentIds = []; }
    expect(() => parseProject(JSON.stringify(current))).toThrow('不能携带 H2-B');
  });
});
