import { z } from 'zod';
import { CATALOG, CATALOG_VERSION, TARGET } from './catalog';
import { PANEL_MIN_SIZE, PANEL_STYLE, NATIVE_PANEL_16, NATIVE_PANEL_32 } from './panel';
import { selectionError, isSelectionNode } from './selection';
import { numericError } from './numeric';
import { progressError, isProgressNode } from './progress';
import { isStatusNode, statusError } from './statusIndicator';
import { imageError, isImageNode } from './image';
import { contentSize, contentViewport, isScrollableChildType, isScrollablePanelNode } from './scrollablePanel';
import { containerDepth, containerLocalViewport, isCollapsiblePanelNode, isContainerNode } from './collapsiblePanel';
import { isTreeViewNode, treeViewError } from './treeView';

const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const color = z.string().regex(/^#[A-Fa-f0-9]{8}$/, '需要 #AARRGGBB 格式');
export const textSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('literal'), value: z.string() }),
  z.strictObject({ kind: z.literal('translate'), key: z.string().min(1), fallback: z.string() }),
]);
export type TextSpec = z.infer<typeof textSchema>;
export const statusTextSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('literal'), value: z.string() }),
  z.strictObject({ kind: z.literal('translate'), key: z.string().min(1), fallback: z.string().optional() }),
]);
export type StatusTextSpec = z.infer<typeof statusTextSchema>;
export const boundsSchema = z.strictObject({ x: integer, y: integer, w: integer.positive(), h: integer.positive() });
export type Bounds = z.infer<typeof boundsSchema>;
const widgetSource = z.strictObject({ category: z.literal('vanilla-widget'), className: z.string() });
const base = { id, bounds: boundsSchema, parentContainerId: id.optional() };
const widgetState = z.strictObject({ visible: z.boolean(), enabled: z.boolean() });
const emptyEvents = z.strictObject({});
const numericProps = { min: z.number().finite(), max: z.number().finite(), step: z.number().finite(), initialValue: z.number().finite(), numericType: z.enum(['integer', 'decimal']), format: z.strictObject({ decimals: z.number().int().min(0).max(6), unit: z.string().max(32) }), name: textSchema };
const selectionProps = { name: textSchema, color, textShadow: z.boolean(), options: z.array(z.strictObject({ id, label: textSchema, disabled: z.boolean() })).min(1).max(100), initialSelectedOptionId: id };
const treeItemSchema = z.strictObject({ id, label: textSchema, parentId: id.nullable(), order: integer.max(4095), selectable: z.boolean(), disabled: z.boolean() });
const treeViewPropsSchema = z.strictObject({ name: textSchema, items: z.array(treeItemSchema).min(1).max(256), initialExpandedIds: z.array(id).max(256), initialSelectedItemId: id });
export const PROJECT_SCHEMA_VERSIONS = ['0.1.0', '0.2.0', '0.3.0', '0.4.0', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'] as const;
export const CURRENT_PROJECT_SCHEMA_VERSION = PROJECT_SCHEMA_VERSIONS[PROJECT_SCHEMA_VERSIONS.length - 1];
export const nodeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('minecraft:scrollable-panel'), source: z.strictObject({ category: z.literal('vanilla-draw'), className: z.literal('net.minecraft.client.gui.GuiGraphics'), member: z.literal('fill') }), state: widgetState,
    props: z.strictObject({ padding: integer.max(16), contentHeight: integer.positive().max(8192), initialScroll: z.literal('top'), backgroundColor: color, borderColor: color }), events: emptyEvents }),
  z.strictObject({ ...base, type: z.literal('minecraft:collapsible-panel'), source: z.strictObject({ category: z.literal('vanilla-draw'), className: z.literal('net.minecraft.client.gui.GuiGraphics'), member: z.literal('fill') }), state: widgetState,
    props: z.strictObject({ title: textSchema, headerHeight: integer.min(16).max(40), initialExpanded: z.boolean(), headerColor: color, backgroundColor: color, textColor: color, border: z.boolean(), borderColor: color }), events: emptyEvents }),
  z.strictObject({ ...base, type: z.literal('minecraft:tree-view'), source: z.strictObject({ category: z.literal('vanilla-draw'), className: z.literal('net.minecraft.client.gui.GuiGraphics'), member: z.literal('fill') }), state: widgetState, props: treeViewPropsSchema, events: z.strictObject({ change: z.literal('tree-selection-change') }) }),
  z.strictObject({ ...base, type: z.literal('minecraft:image'), source: z.strictObject({ category: z.literal('vanilla-draw'), className: z.literal('net.minecraft.client.gui.GuiGraphics'), member: z.enum(['blit', 'blitSprite']) }), state: z.strictObject({ visible: z.boolean() }), props: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('texture'), resourceId: z.string().min(1).max(512), textureWidth: integer.positive().max(8192), textureHeight: integer.positive().max(8192), uv: z.strictObject({ x: integer, y: integer, width: integer.positive(), height: integer.positive() }) }),
    z.strictObject({ kind: z.literal('sprite'), spriteId: z.string().min(1).max(256) }),
  ]), events: emptyEvents }),
  z.strictObject({ ...base, type: z.literal('minecraft:status-indicator'), source: z.strictObject({ category: z.literal('vanilla-draw'), className: z.literal('net.minecraft.client.gui.GuiGraphics'), member: z.literal('fill') }), state: z.strictObject({ visible: z.boolean() }), props: z.strictObject({ name: textSchema, statuses: z.array(z.strictObject({ statusId: id, label: textSchema, color, text: statusTextSchema.optional() })).min(1).max(32), initialStatusId: id, shape: z.enum(['circle', 'square']), showLabel: z.boolean(), color, textShadow: z.boolean() }), events: z.strictObject({ change: z.literal('status-change') }) }),
  z.strictObject({ ...base, type: z.literal('minecraft:progress-bar'), source: z.strictObject({ category: z.literal('vanilla-draw'), className: z.literal('net.minecraft.client.gui.GuiGraphics'), member: z.literal('fill') }), state: z.strictObject({ visible: z.boolean() }), props: z.strictObject({ min: z.number().finite(), max: z.number().finite(), initialValue: z.number().finite(), direction: z.enum(['left-to-right', 'right-to-left', 'bottom-to-top', 'top-to-bottom']), backgroundColor: color, foregroundColor: color, border: z.boolean(), borderColor: color, borderThickness: z.number().int().min(0).max(16), display: z.enum(['none', 'percentage', 'value']), color, textShadow: z.boolean() }), events: emptyEvents }),
  z.strictObject({ ...base, type: z.literal('minecraft:radio-group'), source: widgetSource, state: widgetState, props: z.strictObject({ ...selectionProps, orientation: z.enum(['vertical', 'horizontal']) }), events: z.strictObject({ change: z.literal('selection-change') }) }),
  z.strictObject({ ...base, type: z.literal('minecraft:dropdown'), source: widgetSource, state: widgetState, props: z.strictObject({ ...selectionProps, visibleRows: z.number().int().min(1).max(12) }), events: z.strictObject({ change: z.literal('selection-change') }) }),
  z.strictObject({ ...base, type: z.literal('minecraft:numeric-input'), source: widgetSource, state: widgetState,
    props: z.strictObject({ ...numericProps, color: color.optional(), textShadow: z.boolean(), bordered: z.boolean(), editable: z.boolean(), commitPolicy: z.literal('enter-or-blur'), errorMessage: z.string().min(1).max(256) }), events: z.strictObject({ commit: z.literal('numeric-commit') }) }),
  z.strictObject({ ...base, type: z.literal('minecraft:slider'), source: widgetSource, state: widgetState,
    props: z.strictObject({ ...numericProps, color: color.optional(), textShadow: z.boolean(), showValue: z.boolean() }), events: z.strictObject({ change: z.literal('slider-change') }) }),
  z.strictObject({ ...base, type: z.literal('minecraft:fitting-multi-line-text-widget'), source: z.strictObject({ category: z.literal('vanilla-widget'), className: z.literal('net.minecraft.client.gui.components.FittingMultiLineTextWidget') }), state: z.strictObject({ visible: z.boolean() }), props: z.strictObject({ text: textSchema, color, initialScroll: z.literal('top'), textShadow: z.boolean().optional() }), events: emptyEvents }),
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
export const F2_EVENT_TYPES = ['button-click', 'checkbox-change', 'rectangle-click', 'slider-change', 'selection-change'] as const;
export const F2_ACTION_TYPES = ['set-text', 'set-visible', 'open_screen', 'set-progress-value', 'set-status', 'if'] as const;
export const behaviorMapSchema = z.strictObject({ id, name: z.string().min(1).max(128).refine(value => value.trim().length > 0, '名称不能为空'), mappings: z.array(z.strictObject({ optionId: id, statusId: id })).max(100) });
export type BehaviorMap = z.infer<typeof behaviorMapSchema>;
const behaviorEventSchema = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('button-click'), sourceId: id }),
    z.strictObject({ type: z.literal('checkbox-change'), sourceId: id }),
    z.strictObject({ type: z.literal('rectangle-click'), sourceId: id }),
    z.strictObject({ type: z.literal('slider-change'), sourceId: id }),
    z.strictObject({ type: z.literal('selection-change'), sourceId: id, additionalSourceIds: z.array(id).min(1).max(99).optional() }),
]);
const explicitEventBindingSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('selection-change'), sourceId: id, payloadType: z.literal('OptionId') }),
  z.strictObject({ type: z.literal('slider-change'), sourceId: id, payloadType: z.literal('Number') }),
]);
const setStatusActionSchema = z.union([
  z.strictObject({ type: z.literal('set-status'), targetId: id, statusId: id }),
  z.strictObject({ type: z.literal('set-status'), targetId: id, optionMappings: z.array(z.strictObject({ optionId: id, statusId: id })).max(100) }),
  z.strictObject({ type: z.literal('set-status'), targetId: id, mapRef: id }),
]);
const setProgressActionSchema = z.strictObject({ type: z.literal('set-progress-value'), targetId: id, mapping: z.enum(['direct', 'normalize']) });
const behaviorLeafConditionSchema = z.union([
  z.strictObject({ type: z.literal('event-option'), operator: z.enum(['equals', 'not-equals']), optionId: id }),
  z.discriminatedUnion('valueType', [
    z.strictObject({ type: z.literal('compare'), valueType: z.literal('OptionId'), operator: z.enum(['equals', 'not-equals']),
      left: z.union([z.strictObject({ type: z.literal('event-value'), field: z.literal('optionId') }), z.strictObject({ type: z.literal('constant'), value: id }), z.strictObject({ type: z.literal('read-control-value'), nodeId: id })]),
      right: z.union([z.strictObject({ type: z.literal('event-value'), field: z.literal('optionId') }), z.strictObject({ type: z.literal('constant'), value: id }), z.strictObject({ type: z.literal('read-control-value'), nodeId: id })]) }),
    z.strictObject({ type: z.literal('compare'), valueType: z.literal('Number'), operator: z.enum(['equals', 'not-equals', 'greater-than', 'less-than', 'greater-or-equal', 'less-or-equal']),
      left: z.union([z.strictObject({ type: z.literal('event-value'), field: z.literal('value') }), z.strictObject({ type: z.literal('constant'), value: z.number().finite() }), z.strictObject({ type: z.literal('read-control-value'), nodeId: id })]),
      right: z.union([z.strictObject({ type: z.literal('event-value'), field: z.literal('value') }), z.strictObject({ type: z.literal('constant'), value: z.number().finite() }), z.strictObject({ type: z.literal('read-control-value'), nodeId: id })]) }),
  ]),
]);
export type BehaviorLeafCondition = z.infer<typeof behaviorLeafConditionSchema>;
export type BehaviorCondition = BehaviorLeafCondition | { type: 'and'; conditions: BehaviorCondition[] } | { type: 'or'; conditions: BehaviorCondition[] } | { type: 'not'; condition: BehaviorCondition };
export const MAX_BOOLEAN_DEPTH = 4, MAX_CONDITION_NODES = 32;
const conditionNodeSchema: z.ZodType<BehaviorCondition> = z.lazy(() => z.union([
  behaviorLeafConditionSchema,
  z.strictObject({ type: z.literal('and'), conditions: z.array(conditionNodeSchema).min(2).max(MAX_CONDITION_NODES) }),
  z.strictObject({ type: z.literal('or'), conditions: z.array(conditionNodeSchema).min(2).max(MAX_CONDITION_NODES) }),
  z.strictObject({ type: z.literal('not'), condition: conditionNodeSchema }),
]));
export const behaviorConditionSchema = conditionNodeSchema.superRefine((root, ctx) => {
  let count = 0;
  const walk = (node: BehaviorCondition, depth: number, path: (string | number)[]) => {
    count++;
    if (node.type === 'and' || node.type === 'or' || node.type === 'not') {
      if (depth + 1 > MAX_BOOLEAN_DEPTH) ctx.addIssue({ code: 'custom', path, message: `布尔组合深度不能超过 ${MAX_BOOLEAN_DEPTH}` });
      if (node.type === 'not') walk(node.condition, depth + 1, [...path, 'condition']);
      else node.conditions.forEach((child, i) => walk(child, depth + 1, [...path, 'conditions', i]));
    }
  };
  walk(root, 0, []);
  if (count > MAX_CONDITION_NODES) ctx.addIssue({ code: 'custom', message: `条件树节点不能超过 ${MAX_CONDITION_NODES}` });
});
export function conditionLeaves(root: BehaviorCondition): BehaviorLeafCondition[] {
  if (root.type === 'not') return conditionLeaves(root.condition);
  if (root.type === 'and' || root.type === 'or') return root.conditions.flatMap(conditionLeaves);
  return [root];
}
const conditionalActionSchema = z.strictObject({
  type: z.literal('if'), condition: behaviorConditionSchema,
  thenActions: z.array(z.union([setStatusActionSchema, setProgressActionSchema])).min(1).max(50),
  elseActions: z.array(z.union([setStatusActionSchema, setProgressActionSchema])).max(50),
});
export const behaviorActionSchema = z.union([
    z.strictObject({ type: z.literal('set-text'), targetId: id, text: z.string().max(4096) }),
    z.strictObject({ type: z.literal('set-visible'), targetId: id, visible: z.boolean() }),
    z.strictObject({ type: z.literal('open_screen'), targetScreenId: id }),
    setProgressActionSchema,
    setStatusActionSchema,
    conditionalActionSchema,
]);
export const behaviorSchema = z.union([
  z.strictObject({ id, event: behaviorEventSchema, eventBindings: z.array(explicitEventBindingSchema).min(1).max(100).optional(), action: behaviorActionSchema }),
  z.strictObject({ id, event: behaviorEventSchema, eventBindings: z.array(explicitEventBindingSchema).min(1).max(100).optional(), actions: z.array(behaviorActionSchema).min(1).max(50) }),
]);
export type Behavior = z.infer<typeof behaviorSchema>;
export type BehaviorAction = z.infer<typeof behaviorActionSchema>;
export type SetStatusAction = z.infer<typeof setStatusActionSchema>;
export type ConditionalBehaviorAction = z.infer<typeof conditionalActionSchema>;
export const behaviorLeafActions = (action: BehaviorAction): BehaviorAction[] => action.type === 'if' ? [...action.thenActions, ...action.elseActions] : [action];
export const actionsOf = (rule: Behavior): BehaviorAction[] => 'actions' in rule ? rule.actions : [rule.action];
export const statusMappingsOf = (screen: { behaviorMaps?: BehaviorMap[] }, action: Extract<BehaviorAction, { type: 'set-status' }>) =>
  'mapRef' in action ? screen.behaviorMaps?.find(map => map.id === action.mapRef)?.mappings ?? [] : 'optionMappings' in action ? action.optionMappings : [];
