import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { actionsOf, parseProject, type Behavior, type NamedTextMappingSpec } from '../../../src/domain/schema';
import { initialControlState, reduceTypedBehaviorEvent } from '../../../src/domain/genericBehavior';
import { resolveTextMapping, previewText, TEXT_MAPPING_CONTRACT } from '../../../src/domain/textMapping';
import { behaviorToWorkspace, workspaceToBehavior } from '../../../src/behavior/blocklyModel';
import { registerBehaviorBlocks, setBlockContext } from '../../../src/behavior/blocks';
import { buildBehaviorIndex, buildBehaviorDiagnostics } from '../../../src/domain/behaviorDiagnostics';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification } from '../../../src/exports/specification';
import { buildBundle } from '../../../src/exports/bundle';
import { structuresInspectorProject } from '../../fixtures/structuresInspectorProject';
import { STRUCTURE_CHOICES, STRUCTURE_TITLE_KEYS, namedMappingProject, structureTitleMapping } from '../../fixtures/namedMappingProject';

registerBehaviorBlocks();

const event = (optionId: string) => ({ type: 'selection-change' as const, screenId: 'screen_main', nodeId: 'structure_selector', optionId, phase: 'confirm' as const, source: 'pointer' as const });
const ruleOf = (doc: ReturnType<typeof namedMappingProject>) => doc.screens[0].behaviors[0] as Extract<Behavior, { actions: unknown[] }>;

