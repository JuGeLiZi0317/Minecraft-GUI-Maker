import { expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { createNode } from '../../../src/domain/model';
import { planDeletion } from '../../../src/domain/deletion';
import { parseProject } from '../../../src/domain/schema';
import { beginExport } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';
import { deletionProject } from '../../fixtures/deletionProject';

it.each(['node_22', 'node_26'])('confirmed deletion of %s removes complete shared/conditional rules in one undoable transaction', async nodeId => {
  const initial = deletionProject(), store = createEditorStore(initial); store.getState().select(nodeId);
  const before = structuredClone(store.getState().doc), plan = planDeletion(before, { kind: 'node', screenId: before.screens[0].id, nodeId });
  expect(plan.rules.map(rule => rule.ruleId)).toEqual(['rule_shared', 'rule_condition']); expect(store.getState().doc).toEqual(before);
  expect(() => store.getState().deleteSelected()).toThrow('引用');
  store.getState().deleteSelected(true);
  const after = structuredClone(store.getState().doc);
  expect(after.screens[0].behaviors.map(rule => rule.id)).toEqual(['rule_legacy', 'rule_to_other']);
  expect(after.screens[0].behaviorMaps).toEqual(nodeId === 'node_26' ? [{ ...before.screens[0].behaviorMaps![0], mappings: [] }] : before.screens[0].behaviorMaps);
  expect(after.screens[0].nodes.some(node => node.id === nodeId)).toBe(false); expect(store.getState().past).toHaveLength(1);
  expect(parseProject(JSON.stringify(after))).toEqual(after); expect(after.schemaVersion).toBe(before.schemaVersion);
  const bundle = await buildBundle(beginExport(after), async () => new Uint8Array([137, 80, 78, 71]));
  expect(bundle.manifest.screens).toHaveLength(2); expect(bundle.manifest.screens[0].conditionalBehaviors).toHaveLength(0);
  store.getState().undo(); expect(store.getState().doc).toEqual(before);
  store.getState().redo(); expect(store.getState().doc).toEqual(after);
});

it('deletes a Screen, incoming navigation and its rules before exporting, and restores everything on undo', async () => {
  const store = createEditorStore(deletionProject()), before = structuredClone(store.getState().doc);
  store.getState().deleteScreen(before.screens[0].id, true);
  const after = structuredClone(store.getState().doc);
  expect(after.screens).toHaveLength(1); expect(after.entryScreenId).toBe('screen_other');
  expect(after.screens[0].screenTargets).toEqual([]); expect(after.screens[0].behaviors.map(rule => rule.id)).toEqual(['rule_other']);
  expect(parseProject(JSON.stringify(after))).toEqual(after); expect(store.getState().past).toHaveLength(1);
  const bundle = await buildBundle(beginExport(after), async () => new Uint8Array([137, 80, 78, 71]));
  expect(bundle.files.some(file => file.name.endsWith('.implementation.json'))).toBe(true);
  store.getState().undo(); expect(store.getState().doc).toEqual(before); store.getState().redo(); expect(store.getState().doc).toEqual(after);
});

it.each([false, true])('cleans rendered navigation tabs and their behavior references (last tab: %s)', lastTab => {
  const initial = deletionProject(), main = initial.screens[0], other = initial.screens[1];
  const tab = createNode('minecraft:creative-tab', 'external_tab');
  if (tab.type !== 'minecraft:creative-tab') throw new Error('wrong fixture');
  delete tab.props.groupId; delete tab.props.contentIds;
  Object.assign(tab.props, { tabMode: 'screen-navigation', navigationGroupId: 'nav_group', navigationTabId: 'nav_main' }); other.nodes.push(tab);
  initial.screenTabGroups = [{ id: 'nav_group', name: 'Nav', tabs: [{ id: 'nav_main', name: 'Main', targetScreenId: main.id }, ...(lastTab ? [] : [{ id: 'nav_other', name: 'Other', targetScreenId: other.id }])] }];
  other.behaviors.push({ id: 'rule_tab', event: { type: 'button-click', sourceId: 'other_button' }, action: { type: 'set-visible', targetId: tab.id, visible: true } });
  const store = createEditorStore(initial), before = structuredClone(store.getState().doc);
  store.getState().deleteScreen(main.id, true); const after = store.getState().doc;
  expect(after.screens[0].nodes.map(node => node.id)).toEqual(['other_button']);
  expect(after.screens[0].behaviors.map(rule => rule.id)).toEqual(['rule_other']);
  expect(after.screenTabGroups).toHaveLength(lastTab ? 0 : 1); expect(parseProject(JSON.stringify(after))).toEqual(after);
  store.getState().undo(); expect(store.getState().doc).toEqual(before);
});

it.each(['source_slider', 'target_progress'])('cleans Slider → Progress linkage when deleting %s', id => {
  const initial = deletionProject(); initial.screens[0].nodes.push(createNode('minecraft:slider', 'source_slider'), createNode('minecraft:progress-bar', 'target_progress'));
  initial.screens[0].behaviors.push({ id: 'rule_progress', event: { type: 'slider-change', sourceId: 'source_slider' }, action: { type: 'set-progress-value', targetId: 'target_progress', mapping: 'normalize' } });
  const store = createEditorStore(initial); store.getState().select(id); const before = structuredClone(store.getState().doc);
  store.getState().deleteSelected(true); expect(store.getState().doc.screens[0].behaviors).toEqual(before.screens[0].behaviors.filter(rule => rule.id !== 'rule_progress'));
  expect(parseProject(JSON.stringify(store.getState().doc))).toEqual(store.getState().doc); store.getState().undo(); expect(store.getState().doc).toEqual(before);
});

it('detaches content-tab references and keeps shared pairs whose IDs still exist on another widget', () => {
  const initial = deletionProject(), extraStatus = createNode('minecraft:status-indicator', 'extra_status'); initial.screens[0].nodes.push(extraStatus);
  const tab = createNode('minecraft:creative-tab', 'content_tab');
  if (tab.type !== 'minecraft:creative-tab') throw new Error('wrong fixture');
  Object.assign(tab.props, { groupId: 'content_group', selected: true, contentIds: ['node_26'] }); initial.screens[0].nodes.push(tab);
  const store = createEditorStore(initial); store.getState().select('node_26'); store.getState().deleteSelected(true);
  const screen = store.getState().doc.screens[0], remainingTab = screen.nodes.find(node => node.id === tab.id);
  expect(remainingTab?.type === 'minecraft:creative-tab' && remainingTab.props.contentIds).toEqual([]);
  expect(screen.behaviorMaps).toEqual(initial.screens[0].behaviorMaps); expect(parseProject(JSON.stringify(store.getState().doc))).toEqual(store.getState().doc);
});
