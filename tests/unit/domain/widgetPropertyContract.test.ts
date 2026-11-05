import { describe, expect, it } from 'vitest';
import { CATALOG, NODE_TYPES } from '../../../src/domain/catalog';
import { createNode, emptyProject } from '../../../src/domain/model';
import { WIDGET_PROPERTY_CONTRACT, propertyFlow, widgetPropertyPaths } from '../../../src/domain/widgetPropertyContract';
import { CURRENT_PROJECT_SCHEMA_VERSION, nodeSchema, parseProject, projectSchema, exportProject, behaviorSchema } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';
import { EXPORT_MANIFEST_VERSION, IMPLEMENTATION_SPEC_VERSION } from '../../../src/exports/versions';

type ZodShapeLike = { shape?: Record<string, unknown>; options?: ZodShapeLike[] };
const shapeOf = (value: unknown) => (value as ZodShapeLike).shape ?? {};
function objectVariants(value: unknown): ZodShapeLike[] {
  const schema = value as ZodShapeLike;
  return schema.shape ? [schema] : schema.options ?? [];
}
const roots = (paths: string[], prefix: string) => new Set(paths.filter(path => path.startsWith(prefix)).map(path => path.slice(prefix.length).split('.')[0]));

function currentProjectWithCatalogNodes() {
  const doc = emptyProject();
  doc.schemaVersion = CURRENT_PROJECT_SCHEMA_VERSION;
  doc.entryScreenId = doc.screens[0].id;
  doc.screenTabGroups = [];
  doc.screens[0].nodes = NODE_TYPES.map((type, index) => createNode(type, `contract_node_${index + 1}`));
  return doc;
}

