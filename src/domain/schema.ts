import { z } from 'zod';
import { CATALOG, CATALOG_VERSION, TARGET } from './catalog';
import { PANEL_MIN_SIZE, PANEL_STYLE, NATIVE_PANEL_16, NATIVE_PANEL_32 } from './panel';

const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const color = z.string().regex(/^#[A-Fa-f0-9]{8}$/, '需要 #AARRGGBB 格式');
export const textSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('literal'), value: z.string() }),
  z.strictObject({ kind: z.literal('translate'), key: z.string().min(1), fallback: z.string() }),
]);
export type TextSpec = z.infer<typeof textSchema>;
export const boundsSchema = z.strictObject({ x: integer, y: integer, w: integer.positive(), h: integer.positive() });
export type Bounds = z.infer<typeof boundsSchema>;
const widgetSource = z.strictObject({ category: z.literal('vanilla-widget'), className: z.string() });
const base = { id, bounds: boundsSchema };
const widgetState = z.strictObject({ visible: z.boolean(), enabled: z.boolean() });
const emptyEvents = z.strictObject({});
export const nodeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('minecraft:creative-tab'), source: z.strictObject({ category: z.literal('screen-internal'), className: z.string() }), state: z.strictObject({ visible: z.boolean() }), props: z.strictObject({ name: z.string().min(1).max(128), column: z.number().int().min(1).max(7), selected: z.boolean(), groupId: id.optional(), contentIds: z.array(id).max(1000).optional() }), events: emptyEvents }),
  z.strictObject({ ...base, type: z.literal('minecraft:button'), source: widgetSource, state: widgetState,
    props: z.strictObject({ textShadow: z.boolean().optional(), message: textSchema, tooltip: textSchema.optional() }),
    events: z.strictObject({ press: id.optional() }),
  }),
  z.strictObject({ ...base, type: z.literal('minecraft:edit-box'), source: widgetSource, state: widgetState,
    props: z.strictObject({ textShadow: z.boolean().optional(), narration: textSchema, value: z.string(), maxLength: integer, hint: textSchema.optional(), bordered: z.boolean(), editable: z.boolean() }),
    events: z.strictObject({ valueChanged: id.optional() }),
  }),
  z.strictObject({ ...base, type: z.literal('minecraft:string-widget'), source: widgetSource,
    state: z.strictObject({ visible: z.boolean() }),
    props: z.strictObject({ textShadow: z.boolean().optional(), text: textSchema, color, align: z.enum(['left', 'center', 'right']) }), events: emptyEvents,
  }),
  z.strictObject({ ...base, type: z.literal('minecraft:fill'),
    source: z.strictObject({ category: z.literal('vanilla-draw'), className: z.string(), member: z.literal('fill') }),
    state: z.strictObject({ visible: z.boolean() }), props: z.strictObject({ color }), events: emptyEvents,
  }),
  z.strictObject({ ...base, type: z.literal('minecraft:checkbox'), source: widgetSource, state: widgetState,
    props: z.strictObject({ textShadow: z.boolean().optional(), message: textSchema, selected: z.boolean(), maxWidth: integer.positive() }), events: emptyEvents,
  }),
  z.strictObject({ ...base, type: z.literal('minecraft:cycle-button'), source: widgetSource, state: widgetState,
    props: z.strictObject({ textShadow: z.boolean().optional(), name: textSchema, options: z.array(z.strictObject({ id, text: textSchema })).min(1).max(100), initialOptionId: id, displayFormat: z.enum(['value-only', 'name-and-value']) }), events: emptyEvents,
  }),
]);
export type GuiNode = z.infer<typeof nodeSchema>;
const behaviorEventSchema = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('button-click'), sourceId: id }),
    z.strictObject({ type: z.literal('checkbox-change'), sourceId: id }),
    z.strictObject({ type: z.literal('rectangle-click'), sourceId: id }),
]);
export const behaviorActionSchema = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('set-text'), targetId: id, text: z.string().max(4096) }),
    z.strictObject({ type: z.literal('set-visible'), targetId: id, visible: z.boolean() }),
    z.strictObject({ type: z.literal('open_screen'), targetScreenId: id }),
]);
export const behaviorSchema = z.union([
  z.strictObject({ id, event: behaviorEventSchema, action: behaviorActionSchema }),
  z.strictObject({ id, event: behaviorEventSchema, actions: z.array(behaviorActionSchema).min(1).max(50) }),
]);
export type Behavior = z.infer<typeof behaviorSchema>;
export type BehaviorAction = z.infer<typeof behaviorActionSchema>;
export const actionsOf = (rule: Behavior): BehaviorAction[] => 'actions' in rule ? rule.actions : [rule.action];
export const screenTargetSchema = z.strictObject({ id, name: z.string().min(1).max(128).refine(value => value.trim().length > 0, '名称不能为空'), boundScreenId: id.optional() });
export type ScreenTarget = z.infer<typeof screenTargetSchema>;

