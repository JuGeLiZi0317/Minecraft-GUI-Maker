import { describe, expect, it } from 'vitest';
import { parseProject, type Behavior, type BehaviorAction } from '../../../src/domain/schema';
import { createNode } from '../../../src/domain/model';
import { sameScreenPages, persistentWidgetIds } from '../../../src/domain/sameScreenPages';
import { nativeRegions, pageOwnership, NATIVE_REGION_CONTRACT } from '../../../src/domain/nativeRegion';
import { tabManaged, tabVisibility } from '../../../src/domain/tabGroups';
import { effectiveRuntimeVisibility } from '../../../src/domain/runtimeVisibility';
import { editorLayerVisibility } from '../../../src/domain/editorLayerVisibility';
import { planDeletion } from '../../../src/domain/deletion';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';
import { namedMappingProject } from '../../fixtures/namedMappingProject';

/** Structures Inspector with a two-Page group; the player inventory starts Persistent. */
function pageProject(schemaVersion: '0.47.0' | '0.48.0' = '0.48.0', options: { attachTo?: 'structures' | 'other' | 'both' } = {}) {
  const doc = namedMappingProject();
  doc.schemaVersion = schemaVersion;
  const screen = doc.screens[0];
  screen.nodes.push(createNode('native_region', 'player_inventory', { x: 8, y: 236 }));
  const pages = screen.nodes.filter(node => node.type === 'minecraft:creative-tab');
  if (options.attachTo === 'structures' || options.attachTo === 'both') {
    const tab = pages.find(node => node.type === 'minecraft:creative-tab' && node.props.groupId === 'inspector_pages' && node.props.selected)!;
    if (tab.type === 'minecraft:creative-tab') tab.props.contentIds = [...(tab.props.contentIds ?? []), 'player_inventory'];
  }
  if (options.attachTo === 'other' || options.attachTo === 'both') {
    const tab = pages.find(node => node.type === 'minecraft:creative-tab' && node.props.groupId === 'inspector_pages' && !node.props.selected)!;
    if (tab.type === 'minecraft:creative-tab') tab.props.contentIds = [...(tab.props.contentIds ?? []), 'player_inventory'];
  }
  return doc;
}

