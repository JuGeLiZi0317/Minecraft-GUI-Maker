import type { GuiNode, GuiProject } from './schema';

const NAMESPACE = /^[a-z0-9_.-]{1,64}$/;
const PATH_SEGMENT = /^[a-z0-9/._-]+$/;

export function normalizeNamespaceCandidate(projectName: string): { value: string | null; reason: string | null } {
  const trimmed = projectName.trim();
  if (!trimmed) return { value: null, reason: '项目名称为空，请设置本地化命名空间。' };
  const value = trimmed.toLowerCase().replace(/\s+/g, '_');
  if (!NAMESPACE.test(value)) return { value: null, reason: '项目名称包含不能安全转换的字符；请显式设置小写 namespace（a-z、0-9、_、.、-）。' };
  return { value, reason: null };
}

export function validateLocalizationNamespace(value: string): string | null {
  return NAMESPACE.test(value) ? null : 'Namespace 必须为 1–64 位小写 a-z、0-9、下划线、点或连字符。';
}

function widgetIdentifier(node: GuiNode): { value: string; warning: string | null } {
  if (!node.alias) return { value: node.id.toLowerCase(), warning: null };
  const alias = node.alias.trim().toLowerCase().replace(/\s+/g, '_');
  if (PATH_SEGMENT.test(alias)) return { value: alias, warning: null };
  return { value: node.id.toLowerCase(), warning: '控件别名含有翻译路径不支持的字符，建议值改用稳定 node ID；别名和 ID 均未修改。' };
}

export function suggestedTranslationKey(project: GuiProject, node: GuiNode, propertySuffix = ''): { value: string | null; reason: string | null } {
  const namespace = project.project.localizationNamespace
    ? { value: project.project.localizationNamespace, reason: null }
    : normalizeNamespaceCandidate(project.project.name);
  if (!namespace.value) return namespace;
  const identifier = widgetIdentifier(node);
  const suffix = propertySuffix ? `.${propertySuffix}` : '';
  return { value: `gui.${namespace.value}.${identifier.value}${suffix}`, reason: identifier.warning };
}

export type TranslationKeyUse = { key: string; fallback?: string; screenId: string; nodeId: string; alias?: string; type: string; propertyPath: string; usage?: 'node' | 'screen-title' | 'text-mapping' | 'behavior' };
export function translationKeyUses(project: GuiProject): TranslationKeyUse[] {
  const uses: TranslationKeyUse[] = [];
  const visit = (value: unknown, screenId: string, nodeId: string, type: string, alias: string | undefined, path: string, usage: TranslationKeyUse['usage']) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach((item, index) => visit(item, screenId, nodeId, type, alias, `${path}[${index}]`, usage)); return; }
    const object = value as Record<string, unknown>;
    if (object.kind === 'translate' && typeof object.key === 'string') uses.push({ key: object.key, ...(typeof object.fallback === 'string' ? { fallback: object.fallback } : {}), screenId, nodeId, ...(alias ? { alias } : {}), type, propertyPath: path, usage });
    for (const [key, child] of Object.entries(object)) visit(child, screenId, nodeId, type, alias, path ? `${path}.${key}` : key, usage);
  };
  for (const screen of project.screens) {
    visit(screen.title, screen.id, screen.id, 'screen', undefined, 'title', 'screen-title');
    for (const node of screen.nodes) visit(node, screen.id, node.id, node.type, node.alias, '', 'node');
    visit(screen.textMappings, screen.id, screen.id, 'text-mapping', undefined, 'textMappings', 'text-mapping');
    visit(screen.behaviors, screen.id, screen.id, 'behavior', undefined, 'behaviors', 'behavior');
  }
  return uses;
}

export function duplicateTranslationKeyUses(project: GuiProject, key: string): TranslationKeyUse[] {
  return translationKeyUses(project).filter(use => use.key === key);
}
