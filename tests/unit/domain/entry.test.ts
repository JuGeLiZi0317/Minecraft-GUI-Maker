import { expect, it } from 'vitest';
import { createEditorStore } from '../../../src/editor/store';
import { parseProject } from '../../../src/domain/schema';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildSpecification, buildPrompt } from '../../../src/exports/specification';

it('explicit entry upgrade is atomic, protected, undoable and never inferred from editor selection', async () => {
  const store = createEditorStore(); store.getState().add('minecraft:button'); store.getState().addScreen();
  const legacy = structuredClone(store.getState().doc), first = legacy.screens[0].id, second = legacy.screens[1].id;
  expect(parseProject(JSON.stringify(legacy))).toEqual(legacy);
  expect(legacy.entryScreenId).toBeUndefined();
  store.getState().setEntryScreen(first); const saved = structuredClone(store.getState().doc);
  expect(saved.schemaVersion).toBe('0.13.0'); expect(store.getState().currentScreenId).toBe(second);
  store.getState().undo(); expect(store.getState().doc).toEqual(legacy); store.getState().redo(); expect(store.getState().doc).toEqual(saved);
  expect(() => store.getState().deleteScreen(first)).toThrow('替代入口');
  store.getState().renameScreen(first, 'Renamed'); expect(store.getState().doc.entryScreenId).toBe(first);
  store.getState().add('minecraft:checkbox'); expect(store.getState().doc.schemaVersion).toBe('0.13.0');
  const checkboxId = store.getState().doc.screens[1].nodes[0].id;
  store.getState().saveScreenTarget({ id: 'return_main', name: 'Return', boundScreenId: first });
  store.getState().saveBehavior({ id: 'return_rule', event: { type: 'checkbox-change', sourceId: checkboxId }, action: { type: 'open_screen', targetScreenId: 'return_main' } });
  const snapshot = beginExport(store.getState().doc, undefined, second), spec = buildSpecification(snapshot, await referenceFor(snapshot), 'project.json');
  expect(spec.designIntent.entryScreenId).toBe(first); expect(buildPrompt(spec)).toContain(`项目入口 Screen：${first}`);
  expect(spec.designIntent.navigationLifecycle.localState).toContain('every-open-including-self');
  for (const item of spec.designIntent.screens) for (const node of item.nodes) {
    const resolved = node.jsonPointer.split('/').slice(1).reduce((value: any, key) => value[key], snapshot.document);
    expect(resolved.id).toBe(node.nodeId); expect(node.stableLocator).toContain(item.screenId);
  }
  const ruleSource = spec.designIntent.screens[1].behaviorSources[0];
  expect(ruleSource.navigation[0]).toMatchObject({ boundScreenId: first, executableNavigation: true });
  expect(ruleSource.jsonPointer.split('/').slice(1).reduce((value: any, key) => value[key], snapshot.document).id).toBe(ruleSource.ruleId);
  const reordered = structuredClone(snapshot.document); reordered.screens.reverse();
  const nextSnapshot = beginExport(reordered), nextSpec = buildSpecification(nextSnapshot, await referenceFor(nextSnapshot), 'project.json');
  expect(nextSpec.designIntent.screens[0].behaviorSources[0].stableLocator).toBe(ruleSource.stableLocator);
  expect(nextSpec.designIntent.screens[0].behaviorSources[0].jsonPointer).toBe('/screens/0/behaviors/0');
  const invalid = structuredClone(saved); invalid.entryScreenId = 'missing'; expect(() => parseProject(JSON.stringify(invalid))).toThrow('entryScreenId');
  const smuggled = structuredClone(saved); smuggled.schemaVersion = '0.12.0'; expect(() => parseProject(JSON.stringify(smuggled))).toThrow('0.13.0');
  delete invalid.entryScreenId; expect(() => parseProject(JSON.stringify(invalid))).toThrow('entryScreenId');
});
