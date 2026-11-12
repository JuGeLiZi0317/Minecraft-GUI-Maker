import type { GuiProject, ProjectLocalization } from './schema';
import { MOD_ID } from './schema';
import { normalizeNamespaceCandidate, translationKeyUses, type TranslationKeyUse } from './localization';

export type LocalizationRow = {
  key: string;
  uses: TranslationKeyUse[];
  sourceText: string | null;
  fallbackConflict: boolean;
  translations: Record<string, string>;
  missing: Record<string, boolean>;
  unused: boolean;
};

export type LocalizationReport = {
  uses: TranslationKeyUse[];
  locales: string[];
  sourceLocale: string | null;
  rows: LocalizationRow[];
  missing: Record<string, string[]>;
  unusedEntries: Record<string, string[]>;
  fallbackConflicts: { key: string; values: string[] }[];
  invalidKeys: string[];
  modId: string | null;
  modIdSource: 'explicit' | 'localizationNamespace' | 'projectName' | null;
  modIdDiagnostic: string | null;
};

export type ModIdSuggestion = { value: string | null; source: 'explicit' | 'localizationNamespace' | 'projectName' | null; reason: string | null };

export function suggestedModId(doc: GuiProject): ModIdSuggestion {
  if (doc.project.modId) return { value: doc.project.modId, source: 'explicit', reason: null };
  const namespace = doc.project.localizationNamespace;
  if (namespace && MOD_ID.test(namespace)) return { value: namespace, source: 'localizationNamespace', reason: null };
  const normalized = normalizeNamespaceCandidate(doc.project.name);
  if (normalized.value && MOD_ID.test(normalized.value)) return { value: normalized.value, source: 'projectName', reason: namespace ? '本地化命名空间含 Mod ID 不支持的字符（点/连字符）；建议使用项目名规范化结果并显式保存。' : null };
  return { value: null, source: null, reason: '无法从项目名或本地化命名空间推导合法 Mod ID；请显式设置小写 a-z、0-9、下划线，1–64 字符。' };
}

export function validateModId(value: string): string | null {
  return MOD_ID.test(value) ? null : 'Mod ID 必须为 1–64 位小写 a-z、0-9 或下划线，且以字母开头。';
}

export const LOCALIZATION_RESOURCE_CONTRACT = {
  version: '1.0.0',
  authority: 'project.localization stores locale translations only; TextSpec fallback, translation key and locale text remain three separate values and no control TextSpec is rewritten',
  path: 'assets/<project.modId>/lang/<locale>.json',
  modId: 'project.modId is explicit; the path is never inferred from the gui.* translation key text',
  format: 'UTF-8 standard Minecraft Java 1.21.1 language JSON object; no comments, BOM, editor metadata or .lang format',
  ordering: 'object keys sorted by Unicode code point for stable output',
  sourceLocale: 'project.localization.sourceLocale; fallback values are only candidates and require explicit user confirmation before becoming source translations',
  missing: 'keys without non-empty text are reported but omitted; source text is never copied into another locale and keys are never written as translations',
  unused: 'locale entries not referenced by the project are preserved because Java code may reference them',
  conflicts: 'the same key with different TextSpec fallbacks is diagnosed; existing non-empty translations are never silently replaced',
  zip: 'language files are packaged only when project.localization.includeInZip is true; individual downloads remain available',
} as const;

function entryMaps(localization: ProjectLocalization | undefined): Record<string, Map<string, string>> {
  const result: Record<string, Map<string, string>> = {};
  for (const locale of localization?.locales ?? []) result[locale.locale] = new Map(locale.entries.map(entry => [entry.key, entry.text]));
  return result;
}

