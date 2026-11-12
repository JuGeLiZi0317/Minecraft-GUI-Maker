import { describe, expect, it } from 'vitest';
import { createNode, emptyProject, literal } from '../../../src/domain/model';
import { parseProject, type Behavior, type GuiProject, type TextSpec } from '../../../src/domain/schema';
import { buildLanguageFiles, buildLanguageJson, buildLanguageObject, collectLocalizationReport, sourceCandidateRows, suggestedModId, withSourceFallbacks } from '../../../src/domain/localizationResources';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';

const tr = (key: string, fallback: string): TextSpec => ({ kind: 'translate', key, fallback });

function fixture(): GuiProject {
  const doc = emptyProject(); doc.schemaVersion = '0.50.0'; doc.entryScreenId = 'screen_main'; doc.screenTabGroups = [];
  doc.project.name = 'CustomDim'; doc.project.localizationNamespace = 'customdim'; doc.project.modId = 'mymod';
  const screen = doc.screens[0]; screen.designSize = { width: 480, height: 270, unit: 'gui-px' }; screen.title = tr('gui.customdim.title', '自定义维度');
  const button = createNode('minecraft:button', 'button_a', { x: 8, y: 8 });
  if (button.type === 'minecraft:button') { button.props.message = tr('gui.customdim.button', '按钮'); button.props.tooltip = tr('gui.customdim.tooltip', '提示'); }
  const cycle = createNode('minecraft:cycle-button', 'time_mode', { x: 8, y: 36 });
  if (cycle.type === 'minecraft:cycle-button') { cycle.props.options = [
    { id: 'always_day', text: tr('gui.customdim.time.always_day', '永昼') },
    { id: 'always_night', text: tr('gui.customdim.time.always_night', '永夜') },
    { id: 'normal', text: tr('gui.customdim.time.normal', '昼夜循环') },
  ]; cycle.props.initialOptionId = 'always_day'; }
  const status = createNode('minecraft:status-indicator', 'status', { x: 8, y: 68 });
  if (status.type === 'minecraft:status-indicator') status.props.statuses = [
    { statusId: 'running', label: tr('gui.customdim.status.running', '运行'), color: '#FF54B56A' },
    { statusId: 'stopped', label: tr('gui.customdim.status.stopped', '停止'), color: '#FF808080' },
    { statusId: 'warning', label: tr('gui.customdim.status.warning', '警告'), color: '#FFFFB347' },
  ], status.props.initialStatusId = 'running';
  const tree = createNode('minecraft:tree-view', 'tree', { x: 8, y: 100 }); tree.bounds = { x: 8, y: 100, w: 200, h: 100 };
  if (tree.type === 'minecraft:tree-view') tree.props.items[0].label = tr('gui.customdim.tree.world', '世界');
  const panel = createNode('minecraft:collapsible-panel', 'panel', { x: 230, y: 8 }); panel.bounds = { x: 230, y: 8, w: 180, h: 96 };
  if (panel.type === 'minecraft:collapsible-panel') panel.props.title = tr('gui.customdim.panel.title', '结构检查器');
  const summary = createNode('minecraft:string-widget', 'summary', { x: 230, y: 120 });
  if (summary.type === 'minecraft:string-widget') summary.props.text = literal('Selected');
  const pageText = createNode('minecraft:string-widget', 'page_b_text', { x: 230, y: 150 });
  if (pageText.type === 'minecraft:string-widget') pageText.props.text = tr('gui.customdim.page_b', '第二页');
  const duplicateA = createNode('minecraft:button', 'duplicate_a', { x: 8, y: 210 }); duplicateA.bounds = { x: 8, y: 210, w: 100, h: 20 };
  if (duplicateA.type === 'minecraft:button') duplicateA.props.tooltip = tr('gui.customdim.shared', '第一处');
  const duplicateB = createNode('minecraft:button', 'duplicate_b', { x: 120, y: 210 }); duplicateB.bounds = { x: 120, y: 210, w: 100, h: 20 };
  if (duplicateB.type === 'minecraft:button') duplicateB.props.tooltip = tr('gui.customdim.shared', '第二处');
  const tabA = createNode('minecraft:creative-tab', 'page_a', { x: 8, y: 236 }); tabA.bounds = { x: 8, y: 236, w: 26, h: 32 };
  const tabB = createNode('minecraft:creative-tab', 'page_b', { x: 40, y: 236 }); tabB.bounds = { x: 40, y: 236, w: 26, h: 32 };
  if (tabA.type === 'minecraft:creative-tab') Object.assign(tabA.props, { name: 'A', groupId: 'pages', selected: true, contentIds: ['button_a', 'time_mode', 'status', 'tree', 'panel', 'summary', 'duplicate_a', 'duplicate_b'] });
  if (tabB.type === 'minecraft:creative-tab') Object.assign(tabB.props, { name: 'B', groupId: 'pages', selected: false, contentIds: ['page_b_text'] });
  screen.nodes = [button, cycle, status, tree, panel, summary, pageText, duplicateA, duplicateB, tabA, tabB];
  screen.textMappings = [{ id: 'mapping', name: 'Map', inputType: 'OptionId', outputType: 'Text', entries: [{ key: 'day', value: tr('gui.customdim.mapping.day', '白天') }], fallback: tr('gui.customdim.mapping.fallback', '—') }];
  screen.behaviors = [{ id: 'result_text', event: { type: 'button-click', sourceId: 'button_a' }, action: { type: 'set-text', targetId: 'summary', value: tr('gui.customdim.behavior.result', '完成') } }] as Behavior[];
  doc.localization = {
    sourceLocale: 'zh_cn', includeInZip: true,
    locales: [
      { locale: 'zh_cn', entries: [
        { key: 'gui.customdim.title', text: '自定义维度' }, { key: 'gui.customdim.button', text: '按钮' },
        { key: 'gui.customdim.time.always_day', text: '永昼' }, { key: 'gui.customdim.time.always_night', text: '永夜' },
        { key: 'gui.customdim.time.normal', text: '昼夜循环' }, { key: 'gui.customdim.status.running', text: '运行' },
        { key: 'gui.customdim.status.stopped', text: '停止' }, { key: 'gui.customdim.status.warning', text: '警告' },
        { key: 'gui.customdim.tree.world', text: '世界' }, { key: 'gui.customdim.panel.title', text: '结构检查器' },
        { key: 'gui.customdim.page_b', text: '第二页' }, { key: 'gui.customdim.mapping.day', text: '白天' },
        { key: 'gui.customdim.mapping.fallback', text: '—' }, { key: 'gui.customdim.behavior.result', text: '完成' },
        { key: 'java.only.key', text: 'Java 保留' }, { key: 'gui.customdim.shared', text: '共享' },
      ] },
      { locale: 'en_us', entries: [
        { key: 'gui.customdim.title', text: 'Custom Dimension' }, { key: 'gui.customdim.time.always_day', text: 'Always Day' },
        { key: 'gui.customdim.shared', text: 'Shared' }, { key: 'java.only.key', text: 'Java only' }, { key: 'empty.key', text: '' },
      ] },
    ],
  };
  return doc;
}

