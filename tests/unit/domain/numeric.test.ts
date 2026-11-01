import { describe, expect, it } from 'vitest';
import { allowsDraft, commitNumeric, formatNumber, initialNumericState, numericError, numericFraction, parseNumericDraft, quantizeFraction, stepNumeric, units, validValue, type NumericConfig } from '../../../src/domain/numeric';
import { createEditorStore, currentScreen } from '../../../src/editor/store';
import { emptyProject } from '../../../src/domain/model';
import { exportProject, parseProject } from '../../../src/domain/schema';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';
import { buildPrompt } from '../../../src/exports/specification';
import { SLIDER_SPRITES, LayeredResources } from '../../../src/resources/layered';

const config = (): NumericConfig => ({ min: -.15, max: .3, step: .1, initialValue: .05, numericType: 'decimal', format: { decimals: 2, unit: 'm' } });
describe('W1-B fixed-point numeric contract', () => {
  it('uses min-anchored grid, explicit max, tie-up, and exact forward/backward increments', () => {
    const c = config(); expect(numericError(c)).toBeNull();
    const values = [-.15, -.05, .05, .15, .25, .3];
    for (let i = 0; i < values.length; i++) { expect(validValue(c, values[i])).toBe(true); expect(stepNumeric(c, values[i], 1)).toBe(values[Math.min(values.length - 1, i + 1)]); expect(stepNumeric(c, values[i], -1)).toBe(values[Math.max(0, i - 1)]); }
    expect(validValue(c, .1)).toBe(false);
    expect(quantizeFraction({ ...c, min: 0, max: 1, step: .2, initialValue: 0 }, .1)).toBe(.2);
    expect(quantizeFraction(c, 1)).toBe(.3); expect(quantizeFraction(c, -5)).toBe(-.15);
    let v = c.min; for (let i = 0; i < 10000; i++) v = stepNumeric(c, stepNumeric(c, v, 1), -1); expect(v).toBe(c.min);
  });
  it('handles constant ranges, tiny decimal steps, large scaled integers and oversized steps', () => {
    const c = { ...config(), min: .1, max: .1, initialValue: .1 };
    expect(numericError(c)).toBeNull(); expect(quantizeFraction(c, 1)).toBe(.1); expect(stepNumeric(c, .1, 1)).toBe(.1); expect(numericFraction(c, .1)).toBe(0);
    const micro = { ...config(), min: 0, max: .000003, step: .000001, initialValue: .000001, format: { decimals: 6, unit: '' } };
    expect(numericError(micro)).toBeNull(); expect(stepNumeric(micro, .000001, 1)).toBe(.000002);
    expect(units(1e9)).toBe(1e15); expect(units(.30000000000000004)).toBeNull();
    const bigStep = { ...config(), min: 0, max: 1, step: 10, initialValue: 0 }; expect(stepNumeric(bigStep, 0, 1)).toBe(1); expect(stepNumeric(bigStep, 1, -1)).toBe(0);
  });
  it.each(['', '-', '.', '-.', '1e2', 'NaN', 'Infinity', '+1', ' 0.05', '0,05', '0.0500001', '0.1', '999'])('rejects invalid submitted draft %j without losing last valid value', draft => {
    const c = config(), original = { ...initialNumericState(c), draft }, result = commitNumeric(c, original);
    expect(result.changed).toBe(false); expect(result.state.value).toBe(.05); expect(result.state.draft).toBe(draft); expect(result.state.error).toBeTruthy();
  });
  it('permits partial grammar, commits once, recovers errors, and canonicalizes without duplicate blur', () => {
    const c = config(); for (const draft of ['', '-', '.', '-.', '-0.']) expect(allowsDraft(c, draft)).toBe(true);
    expect(allowsDraft({ ...c, numericType: 'integer' }, '.')).toBe(false); expect(allowsDraft(c, '1e2')).toBe(false);
    const invalid = commitNumeric(c, { ...initialNumericState(c), draft: '-' }).state;
    const result = commitNumeric(c, { ...invalid, draft: '.15' }); expect(result.changed).toBe(true); expect(result.state.draft).toBe('0.15'); expect(result.state.error).toBeNull();
    expect(commitNumeric(c, result.state).changed).toBe(false); expect(formatNumber(c, -.05)).toBe('-0.05'); expect(parseNumericDraft(c, '.3').value).toBe(.3);
  });
  it.each([
    { min: Infinity }, { max: NaN }, { step: 0 }, { step: -1 }, { min: .4 }, { initialValue: .1 }, { initialValue: 2 },
    { step: .0000001 }, { max: 1e10 }, { numericType: 'integer' }, { format: { decimals: 1, unit: '' } },
  ])('rejects invalid configuration %j', patch => { expect(numericError({ ...config(), ...patch } as NumericConfig)).toBeTruthy(); });
});