export function collectLocalizationReport(doc: GuiProject): LocalizationReport {
  const uses = translationKeyUses(doc);
  const localization = doc.localization;
  const locales = (localization?.locales ?? []).map(locale => locale.locale);
  const maps = entryMaps(localization);
  const byKey = new Map<string, TranslationKeyUse[]>();
  for (const use of uses) byKey.set(use.key, [...(byKey.get(use.key) ?? []), use]);
  const keys = new Set([...byKey.keys(), ...[...Object.values(maps)].flatMap(map => [...map.keys()])]);
  const fallbackConflicts: LocalizationReport['fallbackConflicts'] = [];
  const missing: Record<string, string[]> = Object.fromEntries(locales.map(locale => [locale, []]));
  const unusedEntries: Record<string, string[]> = Object.fromEntries(locales.map(locale => [locale, []]));
  const rows = [...keys].sort().map(key => {
    const keyUses = byKey.get(key) ?? [];
    const values = [...new Set(keyUses.map(use => use.fallback ?? '').filter(value => value.trim()))];
    if (values.length > 1) fallbackConflicts.push({ key, values });
    const sourceText = values[0] ?? null;
    const translations = Object.fromEntries(locales.map(locale => [locale, maps[locale]?.get(key) ?? '']));
    const missingFor = Object.fromEntries(locales.map(locale => [locale, !translations[locale].trim()]));
    if (keyUses.length) for (const locale of locales) if (missingFor[locale]) missing[locale].push(key);
    if (!keyUses.length) for (const locale of locales) if (translations[locale].trim()) unusedEntries[locale].push(key);
    return { key, uses: keyUses, sourceText, fallbackConflict: values.length > 1, translations, missing: missingFor, unused: keyUses.length === 0 };
  });
  const suggestion = suggestedModId(doc);
  return {
    uses, locales, sourceLocale: localization?.sourceLocale ?? null, rows, missing, unusedEntries, fallbackConflicts,
    invalidKeys: [...keys].filter(key => !key.trim() || /\s/.test(key)),
    modId: suggestion.value, modIdSource: suggestion.source, modIdDiagnostic: suggestion.reason,
  };
}

export function sourceCandidateRows(report: LocalizationReport, sourceLocale: string | null = report.sourceLocale): { key: string; text: string }[] {
  if (!sourceLocale) return [];
  return report.rows.filter(row => row.uses.length > 0 && !row.translations[sourceLocale]?.trim() && row.sourceText)
    .map(row => ({ key: row.key, text: row.sourceText! }));
}

/** Fill only empty source entries from fallback; existing user translations are never overwritten. */
export function withSourceFallbacks(report: LocalizationReport, entries: Record<string, string>): Record<string, string> {
  const next = { ...entries };
  for (const row of report.rows) if (row.uses.length > 0 && row.sourceText && !next[row.key]?.trim()) next[row.key] = row.sourceText;
  return next;
}

export function buildLanguageObject(localization: ProjectLocalization, locale: string): Record<string, string> {
  const entries = localization.locales.find(item => item.locale === locale)?.entries ?? [];
  return Object.fromEntries(entries.filter(entry => entry.text.trim()).map(entry => [entry.key, entry.text]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function buildLanguageJson(localization: ProjectLocalization, locale: string): string {
  return JSON.stringify(buildLanguageObject(localization, locale), null, 2) + '\n';
}

export type LanguageFile = { locale: string; path: string; text: string; bytes: Uint8Array; keyCount: number; missingCount: number };

export function buildLanguageFiles(doc: GuiProject, report: LocalizationReport): LanguageFile[] {
  const localization = doc.localization;
  if (!localization || !report.modId || !MOD_ID.test(report.modId)) return [];
  return localization.locales.map(locale => {
    const text = buildLanguageJson(localization, locale.locale);
    return {
      locale: locale.locale,
      path: `assets/${report.modId}/lang/${locale.locale}.json`,
      text,
      bytes: new TextEncoder().encode(text),
      keyCount: Object.keys(buildLanguageObject(localization, locale.locale)).length,
      missingCount: report.missing[locale.locale]?.length ?? 0,
    };
  });
}

export function localizationSummary(report: LocalizationReport): string {
  const missing = report.locales.map(locale => `${locale} 缺失 ${report.missing[locale]?.length ?? 0}`).join(' · ');
  return `${report.rows.length} 键 · ${missing}${report.fallbackConflicts.length ? ` · ${report.fallbackConflicts.length} 个 fallback 冲突` : ''}`;
}