describe('Q2-A widget property contract', () => {
  it('has one explicit contract and strict Schema node variant for every Catalog type', () => {
    const schemaTypes = nodeSchema.options.map(option => {
      const typeSchema = shapeOf(option).type as { _def?: { values?: string[] }; value?: string };
      return typeSchema.value ?? typeSchema._def?.values?.[0];
    });
    expect(new Set(schemaTypes)).toEqual(new Set(NODE_TYPES));
    expect(new Set(Object.keys(WIDGET_PROPERTY_CONTRACT))).toEqual(new Set(NODE_TYPES));
    for (const type of NODE_TYPES) {
      const contract = WIDGET_PROPERTY_CONTRACT[type];
      expect(CATALOG[type]).toBeDefined();
      expect(contract.inspectorHandler.trim()).not.toBe(''); // explicit manual route; no source-text coverage claim
      expect(contract.designRenderer.trim()).not.toBe('');
      const paths = widgetPropertyPaths(type);
      expect(new Set(paths).size).toBe(paths.length);
      const shape = shapeOf(nodeSchema.options.find(option => {
        const typeShape = shapeOf(option).type as { value?: string };
        return typeShape.value === type;
      }));
      const expectedRoots = new Set(['id', 'bounds', 'parentContainerId', 'state', 'props']);
      if (Object.keys(shapeOf(shape.events)).length) expectedRoots.add('events');
      expect(new Set(paths.map(path => path.split('.')[0]))).toEqual(expectedRoots);
      expect(roots(paths, 'bounds.')).toEqual(new Set(Object.keys(shapeOf(shape.bounds))));
      const actualProps = new Set(objectVariants(shape.props).flatMap(variant => Object.keys(variant.shape ?? {})));
      expect(roots(paths, 'props.')).toEqual(actualProps);
      expect(roots(paths, 'state.')).toEqual(new Set(Object.keys(shapeOf(shape.state))));
      expect(roots(paths, 'events.')).toEqual(new Set(Object.keys(shapeOf(shape.events))));
      for (const path of paths) {
        const flow = propertyFlow(type, path);
        for (const phase of ['json', 'schema', 'inspector', 'designCanvas', 'behaviorPreview', 'png', 'agentSpec', 'minecraft'] as const) {
          expect(['REQUIRED', 'APPLICABLE', 'NOT_APPLICABLE', 'EXTERNAL_IMPLEMENTATION']).toContain(flow[phase]);
        }
      }
    }
  });

  it('validates every Catalog default and exports each authoritative props object intact', async () => {
    const doc = currentProjectWithCatalogNodes();
    const parsed = parseProject(JSON.stringify(doc));
    expect(parsed.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    const snapshot = beginExport(parsed), reference = await referenceFor(snapshot);
    const spec = buildSpecification(snapshot, reference, 'contract-project.json');
    expect(spec.version).toBe(IMPLEMENTATION_SPEC_VERSION);
    expect(spec.designIntent.nodes).toHaveLength(NODE_TYPES.length);
    for (const node of parsed.screens[0].nodes) {
      expect(nodeSchema.safeParse(node).success, node.type).toBe(true);
      const exported = spec.designIntent.nodes.find(item => item.nodeId === node.id);
      expect(exported?.properties, node.type).toEqual(node.props);
      expect(exported?.initialState, node.type).toEqual(node.state);
    }
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([1]));
    expect(bundle.manifest.version).toBe(EXPORT_MANIFEST_VERSION);
    expect(bundle.manifest.versions).toMatchObject({ projectSchema: CURRENT_PROJECT_SCHEMA_VERSION, manifest: EXPORT_MANIFEST_VERSION, implementationSpecification: IMPLEMENTATION_SPEC_VERSION });
  });

  it('round-trips a representative older project without injecting current fields', () => {
    const old = emptyProject();
    old.schemaVersion = '0.14.0';
    old.entryScreenId = old.screens[0].id;
    old.screenTabGroups = [];
    const button = createNode('minecraft:button', 'legacy_button');
    if (button.type !== 'minecraft:button') throw new Error('unexpected Catalog type');
    delete button.props.color;
    old.screens[0].nodes = [button];
    const source = JSON.stringify(old);
    const parsed = parseProject(source);
    expect(JSON.parse(exportProject(parsed))).toEqual(JSON.parse(source));
    expect(parsed.screens[0].nodes[0].props).not.toHaveProperty('tooltip');
    expect(parsed.screens[0].nodes[0].props).not.toHaveProperty('textShadow');
    expect(parsed.schemaVersion).toBe('0.14.0');

    const store = createEditorStore(parsed);
    store.getState().updateNode('legacy_button', node => node.type === 'minecraft:button' ? { ...node, props: { ...node.props, message: { kind: 'literal', value: 'edited' } } } : node);
    expect(store.getState().doc.schemaVersion).toBe('0.14.0');
    store.getState().undo();
    expect(store.getState().doc.screens[0].nodes[0].props).toEqual(button.props);
    store.getState().redo();
    expect(store.getState().doc.screens[0].nodes[0].props).toMatchObject({ message: { kind: 'literal', value: 'edited' } });
    expect(parseProject(exportProject(store.getState().doc))).toEqual(store.getState().doc);
  });

  it('keeps newer projects at their version through older-node add/edit and history', () => {
    const doc = currentProjectWithCatalogNodes();
    const store = createEditorStore(doc);
    store.getState().add('minecraft:button');
    expect(store.getState().doc.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    const added = store.getState().doc.screens[0].nodes.at(-1)!;
    store.getState().updateNode(added.id, node => node.type === 'minecraft:button' ? { ...node, props: { ...node.props, message: { kind: 'literal', value: 'next' } } } : node);
    expect(store.getState().doc.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    store.getState().undo(); store.getState().redo();
    expect(store.getState().doc.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(parseProject(exportProject(store.getState().doc)).schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
  });

  it('keeps F2 source/action vocabulary separate from Widget event intents', () => {
    const f2Events = ['button-click', 'checkbox-change', 'rectangle-click'] as const;
    const f2Actions = ['set-text', 'set-visible', 'open_screen'] as const;
    for (const type of f2Events) expect(behaviorSchema.safeParse({ id: 'rule_1', event: { type, sourceId: 'node_1' }, action: { type: 'set-visible', targetId: 'node_2', visible: false } }).success).toBe(true);
    for (const type of f2Actions) {
      const action = type === 'set-text' ? { type, targetId: 'node_2', text: 'value' } : type === 'set-visible' ? { type, targetId: 'node_2', visible: true } : { type, targetScreenId: 'screen_2' };
      expect(behaviorSchema.safeParse({ id: 'rule_1', event: { type: 'button-click', sourceId: 'node_1' }, action }).success).toBe(true);
    }
    // behaviorSchema validates each event/action shape; Q2-C pairing and stable references are
    // project-level invariants, so validate the semantic rejection at projectSchema instead.
    expect(behaviorSchema.safeParse({ id: 'rule_1', event: { type: 'slider-change', sourceId: 'node_1' }, action: { type: 'set-visible', targetId: 'node_2', visible: true } }).success).toBe(true);
    const invalidPair = currentProjectWithCatalogNodes();
    const screen = invalidPair.screens[0], slider = screen.nodes.find(node => node.type === 'minecraft:slider')!, target = screen.nodes.find(node => node.type === 'minecraft:button')!;
    screen.behaviors.push({ id: 'rule_invalid_pair', event: { type: 'slider-change', sourceId: slider.id }, action: { type: 'set-visible', targetId: target.id, visible: true } });
    expect(projectSchema.safeParse(invalidPair).success).toBe(false);
    expect(projectSchema.safeParse(currentProjectWithCatalogNodes()).success).toBe(true);
    const intentTypes = NODE_TYPES.flatMap(type => WIDGET_PROPERTY_CONTRACT[type].events.map(path => ({ type, path })));
    expect(intentTypes.some(item => ['minecraft:numeric-input', 'minecraft:slider', 'minecraft:radio-group', 'minecraft:dropdown', 'minecraft:status-indicator', 'minecraft:tree-view'].includes(item.type) && item.path.startsWith('events.'))).toBe(true);
    expect(f2Events).toEqual(['button-click', 'checkbox-change', 'rectangle-click']);
    expect(f2Actions).toEqual(['set-text', 'set-visible', 'open_screen']);
  });

  it('marks special initial-only and external behaviors without requiring runtime state in PNG', () => {
    expect(propertyFlow('minecraft:dropdown', 'props.visibleRows').png).toBe('APPLICABLE');
    expect(propertyFlow('minecraft:dropdown', 'props.visibleRows').note).toContain('闭合');
    expect(propertyFlow('minecraft:dropdown', 'runtime.expanded').png).toBe('NOT_APPLICABLE');
    expect(propertyFlow('minecraft:progress-bar', 'props.initialValue').png).toBe('APPLICABLE');
    expect(WIDGET_PROPERTY_CONTRACT['minecraft:progress-bar'].events).toEqual([]);
    expect(propertyFlow('minecraft:radio-group', 'events.change').minecraft).toBe('EXTERNAL_IMPLEMENTATION');
    expect(propertyFlow('minecraft:tree-view', 'parentContainerId').inspector).toBe('NOT_APPLICABLE');
    expect(propertyFlow('minecraft:tree-view', 'parentContainerId').json).toBe('NOT_APPLICABLE');
  });
});