describe('W1-B strict document and export integration', () => {
  it.each(['minecraft:numeric-input', 'minecraft:slider'] as const)('adds %s atomically, keeps ID/history and persists JSON', type => {
    const store = createEditorStore(), old = exportProject(store.getState().doc); store.getState().add(type);
    const id = store.getState().selected!, doc = store.getState().doc; expect(doc.schemaVersion).toBe('0.17.0'); expect(parseProject(exportProject(doc))).toEqual(doc);
    store.getState().beginGesture(id); store.getState().previewBounds({ x: 4, y: 5, w: 100, h: 24 }); expect(store.getState().doc).toBe(doc); store.getState().commitGesture();
    expect(currentScreen(store.getState()).nodes[0].id).toBe(id); store.getState().undo(); expect(store.getState().doc).toEqual(doc);
    store.getState().undo(); expect(exportProject(store.getState().doc)).toBe(old); store.getState().redo(); expect(store.getState().doc).toEqual(doc);
    store.getState().restoreLocal(parseProject(exportProject(doc))); expect(store.getState().doc).toEqual(doc);
  });
  it.each(['version', 'range', 'step', 'precision', 'grid', 'event', 'size', 'fraction', 'unknown'] as const)('atomically rejects malformed %s', reason => {
    const store = createEditorStore(); store.getState().add('minecraft:slider'); const before = store.getState().doc, bad = JSON.parse(exportProject(before)), n = bad.screens[0].nodes[0];
    if (reason === 'version') bad.schemaVersion = '0.15.0'; if (reason === 'range') n.props.min = 200; if (reason === 'step') n.props.step = 0;
    if (reason === 'precision') { n.props.numericType = 'decimal'; n.props.step = .0000001; } if (reason === 'grid') { n.props.step = 3; n.props.initialValue = 50; }
    if (reason === 'event') n.events.change = 'execute-java'; if (reason === 'size') n.bounds.w = 8; if (reason === 'fraction') n.bounds.x = .5; if (reason === 'unknown') n.props.script = 'x';
    expect(() => store.getState().importJson(JSON.stringify(bad))).toThrow(); expect(store.getState().doc).toBe(before);
  });
  it('keeps every previous schema unchanged on load and does not downgrade after adding older widgets/features', () => {
    expect(parseProject(exportProject(emptyProject()))).toEqual(emptyProject());
    const store = createEditorStore(); store.getState().add('minecraft:slider'); store.getState().add('minecraft:multi-line-text-widget'); store.getState().add('minecraft:checkbox'); store.getState().addScreen(); store.getState().setEntryScreen(store.getState().currentScreenId); store.getState().setPanel(true);
    store.getState().add('minecraft:creative-tab'); store.getState().createScreenTabGroup(store.getState().selected!);
    expect(store.getState().doc.schemaVersion).toBe('0.17.0'); expect(parseProject(exportProject(store.getState().doc))).toEqual(store.getState().doc);
  });
  it('exports typed unbound events, native responsibilities and all-screen snapshot atomically', async () => {
    const store = createEditorStore(); store.getState().add('minecraft:numeric-input'); store.getState().addScreen(); store.getState().add('minecraft:slider');
    const snapshot = beginExport(store.getState().doc), ref = await referenceFor(snapshot), render = async () => new Uint8Array([1]);
    const bundle = await buildBundle(snapshot, render, render); expect(bundle.manifest.versions.implementationSpecification).toBe('0.6.0');
    const specFile = bundle.files.find(f => f.name.endsWith('.implementation.json'))!, spec = JSON.parse(new TextDecoder().decode(specFile.bytes));
    expect(spec.designIntent.numericEvents.map((e: { type: string }) => e.type)).toEqual(['numeric-commit', 'slider-change']);
    expect(spec.designIntent.screens[1].nodes[0].sourcePath).toBe('/screens/1/nodes/0'); expect(spec.designIntent.widgetContracts.numeric.scale).toBe(1e6);
    const prompt = buildPrompt(spec); expect(prompt).toContain('unbound'); expect(prompt).toContain('AbstractSliderButton'); expect(prompt).toContain('setFilter');
    expect(ref.documentSha256).toBe(bundle.manifest.authority.sha256);
    await expect(buildBundle(snapshot, async (_s, _r, _p, id) => { if (id === snapshot.document.screens[1].id) throw new Error('numeric render failed'); return render(); }, render)).rejects.toThrow('numeric render failed');
  });
  it('limits new resource whitelist to the four audited Slider sprites', async () => {
    expect(SLIDER_SPRITES).toHaveLength(4); const resources = new LayeredResources();
    for (const id of SLIDER_SPRITES) expect((await resources.sprite(id)).status).toBe('missing');
    expect((await resources.sprite('minecraft:widget/arbitrary')).status).toBe('unsupported'); resources.close();
  });
});