// F0 allows only the explicit rule subset; variables, assets and node event references remain unsupported.
export const projectSchema = z.strictObject({
  format: z.literal('minecraft-gui-maker'), schemaVersion: z.enum(['0.1.0', '0.2.0', '0.3.0', '0.4.0', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0']),
  catalogVersion: z.literal(CATALOG_VERSION),
  target: z.strictObject({ edition: z.literal(TARGET.edition), minecraft: z.literal(TARGET.minecraft),
    loader: z.strictObject({ id: z.literal('neoforge'), version: z.literal(TARGET.loader.version) }), java: z.literal(21) }),
  project: z.strictObject({ id, name: z.string().min(1), revision: integer }),
  entryScreenId: id.optional(),
  screens: z.array(z.strictObject({ id, title: textSchema, base: z.literal('screen'),
    designSize: z.strictObject({ width: integer.positive(), height: integer.positive(), unit: z.literal('gui-px') }),
    placement: z.literal('center'), background: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('none') }), z.strictObject({ kind: z.literal('panel'), style: z.enum([PANEL_STYLE, NATIVE_PANEL_16, NATIVE_PANEL_32]), bounds: boundsSchema.optional() })]),
    nodes: z.array(nodeSchema).max(1000), variables: z.array(z.never()).max(0), behaviors: z.array(behaviorSchema).max(200), screenTargets: z.array(screenTargetSchema).max(100).optional(),
  })).min(1).max(100),
  assets: z.array(z.never()).max(0),
  extensions: z.record(z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/), z.json()).optional(),
}).superRefine((doc, ctx) => {
  if (doc.schemaVersion === '0.13.0' ? !doc.entryScreenId || !doc.screens.some(screen => screen.id === doc.entryScreenId) : doc.entryScreenId !== undefined) ctx.addIssue({ code: 'custom', path: ['entryScreenId'], message: 'entryScreenId 需要 schema 0.13.0 且必须引用真实 Screen；0.13.0 必须指定入口' });
  const seen = new Set<string>();
  const unique = (value: string, path: (string | number)[]) => {
    if (seen.has(value)) ctx.addIssue({ code: 'custom', path, message: 'ID 必须全局唯一' });
    seen.add(value);
  };
  if (!['0.12.0', '0.13.0'].includes(doc.schemaVersion) && doc.screens.length !== 1) ctx.addIssue({ code: 'custom', path: ['screens'], message: '多 Screen 需要 schema 0.12.0' });
  unique(doc.project.id, ['project', 'id']);
  doc.screens.forEach((screen, si) => {
    const sp = ['screens', si];
    if (screen.background.kind === 'panel') {
      if (doc.schemaVersion === '0.1.0') ctx.addIssue({ code: 'custom', path: [...sp, 'background'], message: 'Panel 需要 schema 0.2.0 或更高版本' });
      if (doc.schemaVersion === '0.2.0' && screen.background.style !== PANEL_STYLE) ctx.addIssue({ code: 'custom', path: [...sp, 'background'], message: '用户提供的 Panel 纹理需要 schema 0.3.0' });
      if (screen.background.bounds) {
        const b = screen.background.bounds;
        if (!['0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...sp, 'background', 'bounds'], message: 'Panel 独立几何需要 schema 0.9.0' });
        if (b.w < PANEL_MIN_SIZE || b.h < PANEL_MIN_SIZE || b.x + b.w > screen.designSize.width || b.y + b.h > screen.designSize.height) ctx.addIssue({ code: 'custom', path: [...sp, 'background', 'bounds'], message: 'Panel 最小 8×8 且必须位于设计区内' });
      }
      if (screen.designSize.width < PANEL_MIN_SIZE || screen.designSize.height < PANEL_MIN_SIZE) ctx.addIssue({ code: 'custom', path: [...sp, 'designSize'], message: 'Panel 宽高均需至少 8 GUI px' });
    }
    unique(screen.id, [...sp, 'id']);
    screen.nodes.forEach((node, ni) => {
      const np = [...sp, 'nodes', ni];
      unique(node.id, [...np, 'id']);
      if (node.type === 'minecraft:creative-tab' && (!['0.10.0', '0.11.0', '0.12.0', '0.13.0'].includes(doc.schemaVersion) || node.bounds.w !== 26 || node.bounds.h !== 32)) ctx.addIssue({ code: 'custom', path: np, message: 'CreativeTab 需要 schema 0.10.0 和固定 26×32 尺寸' });
      if ((node.type === 'minecraft:checkbox' || node.type === 'minecraft:cycle-button') && !['0.4.0', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0'].includes(doc.schemaVersion)) {
        ctx.addIssue({ code: 'custom', path: [...np, 'type'], message: '此组件需要 schema 0.4.0' });
      }
      if (node.type !== 'minecraft:fill' && node.type !== 'minecraft:creative-tab' && node.props.textShadow !== undefined && !['0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0'].includes(doc.schemaVersion)) {
        ctx.addIssue({ code: 'custom', path: [...np, 'props', 'textShadow'], message: '文字阴影需要 schema 0.5.0' });
      }
      if (node.type === 'minecraft:cycle-button') {
        const ids = node.props.options.map(option => option.id);
        if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'options'], message: '选项 ID 必须唯一' });
        if (!ids.includes(node.props.initialOptionId)) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'initialOptionId'], message: '初始选项不存在' });
      }
      const spec = CATALOG[node.type];
      if (node.source.className !== spec.source.className || node.source.category !== spec.source.category) {
        ctx.addIssue({ code: 'custom', path: [...np, 'source'], message: '来源与已审计组件目录不匹配' });
      }
      const b = node.bounds;
      if (b.w < spec.min.w || b.h < spec.min.h || b.x + b.w > screen.designSize.width || b.y + b.h > screen.designSize.height) {
        ctx.addIssue({ code: 'custom', path: [...np, 'bounds'], message: '尺寸小于组件下限或超出设计区' });
      }
      if (node.type === 'minecraft:edit-box' && node.props.value.length > node.props.maxLength) {
        ctx.addIssue({ code: 'custom', path: [...np, 'props', 'value'], message: '输入值超过 maxLength（UTF-16）' });
      }
      for (const key of Object.keys(node.events)) {
        ctx.addIssue({ code: 'custom', path: [...np, 'events', key], message: '节点 events 暂不支持引用；请使用 F0 规则' });
      }
    });
    const ownership = new Map<string, string>(), groups = new Map<string, number>();
    screen.nodes.forEach((node, index) => {
      if (node.type !== 'minecraft:creative-tab') return;
      const { groupId, contentIds } = node.props, path = [...sp, 'nodes', index, 'props'];
      if ((groupId !== undefined || contentIds !== undefined) && !['0.11.0', '0.12.0', '0.13.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: '标签组需要 schema 0.11.0' });
      if (!groupId && contentIds?.length) ctx.addIssue({ code: 'custom', path, message: '关联内容需要标签组' });
      if (groupId) groups.set(groupId, (groups.get(groupId) ?? 0) + (node.props.selected ? 1 : 0));
      if (new Set(contentIds ?? []).size !== (contentIds?.length ?? 0)) ctx.addIssue({ code: 'custom', path, message: '关联内容不能重复' });
      for (const targetId of contentIds ?? []) {
        const target = screen.nodes.find(n => n.id === targetId);
        if (!target || target.type === 'minecraft:creative-tab') ctx.addIssue({ code: 'custom', path, message: '关联组件不存在或是标签' });
        const owner = ownership.get(targetId); if (owner && owner !== groupId) ctx.addIssue({ code: 'custom', path, message: '同一组件不能属于多个标签组' });
        if (groupId) ownership.set(targetId, groupId);
      }
    });
    for (const count of groups.values()) if (count !== 1) ctx.addIssue({ code: 'custom', path: [...sp, 'nodes'], message: '每个标签组必须有且仅有一个初始选中标签' });
    if (screen.screenTargets !== undefined && !['0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...sp, 'screenTargets'], message: 'Screen 目标声明需要 schema 0.7.0' });
    screen.screenTargets?.forEach((target, index) => { unique(target.id, [...sp, 'screenTargets', index, 'id']); if (target.boundScreenId !== undefined && (!['0.12.0', '0.13.0'].includes(doc.schemaVersion) || !doc.screens.some(item => item.id === target.boundScreenId))) ctx.addIssue({ code: 'custom', path: [...sp, 'screenTargets', index, 'boundScreenId'], message: '绑定需要 0.12.0 且必须指向真实 Screen' }); });
    screen.behaviors.forEach((rule, index) => {
      const path = [...sp, 'behaviors', index]; unique(rule.id, [...path, 'id']);
      if (!['0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: '行为规则需要 schema 0.6.0' });
      if ('actions' in rule && !['0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: '有序动作需要 schema 0.8.0' });
      if ((rule.event.type === 'rectangle-click' || actionsOf(rule).some(a => a.type === 'open_screen')) && !['0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: 'F1 行为需要 schema 0.7.0' });
      const source = screen.nodes.find(n => n.id === rule.event.sourceId);
      const required = rule.event.type === 'button-click' ? 'minecraft:button' : rule.event.type === 'checkbox-change' ? 'minecraft:checkbox' : 'minecraft:fill';
      if (!source || source.type !== required) ctx.addIssue({ code: 'custom', path: [...path, 'event', 'sourceId'], message: '事件来源不存在或类型不匹配' });
      actionsOf(rule).forEach((action, ai) => {
      const actionPath = 'actions' in rule ? [...path, 'actions', ai] : [...path, 'action'];
      if (action.type === 'open_screen') {
        if (!screen.screenTargets?.some(t => t.id === action.targetScreenId)) ctx.addIssue({ code: 'custom', path: [...actionPath, 'targetScreenId'], message: 'Screen 目标未声明' });
      } else {
        const target = screen.nodes.find(n => n.id === action.targetId);
        if (!target || (action.type === 'set-text' && target.type !== 'minecraft:string-widget')) ctx.addIssue({ code: 'custom', path: [...actionPath, 'targetId'], message: '动作目标不存在或类型不匹配' });
      }
      });
    });
  });
});
export type GuiProject = z.infer<typeof projectSchema>;
export type GuiScreen = GuiProject['screens'][number];

export class ValidationError extends Error {}
export const MAX_JSON_BYTES = 5 * 1024 * 1024;

export function parseProject(json: string): GuiProject {
  if (new TextEncoder().encode(json).byteLength > MAX_JSON_BYTES) throw new ValidationError('文件超过 5 MiB 上限');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new ValidationError('JSON 语法错误'); }
  // Bound traversal before recursive extension validation, including hostile deeply nested JSON.
  const stack = [{ value, depth: 0 }];
  while (stack.length) {
    const entry = stack.pop()!;
    if (entry.depth > 32) throw new ValidationError('JSON 嵌套超过 32 层');
    if (entry.value && typeof entry.value === 'object') {
      for (const child of Object.values(entry.value)) stack.push({ value: child, depth: entry.depth + 1 });
    }
  }
  const result = projectSchema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error.issues.slice(0, 8).map(issue => `${issue.path.join('.') || 'project'}: ${issue.message}`).join('\n'));
  return result.data;
}

export function exportProject(doc: GuiProject): string {
  // Same gate in both directions: export never claims an invalid document is a valid project.
  const json = JSON.stringify(doc, null, 2);
  parseProject(json);
  return json;
}