describe('B1.13 typed named mappings', () => {
  it('round-trips definitions and rejects duplicate keys, bad versions and dangling lookups', () => {
    const doc = namedMappingProject();
    expect(parseProject(JSON.stringify(doc))).toEqual(doc);

    const duplicateKey = namedMappingProject();
    duplicateKey.screens[0].textMappings![0].entries.push({ key: 'village', value: { kind: 'literal', value: 'dup' } });
    expect(() => parseProject(JSON.stringify(duplicateKey))).toThrow('键不能重复');

    const oldSchema = namedMappingProject();
    oldSchema.schemaVersion = '0.46.0';
    expect(() => parseProject(JSON.stringify(oldSchema))).toThrow('0.47.0');

    const danglingLookup = namedMappingProject();
    actionsOf(ruleOf(danglingLookup))[1] = { type: 'set-text', targetId: 'selection_summary', value: { type: 'lookup', mappingId: 'mapping_missing', input: { type: 'event-value', field: 'optionId' } } };
    expect(() => parseProject(JSON.stringify(danglingLookup))).toThrow('不存在于当前 Screen');

    const badTarget = namedMappingProject();
    actionsOf(ruleOf(badTarget))[1] = { type: 'set-text', targetId: 'inspector_temple', value: { type: 'lookup', mappingId: 'mapping_structure_title', input: { type: 'event-value', field: 'optionId' } } };
    expect(() => parseProject(JSON.stringify(badTarget))).toThrow('StringWidget');

    const badReader = namedMappingProject();
    actionsOf(ruleOf(badReader))[1] = { type: 'set-text', targetId: 'selection_summary', value: { type: 'lookup', mappingId: 'mapping_structure_title', input: { type: 'read-control-value', nodeId: 'selection_summary' } } };
    expect(() => parseProject(JSON.stringify(badReader))).toThrow('Radio Group');
  });

  it('accepts a mapping no definition can resolve only through explicit fallback', () => {
    const unresolved = namedMappingProject();
    unresolved.screens[0].textMappings![0].entries = unresolved.screens[0].textMappings![0].entries.filter(entry => entry.key !== 'temple');
    expect(parseProject(JSON.stringify(unresolved))).toEqual(unresolved);
    const result = reduceTypedBehaviorEvent(unresolved.screens[0], initialControlState(unresolved.screens[0]), event('temple'));
    expect(result.next.selection_summary.text).toContain('Unknown Structure');
    expect(result.outcomes.join(' ')).toContain('fallback');
  });

  it('keeps literal and translatable outputs distinct and never renders a raw key', () => {
    const doc = namedMappingProject(), screen = doc.screens[0];
    let state = initialControlState(screen);
    for (const choice of STRUCTURE_CHOICES) {
      const result = reduceTypedBehaviorEvent(screen, state, event(choice));
      state = result.next;
      const key = STRUCTURE_TITLE_KEYS[choice];
      expect(state.selection_summary.text).toContain(`⟦${key}⟧`);
      expect(state.selection_summary.text).not.toBe(key);
      expect(result.outcomes.join(' ')).toContain(key);
    }
    const literalMapping = { ...structureTitleMapping(), entries: [{ key: 'village', value: { kind: 'literal' as const, value: 'Plain Village' } }] };
    expect(previewText(literalMapping.entries[0].value)).toBe('Plain Village');
    expect(previewText({ kind: 'translate', key: 'k', fallback: 'F' })).toBe('F ⟦k⟧');
  });

  it('evaluates the lookup once per event without emitting a second event', () => {
    const doc = namedMappingProject(), screen = doc.screens[0];
    const initial = initialControlState(screen);
    const result = reduceTypedBehaviorEvent(screen, initial, event('temple'));
    expect(result.matchedRuleIds).toEqual(['inspect_structure']);
    expect(result.outcomes.filter(line => line.includes('set-text')).length).toBeLessThanOrEqual(2);
    expect(result.next.selection_summary.text).toContain('temple');
    expect(result.next.inspector_temple.visible).toBe(true);
    // No cascaded event: a second reduce with the same result is independent.
    const again = reduceTypedBehaviorEvent(screen, result.next, event('temple'));
    expect(again.next.selection_summary.text).toBe(result.next.selection_summary.text);
  });

  it('keeps unrelated controls and hidden input state untouched', () => {
    const doc = namedMappingProject(), screen = doc.screens[0];
    const before = initialControlState(screen);
    before.input_village = { text: '42' };
    const result = reduceTypedBehaviorEvent(screen, before, event('end_city'));
    expect(result.next.input_village?.text).toBe('42');
    expect(result.next.selection_summary.text).toContain('end_city');
    expect(result.next.inspector_village.visible).toBe(false);
  });

  it('applies mapping edits on the next explicit trigger and reports deleted references', () => {
    const store = createEditorStore(namedMappingProject());
    const edited: NamedTextMappingSpec = { ...structureTitleMapping(), entries: structureTitleMapping().entries.map(entry => entry.key === 'temple' ? { ...entry, value: { kind: 'literal' as const, value: 'Temple Revised' } } : entry) };
    store.getState().saveTextMapping(edited);
    expect(store.getState().doc.schemaVersion).toBe('0.47.0');
    const screen = store.getState().doc.screens[0];
    const result = reduceTypedBehaviorEvent(screen, initialControlState(screen), event('temple'));
    expect(result.next.selection_summary.text).toBe('Temple Revised');
    expect(() => store.getState().deleteTextMapping('mapping_structure_title')).toThrow('仍被 Lookup 引用');
    const index = buildBehaviorIndex(store.getState().doc)[0].rules[0];
    expect(index.textMappingRefs).toEqual([{ path: 'actions[1].value', mappingId: 'mapping_structure_title', targetId: 'selection_summary' }]);
    store.getState().deleteBehavior('inspect_structure');
    expect(() => store.getState().deleteTextMapping('mapping_structure_title')).not.toThrow();
    expect(store.getState().doc.screens[0].textMappings).toEqual([]);
  });

  it('supports Undo/Redo of mapping CRUD and never migrates legacy projects', () => {
    const legacy = structuresInspectorProject(), store = createEditorStore(legacy);
    expect(store.getState().doc.schemaVersion).toBe('0.44.0');
    store.getState().saveTextMapping(structureTitleMapping());
    expect(store.getState().doc.schemaVersion).toBe('0.47.0');
    expect(store.getState().doc.screens[0].textMappings).toHaveLength(1);
    store.getState().undo(); expect(store.getState().doc).toEqual(legacy);
    store.getState().redo(); expect(store.getState().doc.screens[0].textMappings).toHaveLength(1);
    const reused = structuredClone(store.getState().doc);
    reused.screens[0].behaviors = [{ id: 'rule_a', event: { type: 'selection-change', sourceId: 'structure_selector' }, eventBindings: [{ type: 'selection-change', sourceId: 'structure_selector', payloadType: 'OptionId' }], actions: [{ type: 'set-text', targetId: 'selection_summary', value: { type: 'lookup', mappingId: 'mapping_structure_title', input: { type: 'event-value', field: 'optionId' } } }] }, { id: 'rule_b', event: { type: 'selection-change', sourceId: 'structure_selector' }, eventBindings: [{ type: 'selection-change', sourceId: 'structure_selector', payloadType: 'OptionId' }], actions: [{ type: 'set-text', targetId: 'selection_summary', value: { type: 'lookup', mappingId: 'mapping_structure_title', input: { type: 'event-value', field: 'optionId' } } }] }];
    expect(parseProject(JSON.stringify(reused)).screens[0].behaviors).toHaveLength(2);
  });

  it('resolves lookups only within their own Screen', () => {
    const mapping = structureTitleMapping();
    expect(resolveTextMapping(mapping, 'temple', true).kind).toBe('matched');
    expect(resolveTextMapping(mapping, 'temple', false).kind).toBe('invalid');
    expect(resolveTextMapping(undefined, 'temple', true).kind).toBe('invalid');
    expect(resolveTextMapping(mapping, undefined, true).kind).toBe('invalid');
  });

  it('round-trips through real Blockly serialization', () => {
    const doc = namedMappingProject(), rule = doc.screens[0].behaviors[0];
    const workspace = new Blockly.Workspace(); setBlockContext(workspace, doc.screens[0]);
    try {
      Blockly.serialization.workspaces.load(behaviorToWorkspace(rule), workspace);
      const lookup = workspace.getAllBlocks(false).find(block => block.type === 'gui_lookup')!;
      expect(lookup.getFieldValue('MAPPING')).toBe('mapping_structure_title');
      const saved = Blockly.serialization.workspaces.save(workspace);
      expect(workspaceToBehavior(saved, rule.id, rule)).toEqual(rule);
      workspace.clear(); Blockly.serialization.workspaces.load(saved, workspace);
      expect(workspaceToBehavior(Blockly.serialization.workspaces.save(workspace), rule.id, rule)).toEqual(rule);
    } finally { workspace.dispose(); }
  });

  it('exports definitions, lookups and contract consistently', async () => {
    const doc = namedMappingProject();
    const snapshot = beginExport(doc), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json');
    const projected = spec.designIntent.textMappings!;
    expect(projected[0].definitions[0].id).toBe('mapping_structure_title');
    expect(projected[0].definitions[0].references).toHaveLength(1);
    expect(projected[0].lookups[0].mappingId).toBe('mapping_structure_title');
    expect(spec.designIntent.textMappingContract).toEqual(TEXT_MAPPING_CONTRACT);
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([137, 80, 78, 71]), async () => new Uint8Array([137, 80, 78, 71]));
    expect(bundle.manifest.screens[0].textMappings[0].definitions[0].entryDisplay[0].translationKey).toBe(STRUCTURE_TITLE_KEYS.village);
    expect(bundle.manifest.textMappingContract.version).toBe('1.0.0');
    const diagnostics = buildBehaviorDiagnostics(doc, await referenceFor(snapshot));
    expect(diagnostics.screens[0].rules[0].textMappingRefs).toHaveLength(1);
  });
});