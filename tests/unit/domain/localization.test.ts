import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { normalizeNamespaceCandidate, suggestedTranslationKey, translationKeyUses } from '../../../src/domain/localization';
import { createEditorStore } from '../../../src/editor/store';
import { parseProject } from '../../../src/domain/schema';

describe('project localization naming', () => {
  it('normalizes only case and whitespace; refuses lossy unsupported project names', () => {
    expect(normalizeNamespaceCandidate(' Custom Dim ')).toEqual({ value: 'custom_dim', reason: null });
    expect(normalizeNamespaceCandidate('自定义 UI')).toMatchObject({ value: null });
    expect(normalizeNamespaceCandidate('item:panel')).toMatchObject({ value: null });
  });

  it('uses normalized aliases or stable node IDs without changing node identity', () => {
    const doc = emptyProject(); doc.project.name = 'customdim';
    const button = createNode('minecraft:button', 'node_12'); if (button.type === 'minecraft:button') { button.alias = 'Submit Now'; button.props.tooltip = { kind: 'literal', value: 'Tip' }; }
    doc.screens[0].nodes = [button];
    expect(suggestedTranslationKey(doc, button)).toEqual({ value: 'gui.customdim.submit_now', reason: null });
    expect(suggestedTranslationKey(doc, button, 'tooltip').value).toBe('gui.customdim.submit_now.tooltip');
    button.alias = undefined;
    expect(suggestedTranslationKey(doc, button).value).toBe('gui.customdim.node_12');
    expect(button.id).toBe('node_12');
  });

  it('reports unsafe aliases and preserves duplicate translation key uses', () => {
    const doc = emptyProject(); doc.project.localizationNamespace = 'custom'; doc.schemaVersion = '0.43.0';
    const a = createNode('minecraft:button', 'button_a'), b = createNode('minecraft:button', 'button_b');
    for (const node of [a, b]) if (node.type === 'minecraft:button') { node.alias = 'Submit!'; node.props.message = { kind: 'translate', key: 'gui.custom.submit', fallback: 'Submit' }; }
    doc.screens[0].nodes = [a, b];
    expect(suggestedTranslationKey(doc, a)).toMatchObject({ value: 'gui.custom.button_a', reason: expect.stringContaining('不支持') });
    expect(translationKeyUses(doc).filter(use => use.key === 'gui.custom.submit')).toHaveLength(2);
  });

  it('detects a key collision between separate text attributes on one widget', () => {
    const doc = emptyProject(); const node = createNode('minecraft:button', 'submit_button');
    if (node.type === 'minecraft:button') {
      node.props.message = { kind: 'translate', key: 'gui.custom.submit', fallback: 'Submit' };
      node.props.tooltip = { kind: 'translate', key: 'gui.custom.submit', fallback: 'Opens the trade' };
    }
    doc.screens[0].nodes = [node];
    expect(translationKeyUses(doc).filter(use => use.key === 'gui.custom.submit').map(use => use.propertyPath)).toEqual(['props.message', 'props.tooltip']);
  });

  it('persists explicit namespace edits through Undo/Redo and does not migrate on project rename', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.42.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
    const store = createEditorStore(doc);
    store.getState().renameProject('customdim');
    expect(store.getState().doc.schemaVersion).toBe('0.42.0');
    store.getState().setLocalizationNamespace('custom');
    expect(store.getState().doc).toMatchObject({ schemaVersion: '0.43.0', project: { localizationNamespace: 'custom' } });
    store.getState().undo(); expect(store.getState().doc.project.localizationNamespace).toBeUndefined();
    store.getState().redo(); expect(store.getState().doc.project.localizationNamespace).toBe('custom');
  });

  it('validates the 0.43 namespace and reversible-key migration boundary', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.43.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
    doc.project.localizationNamespace = 'Custom';
    expect(() => parseProject(JSON.stringify(doc))).toThrow(/Namespace/);
    doc.project.localizationNamespace = 'custom';
    const button = createNode('minecraft:button', 'submit_button');
    if (button.type === 'minecraft:button') button.props.message = { kind: 'literal', value: 'Submit', disabledKey: 'gui.custom.submit' };
    doc.screens[0].nodes = [button];
    expect(() => parseProject(JSON.stringify(doc))).not.toThrow();
    doc.schemaVersion = '0.42.0';
    expect(() => parseProject(JSON.stringify(doc))).toThrow(/0.43.0/);
  });
});
