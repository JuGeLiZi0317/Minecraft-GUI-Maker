import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { parseProject, exportProject } from '../../../src/domain/schema';
import { renameStatusId, statusError } from '../../../src/domain/statusIndicator';
import type { StatusNode } from '../../../src/domain/statusIndicator';
import { circleRowSpans, statusIndicatorGeometry } from '../../../src/render/statusIndicator';
import { createEditorStore } from '../../../src/editor/store';

const make = (): StatusNode => createNode('minecraft:status-indicator', 'status_node') as StatusNode;

describe('Status Indicator', () => {
  it('adds as schema 0.21.0 with stable state IDs and valid initial status', () => {
    const store = createEditorStore(emptyProject()); store.getState().add('minecraft:status-indicator');
    const selected = store.getState().selected!;
    const node = store.getState().doc.screens[0].nodes.find(item => item.id === selected)!;
    expect(store.getState().doc.schemaVersion).toBe('0.21.0');
    expect(node).toMatchObject({ type: 'minecraft:status-indicator', id: 'node_1', props: { initialStatusId: 'status_stopped', shape: 'circle' } });
    expect(parseProject(exportProject(store.getState().doc))).toEqual(store.getState().doc);
  });

  it('keeps status edits transactional across undo and redo and uses bounded deterministic geometry', () => {
    const store = createEditorStore(emptyProject()); store.getState().add('minecraft:status-indicator');
    const id = store.getState().selected!, before = store.getState().doc.screens[0].nodes[0] as StatusNode;
    store.getState().updateNode(id, current => { if (current.type === 'minecraft:status-indicator') current.props.statuses[0].label = { kind: 'literal', value: '工作中' }; return current; });
    expect((store.getState().doc.screens[0].nodes[0] as StatusNode).props.statuses[0].statusId).toBe(before.props.statuses[0].statusId);
    store.getState().undo(); expect((store.getState().doc.screens[0].nodes[0] as StatusNode).props.statuses[0].label).toEqual(before.props.statuses[0].label);
    store.getState().redo(); expect((store.getState().doc.screens[0].nodes[0] as StatusNode).props.statuses[0].label).toEqual({ kind: 'literal', value: '工作中' });
    expect(statusIndicatorGeometry(1, 1)).toEqual({ size: 1, y: 0, textX: 1, textWidth: 0 });
    expect(statusIndicatorGeometry(100, 8).size).toBe(8);
    expect(circleRowSpans(10)).toHaveLength(10); expect(circleRowSpans(10).every(row => row.width > 0 && row.x >= 0)).toBe(true);
  });

  it('keeps historical IDs stable, accepts translated display text, and round-trips it independently from label', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.22.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
    const node = make(); node.props.statuses[0].statusId = 'status_e59c715e468647c4';
    node.props.statuses[0].text = { kind: 'translate', key: 'example.status.running', fallback: 'Running' };
    doc.screens[0].nodes.push(node);
    const parsed = parseProject(exportProject(doc));
    expect((parsed.screens[0].nodes[0] as StatusNode).props.statuses[0]).toMatchObject({ statusId: 'status_e59c715e468647c4', label: { kind: 'literal', value: '运行' }, text: { kind: 'translate', key: 'example.status.running', fallback: 'Running' } });
    (parsed.screens[0].nodes[0] as StatusNode).props.statuses[0].text = { kind: 'translate', key: 'example.status.running' };
    expect((parseProject(exportProject(parsed)).screens[0].nodes[0] as StatusNode).props.statuses[0].text).toEqual({ kind: 'translate', key: 'example.status.running' });
  });

  it('rejects translation text in Schema 0.21 without mutating the old document', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.21.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
    const node = make(); node.props.statuses[0].statusId = 'status_e59c715e468647c4'; doc.screens[0].nodes.push(node);
    const legacy = exportProject(doc); expect(parseProject(legacy)).toEqual(doc);
    node.props.statuses[0].text = { kind: 'translate', key: 'example.status.running' };
    expect(() => parseProject(exportProject(doc))).toThrow('Translation Key 需要 Schema 0.22.0');
  });

  it('updates initial references atomically when explicitly renaming a status ID', () => {
    const node = make(), previous = node.props.statuses[0].statusId;
    const renamed = renameStatusId(node.props, previous, 'active');
    expect(renamed.initialStatusId).toBe(node.props.initialStatusId === previous ? 'active' : node.props.initialStatusId);
    expect(renamed.statuses.find(status => status.statusId === 'active')?.label).toEqual(node.props.statuses[0].label);
    expect(node.props.statuses[0].statusId).toBe(previous);
  });

  it('upgrades to Schema 0.22 when a Translation Key is committed in Inspector state', () => {
    const store = createEditorStore(emptyProject()); store.getState().add('minecraft:status-indicator'); const id = store.getState().selected!;
    store.getState().updateNode(id, current => { if (current.type === 'minecraft:status-indicator') current.props.statuses[0].text = { kind: 'translate', key: 'example.status.running' }; return current; });
    expect(store.getState().doc.schemaVersion).toBe('0.22.0'); expect(parseProject(exportProject(store.getState().doc))).toEqual(store.getState().doc);
  });

  it('preserves the new Schema through legacy editor operations', () => {
    const store = createEditorStore(emptyProject()); store.getState().add('minecraft:status-indicator');
    store.getState().addScreen(); store.getState().setPanel(true); store.getState().setPanelBounds({ x: 0, y: 0, w: 320, h: 160 });
    expect(store.getState().doc.schemaVersion).toBe('0.21.0'); expect(parseProject(exportProject(store.getState().doc))).toEqual(store.getState().doc);
  });

  it.each([
    [{ statuses: [], initialStatusId: 'x' }, '状态数量'],
    [{ statuses: [{ statusId: 'bad id', color: '#FF000000' }], initialStatusId: 'bad id' }, 'statusId 格式'],
    [{ statuses: [{ statusId: 'a', color: 'red' }], initialStatusId: 'a' }, '颜色'],
    [{ statuses: [{ statusId: 'a', color: '#FF000000' }], initialStatusId: 'missing' }, '初始状态'],
  ])('rejects invalid status definitions %#', (input, message) => expect(statusError(input as never)).toContain(message));

  it('rejects repeated IDs, invalid colors, dangling initial references and legacy schema without repair', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.21.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = []; doc.screens[0].nodes.push(make());
    expect(parseProject(exportProject(doc))).toEqual(doc);
    for (const patch of [
      (node: ReturnType<typeof make>) => { node.props.statuses.push(structuredClone(node.props.statuses[0])); },
      (node: ReturnType<typeof make>) => { node.props.statuses[0].color = '#xyz'; },
      (node: ReturnType<typeof make>) => { node.props.initialStatusId = 'missing'; },
    ]) { const bad = structuredClone(doc); patch(bad.screens[0].nodes[0] as StatusNode); expect(() => parseProject(JSON.stringify(bad))).toThrow(); }
    const old = structuredClone(doc); old.schemaVersion = '0.20.0'; const json = JSON.stringify(old); expect(() => parseProject(json)).toThrow('0.21.0'); expect(JSON.stringify(old)).toBe(json);
  });

  it('records status definitions and unbound status-change intent in multi-Screen ZIP outputs', async () => {
    const doc = emptyProject(); doc.schemaVersion = '0.21.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = []; doc.screens[0].nodes.push(make());
    const second = structuredClone(doc.screens[0]); second.id = 'screen_other'; second.title = { kind: 'literal', value: 'Other' }; second.nodes = [createNode('minecraft:status-indicator', 'status_other')]; doc.screens.push(second);
    const renderer = (async (_snapshot: unknown, _ref: unknown, scale: number) => new Uint8Array([scale])) as never;
    const { buildBundle } = await import('../../../src/exports/bundle'); const bundle = await buildBundle((await import('../../../src/exports/snapshot')).beginExport(doc), renderer);
    expect(bundle.manifest.version).toBe('0.17.0'); expect(bundle.manifest.screens.map(screen => screen.statusIndicators[0].initialStatusId)).toEqual(['status_stopped', 'status_stopped']);
    const spec = JSON.parse(new TextDecoder().decode(bundle.files.find(file => file.name.endsWith('.implementation.json'))!.bytes));
    expect(spec.version).toBe('0.12.0'); expect(spec.designIntent.statusIndicators).toHaveLength(2);
    expect(spec.statusIndicatorContract.runtime).toMatchObject({ repaint: expect.any(String), businessSource: expect.stringContaining('no variables') });
    expect(bundle.manifest.files.every(file => !!file.sha256)).toBe(true);
  });
});