describe('B1.14 page-scoped native region', () => {
  it('only accepts Page membership from Schema 0.48.0 and keeps every other boundary', () => {
    expect(() => parseProject(JSON.stringify(pageProject('0.47.0', { attachTo: 'structures' })))).toThrow('0.48.0');
    const accepted = parseProject(JSON.stringify(pageProject('0.48.0', { attachTo: 'structures' })));
    expect(accepted.schemaVersion).toBe('0.48.0');
    expect(parseProject(JSON.stringify(pageProject('0.48.0')))).toEqual(pageProject('0.48.0'));

    const container = pageProject();
    container.screens[0].nodes.find(node => node.id === 'player_inventory')!.parentContainerId = 'inspector_village';
    expect(() => parseProject(JSON.stringify(container))).toThrow('Screen 根级归属');

    const twoGroups = pageProject('0.48.0', { attachTo: 'both' });
    const secondTab = twoGroups.screens[0].nodes.find(node => node.type === 'minecraft:creative-tab' && !node.props.selected)!;
    if (secondTab.type === 'minecraft:creative-tab') { secondTab.props.groupId = 'other_group'; secondTab.props.selected = true; }
    expect(() => parseProject(JSON.stringify(twoGroups))).toThrow('多个标签组');

    const f2Target = (action: BehaviorAction) => {
      const doc = pageProject();
      const rule = doc.screens[0].behaviors[0] as Extract<Behavior, { actions: unknown[] }>;
      rule.actions = [action as never];
      return () => parseProject(JSON.stringify(doc));
    };
    expect(f2Target({ type: 'set-visible', targetId: 'player_inventory', visible: false })).toThrow('Native Region');
    expect(f2Target({ type: 'set-exclusive-visible', value: { type: 'event-value', field: 'optionId' }, mapping: [{ optionId: 'village', targetId: 'player_inventory' }], fallback: 'hide-all' })).toThrow('Native Region');
    expect(f2Target({ type: 'set-text', targetId: 'player_inventory', text: 'x' })).toThrow();
  });

  it('derives persistent, pageGroupId and pageIds from contentIds only', () => {
    const screen = pageProject('0.48.0', { attachTo: 'structures' }).screens[0];
    const [region] = nativeRegions(screen);
    expect(region).toMatchObject({ nodeId: 'player_inventory', persistent: false, pageGroupId: 'inspector_pages', pageIds: ['page_structures'] });
    expect(region.visibilityGate).toBe('active Page membership AND ancestor visibility');
    expect(nativeRegions(pageProject().screens[0])[0]).toMatchObject({ persistent: true, pageGroupId: null, pageIds: [] });

    const shared = pageProject('0.48.0', { attachTo: 'both' }).screens[0];
    expect(pageOwnership(shared, 'player_inventory')).toEqual({ persistent: false, pageGroupId: 'inspector_pages', pageIds: ['page_structures', 'page_other'] });
    expect(persistentWidgetIds(shared)).not.toContain('player_inventory');
    expect(sameScreenPages(shared).flatMap(page => page.contentIds)).toContain('player_inventory');
    expect(persistentWidgetIds(pageProject().screens[0])).toContain('player_inventory');
  });

  it('gates a page-owned region on the active Page in preview, design PNG and editor layers', () => {
    const screen = pageProject('0.48.0', { attachTo: 'structures' }).screens[0];
    const region = screen.nodes.find(node => node.id === 'player_inventory')!;
    const otherPage = screen.nodes.find(node => node.type === 'minecraft:creative-tab' && !node.props.selected)!;
    expect(tabManaged(screen.nodes).has('player_inventory')).toBe(true);
    const defaultActive = effectiveRuntimeVisibility(screen.nodes)(region);
    expect(defaultActive).toBe(true);
    const inactive = effectiveRuntimeVisibility(screen.nodes, { [otherPage.id]: { tabSelected: false }, [screen.nodes.find(node => node.type === 'minecraft:creative-tab' && node.props.selected)!.id]: { tabSelected: false } }, null)(region) && tabVisibility(screen.nodes, { [screen.nodes.find(node => node.type === 'minecraft:creative-tab' && node.props.selected)!.id]: { tabSelected: false }, [otherPage.id]: { tabSelected: true } })('player_inventory');
    expect(inactive).toBe(false);
    const layerState = editorLayerVisibility(screen, {}, { hidden: [], solo: null } as never);
    expect(layerState.display(region).hit).toBe(true);
  });

  it('upgrades only on explicit page ownership and never downgrades', () => {
    const legacy = pageProject('0.47.0'), store = createEditorStore(legacy);
    expect(store.getState().doc.schemaVersion).toBe('0.47.0');
    const screens = store.getState().doc.screens[0], tab = screens.nodes.find(node => node.id === 'page_structures')!;
    if (tab.type !== 'minecraft:creative-tab') throw new Error('fixture');
    store.getState().configureTab(tab.id, 'inspector_pages', [...(tab.props.contentIds ?? []), 'player_inventory'], tab.props.selected);
    expect(store.getState().doc.schemaVersion).toBe('0.48.0');
    store.getState().undo(); expect(store.getState().doc).toEqual(legacy);
    store.getState().redo();
    const owned = store.getState().doc.screens[0].nodes.find(node => node.id === 'page_structures')!;
    if (owned.type !== 'minecraft:creative-tab') throw new Error('fixture');
    store.getState().configureTab(owned.id, 'inspector_pages', (owned.props.contentIds ?? []).filter(id => id !== 'player_inventory'), owned.props.selected);
    expect(store.getState().doc.schemaVersion).toBe('0.48.0');
    expect(store.getState().doc.screens[0].nodes.some(node => node.id === 'player_inventory')).toBe(true);
  });

  it('cleans references when a Page or the region is deleted', () => {
    const pageDeleted = planDeletion(pageProject('0.48.0', { attachTo: 'structures' }), { kind: 'node', screenId: 'screen_main', nodeId: 'page_structures' });
    expect(pageDeleted.document.screens[0].nodes.some(node => node.id === 'player_inventory')).toBe(true);
    const regionDeleted = planDeletion(pageProject('0.48.0', { attachTo: 'both' }), { kind: 'node', screenId: 'screen_main', nodeId: 'player_inventory' });
    const remaining = regionDeleted.document.screens[0].nodes.filter(node => node.type === 'minecraft:creative-tab');
    for (const node of remaining) if (node.type === 'minecraft:creative-tab') expect(node.props.contentIds ?? []).not.toContain('player_inventory');
    expect(() => parseProject(JSON.stringify(regionDeleted.document))).not.toThrow();
  });

  it('exports derived ownership, gating text and the updated contract', async () => {
    const doc = pageProject('0.48.0', { attachTo: 'structures' });
    const snapshot = beginExport(doc), reference = await referenceFor(snapshot);
    const spec = buildSpecification(snapshot, reference, 'project.json');
    expect(spec.designIntent.screens[0].nativeRegions[0]).toMatchObject({ nodeId: 'player_inventory', persistent: false, pageIds: ['page_structures'] });
    expect(spec.designIntent.nativeRegionContract.version).toBe('1.1.0');
    expect(spec.designIntent.nativeRegionContract.pagePolicy).toContain('same Screen/Menu instance');
    expect(spec.implementationRequirements.join(' ')).toContain('Slot.isActive()');
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([137, 80, 78, 71]), async () => new Uint8Array([137, 80, 78, 71]));
    expect(bundle.manifest.nativeRegionContract).toEqual(NATIVE_REGION_CONTRACT);
    expect(bundle.manifest.screens[0].nativeRegions[0].persistent).toBe(false);
    expect(bundle.manifest.screens[0].persistentWidgetIds).not.toContain('player_inventory');
  });
});