export const statusAssignmentOf = (action: SetStatusAction) => 'statusId' in action ? { statusId: action.statusId } : 'mapRef' in action ? { mapRef: action.mapRef } : { optionMappings: action.optionMappings };
/** Legacy additional sources retain the event type of their owner. */
export const legacySourcesOf = (rule: Behavior): string[] => [rule.event.sourceId, ...(rule.event.type === 'selection-change' ? rule.event.additionalSourceIds ?? [] : [])];
export const eventBindingsOf = (rule: Behavior) => rule.eventBindings ?? legacySourcesOf(rule).map(sourceId => ({ type: rule.event.type, sourceId, payloadType: rule.event.type === 'selection-change' ? 'OptionId' : rule.event.type === 'slider-change' ? 'Number' : 'none' }));
export const sourcesOf = (rule: Behavior): string[] => [...new Set(eventBindingsOf(rule).map(binding => binding.sourceId))];
export const matchesBehaviorEvent = (rule: Behavior, type: Behavior['event']['type'], sourceId: string) => eventBindingsOf(rule).some(binding => binding.type === type && binding.sourceId === sourceId);
export const screenTargetSchema = z.strictObject({ id, name: z.string().min(1).max(128).refine(value => value.trim().length > 0, '名称不能为空'), boundScreenId: id.optional() });
export type ScreenTarget = z.infer<typeof screenTargetSchema>;
export const screenTabGroupSchema = z.strictObject({ id, name: z.string().min(1).max(128).refine(value => value.trim().length > 0, '名称不能为空'), tabs: z.array(z.strictObject({ id, name: z.string().min(1).max(128).refine(value => value.trim().length > 0, '名称不能为空'), targetScreenId: id })).min(1).max(100) });
export type ScreenTabGroup = z.infer<typeof screenTabGroupSchema>;