describe('Q4-E localization resources', () => {
  it('collects every declared TextSpec, including inactive Pages, mappings, behavior values and tooltips', () => {
    const doc = fixture(); expect(parseProject(JSON.stringify(doc))).toEqual(doc);
    const report = collectLocalizationReport(doc), keys = report.rows.map(row => row.key);
    for (const key of ['gui.customdim.title', 'gui.customdim.button', 'gui.customdim.tooltip', 'gui.customdim.time.always_day', 'gui.customdim.time.always_night', 'gui.customdim.time.normal', 'gui.customdim.status.running', 'gui.customdim.status.stopped', 'gui.customdim.status.warning', 'gui.customdim.tree.world', 'gui.customdim.panel.title', 'gui.customdim.page_b', 'gui.customdim.mapping.day', 'gui.customdim.mapping.fallback', 'gui.customdim.behavior.result', 'gui.customdim.shared']) expect(keys).toContain(key);
    expect(report.rows.find(row => row.key === 'gui.customdim.page_b')?.uses[0]).toMatchObject({ screenId: 'screen_main', nodeId: 'page_b_text', usage: 'node' });
    expect(report.rows.find(row => row.key === 'gui.customdim.mapping.day')?.uses[0].usage).toBe('text-mapping');
    expect(report.rows.find(row => row.key === 'gui.customdim.behavior.result')?.uses[0].usage).toBe('behavior');
    expect(report.rows.find(row => row.key === 'gui.customdim.tooltip')?.uses.map(use => use.propertyPath)).toContain('props.tooltip');
    expect(report.fallbackConflicts).toEqual([{ key: 'gui.customdim.shared', values: ['第一处', '第二处'] }]);
    expect(report.unusedEntries.zh_cn).toContain('java.only.key');
    expect(report.missing.en_us).toEqual(expect.arrayContaining(['gui.customdim.button', 'gui.customdim.status.running', 'gui.customdim.page_b']));
    expect(sourceCandidateRows(report).some(candidate => candidate.key === 'gui.customdim.tooltip' && candidate.text === '提示')).toBe(true);
    const seeded = withSourceFallbacks(report, { 'gui.customdim.button': '手写译文' });
    expect(seeded['gui.customdim.button']).toBe('手写译文');
    expect(seeded['gui.customdim.tooltip']).toBe('提示');  });

  it('uses the explicit Mod ID for paths and emits sorted standard JSON without empty keys', () => {
    const doc = fixture(), report = collectLocalizationReport(doc), files = buildLanguageFiles(doc, report);
    expect(files.map(file => file.path)).toEqual(['assets/mymod/lang/zh_cn.json', 'assets/mymod/lang/en_us.json']);
    const zh = JSON.parse(files[0].text), en = JSON.parse(files[1].text);
    expect(Object.keys(zh)).toEqual([...Object.keys(zh)].sort());
    expect(zh['gui.customdim.time.always_day']).toBe('永昼');
    expect(en).not.toHaveProperty('empty.key');
    expect(en['gui.customdim.title']).toBe('Custom Dimension');
    expect(files[0].text).not.toContain('//');
    expect(buildLanguageObject(doc.localization!, 'zh_cn')['java.only.key']).toBe('Java 保留');
    expect(buildLanguageJson(doc.localization!, 'en_us')).toBe(files[1].text);
    expect(suggestedModId(doc)).toMatchObject({ value: 'mymod', source: 'explicit' });
  });

  it('requires Schema 0.50.0 for localization/modId and supports transactional undo', () => {
    const doc = fixture(); const old = structuredClone(doc); old.schemaVersion = '0.49.0';
    expect(() => parseProject(JSON.stringify(old))).toThrow('0.50.0');
    const missing = structuredClone(doc); delete (missing.project as { modId?: string }).modId;
    expect(() => parseProject(JSON.stringify(missing))).toThrow('Mod ID');
    const custom = structuredClone(doc); custom.localization!.locales.push({ locale: 'fr_fr', entries: [] });
    expect(parseProject(JSON.stringify(custom)).localization?.locales.map(locale => locale.locale)).toContain('fr_fr');
    const badLocale = structuredClone(doc); badLocale.localization!.locales[0].locale = 'zh-CN';
    expect(() => parseProject(JSON.stringify(badLocale))).toThrow();
    const store = createEditorStore(); const before = store.getState().doc;
    store.getState().saveLocalization(doc.localization, 'mymod');
    expect(store.getState().doc.schemaVersion).toBe('0.50.0');
    expect(store.getState().doc.localization?.sourceLocale).toBe('zh_cn');
    store.getState().undo();
    expect(store.getState().doc).toEqual(before);
    store.getState().redo();
    expect(store.getState().doc.localization?.locales).toHaveLength(2);
  });

  it('exports language files into the ZIP and manifest only when requested', async () => {
    const doc = fixture(), renderer = async (_snapshot: unknown, _reference: unknown, scale: number) => new Uint8Array([scale]);
    const bundle = await buildBundle(beginExport(doc), renderer as never);
    const zh = bundle.files.find(file => file.name === 'assets/mymod/lang/zh_cn.json')!;
    expect(zh).toBeTruthy();
    expect(JSON.parse(new TextDecoder().decode(zh.bytes))['gui.customdim.button']).toBe('按钮');
    expect(bundle.manifest.localization!).toMatchObject({ modId: 'mymod', sourceLocale: 'zh_cn', includeInZip: true });
    const entry = bundle.manifest.localization!.languageFiles.find((file: { locale: string }) => file.locale === 'zh_cn')!;
    expect(entry).toMatchObject({ path: 'assets/mymod/lang/zh_cn.json', packaged: true, keyCount: 16, missingCount: 1 });
    expect(entry.bytes).toBe(zh.bytes.byteLength); expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    const spec = JSON.parse(new TextDecoder().decode(bundle.files.find(file => file.name.endsWith('.implementation.json'))!.bytes));
    expect(spec.localizationResourceContract).toMatchObject({ modId: 'mymod', sourceLocale: 'zh_cn' });
    expect(spec.designIntent.localization.languageFiles.map((file: { locale: string }) => file.locale)).toEqual(['zh_cn', 'en_us']);

    const noZip = structuredClone(doc); noZip.localization!.includeInZip = false;
    const plain = await buildBundle(beginExport(noZip), renderer as never);
    expect(plain.files.some(file => file.name.endsWith('/lang/zh_cn.json'))).toBe(false);
    expect(plain.manifest.localization!.languageFiles.every((file: { packaged: boolean }) => !file.packaged)).toBe(true);
    expect(plain.manifest.localization!.languageFiles[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
