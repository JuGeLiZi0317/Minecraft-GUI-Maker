import { z } from 'zod';
import { CATALOG, CATALOG_VERSION, TARGET } from './catalog';
import { PANEL_MIN_SIZE, PANEL_STYLE, NATIVE_PANEL_16, NATIVE_PANEL_32 } from './panel';
import { selectionError, isSelectionNode } from './selection';
import { numericError } from './numeric';

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
const numericProps = { min: z.number().finite(), max: z.number().finite(), step: z.number().finite(), initialValue: z.number().finite(), numericType: z.enum(['integer', 'decimal']), format: z.strictObject({ decimals: z.number().int().min(0).max(6), unit: z.string().max(32) }), name: textSchema };
const selectionProps = { name: textSchema, color, textShadow: z.boolean(), options: z.array(z.strictObject({ id, label: textSchema, disabled: z.boolean() })).min(1).max(100), initialSelectedOptionId: id };
export const nodeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('minecraft:radio-group'), source: widgetSource, state: widgetState, props: z.strictObject({ ...selectionProps, orientation: z.enum(['vertical', 'horizontal']) }), events: z.strictObject({ change: z.literal('selection-change') }) }),
  z.strictObject({ ...base, type: z.literal('minecraft:dropdown'), source: widgetSource, state: widgetState, props: z.strictObject({ ...selectionProps, visibleRows: z.number().int().min(1).max(12) }), events: z.strictObject({ change: z.literal('selection-change') }) }),
  z.strictObject({ ...base, type: z.literal('minecraft:numeric-input'), source: widgetSource, state: widgetState,
    props: z.strictObject({ ...numericProps, color: color.optional(), textShadow: z.boolean(), bordered: z.boolean(), editable: z.boolean(), commitPolicy: z.literal('enter-or-blur'), errorMessage: z.string().min(1).max(256) }), events: z.strictObject({ commit: z.literal('numeric-commit') }) }),
  z.strictObject({ ...base, type: z.literal('minecraft:slider'), source: widgetSource, state: widgetState,
    props: z.strictObject({ ...numericProps, color: color.optional(), textShadow: z.boolean(), showValue: z.boolean() }), events: z.strictObject({ change: z.literal('slider-change') }) }),
  z.strictObject({ ...base, type: z.literal('minecraft:multi-line-text-widget'), source: widgetSource,
    state: z.strictObject({ visible: z.boolean() }), props: z.strictObject({ text: textSchema, color, maxWidth: integer.positive().max(8192), maxRows: integer.positive().max(256), align: z.enum(['left', 'center']), textShadow: z.boolean() }), events: emptyEvents }),
  z.strictObject({ ...base, type: z.literal('minecraft:creative-tab'), source: z.strictObject({ category: z.literal('screen-internal'), className: z.string() }), state: z.strictObject({ visible: z.boolean() }), props: z.strictObject({ name: z.string().min(1).max(128), column: z.number().int().min(1).max(7), selected: z.boolean(), groupId: id.optional(), contentIds: z.array(id).max(1000).optional(), tabMode: z.literal('screen-navigation').optional(), navigationGroupId: id.optional(), navigationTabId: id.optional() }), events: emptyEvents }),
  z.strictObject({ ...base, type: z.literal('minecraft:button'), source: widgetSource, state: widgetState,
    props: z.strictObject({ color: color.optional(), textShadow: z.boolean().optional(), message: textSchema, tooltip: textSchema.optional() }),
    events: z.strictObject({ press: id.optional() }),
  }),
  z.strictObject({ ...base, type: z.literal('minecraft:edit-box'), source: widgetSource, state: widgetState,
    props: z.strictObject({ color: color.optional(), textShadow: z.boolean().optional(), narration: textSchema, value: z.string(), maxLength: integer, hint: textSchema.optional(), bordered: z.boolean(), editable: z.boolean() }),
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
    props: z.strictObject({ color: color.optional(), textShadow: z.boolean().optional(), message: textSchema, selected: z.boolean(), maxWidth: integer.positive() }), events: emptyEvents,
  }),
  z.strictObject({ ...base, type: z.literal('minecraft:cycle-button'), source: widgetSource, state: widgetState,
    props: z.strictObject({ color: color.optional(), textShadow: z.boolean().optional(), name: textSchema, options: z.array(z.strictObject({ id, text: textSchema })).min(1).max(100), initialOptionId: id, displayFormat: z.enum(['value-only', 'name-and-value']) }), events: emptyEvents,
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
export const screenTabGroupSchema = z.strictObject({ id, name: z.string().min(1).max(128).refine(value => value.trim().length > 0, '名称不能为空'), tabs: z.array(z.strictObject({ id, name: z.string().min(1).max(128).refine(value => value.trim().length > 0, '名称不能为空'), targetScreenId: id })).min(1).max(100) });
export type ScreenTabGroup = z.infer<typeof screenTabGroupSchema>;

// F0 allows only the explicit rule subset; variables, assets and node event references remain unsupported.
export const projectSchema = z.strictObject({
  format: z.literal('minecraft-gui-maker'), schemaVersion: z.enum(['0.1.0', '0.2.0', '0.3.0', '0.4.0', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0']),
  catalogVersion: z.literal(CATALOG_VERSION),
  target: z.strictObject({ edition: z.literal(TARGET.edition), minecraft: z.literal(TARGET.minecraft),
    loader: z.strictObject({ id: z.literal('neoforge'), version: z.literal(TARGET.loader.version) }), java: z.literal(21) }),
  project: z.strictObject({ id, name: z.string().min(1), revision: integer }),
  runtimePolicy: z.strictObject({ escapeAction: z.literal('close'), nativeBackground: z.literal('default') }).optional(),
  entryScreenId: id.optional(),
  screenTabGroups: z.array(screenTabGroupSchema).max(100).optional(),
  screens: z.array(z.strictObject({ id, title: textSchema, base: z.literal('screen'),
    designSize: z.strictObject({ width: integer.positive(), height: integer.positive(), unit: z.literal('gui-px') }),
    placement: z.literal('center'), background: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('none') }), z.strictObject({ kind: z.literal('panel'), style: z.enum([PANEL_STYLE, NATIVE_PANEL_16, NATIVE_PANEL_32]), bounds: boundsSchema.optional() })]),
    nodes: z.array(nodeSchema).max(1000), variables: z.array(z.never()).max(0), behaviors: z.array(behaviorSchema).max(200), screenTargets: z.array(screenTargetSchema).max(100).optional(),
  })).min(1).max(100),
  assets: z.array(z.never()).max(0),
  extensions: z.record(z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/), z.json()).optional(),
}).superRefine((doc, ctx) => {
  if (doc.runtimePolicy && !['0.17.0', '0.18.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: ['runtimePolicy'], message: '运行策略需要 Schema 0.17.0' });
  if (['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion) && doc.screenTabGroups === undefined) ctx.addIssue({ code: 'custom', path: ['screenTabGroups'], message: 'CreativeTab Screen 导航组需要 Schema 0.14.0 项目级 screenTabGroups' });
  if (!['0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion) ? doc.entryScreenId !== undefined : !doc.entryScreenId || !doc.screens.some(screen => screen.id === doc.entryScreenId)) ctx.addIssue({ code: 'custom', path: ['entryScreenId'], message: 'entryScreenId 需要 schema 0.13.0 或更高且必须引用真实 Screen；0.13.0+ 必须指定入口' });
  if (!['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion) && doc.screenTabGroups !== undefined) ctx.addIssue({ code: 'custom', path: ['screenTabGroups'], message: '项目级 CreativeTab Screen 导航组需要 schema 0.14.0' });
  const seen = new Set<string>();
  const unique = (value: string, path: (string | number)[]) => {
    if (seen.has(value)) ctx.addIssue({ code: 'custom', path, message: 'ID 必须全局唯一' });
    seen.add(value);
  };
  const screenNavigationInstances = new Set<string>();
  const navigationGroups = doc.screenTabGroups ?? [];
  navigationGroups.forEach((group, gi) => {
    unique(group.id, ['screenTabGroups', gi, 'id']);
    const targetScreens = new Set<string>(), tabIds = new Set<string>();
    group.tabs.forEach((tab, ti) => {
      unique(tab.id, ['screenTabGroups', gi, 'tabs', ti, 'id']);
      if (tabIds.has(tab.id)) ctx.addIssue({ code: 'custom', path: ['screenTabGroups', gi, 'tabs', ti, 'id'], message: '同一导航组的标签 ID 不能重复' });
      tabIds.add(tab.id);
      if (targetScreens.has(tab.targetScreenId)) ctx.addIssue({ code: 'custom', path: ['screenTabGroups', gi, 'tabs', ti, 'targetScreenId'], message: '同一导航组不能有多个标签指向同一 Screen' });
      targetScreens.add(tab.targetScreenId);
      if (!doc.screens.some(screen => screen.id === tab.targetScreenId)) ctx.addIssue({ code: 'custom', path: ['screenTabGroups', gi, 'tabs', ti, 'targetScreenId'], message: '标签目标必须引用真实 Screen' });
    });
  });
  if (!['0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion) && doc.screens.length !== 1) ctx.addIssue({ code: 'custom', path: ['screens'], message: '多 Screen 需要 schema 0.12.0' });
  unique(doc.project.id, ['project', 'id']);
  doc.screens.forEach((screen, si) => {
    const sp = ['screens', si];
    if (screen.background.kind === 'panel') {
      if (doc.schemaVersion === '0.1.0') ctx.addIssue({ code: 'custom', path: [...sp, 'background'], message: 'Panel 需要 schema 0.2.0 或更高版本' });
      if (doc.schemaVersion === '0.2.0' && screen.background.style !== PANEL_STYLE) ctx.addIssue({ code: 'custom', path: [...sp, 'background'], message: '用户提供的 Panel 纹理需要 schema 0.3.0' });
      if (screen.background.bounds) {
        const b = screen.background.bounds;
        if (!['0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...sp, 'background', 'bounds'], message: 'Panel 独立几何需要 schema 0.9.0' });
        if (b.w < PANEL_MIN_SIZE || b.h < PANEL_MIN_SIZE || b.x + b.w > screen.designSize.width || b.y + b.h > screen.designSize.height) ctx.addIssue({ code: 'custom', path: [...sp, 'background', 'bounds'], message: 'Panel 最小 8×8 且必须位于设计区内' });
      }
      if (screen.designSize.width < PANEL_MIN_SIZE || screen.designSize.height < PANEL_MIN_SIZE) ctx.addIssue({ code: 'custom', path: [...sp, 'designSize'], message: 'Panel 宽高均需至少 8 GUI px' });
    }
    unique(screen.id, [...sp, 'id']);
    screen.nodes.forEach((node, ni) => {
      const np = [...sp, 'nodes', ni];
      unique(node.id, [...np, 'id']);
      if (isSelectionNode(node)) {
        if (doc.schemaVersion !== '0.18.0') ctx.addIssue({ code: 'custom', path: np, message: '选择控件需要 Schema 0.18.0' });
        const error = selectionError(node.props); if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
        if (node.type === 'minecraft:radio-group' && (node.props.orientation === 'vertical' ? node.bounds.h : node.bounds.w) < node.props.options.length * 20) ctx.addIssue({ code: 'custom', path: [...np, 'bounds'], message: '单选组每个选项至少需要20px布局空间' });
      }
      if (node.type === 'minecraft:numeric-input' || node.type === 'minecraft:slider') {
        if (!['0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: '数值控件需要 Schema 0.16.0' });
        const error = numericError(node.props);
        if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
      }
      if (node.type === 'minecraft:multi-line-text-widget') {
        if (!['0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'MultiLineTextWidget 需要 schema 0.15.0' });
        if (node.bounds.w !== node.props.maxWidth || node.bounds.h !== node.props.maxRows * 9) ctx.addIssue({ code: 'custom', path: [...np, 'bounds'], message: '多行文本预留区必须等于 maxWidth × (maxRows × 9)，不是原生测量尺寸' });
        const text = node.props.text.kind === 'literal' ? node.props.text.value : node.props.text.fallback;
        if (text.length > 4096) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'text'], message: '多行文本最多 4096 UTF-16 单元' });
      }
      if (node.type === 'minecraft:creative-tab' && (node.props.tabMode !== undefined || node.props.navigationGroupId !== undefined || node.props.navigationTabId !== undefined)) {
        if (!['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'tabMode'], message: 'Screen 导航标签需要 schema 0.14.0' });
        if (node.props.tabMode !== 'screen-navigation' || !node.props.navigationGroupId || !node.props.navigationTabId || node.props.groupId !== undefined || node.props.contentIds !== undefined) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: 'Screen 导航模式必须引用项目级组和标签 ID，且不能携带 H2-B 内容组字段' });
        const group = navigationGroups.find(item => item.id === node.props.navigationGroupId);
        if (!group || !group.tabs.some(tab => tab.id === node.props.navigationTabId)) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'navigationGroupId'], message: 'CreativeTab 导航组或标签不存在' });
        const identity = `${screen.id}:${node.props.navigationGroupId}:${node.props.navigationTabId}`;
        if (screenNavigationInstances.has(identity)) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: '同一 Screen 内导航组的标签实例不能重复' });
        screenNavigationInstances.add(identity);
      }
      if (node.type === 'minecraft:creative-tab' && (!['0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion) || node.bounds.w !== 26 || node.bounds.h !== 32)) ctx.addIssue({ code: 'custom', path: np, message: 'CreativeTab 需要 schema 0.10.0 和固定 26×32 尺寸' });
      if ((node.type === 'minecraft:checkbox' || node.type === 'minecraft:cycle-button') && !['0.4.0', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion)) {
        ctx.addIssue({ code: 'custom', path: [...np, 'type'], message: '此组件需要 schema 0.4.0' });
      }
      if (!['0.17.0', '0.18.0'].includes(doc.schemaVersion) && ((node.type !== 'minecraft:fill' && node.type !== 'minecraft:string-widget' && node.type !== 'minecraft:multi-line-text-widget' && 'color' in node.props && node.props.color !== undefined) || ((node.type === 'minecraft:multi-line-text-widget' || node.type === 'minecraft:slider') && !node.props.textShadow))) ctx.addIssue({ code: 'custom', path: np, message: '自定义文字颜色/多行与滑块阴影选项需要 Schema 0.17.0' });
      if (node.type !== 'minecraft:fill' && node.type !== 'minecraft:creative-tab' && node.props.textShadow !== undefined && !['0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion)) {
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
        if (isSelectionNode(node) || node.type === 'minecraft:numeric-input' || node.type === 'minecraft:slider') continue;
        ctx.addIssue({ code: 'custom', path: [...np, 'events', key], message: '节点 events 暂不支持引用；请使用 F0 规则' });
      }
    });
    const ownership = new Map<string, string>(), groups = new Map<string, number>();
    screen.nodes.forEach((node, index) => {
      if (node.type !== 'minecraft:creative-tab') return;
      const { groupId, contentIds } = node.props, path = [...sp, 'nodes', index, 'props'];
      if ((groupId !== undefined || contentIds !== undefined) && !['0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: '标签组需要 schema 0.11.0' });
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
    if (screen.screenTargets !== undefined && !['0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...sp, 'screenTargets'], message: 'Screen 目标声明需要 schema 0.7.0' });
    screen.screenTargets?.forEach((target, index) => { unique(target.id, [...sp, 'screenTargets', index, 'id']); if (target.boundScreenId !== undefined && (!['0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion) || !doc.screens.some(item => item.id === target.boundScreenId))) ctx.addIssue({ code: 'custom', path: [...sp, 'screenTargets', index, 'boundScreenId'], message: '绑定需要 0.12.0 且必须指向真实 Screen' }); });
    screen.behaviors.forEach((rule, index) => {
      const path = [...sp, 'behaviors', index]; unique(rule.id, [...path, 'id']);
      if (!['0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: '行为规则需要 schema 0.6.0' });
      if ('actions' in rule && !['0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: '有序动作需要 schema 0.8.0' });
      if ((rule.event.type === 'rectangle-click' || actionsOf(rule).some(a => a.type === 'open_screen')) && !['0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: 'F1 行为需要 schema 0.7.0' });
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