// F0 allows only the explicit rule subset; variables, assets and node event references remain unsupported.
export const projectSchema = z.strictObject({
  format: z.literal('minecraft-gui-maker'), schemaVersion: z.enum(PROJECT_SCHEMA_VERSIONS),
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
    nodes: z.array(nodeSchema).max(1000), variables: z.array(z.never()).max(0), behaviors: z.array(behaviorSchema).max(200), screenTargets: z.array(screenTargetSchema).max(100).optional(), behaviorMaps: z.array(behaviorMapSchema).max(100).optional(),
  })).min(1).max(100),
  assets: z.array(z.never()).max(0),
  extensions: z.record(z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/), z.json()).optional(),
}).superRefine((doc, ctx) => {
  if (doc.runtimePolicy && !['0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: ['runtimePolicy'], message: '运行策略需要 Schema 0.17.0' });
  if (['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion) && doc.screenTabGroups === undefined) ctx.addIssue({ code: 'custom', path: ['screenTabGroups'], message: 'CreativeTab Screen 导航组需要 Schema 0.14.0 项目级 screenTabGroups' });
  if (!['0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion) ? doc.entryScreenId !== undefined : !doc.entryScreenId || !doc.screens.some(screen => screen.id === doc.entryScreenId)) ctx.addIssue({ code: 'custom', path: ['entryScreenId'], message: 'entryScreenId 需要 schema 0.13.0 或更高且必须引用真实 Screen；0.13.0+ 必须指定入口' });
  if (!['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion) && doc.screenTabGroups !== undefined) ctx.addIssue({ code: 'custom', path: ['screenTabGroups'], message: '项目级 CreativeTab Screen 导航组需要 schema 0.14.0' });
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
  if (!['0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion) && doc.screens.length !== 1) ctx.addIssue({ code: 'custom', path: ['screens'], message: '多 Screen 需要 schema 0.12.0' });
  unique(doc.project.id, ['project', 'id']);
  doc.screens.forEach((screen, si) => {
    const sp = ['screens', si];
    if (screen.background.kind === 'panel') {
      if (doc.schemaVersion === '0.1.0') ctx.addIssue({ code: 'custom', path: [...sp, 'background'], message: 'Panel 需要 schema 0.2.0 或更高版本' });
      if (doc.schemaVersion === '0.2.0' && screen.background.style !== PANEL_STYLE) ctx.addIssue({ code: 'custom', path: [...sp, 'background'], message: '用户提供的 Panel 纹理需要 schema 0.3.0' });
      if (screen.background.bounds) {
        const b = screen.background.bounds;
        if (!['0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...sp, 'background', 'bounds'], message: 'Panel 独立几何需要 schema 0.9.0' });
        if (b.w < PANEL_MIN_SIZE || b.h < PANEL_MIN_SIZE || b.x + b.w > screen.designSize.width || b.y + b.h > screen.designSize.height) ctx.addIssue({ code: 'custom', path: [...sp, 'background', 'bounds'], message: 'Panel 最小 8×8 且必须位于设计区内' });
      }
      if (screen.designSize.width < PANEL_MIN_SIZE || screen.designSize.height < PANEL_MIN_SIZE) ctx.addIssue({ code: 'custom', path: [...sp, 'designSize'], message: 'Panel 宽高均需至少 8 GUI px' });
    }
    unique(screen.id, [...sp, 'id']);
    if (screen.behaviorMaps !== undefined && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.32.0')) ctx.addIssue({ code: 'custom', path: [...sp, 'behaviorMaps'], message: '共享行为映射需要 Schema 0.32.0' });
    const mapIds = new Set<string>();
    screen.behaviorMaps?.forEach((map, mapIndex) => {
      if (mapIds.has(map.id)) ctx.addIssue({ code: 'custom', path: [...sp, 'behaviorMaps', mapIndex, 'id'], message: '同一 Screen 的共享映射 ID 不能重复' });
      mapIds.add(map.id);
      const optionIds = new Set<string>();
      map.mappings.forEach((mapping, mappingIndex) => {
        if (optionIds.has(mapping.optionId)) ctx.addIssue({ code: 'custom', path: [...sp, 'behaviorMaps', mapIndex, 'mappings', mappingIndex, 'optionId'], message: '共享映射中的 optionId 不能重复' });
        optionIds.add(mapping.optionId);
        if (!screen.nodes.some(node => isSelectionNode(node) && node.props.options.some(option => option.id === mapping.optionId))) ctx.addIssue({ code: 'custom', path: [...sp, 'behaviorMaps', mapIndex, 'mappings', mappingIndex, 'optionId'], message: '共享映射 optionId 必须存在于当前 Screen 的选择控件中' });
        if (!screen.nodes.some(node => isStatusNode(node) && node.props.statuses.some(status => status.statusId === mapping.statusId))) ctx.addIssue({ code: 'custom', path: [...sp, 'behaviorMaps', mapIndex, 'mappings', mappingIndex, 'statusId'], message: '共享映射 statusId 必须存在于当前 Screen 的 Status Indicator 中' });
      });
    });
    screen.nodes.forEach((node, ni) => {
      const np = [...sp, 'nodes', ni];
      unique(node.id, [...np, 'id']);
      if (node.parentContainerId !== undefined && !['0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: '容器父子关系需要 Schema 0.26.0 或更高版本' });
      if (node.type === 'minecraft:scrollable-panel') {
        if (!['0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Scrollable Panel 需要 Schema 0.26.0 或更高版本' });
        const viewport = contentViewport(node);
        if (viewport.w < 1 || viewport.h < 1) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'padding'], message: 'padding 与 viewport 尺寸必须留下正数内容区域' });
        if (viewport.h > 0 && node.props.contentHeight < viewport.h) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'contentHeight'], message: '内容高度不能小于容器的可视内容高度' });
      }
      if (isCollapsiblePanelNode(node)) {
        if (!['0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Collapsible Panel 需要 Schema 0.27.0 或更高支持版本' });
        if (node.props.headerHeight >= node.bounds.h) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'headerHeight'], message: '展开高度必须大于标题栏高度' });
      }
      if (isTreeViewNode(node)) {
        if (!['0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Tree View 需要 Schema 0.28.0' });
        const error = treeViewError(node.props);
        if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
      }
      if (node.parentContainerId !== undefined) {
        const parent = screen.nodes.find(candidate => candidate.id === node.parentContainerId);
        if (!parent || !isContainerNode(parent)) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: '父节点必须引用同 Screen 内的容器' });
        else {
          const crossContainer = isContainerNode(node) && node.type !== parent.type;
          if (isContainerNode(node) && !crossContainer) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: '首版只允许 Scrollable Panel 与 Collapsible Panel 交叉嵌套' });
          if (!isContainerNode(node) && !isScrollableChildType(node.type)) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: `${node.type} 暂不支持作为容器子节点` });
          const viewport = isScrollablePanelNode(parent) ? contentViewport(parent) : containerLocalViewport(parent);
          const content = isScrollablePanelNode(parent) ? contentSize(parent).height : Math.max(0, parent.bounds.h - parent.props.headerHeight);
          if (node.bounds.x + node.bounds.w > viewport.w || node.bounds.y + node.bounds.h > content) ctx.addIssue({ code: 'custom', path: [...np, 'bounds'], message: '子节点必须完整位于容器内容坐标范围内' });
          if (isContainerNode(node) && containerDepth(node, screen.nodes) > 1) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: '首版每个容器分支最多包含两个容器节点' });
        }
      }
      if (isSelectionNode(node)) {
        if (!['0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: '选择控件需要 Schema 0.18.0' });
        const error = selectionError(node.props); if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
        if (node.type === 'minecraft:radio-group' && (node.props.orientation === 'vertical' ? node.bounds.h : node.bounds.w) < node.props.options.length * 20) ctx.addIssue({ code: 'custom', path: [...np, 'bounds'], message: '单选组每个选项至少需要20px布局空间' });
      }
      if (isTreeViewNode(node)) {
        if (!['0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Tree View 需要 Schema 0.28.0' });
        const error = treeViewError(node.props); if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
      }
      if (isProgressNode(node)) {
        if (!['0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Progress Bar 需要 Schema 0.19.0' });
        const error = progressError(node.props); if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
      }
      if (isImageNode(node)) {
        if (!['0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Image / Sprite 需要 Schema 0.22.0' });
        const error = imageError(node); if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
        if ((node.props.kind === 'texture' && node.source.member !== 'blit') || (node.props.kind === 'sprite' && node.source.member !== 'blitSprite')) ctx.addIssue({ code: 'custom', path: [...np, 'source', 'member'], message: 'Image 绘制成员必须与 Texture/Sprite 类型一致' });
      }
      if (isStatusNode(node)) {
        if (!['0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Status Indicator 需要 Schema 0.21.0' });
          if (!['0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion) && node.props.statuses.some(status => status.text?.kind === 'translate')) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'statuses'], message: 'Status Translation Key 需要 Schema 0.22.0' });
        const error = statusError(node.props); if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
      }
      if (node.type === 'minecraft:numeric-input' || node.type === 'minecraft:slider') {
        if (!['0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: '数值控件需要 Schema 0.16.0' });
        const error = numericError(node.props);
        if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
      }
      if (node.type === 'minecraft:multi-line-text-widget') {
        if (!['0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'MultiLineTextWidget 需要 schema 0.15.0' });
        if (node.bounds.w !== node.props.maxWidth || node.bounds.h !== node.props.maxRows * 9) ctx.addIssue({ code: 'custom', path: [...np, 'bounds'], message: '多行文本预留区必须等于 maxWidth × (maxRows × 9)，不是原生测量尺寸' });
        const text = node.props.text.kind === 'literal' ? node.props.text.value : node.props.text.fallback;
        if (text.length > 4096) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'text'], message: '多行文本最多 4096 UTF-16 单元' });
      }
      if (node.type === 'minecraft:fitting-multi-line-text-widget') {
        if (!['0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'ReadOnlyScrollText 需要 Schema 0.23.0 或更高版本' });
        if (node.props.textShadow !== undefined && !['0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'textShadow'], message: '滚动文字阴影选项需要 Schema 0.24.0 或更高版本' });
        if (node.bounds.w < 9) ctx.addIssue({ code: 'custom', path: [...np, 'bounds', 'w'], message: '只读滚动文本区宽度必须至少 9px，以保留正数原生内宽' });
        const value = node.props.text.kind === 'literal' ? node.props.text.value : node.props.text.fallback;
        if (value.length > 4096) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'text'], message: '只读滚动文本最多 4096 UTF-16 单元' });
      }
      if (node.type === 'minecraft:creative-tab' && (node.props.tabMode !== undefined || node.props.navigationGroupId !== undefined || node.props.navigationTabId !== undefined)) {
        if (!['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'tabMode'], message: 'Screen 导航标签需要 schema 0.14.0' });
        if (node.props.tabMode !== 'screen-navigation' || !node.props.navigationGroupId || !node.props.navigationTabId || node.props.groupId !== undefined || node.props.contentIds !== undefined) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: 'Screen 导航模式必须引用项目级组和标签 ID，且不能携带 H2-B 内容组字段' });
        const group = navigationGroups.find(item => item.id === node.props.navigationGroupId);
        if (!group || !group.tabs.some(tab => tab.id === node.props.navigationTabId)) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'navigationGroupId'], message: 'CreativeTab 导航组或标签不存在' });
        const identity = `${screen.id}:${node.props.navigationGroupId}:${node.props.navigationTabId}`;
        if (screenNavigationInstances.has(identity)) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: '同一 Screen 内导航组的标签实例不能重复' });
        screenNavigationInstances.add(identity);
      }
      if (node.type === 'minecraft:creative-tab' && (!['0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion) || node.bounds.w !== 26 || node.bounds.h !== 32)) ctx.addIssue({ code: 'custom', path: np, message: 'CreativeTab 需要 schema 0.10.0 和固定 26×32 尺寸' });
      if ((node.type === 'minecraft:checkbox' || node.type === 'minecraft:cycle-button') && !['0.4.0', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) {
        ctx.addIssue({ code: 'custom', path: [...np, 'type'], message: '此组件需要 schema 0.4.0' });
      }
      if (!['0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion) && node.type !== 'minecraft:scrollable-panel' && ((node.type !== 'minecraft:fill' && node.type !== 'minecraft:image' && node.type !== 'minecraft:string-widget' && node.type !== 'minecraft:multi-line-text-widget' && 'color' in node.props && node.props.color !== undefined) || ((node.type === 'minecraft:multi-line-text-widget' || node.type === 'minecraft:slider') && !node.props.textShadow))) ctx.addIssue({ code: 'custom', path: np, message: '自定义文字颜色/多行与滑块阴影选项需要 Schema 0.17.0' });
      if (node.type !== 'minecraft:fill' && node.type !== 'minecraft:image' && node.type !== 'minecraft:creative-tab' && node.type !== 'minecraft:fitting-multi-line-text-widget' && node.type !== 'minecraft:scrollable-panel' && 'textShadow' in node.props && node.props.textShadow !== undefined && !['0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) {
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
      if (b.w < spec.min.w || b.h < spec.min.h || (node.parentContainerId === undefined && (b.x + b.w > screen.designSize.width || b.y + b.h > screen.designSize.height))) {
        ctx.addIssue({ code: 'custom', path: [...np, 'bounds'], message: node.parentContainerId === undefined ? '尺寸小于组件下限或超出设计区' : '子节点尺寸小于组件下限' });
      }
      if (node.type === 'minecraft:edit-box' && node.props.value.length > node.props.maxLength) {
        ctx.addIssue({ code: 'custom', path: [...np, 'props', 'value'], message: '输入值超过 maxLength（UTF-16）' });
      }
      for (const key of Object.keys(node.events)) {
        if (isSelectionNode(node) || isTreeViewNode(node) || node.type === 'minecraft:numeric-input' || node.type === 'minecraft:slider' || isStatusNode(node)) continue;
        ctx.addIssue({ code: 'custom', path: [...np, 'events', key], message: '节点 events 暂不支持引用；请使用 F0 规则' });
      }
    });
    const ownership = new Map<string, string>(), groups = new Map<string, number>();
    screen.nodes.forEach((node, index) => {
      if (node.type !== 'minecraft:creative-tab') return;
      const { groupId, contentIds } = node.props, path = [...sp, 'nodes', index, 'props'];
      if ((groupId !== undefined || contentIds !== undefined) && !['0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: '标签组需要 schema 0.11.0' });
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
    if (screen.screenTargets !== undefined && !['0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...sp, 'screenTargets'], message: 'Screen 目标声明需要 schema 0.7.0' });
    screen.screenTargets?.forEach((target, index) => { unique(target.id, [...sp, 'screenTargets', index, 'id']); if (target.boundScreenId !== undefined && (!['0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion) || !doc.screens.some(item => item.id === target.boundScreenId))) ctx.addIssue({ code: 'custom', path: [...sp, 'screenTargets', index, 'boundScreenId'], message: '绑定需要 0.12.0 且必须指向真实 Screen' }); });
    screen.behaviors.forEach((rule, index) => {
      const path = [...sp, 'behaviors', index]; unique(rule.id, [...path, 'id']);
      if (!['0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: '行为规则需要 schema 0.6.0' });
      if ('actions' in rule && !['0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: '有序动作需要 schema 0.8.0' });
      if ((rule.event.type === 'rectangle-click' || actionsOf(rule).some(a => a.type === 'open_screen')) && !['0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: 'F1 行为需要 schema 0.7.0' });
      if ((rule.event.type === 'slider-change' || actionsOf(rule).some(a => a.type === 'set-progress-value')) && !['0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: 'Slider → Progress Bar 联动需要 Schema 0.29.0 或更高的兼容版本' });
      if ((rule.event.type === 'selection-change' || actionsOf(rule).some(a => a.type === 'set-status')) && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.30.0')) ctx.addIssue({ code: 'custom', path, message: '选择控件 → Status Indicator 联动需要 Schema 0.30.0 或更高版本' });
      if (actionsOf(rule).some(a => a.type === 'if') && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.33.0')) ctx.addIssue({ code: 'custom', path, message: 'Blockly 有限条件动作需要 Schema 0.33.0 或更高版本' });
      const source = screen.nodes.find(n => n.id === rule.event.sourceId);
      const sourceIds = sourcesOf(rule), allSources = sourceIds.map(sourceId => screen.nodes.find(node => node.id === sourceId));
      const bindings = eventBindingsOf(rule);
      const selectionSources = bindings.filter(binding => binding.type === 'selection-change').map(binding => screen.nodes.find(node => node.id === binding.sourceId));
      if (rule.eventBindings) {
        if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.38.0')) ctx.addIssue({ code:'custom', path, message:'显式事件绑定需要 Schema 0.38.0' });
        if (rule.event.type !== 'selection-change' && rule.event.type !== 'slider-change') ctx.addIssue({ code:'custom', path:[...path,'event'], message:'显式事件绑定仅支持选择与滑条事件' });
        if (rule.event.type === 'selection-change' && rule.event.additionalSourceIds) ctx.addIssue({ code:'custom', path:[...path,'event'], message:'显式事件绑定不能与旧多来源字段并用' });
        if (rule.eventBindings[0].type !== rule.event.type || rule.eventBindings[0].sourceId !== rule.event.sourceId) ctx.addIssue({ code:'custom', path:[...path,'eventBindings',0], message:'首个绑定必须与事件入口一致' });
        const keys = rule.eventBindings.map(binding => `${binding.type}:${binding.sourceId}`);
        if (new Set(keys).size !== keys.length) ctx.addIssue({ code:'custom', path:[...path,'eventBindings'], message:'事件绑定不能重复' });
        rule.eventBindings.forEach((binding, i) => {
          const node = screen.nodes.find(candidate => candidate.id === binding.sourceId);
          if (!node || (binding.type === 'selection-change' ? !isSelectionNode(node) : node.type !== 'minecraft:slider')) ctx.addIssue({ code:'custom', path:[...path,'eventBindings',i,'sourceId'], message:'事件绑定来源必须是同 Screen 的兼容控件' });
        });
      }
      if (rule.event.type === 'selection-change' && rule.event.additionalSourceIds) {
      if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.31.0')) ctx.addIssue({ code: 'custom', path, message: '多来源共享选择规则需要 Schema 0.31.0' });
        if (new Set(legacySourcesOf(rule)).size !== legacySourcesOf(rule).length) ctx.addIssue({ code: 'custom', path: [...path, 'event'], message: '事件来源 ID 不能重复' });
        if (allSources.some(node => !node || !isSelectionNode(node))) ctx.addIssue({ code: 'custom', path: [...path, 'event'], message: '每个来源必须是同 Screen 的 Radio Group 或 Dropdown' });
      }
      const required = rule.event.type === 'button-click' ? 'minecraft:button' : rule.event.type === 'checkbox-change' ? 'minecraft:checkbox' : rule.event.type === 'slider-change' ? 'minecraft:slider' : rule.event.type === 'selection-change' ? 'selection' : 'minecraft:fill';
      if (!source || (required === 'selection' ? !isSelectionNode(source) : source.type !== required)) ctx.addIssue({ code: 'custom', path: [...path, 'event', 'sourceId'], message: '事件来源不存在或类型不匹配' });
      const topActions = actionsOf(rule), leafActions = topActions.flatMap(behaviorLeafActions);
      const sliderStatus = rule.event.type === 'slider-change' && leafActions.some(action => action.type === 'set-status');
      if (sliderStatus && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.37.0')) ctx.addIssue({ code:'custom',path,message:'Slider 状态赋值需要 Schema 0.37.0' });
      if (bindings.some(binding => binding.type === 'slider-change') ? leafActions.some(action => action.type !== 'set-progress-value' && !(action.type === 'set-status' && 'statusId' in action)) : leafActions.some(action => action.type === 'set-progress-value')) ctx.addIssue({ code:'custom',path,message:'Slider 仅能搭配进度赋值与直接状态赋值' });
      if (bindings.some(binding => binding.type === 'selection-change') ? leafActions.some(action => action.type !== 'set-status') : bindings.some(binding => binding.type !== 'slider-change') && leafActions.some(action => action.type === 'set-status')) ctx.addIssue({code:'custom',path,message:'状态赋值需要 selection-change 或 slider-change 事件'});
      topActions.forEach((action, actionIndex) => {
        if (action.type !== 'if') return;
        const condition = action.condition, conditionPath = [...path, 'actions', actionIndex, 'condition'];
        const check = (node: BehaviorCondition, nodePath: (string | number)[]) => {
          if (node.type === 'and' || node.type === 'or' || node.type === 'not') {
            if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.36.0')) ctx.addIssue({ code: 'custom', path: nodePath, message: '布尔组合条件需要 Schema 0.36.0' });
            if (node.type === 'not') check(node.condition, [...nodePath, 'condition']);
            else node.conditions.forEach((child, i) => check(child, [...nodePath, 'conditions', i]));
            return;
          }
          if (node.type === 'compare' && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.35.0')) ctx.addIssue({ code: 'custom', path: nodePath, message: '类型化 compare 条件需要 Schema 0.35.0' });
          const operands = node.type === 'compare' ? [node.left,node.right] : [];
          const reads = operands.filter(operand => operand.type === 'read-control-value');
          if (reads.length && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.37.0')) ctx.addIssue({code:'custom',path:nodePath,message:'控件运行值读取需要 Schema 0.37.0'});
          for (const read of reads) { const target = screen.nodes.find(candidate => candidate.id === read.nodeId); if (!target || (node.type === 'compare' && (node.valueType === 'OptionId' ? !isSelectionNode(target) : target.type !== 'minecraft:slider'))) ctx.addIssue({code:'custom',path:nodePath,message:'读取目标必须是同 Screen 的兼容控件'}); }
          const expectedEvent = node.type === 'event-option' || node.valueType === 'OptionId' ? 'selection-change' : 'slider-change';
          if ((node.type === 'event-option' || operands.some(operand => operand.type === 'event-value')) && bindings.some(binding => binding.type !== expectedEvent)) ctx.addIssue({ code:'custom',path:nodePath,message:`${node.type} 条件需要所有触发路径均为 ${expectedEvent} 事件` });
          const optionIds = node.type === 'event-option' ? [node.optionId] : node.valueType === 'OptionId' ? operands.flatMap(value => value.type === 'constant' && typeof value.value === 'string' ? [value.value] : []) : [];
          const optionOwners = reads.length ? [...reads.map(read => screen.nodes.find(candidate => candidate.id === read.nodeId)), ...(operands.some(operand => operand.type === 'event-value') ? selectionSources : [])] : selectionSources;
          for (const optionId of optionIds) if (optionOwners.some(owner => !owner || !isSelectionNode(owner) || !owner.props.options.some(option => option.id === optionId))) ctx.addIssue({code:'custom',path:nodePath,message:'条件 optionId 必须存在于每个来源控件或读取控件中'});
        };
        check(condition, conditionPath);
      });
      const validateStatusAction = (action: SetStatusAction, actionPath: (string | number)[]) => {
        const target = screen.nodes.find(node => node.id === action.targetId);
        if (!target || !isStatusNode(target)) ctx.addIssue({ code: 'custom', path: [...actionPath, 'targetId'], message: '动作目标不存在或类型不匹配' });
        if ('statusId' in action) {
          if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.34.0')) ctx.addIssue({ code: 'custom', path: [...actionPath, 'statusId'], message: '常量状态赋值需要 Schema 0.34.0' });
          if (!target || !isStatusNode(target) || !target.props.statuses.some(status => status.statusId === action.statusId)) ctx.addIssue({ code: 'custom', path: [...actionPath, 'statusId'], message: 'statusId 必须引用同 Screen 目标指示器的有效状态' });
        }
        if ('mapRef' in action) {
          if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.32.0')) ctx.addIssue({ code: 'custom', path: [...actionPath, 'mapRef'], message: '共享映射引用需要 Schema 0.32.0' });
          if (!screen.behaviorMaps?.some(map => map.id === action.mapRef)) ctx.addIssue({ code: 'custom', path: [...actionPath, 'mapRef'], message: `共享映射 ${action.mapRef} 不存在于当前 Screen` });
        }
        const mappingIds = new Set<string>();
        statusMappingsOf(screen, action).forEach((mapping, mappingIndex) => {
          const mappingPath = [...actionPath, 'optionMappings', mappingIndex];
          if (mappingIds.has(mapping.optionId)) ctx.addIssue({ code: 'custom', path: [...mappingPath, 'optionId'], message: '同一动作的 optionId 映射不能重复' });
          mappingIds.add(mapping.optionId);
          if (allSources.some(node => !node || !isSelectionNode(node) || !node.props.options.some(option => option.id === mapping.optionId))) ctx.addIssue({ code: 'custom', path: [...mappingPath, 'optionId'], message: '映射 optionId 必须引用每个来源控件的有效选项 ID' });
          if (!target || !isStatusNode(target) || !target.props.statuses.some(status => status.statusId === mapping.statusId)) ctx.addIssue({ code: 'custom', path: [...mappingPath, 'statusId'], message: '映射 statusId 必须引用目标控件的有效状态 ID' });
        });
      };
      topActions.forEach((action, actionIndex) => {
        const actionPath = 'actions' in rule ? [...path, 'actions', actionIndex] : [...path, 'action'];
        if (action.type === 'if') {
          for (const [branch, leaves] of [['thenActions', action.thenActions], ['elseActions', action.elseActions]] as const) leaves.forEach((leaf, index) => {
            if (leaf.type === 'set-status') validateStatusAction(leaf, [...actionPath, branch, index]);
            else if (!screen.nodes.some(node => node.id === leaf.targetId && node.type === 'minecraft:progress-bar')) ctx.addIssue({ code: 'custom', path: [...actionPath, branch, index, 'targetId'], message: 'Progress Bar 动作目标不存在或类型不匹配' });
          });
        } else if (action.type === 'set-status') validateStatusAction(action, actionPath);
        else if (action.type === 'open_screen') {
          if (!screen.screenTargets?.some(target => target.id === action.targetScreenId)) ctx.addIssue({ code: 'custom', path: [...actionPath, 'targetScreenId'], message: 'Screen 目标未声明' });
        } else {
          const target = screen.nodes.find(node => node.id === action.targetId);
          if (!target || (action.type === 'set-text' && target.type !== 'minecraft:string-widget') || (action.type === 'set-progress-value' && target.type !== 'minecraft:progress-bar')) ctx.addIssue({ code: 'custom', path: [...actionPath, 'targetId'], message: '动作目标不存在或类型不匹配' });
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
