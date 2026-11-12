import { describe, expect, it } from 'vitest';
import { diagnoseBakeCandidates, diagnoseBakeGroup } from '../../../src/domain/bake';
import { createNode, emptyProject } from '../../../src/domain/model';
import { parseProject, PROJECT_SCHEMA_VERSIONS } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';

function fixture() {
  const project = emptyProject(); project.schemaVersion = '0.41.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  const screen = project.screens[0]; screen.designSize = { width: 320, height: 180, unit: 'gui-px' };
  const a = createNode('minecraft:fill', 'fill_a', { x: 10, y: 12 }), b = createNode('minecraft:fill', 'fill_b', { x: 20, y: 12 });
  a.bounds = { ...a.bounds, w: 20, h: 10 }; b.bounds = { ...b.bounds, w: 15, h: 8 };
  if (a.type === 'minecraft:fill' && b.type === 'minecraft:fill') { a.props.color = '#80ff0000'; b.props.color = '#4000ff00'; }
  screen.nodes = [a, b]; return project;
}

describe('Q3-C static Bake qualification and document contract', () => {
  it('keeps the Schema version registry unique when adding Bake support', () => {
    expect(new Set(PROJECT_SCHEMA_VERSIONS).size).toBe(PROJECT_SCHEMA_VERSIONS.length);
    expect(PROJECT_SCHEMA_VERSIONS.at(-1)).toBe('0.51.0');
  });

  it('accepts continuous root Fill nodes and computes a logical-pixel union', () => {
    const doc = fixture(), screen = doc.screens[0], group = { id: 'bakegroup_1', name: 'Cards', memberIds: ['fill_a', 'fill_b'], enabled: true };
    expect(diagnoseBakeCandidates(screen).filter(item => item.eligible).map(item => item.nodeId)).toEqual(['fill_a', 'fill_b']);
    expect(diagnoseBakeGroup(screen, group)).toMatchObject({ eligible: true, scope: { kind: 'persistent' }, bounds: { x: 10, y: 12, w: 25, h: 10 } });
    screen.bakeGroups = [group]; expect(parseProject(JSON.stringify(doc)).screens[0].bakeGroups).toEqual([group]);
  });

  it('rejects interleaved draw order and different Persistent/Page scopes', () => {
    const project = fixture(), screen = project.screens[0], divider = createNode('minecraft:button', 'button_mid', { x: 0, y: 0 });
    screen.nodes.splice(1, 0, divider);
    expect(diagnoseBakeGroup(screen, { id: 'bakegroup_1', name: 'Invalid', memberIds: ['fill_a', 'fill_b'], enabled: true }).reasons.join(' ')).toContain('绘制顺序不连续');
    const tab = createNode('minecraft:creative-tab', 'page_a', { x: 0, y: 0 });
    if (tab.type === 'minecraft:creative-tab') Object.assign(tab.props, { groupId: 'pages', contentIds: ['fill_b'], selected: true });
    screen.nodes.push(tab);
    expect(diagnoseBakeGroup(screen, { id: 'bakegroup_2', name: 'Invalid scope', memberIds: ['fill_a', 'fill_b'], enabled: true }).reasons.join(' ')).toContain('相同 Persistent 或单一 Page');
  });

  it('rejects F2 references, hidden members, containers, Images and Native Regions with explicit reasons', () => {
    const project = fixture(), screen = project.screens[0], [a, b] = screen.nodes;
    screen.behaviors.push({ id: 'rule_1', event: { type: 'rectangle-click', sourceId: 'fill_a' }, action: { type: 'set-visible', targetId: 'fill_b', visible: false } });
    if (b.type === 'minecraft:fill') b.state.visible = false;
    screen.nodes.push(createNode('minecraft:image', 'image_1', { x: 40, y: 12 }), createNode('native_region', 'inventory_1', { x: 100, y: 20 }));
    const results = diagnoseBakeCandidates(screen), aResult = results.find(item => item.nodeId === a.id)!, bResult = results.find(item => item.nodeId === b.id)!;
    expect(aResult.reasons.join(' ')).toContain('F2'); expect(bResult.reasons.join(' ')).toContain('隐藏'); expect(bResult.reasons.join(' ')).toContain('F2');
    expect(results.find(item => item.nodeId === 'image_1')?.reasons.join(' ')).toContain('Rectangle / Fill');
    expect(results.find(item => item.nodeId === 'inventory_1')?.reasons.join(' ')).toContain('Native Region');
  });

  it('creates enabled groups transactionally and includes group edits in undo/redo and removal', () => {
    const store = createEditorStore(fixture());
    store.getState().createBakeGroup(['fill_a', 'fill_b']);
    const grouped = store.getState().doc;
    expect(grouped.schemaVersion).toBe('0.41.0'); expect(grouped.screens[0].bakeGroups?.[0].memberIds).toEqual(['fill_a', 'fill_b']);
    store.getState().setBakeGroupEnabled('bakegroup_1', false); store.getState().undo(); expect(store.getState().doc).toEqual(grouped);
    store.getState().setBakeGroupEnabled('bakegroup_1', false); store.getState().undo(); store.getState().redo();
    expect(store.getState().doc.screens[0].bakeGroups?.[0].enabled).toBe(false);
    store.getState().deleteBakeGroup('bakegroup_1'); expect(store.getState().doc.screens[0].bakeGroups).toEqual([]);
  });

  it('preserves group references when a member is deleted and invalidates eligibility after a property edit', () => {
    const store = createEditorStore(fixture()); store.getState().createBakeGroup(['fill_a', 'fill_b']);
    store.getState().select('fill_a'); store.getState().deleteSelected();
    expect(store.getState().doc.screens[0].bakeGroups?.[0].memberIds).toEqual(['fill_b']);
    store.getState().undo(); expect(store.getState().doc.screens[0].bakeGroups?.[0].memberIds).toEqual(['fill_a', 'fill_b']);
    store.getState().updateNode('fill_a', node => node.type === 'minecraft:fill'
      ? { ...node, state: { visible: false } }
      : node);
    expect(diagnoseBakeGroup(store.getState().doc.screens[0], store.getState().doc.screens[0].bakeGroups![0]).eligible).toBe(false);
    store.getState().setBakeGroupEnabled('bakegroup_1', false);
    expect(() => store.getState().setBakeGroupEnabled('bakegroup_1', true)).toThrow('初始为隐藏状态');
  });

  it('rejects dangling, duplicate and multiply owned membership without migrating legacy projects', () => {
    const legacy = emptyProject(), untouched = createEditorStore(legacy); expect(untouched.getState().doc).toEqual(legacy);
    const invalid = fixture(); invalid.screens[0].bakeGroups = [{ id: 'bakegroup_1', name: 'bad', memberIds: ['missing'], enabled: true }];
    expect(() => parseProject(JSON.stringify(invalid))).toThrow('当前 Screen 节点');
    invalid.screens[0].bakeGroups = [
      { id: 'bakegroup_1', name: 'A', memberIds: ['fill_a'], enabled: true },
      { id: 'bakegroup_2', name: 'B', memberIds: ['fill_a'], enabled: true },
    ];
    expect(() => parseProject(JSON.stringify(invalid))).toThrow('不能属于多个');
  });
});
