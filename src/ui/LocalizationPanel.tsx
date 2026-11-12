import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { ProjectLocalization } from '../domain/schema';
import { buildLanguageJson, collectLocalizationReport, suggestedModId, validateModId, withSourceFallbacks, type LocalizationReport } from '../domain/localizationResources';
import { editorStore } from '../editor/store';

type DraftLocale = { locale: string; entries: Record<string, string> };
type Draft = { modId: string; sourceLocale: string; includeInZip: boolean; locales: DraftLocale[] };
const COMMON_LOCALES = ['zh_cn', 'en_us', 'zh_tw', 'ja_jp', 'de_de', 'fr_fr', 'es_es', 'pt_br', 'ru_ru', 'ko_kr'];
const LOCALE = /^[a-z]{2,3}(_[a-z]{2,4})?$/;

function draftFrom(doc: ReturnType<typeof editorStore.getState>['doc']): Draft {
  const suggestion = suggestedModId(doc);
  if (doc.localization) return {
    modId: doc.project.modId ?? suggestion.value ?? '',
    sourceLocale: doc.localization.sourceLocale,
    includeInZip: doc.localization.includeInZip,
    locales: doc.localization.locales.map(locale => ({ locale: locale.locale, entries: Object.fromEntries(locale.entries.map(entry => [entry.key, entry.text])) })),
  };
  return { modId: suggestion.value ?? '', sourceLocale: 'zh_cn', includeInZip: true, locales: [{ locale: 'zh_cn', entries: {} }, { locale: 'en_us', entries: {} }] };
}

function toLocalization(draft: Draft): ProjectLocalization {
  return {
    sourceLocale: draft.sourceLocale, includeInZip: draft.includeInZip,
    locales: draft.locales.map(locale => ({ locale: locale.locale, entries: Object.entries(locale.entries).filter(([, text]) => text.trim()).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, text]) => ({ key, text })) })),
  };
}

function download(json: string, filename: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  try { const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function useDraft(doc: ReturnType<typeof editorStore.getState>['doc']) {
  const key = JSON.stringify([doc.localization ?? null, doc.project.modId ?? null, doc.project.name, doc.project.localizationNamespace ?? null]);
  const initial = useMemo(() => draftFrom(doc), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<Draft>(initial);
  const applied = useRef(JSON.stringify(initial));
  useEffect(() => { setDraft(initial); applied.current = JSON.stringify(initial); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { draft, setDraft, dirty: JSON.stringify(draft) !== applied.current };
}

export function LocalizationPanel({ disabled, notify }: { disabled: boolean; notify: (message: string, error?: boolean) => void }) {
  const doc = useStore(editorStore, state => state.doc);
  const report = useMemo(() => collectLocalizationReport(doc), [doc]);
  const { draft, setDraft, dirty } = useDraft(doc);
  const [search, setSearch] = useState(''), [missingOnly, setMissingOnly] = useState(false), [customLocale, setCustomLocale] = useState(''), [error, setError] = useState('');
  const hasLocalization = !!doc.localization;
  const modError = validateModId(draft.modId);
  const pathPreview = modError ? null : `assets/${draft.modId}/lang/<locale>.json`;
  const patch = (locale: string, key: string, text: string) => setDraft(current => ({ ...current, locales: current.locales.map(item => item.locale === locale ? { ...item, entries: { ...item.entries, [key]: text } } : item) }));
  const addLocale = (locale: string) => {
    const value = locale.trim().toLowerCase();
    if (!LOCALE.test(value)) throw new Error('语言代码必须为小写 ll 或 ll_cc（例如 zh_cn、en_us）。');
    if (draft.locales.some(item => item.locale === value)) throw new Error('该语言已存在');
    setDraft(current => ({ ...current, locales: [...current.locales, { locale: value, entries: {} }] }));
  };
  const removeLocale = (locale: string) => {
    if (draft.locales.length <= 1) throw new Error('至少保留一种语言');
    if (draft.sourceLocale === locale) throw new Error('不能删除源语言；请先切换源语言');
    setDraft(current => ({ ...current, locales: current.locales.filter(item => item.locale !== locale) }));
  };
  const fillSource = () => {
    const source = draft.sourceLocale, current = draft.locales.find(item => item.locale === source);
    const entries = withSourceFallbacks(report, current?.entries ?? {});
    if (JSON.stringify(entries) === JSON.stringify(current?.entries ?? {})) { setError('没有可用的 fallback 候选（已有译文不会被覆盖）'); return; }
    setDraft(currentDraft => ({ ...currentDraft, locales: currentDraft.locales.map(item => item.locale === source ? { ...item, entries } : item) }));
    setError('');
  };
  const changeSource = (locale: string) => {
    setDraft(current => ({ ...current, sourceLocale: locale, locales: current.locales.map(item => item.locale === locale ? { ...item, entries: withSourceFallbacks(report, item.entries) } : item) }));
    setError('');
  };
  const apply = () => {
    if (disabled) return;
    if (!draft.modId.trim()) throw new Error('请显式填写 Mod ID');
    const reason = validateModId(draft.modId.trim()); if (reason) throw new Error(reason);
    if (!draft.locales.some(item => item.locale === draft.sourceLocale)) throw new Error('源语言必须是已声明的语言之一');
    if (draft.locales.length === 0) throw new Error('至少保留一种语言');
    const localization = toLocalization({ ...draft, modId: draft.modId.trim() });
    editorStore.getState().saveLocalization(localization, draft.modId.trim());
    notify('本地化资源已应用 · 可撤销');
  };
  const localized = (locale: string, key: string) => draft.locales.find(item => item.locale === locale)?.entries[key] ?? '';
  const rows = report.rows.filter(row => {
    if (missingOnly && !draft.locales.some(locale => !localized(locale.locale, row.key).trim())) return false;
    if (!search.trim()) return true;
    const haystack = [row.key, row.sourceText ?? '', ...row.uses.flatMap(use => [use.alias ?? '', use.nodeId, use.type, use.propertyPath])].join(' ').toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  const missing = Object.fromEntries(draft.locales.map(locale => [locale.locale, report.rows.filter(row => row.uses.length > 0 && !localized(locale.locale, row.key).trim()).length]));
  const locate = (use: LocalizationReport['uses'][number]) => {
    try {
      const state = editorStore.getState();
      if (use.screenId !== state.currentScreenId) state.switchScreen(use.screenId);
      if (use.usage === 'node') editorStore.getState().select(use.nodeId);
      notify(`已定位来源：${use.alias ?? use.nodeId} · ${use.propertyPath}`);
    } catch (cause) { notify((cause as Error).message, true); }
  };

  return <details className="localization-panel" role="region" aria-label="Localization Resources" open>
    <summary><span>Localization Resources</span><span>{report.rows.length} 键 · {draft.locales.length} 语言{report.fallbackConflicts.length ? ` · ${report.fallbackConflicts.length} 冲突` : ''}</span></summary>
    <div className="localization-body">
      <p className="field-note">从权威项目 JSON 收集 Translatable TextSpec，生成 Minecraft 标准语言 JSON。只写入设计资源，不修改控件 fallback / 翻译键。未显式创建时旧项目保持原样。</p>
      <div className="localization-settings-row">
        <label className="field"><span>Mod ID（资源命名空间）</span><input aria-label="本地化 Mod ID" value={draft.modId} maxLength={64} onChange={event => setDraft({ ...draft, modId: event.target.value })}/></label>
        <label className="field"><span>源语言</span><select aria-label="本地化源语言" value={draft.sourceLocale} onChange={event => changeSource(event.target.value)}>{draft.locales.map(locale => <option key={locale.locale} value={locale.locale}>{locale.locale}</option>)}</select></label>
        <label className="check"><input type="checkbox" aria-label="随 ZIP 打包语言文件" checked={draft.includeInZip} onChange={event => setDraft({ ...draft, includeInZip: event.target.checked })}/>随 ZIP 打包</label>
      </div>
      <p className="field-note">{pathPreview ?? '设置合法 Mod ID 后显示资源路径。'}{report.modIdSource && report.modIdSource !== 'explicit' ? ` · 建议来源：${report.modIdSource}` : ''}{report.modIdDiagnostic ? ` · ${report.modIdDiagnostic}` : ''}</p>
      <p className="field-note">切换源语言时会自动把 fallback 填入该语言的缺失项；已有译文不会被覆盖。也可用下方按钮重新填充。</p>
      <div className="localization-actions">
        <button type="button" disabled={disabled || !dirty} onClick={() => { try { apply(); setError(''); } catch (cause) { setError((cause as Error).message); } }}>应用本地化资源</button>
        <button type="button" disabled={disabled || !report.rows.length} onClick={fillSource}>用 fallback 填充源语言缺失项</button>
        <button type="button" disabled={disabled || draft.locales.length >= 32} onClick={() => { try { addLocale(COMMON_LOCALES.find(locale => !draft.locales.some(item => item.locale === locale)) ?? 'zh_cn'); } catch (cause) { setError((cause as Error).message); } }}>添加常用语言</button>
      </div>
      <div className="localization-settings-row">
        <label className="field"><span>自定义语言代码</span><input aria-label="自定义语言代码" value={customLocale} placeholder="例如 fr_fr" onChange={event => setCustomLocale(event.target.value)}/></label>
        <button type="button" disabled={disabled || !customLocale.trim()} onClick={() => { try { addLocale(customLocale); setCustomLocale(''); setError(''); } catch (cause) { setError((cause as Error).message); } }}>添加语言</button>
      </div>
      {!!draft.locales.length && <div className="localization-languages">{draft.locales.map(locale => <span key={locale.locale} className="localization-language"><b>{locale.locale}</b><button type="button" disabled={disabled || draft.locales.length <= 1 || locale.locale === draft.sourceLocale} title={locale.locale === draft.sourceLocale ? '源语言不可删除' : '删除语言'} onClick={() => { try { removeLocale(locale.locale); } catch (cause) { setError((cause as Error).message); } }}>移除</button><button type="button" onClick={() => download(buildLanguageJson(toLocalization({ ...draft, modId: draft.modId.trim() || 'modid' }), locale.locale), `${locale.locale}.json`)}>下载 JSON</button></span>)}</div>}
      <p className="field-note" data-testid="localization-summary">{report.rows.length} 个收集键 · {draft.locales.map(locale => `${locale.locale} 缺失 ${missing[locale.locale] ?? 0}`).join(' · ')}{report.fallbackConflicts.length ? ` · ${report.fallbackConflicts.length} 个 fallback 冲突` : ''}。导出只包含已填写译文；不会自动复制源语言或写键名。</p>
      {report.fallbackConflicts.map(conflict => <p key={conflict.key} role="alert" className="field-error">翻译键 {conflict.key} 的 fallback 不一致：{conflict.values.join(' / ')}</p>)}
      {!!report.invalidKeys.length && <p role="alert" className="field-error">含空白的翻译键：{report.invalidKeys.join('、')}（保留原键，不自动改写）</p>}
      <div className="localization-filters">
        <label className="field"><span>搜索键 / 来源</span><input aria-label="搜索翻译键" value={search} onChange={event => setSearch(event.target.value)}/></label>
        <label className="check"><input type="checkbox" aria-label="仅看缺失翻译" checked={missingOnly} onChange={event => setMissingOnly(event.target.checked)}/>仅看缺失</label>
      </div>
      <div className="localization-rows" aria-label="翻译键列表">
        {rows.map(row => <div className="localization-row" key={row.key} data-testid="localization-row" data-key={row.key}>
          <div className="localization-key"><code>{row.key}</code>{row.fallbackConflict && <span className="field-error">fallback 冲突</span>}{row.unused && <span className="field-note">项目未引用（可能由 Java 引用）</span>}</div>
          <div className="localization-source">
            {row.uses.length ? row.uses.map((use, index) => <button type="button" key={`${use.screenId}-${use.propertyPath}-${index}`} title={`${use.alias ?? use.nodeId} · ${use.type} · ${use.propertyPath}`} onClick={() => locate(use)}>{use.alias ?? use.nodeId} · {use.type} · {use.propertyPath}</button>) : <span className="field-note">无项目引用</span>}
            <span className="field-note">fallback：{row.sourceText ?? '—'}</span>
          </div>
          <div className="localization-translations">{draft.locales.map(locale => <label className="field" key={locale.locale}><span>{locale.locale}{!localized(locale.locale, row.key).trim() && <em className="field-error"> 缺失</em>}</span><input aria-label={`翻译 ${locale.locale} ${row.key}`} value={localized(locale.locale, row.key)} onChange={event => { patch(locale.locale, row.key, event.target.value); setError(''); }}/></label>)}</div>
        </div>)}
        {!rows.length && <p className="field-note">没有匹配的翻译键。{hasLocalization ? '' : '尚未创建本地化资源；编辑后点击“应用本地化资源”。'}</p>}
      </div>
      {error && <p role="alert" className="field-error">{error}</p>}
    </div>
  </details>;
}
