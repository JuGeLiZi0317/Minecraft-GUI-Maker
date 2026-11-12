import { z } from 'zod';
import { CATALOG, CATALOG_VERSION, TARGET } from './catalog';
import { PANEL_MIN_SIZE, PANEL_STYLE, NATIVE_PANEL_16, NATIVE_PANEL_32 } from './panel';
import { selectionError, isSelectionNode } from './selection';
import { numericError } from './numeric';
import { progressError, isProgressNode } from './progress';
import { isStatusNode, statusError } from './statusIndicator';
import { imageError, isImageNode } from './image';
import { contentSize, contentViewport, isScrollablePanelNode, scrollableChildRejection } from './scrollablePanel';
import { containerDepth, containerLocalViewport, isCollapsiblePanelNode, isContainerNode } from './collapsiblePanel';
import { isTreeViewNode, treeViewError } from './treeView';
import { fillStyleSizeError } from './fillStyle';
import { embeddedAssetError, type EmbeddedImageAsset } from './embeddedImage';
import { supportsTooltip, tooltipError } from './tooltip';
import { isRepeatableListNode, repeatableChildRejection, repeatableListError, repeatableTemplateChildren, repeatableViewport } from './repeatableList';

const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const color = z.string().regex(/^#[A-Fa-f0-9]{8}$/, '需要 #AARRGGBB 格式');
const colorMode = z.enum(['native', 'neoforge']);
export const textSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('literal'), value: z.string(), disabledKey: z.string().min(1).optional() }),
  z.strictObject({ kind: z.literal('translate'), key: z.string().min(1), fallback: z.string() }),
]);
export type TextSpec = z.infer<typeof textSchema>;
export const statusTextSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('literal'), value: z.string(), disabledKey: z.string().min(1).optional() }),
  z.strictObject({ kind: z.literal('translate'), key: z.string().min(1), fallback: z.string().optional() }),
]);
export type StatusTextSpec = z.infer<typeof statusTextSchema>;
export const boundsSchema = z.strictObject({ x: integer, y: integer, w: integer.positive(), h: integer.positive() });
export type Bounds = z.infer<typeof boundsSchema>;
const widgetSource = z.strictObject({ category: z.literal('vanilla-widget'), className: z.string() });
const implementationNotes = z.string().max(4096).optional();
const base = { id, alias: z.string().min(1).max(128).refine(value => value.trim().length > 0, '控件别名不能为空').optional(), bounds: boundsSchema, parentContainerId: id.optional(), implementationNotes };
const widgetState = z.strictObject({ visible: z.boolean(), enabled: z.boolean() });
const emptyEvents = z.strictObject({});
const embeddedImageSchema = z.strictObject({ id, name: z.string().min(1).max(256), mime: z.literal('image/png'), width: integer.positive().max(8192), height: integer.positive().max(8192), data: z.string().min(1).max(4_200_000).regex(/^[A-Za-z0-9+/]+={0,2}$/, '嵌入式图像必须是 base64') });
const imageSource = z.union([
  z.strictObject({ category: z.literal('vanilla-draw'), className: z.literal('net.minecraft.client.gui.GuiGraphics'), member: z.enum(['blit', 'blitSprite']) }),
  z.strictObject({ category: z.literal('custom-draw'), className: z.literal('gui-maker:embedded-image'), member: z.literal('blit') }),
]);
const imageProps = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('texture'), resourceId: z.string().min(1).max(512), textureWidth: integer.positive().max(8192), textureHeight: integer.positive().max(8192), uv: z.strictObject({ x: integer, y: integer, width: integer.positive(), height: integer.positive() }), tooltip: textSchema.optional() }),
  z.strictObject({ kind: z.literal('sprite'), spriteId: z.string().min(1).max(256), tooltip: textSchema.optional() }),
  z.strictObject({ kind: z.literal('embedded'), assetId: id, textureWidth: integer.positive().max(8192), textureHeight: integer.positive().max(8192), uv: z.strictObject({ x: integer, y: integer, width: integer.positive(), height: integer.positive() }), tooltip: textSchema.optional() }),
]);
const numericProps = { min: z.number().finite(), max: z.number().finite(), step: z.number().finite(), initialValue: z.number().finite(), numericType: z.enum(['integer', 'decimal']), format: z.strictObject({ decimals: z.number().int().min(0).max(6), unit: z.string().max(32) }), name: textSchema, tooltip: textSchema.optional() };
const selectionProps = { name: textSchema, color, textShadow: z.boolean(), options: z.array(z.strictObject({ id, label: textSchema, disabled: z.boolean() })).min(1).max(100), initialSelectedOptionId: id, tooltip: textSchema.optional() };
const treeItemSchema = z.strictObject({ id, label: textSchema, parentId: id.nullable(), order: integer.max(4095), selectable: z.boolean(), disabled: z.boolean() });
const treeViewPropsSchema = z.strictObject({ name: textSchema, items: z.array(treeItemSchema).min(1).max(256), initialExpandedIds: z.array(id).max(256), initialSelectedItemId: id, tooltip: textSchema.optional() });
export const PROJECT_SCHEMA_VERSIONS = ['0.1.0', '0.2.0', '0.3.0', '0.4.0', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'] as const;
export const CURRENT_PROJECT_SCHEMA_VERSION = PROJECT_SCHEMA_VERSIONS[PROJECT_SCHEMA_VERSIONS.length - 1];
export const nodeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('native_region'), bounds: boundsSchema.refine(value => value.w === 162 && value.h === 76, 'Native Region 固定尺寸为 162×76'),
    source: z.strictObject({ category: z.literal('native-region'), className: z.literal('net.minecraft.world.inventory.Slot') }),
    state: z.strictObject({ visible: z.boolean().refine(value => value, 'Native Region 必须为可见的 Persistent 区域') }), props: z.strictObject({ kind: z.literal('minecraft:player_inventory') }), events: emptyEvents }),
  z.strictObject({ ...base, type: z.literal('minecraft:single_slot'), bounds: boundsSchema.refine(value => value.w === 18 && value.h === 18, 'Single Slot 固定尺寸为 18×18'),
    source: z.strictObject({ category: z.literal('native-region'), className: z.literal('net.minecraft.world.inventory.Slot') }),
    state: z.strictObject({ visible: z.boolean() }), props: z.strictObject({ usage: z.enum(['inventory', 'ghost_selection', 'visual_only']), placeholderItemId: z.string().min(1).max(256).optional() }), events: emptyEvents }),
  z.strictObject({ ...base, type: z.literal('minecraft:scrollable-panel'), source: z.strictObject({ category: z.literal('vanilla-draw'), className: z.literal('net.minecraft.client.gui.GuiGraphics'), member: z.literal('fill') }), state: widgetState,
    props: z.strictObject({ padding: integer.max(16), contentHeight: integer.positive().max(8192), initialScroll: z.literal('top'), backgroundColor: color, borderColor: color, tooltip: textSchema.optional() }), events: emptyEvents }),
  z.strictObject({ ...base, type: z.literal('minecraft:collapsible-panel'), source: z.strictObject({ category: z.literal('vanilla-draw'), className: z.literal('net.minecraft.client.gui.GuiGraphics'), member: z.literal('fill') }), state: widgetState,
    props: z.strictObject({ title: textSchema, headerHeight: integer.min(16).max(40), initialExpanded: z.boolean(), headerColor: color, backgroundColor: color, textColor: color, border: z.boolean(), borderColor: color, tooltip: textSchema.optional() }), events: emptyEvents }),
  z.strictObject({ ...base, type: z.literal('minecraft:repeatable-list'), source: z.strictObject({ category: z.literal('vanilla-draw'), className: z.literal('net.minecraft.client.gui.GuiGraphics'), member: z.literal('fill') }), state: widgetState,
    props: z.strictObject({
      rowHeight: integer.min(9).max(512), rowGap: integer.max(64), padding: integer.max(16),
      templateId: id, dataSource: z.strictObject({ mode: z.literal('external'), bindingKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_.:/-]{0,127}$/, '绑定键须以字母开头，仅允许字母、数字、_ . : / -') }),
      initialScroll: z.literal('top'), backgroundColor: color, borderColor: color, emptyText: textSchema.optional(),
    }), events: emptyEvents }),
  z.strictObject({ ...base, type: z.literal('minecraft:tree-view'), source: z.strictObject({ category: z.literal('vanilla-draw'), className: z.literal('net.minecraft.client.gui.GuiGraphics'), member: z.literal('fill') }), state: widgetState, props: treeViewPropsSchema, events: z.strictObject({ change: z.literal('tree-selection-change') }) }),
  z.strictObject({ ...base, type: z.literal('minecraft:image'), source: imageSource, state: z.strictObject({ visible: z.boolean() }), props: imageProps, events: emptyEvents }),
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
    props: z.strictObject({ color: color.optional(), colorMode: colorMode.optional(), textShadow: z.boolean().optional(), message: textSchema, tooltip: textSchema.optional() }),
    events: z.strictObject({ press: id.optional() }),
  }),
  z.strictObject({ ...base, type: z.literal('minecraft:edit-box'), source: widgetSource, state: widgetState,
    props: z.strictObject({ color: color.optional(), textShadow: z.boolean().optional(), narration: textSchema, value: z.string(), maxLength: integer, hint: textSchema.optional(), bordered: z.boolean(), editable: z.boolean(), tooltip: textSchema.optional() }),
    events: z.strictObject({ valueChanged: id.optional() }),
  }),
  z.strictObject({ ...base, type: z.literal('minecraft:string-widget'), source: widgetSource,
    state: z.strictObject({ visible: z.boolean() }),
    props: z.strictObject({ textShadow: z.boolean().optional(), text: textSchema, color, align: z.enum(['left', 'center', 'right']) }), events: emptyEvents,
  }),
  z.strictObject({ ...base, type: z.literal('minecraft:fill'),
    source: z.strictObject({ category: z.literal('vanilla-draw'), className: z.string(), member: z.literal('fill') }),
    state: z.strictObject({ visible: z.boolean() }), props: z.strictObject({ color, stylePreset: z.enum(['plain', 'framed', 'bevel_raised', 'bevel_inset']).optional(), borderColor: color.optional(), highlightColor: color.optional(), shadowColor: color.optional(), edgeTopColor: color.optional(), edgeRightColor: color.optional(), edgeBottomColor: color.optional(), edgeLeftColor: color.optional(), edgeTopWidth: integer.max(64).optional(), edgeRightWidth: integer.max(64).optional(), edgeBottomWidth: integer.max(64).optional(), edgeLeftWidth: integer.max(64).optional() }), events: emptyEvents,
  }),
  z.strictObject({ ...base, type: z.literal('minecraft:checkbox'), source: widgetSource, state: widgetState,
    props: z.strictObject({ color: color.optional(), textShadow: z.boolean().optional(), message: textSchema, selected: z.boolean(), maxWidth: integer.positive(), tooltip: textSchema.optional() }), events: emptyEvents,
  }),
  z.strictObject({ ...base, type: z.literal('minecraft:cycle-button'), source: widgetSource, state: widgetState,
    props: z.strictObject({ color: color.optional(), colorMode: colorMode.optional(), textShadow: z.boolean().optional(), name: textSchema, options: z.array(z.strictObject({ id, text: textSchema })).min(1).max(100), initialOptionId: id, displayFormat: z.enum(['value-only', 'name-and-value']), tooltip: textSchema.optional() }), events: emptyEvents,
  }),
]);
export type GuiNode = z.infer<typeof nodeSchema>;
export const F2_EVENT_TYPES = ['button-click', 'checkbox-change', 'rectangle-click', 'slider-change', 'selection-change'] as const;
export const F2_ACTION_TYPES = ['set-text', 'set-visible', 'open_screen', 'set-progress-value', 'set-status', 'set-exclusive-visible', 'if', 'switch'] as const;
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
const setVisibleActionSchema = z.strictObject({ type: z.literal('set-visible'), targetId: id, visible: z.boolean() });
const setTextActionSchema = z.strictObject({ type: z.literal('set-text'), targetId: id, text: z.string().max(4096) });
const optionValueSchema = z.union([z.strictObject({ type: z.literal('event-value'), field: z.literal('optionId') }), z.strictObject({ type: z.literal('constant'), value: id }), z.strictObject({ type: z.literal('read-control-value'), nodeId: id })]);
const numberValueSchema = z.union([z.strictObject({ type: z.literal('event-value'), field: z.literal('value') }), z.strictObject({ type: z.literal('constant'), value: z.number().finite() }), z.strictObject({ type: z.literal('read-control-value'), nodeId: id })]);
const lookupExpressionSchema: z.ZodType<LookupExpressionSpec> = z.strictObject({ type: z.literal('lookup'), mappingId: id, input: optionValueSchema });
const textValueExpressionSchema = z.union([lookupExpressionSchema, textSchema]);
/** Schema 0.47.0 variant: the same action fed by a typed value; the legacy `text` field stays untouched. */
const setTextValueActionSchema = z.strictObject({ type: z.literal('set-text'), targetId: id, value: textValueExpressionSchema });
export type TextValueExpression = TextSpec | LookupExpressionSpec;
/** Narrowing helper that keeps the literal/translate/lookup distinction explicit. */
export const isLookupExpression = (value: TextValueExpression | undefined): value is LookupExpressionSpec => !!value && 'type' in value && value.type === 'lookup';
/** Screen-local named mappings: a pure typed table, never a runtime variable. */
export const textMappingSchema = z.strictObject({
  id,
  name: z.string().min(1).max(128).refine(value => value.trim().length > 0, '映射名称不能为空'),
  inputType: z.literal('OptionId'),
  outputType: z.literal('Text'),
  entries: z.array(z.strictObject({ key: id, value: textSchema })).min(1).max(32),
  fallback: textSchema,
});
export type NamedTextMappingSpec = z.infer<typeof textMappingSchema>;
export type BehaviorLeafTextAction = z.infer<typeof setTextActionSchema> | z.infer<typeof setTextValueActionSchema>;
export const MAX_TEXT_MAPPINGS = 32;;
/** One declarative mapping table per action; each entry owns exactly one target. */
export const MAX_EXCLUSIVE_MAPPINGS = 32;
export const EXCLUSIVE_VISIBILITY_FALLBACKS = ['hide-all', 'keep-current'] as const;
const exclusiveMappingSchema = z.strictObject({ optionId: id, targetId: id });
export type LookupExpressionSpec = { type: 'lookup'; mappingId: string; input: { type: 'event-value'; field: 'optionId' } | { type: 'constant'; value: string } | { type: 'read-control-value'; nodeId: string } };
const exclusiveVisibleActionSchema = z.strictObject({
  type: z.literal('set-exclusive-visible'),
  value: optionValueSchema,
  mapping: z.array(exclusiveMappingSchema).min(1).max(MAX_EXCLUSIVE_MAPPINGS),
  fallback: z.enum(EXCLUSIVE_VISIBILITY_FALLBACKS),
});
const behaviorLeafConditionSchema = z.union([
  z.strictObject({ type: z.literal('event-option'), operator: z.enum(['equals', 'not-equals']), optionId: id }),
  z.discriminatedUnion('valueType', [
    z.strictObject({ type: z.literal('compare'), valueType: z.literal('OptionId'), operator: z.enum(['equals', 'not-equals']),
      left: optionValueSchema, right: optionValueSchema }),
    z.strictObject({ type: z.literal('compare'), valueType: z.literal('Number'), operator: z.enum(['equals', 'not-equals', 'greater-than', 'less-than', 'greater-or-equal', 'less-or-equal']),
      left: numberValueSchema, right: numberValueSchema }),
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
export const MAX_CONTROL_BRANCHES = 16, MAX_BRANCH_ACTIONS = 50, MAX_RULE_BRANCH_ACTIONS = 200;
const branchLeafSchema = z.union([setStatusActionSchema, setProgressActionSchema, setVisibleActionSchema, setTextActionSchema, setTextValueActionSchema]);
const branchActionsSchema = z.array(branchLeafSchema).min(1).max(MAX_BRANCH_ACTIONS);
const fallbackActionsSchema = z.array(branchLeafSchema).max(MAX_BRANCH_ACTIONS);
const conditionalActionSchema = z.strictObject({
  type: z.literal('if'), condition: behaviorConditionSchema,
  thenActions: branchActionsSchema,
  elseIf: z.array(z.strictObject({ condition: behaviorConditionSchema, actions: branchActionsSchema })).max(MAX_CONTROL_BRANCHES - 1).optional(),
  elseActions: fallbackActionsSchema,
});
const switchActionSchema = z.discriminatedUnion('valueType', [
  z.strictObject({ type: z.literal('switch'), valueType: z.literal('OptionId'), value: optionValueSchema,
    cases: z.array(z.strictObject({ value: id, actions: branchActionsSchema })).min(1).max(MAX_CONTROL_BRANCHES), defaultActions: fallbackActionsSchema.optional() }),
  z.strictObject({ type: z.literal('switch'), valueType: z.literal('Number'), value: numberValueSchema,
    cases: z.array(z.strictObject({ value: z.number().finite(), actions: branchActionsSchema })).min(1).max(MAX_CONTROL_BRANCHES), defaultActions: fallbackActionsSchema.optional() }),
]).superRefine((action, ctx) => {
  const seen = new Set<string | number>();
  action.cases.forEach((branch, index) => {
    if (seen.has(branch.value)) ctx.addIssue({ code: 'custom', path: ['cases', index, 'value'], message: 'Case 常量不能重复' });
    seen.add(branch.value);
  });
});
export const behaviorActionSchema = z.union([
    setTextActionSchema,
    setTextValueActionSchema,
    setVisibleActionSchema,
    z.strictObject({ type: z.literal('open_screen'), targetScreenId: id }),
    setProgressActionSchema,
    setStatusActionSchema,
    exclusiveVisibleActionSchema,
    conditionalActionSchema,
    switchActionSchema,
]);
export const behaviorSchema = z.union([
  z.strictObject({ id, event: behaviorEventSchema, eventBindings: z.array(explicitEventBindingSchema).min(1).max(100).optional(), action: behaviorActionSchema }),
  z.strictObject({ id, event: behaviorEventSchema, eventBindings: z.array(explicitEventBindingSchema).min(1).max(100).optional(), actions: z.array(behaviorActionSchema).min(1).max(50) }),
]);
export type Behavior = z.infer<typeof behaviorSchema>;
export type BehaviorAction = z.infer<typeof behaviorActionSchema>;
export type SetStatusAction = z.infer<typeof setStatusActionSchema>;
export type ConditionalBehaviorAction = z.infer<typeof conditionalActionSchema>;
export type SwitchBehaviorAction = z.infer<typeof switchActionSchema>;
export type ExclusiveVisibleAction = z.infer<typeof exclusiveVisibleActionSchema>;
export type BranchLeafAction = z.infer<typeof branchLeafSchema>;
export type BehaviorValue = z.infer<typeof optionValueSchema> | z.infer<typeof numberValueSchema>;
export const isBranchAction = (action: BehaviorAction): action is ConditionalBehaviorAction | SwitchBehaviorAction => action.type === 'if' || action.type === 'switch';
export function behaviorBranches(action: ConditionalBehaviorAction | SwitchBehaviorAction): { path: (string | number)[]; actions: BranchLeafAction[] }[] {
  if (action.type === 'switch') return [...action.cases.map((branch, i) => ({ path: ['cases', i, 'actions'], actions: branch.actions })), ...(action.defaultActions ? [{ path: ['defaultActions'], actions: action.defaultActions }] : [])];
  return [{ path: ['thenActions'], actions: action.thenActions }, ...(action.elseIf ?? []).map((branch, i) => ({ path: ['elseIf', i, 'actions'], actions: branch.actions })), { path: ['elseActions'], actions: action.elseActions }];
}
export function behaviorConditions(action: BehaviorAction): { path: (string | number)[]; condition: BehaviorCondition }[] {
  return action.type === 'if' ? [{ path: ['condition'], condition: action.condition }, ...(action.elseIf ?? []).map((branch, i) => ({ path: ['elseIf', i, 'condition'], condition: branch.condition }))] : [];
}
export const behaviorReadDependencies = (action: BehaviorAction): { nodeId: string; valueType: 'OptionId' | 'Number'; path: (string | number)[] }[] => {
  if (action.type === 'switch' && action.value.type === 'read-control-value') return [{ nodeId: action.value.nodeId, valueType: action.valueType, path: ['value'] }];
  if (action.type === 'set-exclusive-visible' && action.value.type === 'read-control-value') return [{ nodeId: action.value.nodeId, valueType: 'OptionId', path: ['value'] }];
  if (action.type === 'set-text' && 'value' in action && isLookupExpression(action.value) && action.value.input.type === 'read-control-value') return [{ nodeId: action.value.input.nodeId, valueType: 'OptionId', path: ['value', 'input'] }];
  return behaviorConditions(action).flatMap(({ condition, path }) => conditionLeaves(condition).flatMap(leaf => leaf.type === 'compare' ? [leaf.left, leaf.right].flatMap(value => value.type === 'read-control-value' ? [{ nodeId: value.nodeId, valueType: leaf.valueType, path }] : []) : []));
};
export const behaviorLeafActions = (action: BehaviorAction): Exclude<BehaviorAction, { type: 'if' | 'switch' }>[] => isBranchAction(action) ? behaviorBranches(action).flatMap(branch => branch.actions) : [action];
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
export const bakeGroupSchema = z.strictObject({ id, name: z.string().min(1).max(128), memberIds: z.array(id).min(1).max(1000), enabled: z.boolean() });
export type BakeGroup = z.infer<typeof bakeGroupSchema>;
export const LOCALE_CODE = /^[a-z]{2,3}(_[a-z]{2,4})?$/;
export const MOD_ID = /^[a-z][a-z0-9_]{1,63}$/;
export const MAX_LOCALIZATION_ENTRIES = 5000;
export const projectLocalizationSchema = z.strictObject({
  sourceLocale: z.string().regex(LOCALE_CODE),
  includeInZip: z.boolean(),
  locales: z.array(z.strictObject({
    locale: z.string().regex(LOCALE_CODE),
    entries: z.array(z.strictObject({ key: z.string().min(1).max(512), text: z.string().max(4096) })).max(MAX_LOCALIZATION_ENTRIES),
  })).min(1).max(32),
});
export type ProjectLocalization = z.infer<typeof projectLocalizationSchema>;

// F0 allows only the explicit rule subset; variables, assets and node event references remain unsupported.
export const projectSchema = z.strictObject({
  format: z.literal('minecraft-gui-maker'), schemaVersion: z.enum(PROJECT_SCHEMA_VERSIONS),
  catalogVersion: z.literal(CATALOG_VERSION),
  target: z.strictObject({ edition: z.literal(TARGET.edition), minecraft: z.literal(TARGET.minecraft),
    loader: z.strictObject({ id: z.literal('neoforge'), version: z.literal(TARGET.loader.version) }), java: z.literal(21) }),
  project: z.strictObject({ id, name: z.string().min(1), revision: integer, localizationNamespace: z.string().optional(), modId: z.string().regex(MOD_ID).optional() }),
  localization: projectLocalizationSchema.optional(),
  runtimePolicy: z.strictObject({ escapeAction: z.literal('close'), nativeBackground: z.literal('default') }).optional(),
  entryScreenId: id.optional(),
  screenTabGroups: z.array(screenTabGroupSchema).max(100).optional(),
  screens: z.array(z.strictObject({ id, title: textSchema, base: z.literal('screen'), implementationNotes,
    designSize: z.strictObject({ width: integer.positive(), height: integer.positive(), unit: z.literal('gui-px') }),
    placement: z.literal('center'), background: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('none') }), z.strictObject({ kind: z.literal('panel'), style: z.enum([PANEL_STYLE, NATIVE_PANEL_16, NATIVE_PANEL_32]), bounds: boundsSchema.optional() })]),
    nodes: z.array(nodeSchema).max(1000), variables: z.array(z.never()).max(0), behaviors: z.array(behaviorSchema).max(200), screenTargets: z.array(screenTargetSchema).max(100).optional(), behaviorMaps: z.array(behaviorMapSchema).max(100).optional(), textMappings: z.array(textMappingSchema).max(MAX_TEXT_MAPPINGS).optional(), bakeGroups: z.array(bakeGroupSchema).max(100).optional(),
  })).min(1).max(100),
  assets: z.array(embeddedImageSchema).max(32),
  extensions: z.record(z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/), z.json()).optional(),
}).superRefine((doc, ctx) => {
  if ((doc.assets?.length ?? 0) > 0 && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.56.0')) ctx.addIssue({ code: 'custom', path: ['assets'], message: '嵌入式贴图需要 Schema 0.56.0' });
  (doc.assets ?? []).forEach((asset, index) => { const error = embeddedAssetError(asset as EmbeddedImageAsset); if (error) ctx.addIssue({ code: 'custom', path: ['assets', index], message: error }); });
  const totalAssetData = (doc.assets ?? []).reduce((total, asset) => total + asset.data.length, 0);
  if (totalAssetData > 4_200_000) ctx.addIssue({ code: 'custom', path: ['assets'], message: '项目内嵌贴图合计超过 4.2 MB base64 上限（项目 JSON 5 MiB 限制）' });
  if (doc.project.localizationNamespace !== undefined) {
    if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.43.0')) ctx.addIssue({ code: 'custom', path: ['project', 'localizationNamespace'], message: '项目本地化命名空间需要 Schema 0.43.0' });
    if (!/^[a-z0-9_.-]{1,64}$/.test(doc.project.localizationNamespace)) ctx.addIssue({ code: 'custom', path: ['project', 'localizationNamespace'], message: 'Namespace 必须为 1–64 位小写 a-z、0-9、下划线、点或连字符' });
  }
  if (doc.project.modId !== undefined && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.50.0')) ctx.addIssue({ code: 'custom', path: ['project', 'modId'], message: '显式 Mod ID 需要 Schema 0.50.0' });
  if (doc.localization) {
    if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.50.0')) ctx.addIssue({ code: 'custom', path: ['localization'], message: '本地化资源需要 Schema 0.50.0' });
    if (!doc.project.modId) ctx.addIssue({ code: 'custom', path: ['project', 'modId'], message: '生成语言资源前必须显式设置 Mod ID（assets/<modid>/lang 路径）' });
    const locales = new Set<string>();
    doc.localization.locales.forEach((locale, localeIndex) => {
      if (locales.has(locale.locale)) ctx.addIssue({ code: 'custom', path: ['localization', 'locales', localeIndex, 'locale'], message: '语言代码不能重复' });
      locales.add(locale.locale);
      const keys = new Set<string>();
      locale.entries.forEach((entry, entryIndex) => {
        if (keys.has(entry.key)) ctx.addIssue({ code: 'custom', path: ['localization', 'locales', localeIndex, 'entries', entryIndex, 'key'], message: '同一语言内翻译键不能重复' });
        keys.add(entry.key);
      });
    });
    if (!locales.has(doc.localization.sourceLocale)) ctx.addIssue({ code: 'custom', path: ['localization', 'sourceLocale'], message: '源语言必须是已声明的语言之一' });
  }
  if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.43.0')) {
    for (const [screenIndex, screen] of doc.screens.entries()) for (const [nodeIndex, node] of screen.nodes.entries()) {
      const findDisabledKey = (value: unknown): boolean => !!value && typeof value === 'object' && (Array.isArray(value) ? value.some(findDisabledKey) : Object.entries(value).some(([key, child]) => key === 'disabledKey' || findDisabledKey(child)));
      if (findDisabledKey(node.props)) ctx.addIssue({ code: 'custom', path: ['screens', screenIndex, 'nodes', nodeIndex, 'props'], message: '翻译键停用恢复信息需要 Schema 0.43.0' });
    }
  }
  for (const [screenIndex, screen] of doc.screens.entries()) for (const [nodeIndex, node] of screen.nodes.entries()) {
    if (node.alias !== undefined && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.39.0')) ctx.addIssue({ code: 'custom', path: ['screens', screenIndex, 'nodes', nodeIndex, 'alias'], message: '控件别名需要 Schema 0.39.0' });
    if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.53.0')) {
      if (screen.implementationNotes !== undefined) ctx.addIssue({ code: 'custom', path: ['screens', screenIndex, 'implementationNotes'], message: '实现备注需要 Schema 0.53.0' });
      if (node.implementationNotes !== undefined) ctx.addIssue({ code: 'custom', path: ['screens', screenIndex, 'nodes', nodeIndex, 'implementationNotes'], message: '实现备注需要 Schema 0.53.0' });
    }
    if (supportsTooltip(node)) {
      const reason = tooltipError(node.props.tooltip);
      if (reason) ctx.addIssue({ code: 'custom', path: ['screens', screenIndex, 'nodes', nodeIndex, 'props', 'tooltip'], message: reason });
      // Button tooltip existed before 0.49.0; only the newly exposed widget types gate the version.
      if (node.type !== 'minecraft:button' && node.props.tooltip !== undefined && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.49.0')) {
        ctx.addIssue({ code: 'custom', path: ['screens', screenIndex, 'nodes', nodeIndex, 'props', 'tooltip'], message: '控件 Tooltip 需要 Schema 0.49.0' });
      }
    }
  }
  if (doc.runtimePolicy && !['0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: ['runtimePolicy'], message: '运行策略需要 Schema 0.17.0' });
  if (['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion) && doc.screenTabGroups === undefined) ctx.addIssue({ code: 'custom', path: ['screenTabGroups'], message: 'CreativeTab Screen 导航组需要 Schema 0.14.0 项目级 screenTabGroups' });
  if (!['0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion) ? doc.entryScreenId !== undefined : !doc.entryScreenId || !doc.screens.some(screen => screen.id === doc.entryScreenId)) ctx.addIssue({ code: 'custom', path: ['entryScreenId'], message: 'entryScreenId 需要 schema 0.13.0 或更高且必须引用真实 Screen；0.13.0+ 必须指定入口' });
  if (!['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion) && doc.screenTabGroups !== undefined) ctx.addIssue({ code: 'custom', path: ['screenTabGroups'], message: '项目级 CreativeTab Screen 导航组需要 schema 0.14.0' });
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
  if (!['0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion) && doc.screens.length !== 1) ctx.addIssue({ code: 'custom', path: ['screens'], message: '多 Screen 需要 schema 0.12.0' });
  unique(doc.project.id, ['project', 'id']);
  doc.screens.forEach((screen, si) => {
    const sp = ['screens', si];
    if (screen.background.kind === 'panel') {
      if (doc.schemaVersion === '0.1.0') ctx.addIssue({ code: 'custom', path: [...sp, 'background'], message: 'Panel 需要 schema 0.2.0 或更高版本' });
      if (doc.schemaVersion === '0.2.0' && screen.background.style !== PANEL_STYLE) ctx.addIssue({ code: 'custom', path: [...sp, 'background'], message: '用户提供的 Panel 纹理需要 schema 0.3.0' });
      if (screen.background.bounds) {
        const b = screen.background.bounds;
        if (!['0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...sp, 'background', 'bounds'], message: 'Panel 独立几何需要 schema 0.9.0' });
        if (b.w < PANEL_MIN_SIZE || b.h < PANEL_MIN_SIZE || b.x + b.w > screen.designSize.width || b.y + b.h > screen.designSize.height) ctx.addIssue({ code: 'custom', path: [...sp, 'background', 'bounds'], message: 'Panel 最小 8×8 且必须位于设计区内' });
      }
      if (screen.designSize.width < PANEL_MIN_SIZE || screen.designSize.height < PANEL_MIN_SIZE) ctx.addIssue({ code: 'custom', path: [...sp, 'designSize'], message: 'Panel 宽高均需至少 8 GUI px' });
    }
    unique(screen.id, [...sp, 'id']);
    const memberOwners = new Map<string, string>();
    screen.bakeGroups?.forEach((group, groupIndex) => {
      const gp = [...sp, 'bakeGroups', groupIndex]; unique(group.id, [...gp, 'id']);
      if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.41.0')) ctx.addIssue({ code: 'custom', path: gp, message: 'Bake Group 需要 Schema 0.41.0' });
      if (new Set(group.memberIds).size !== group.memberIds.length) ctx.addIssue({ code: 'custom', path: [...gp, 'memberIds'], message: 'Bake Group 成员不能重复' });
      group.memberIds.forEach((memberId, memberIndex) => {
        if (!screen.nodes.some(node => node.id === memberId)) ctx.addIssue({ code: 'custom', path: [...gp, 'memberIds', memberIndex], message: 'Bake Group 成员必须引用当前 Screen 节点' });
        if (memberOwners.has(memberId)) ctx.addIssue({ code: 'custom', path: [...gp, 'memberIds', memberIndex], message: '同一节点不能属于多个 Bake Group' });
        memberOwners.set(memberId, group.id);
      });
    });
    const textMappingIds = new Set<string>();
    if (screen.textMappings !== undefined && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.47.0')) ctx.addIssue({ code: 'custom', path: [...sp, 'textMappings'], message: '命名文本映射需要 Schema 0.47.0' });
    screen.textMappings?.forEach((mapping, mappingIndex) => {
      const mp = [...sp, 'textMappings', mappingIndex];
      if (textMappingIds.has(mapping.id) || screen.behaviorMaps?.some(map => map.id === mapping.id)) ctx.addIssue({ code: 'custom', path: [...mp, 'id'], message: '命名映射 ID 在同一 Screen 内必须唯一' });
      textMappingIds.add(mapping.id);
      const keys = new Set<string>();
      mapping.entries.forEach((entry, entryIndex) => {
        if (keys.has(entry.key)) ctx.addIssue({ code: 'custom', path: [...mp, 'entries', entryIndex, 'key'], message: '命名文本映射的键不能重复' });
        keys.add(entry.key);
      });
      if (mapping.outputType === 'Text' && !mapping.fallback) ctx.addIssue({ code: 'custom', path: [...mp, 'fallback'], message: '命名文本映射必须提供与输出类型兼容的 fallback' });
    });
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
      if ((node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button') && node.props.colorMode !== undefined && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.52.0')) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'colorMode'], message: '文字颜色 API 模式需要 Schema 0.52.0' });
      const imageProps = node.type === 'minecraft:image' ? node.props : null;
      if (imageProps?.kind === 'embedded') {
        if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.56.0')) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: '嵌入式贴图需要 Schema 0.56.0' });
        const asset = doc.assets.find(item => item.id === imageProps.assetId);
        if (!asset) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'assetId'], message: '嵌入式贴图资源不存在' });
        else if (asset.width !== imageProps.textureWidth || asset.height !== imageProps.textureHeight) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: '嵌入式贴图逻辑尺寸必须等于 PNG 尺寸' });
        if (imageProps.uv.x + imageProps.uv.width > imageProps.textureWidth || imageProps.uv.y + imageProps.uv.height > imageProps.textureHeight) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'uv'], message: 'UV 必须位于嵌入式贴图范围内' });
      }
      if (node.type === 'minecraft:fill') {
        const hasStyleFields = node.props.stylePreset !== undefined || node.props.borderColor !== undefined || node.props.highlightColor !== undefined || node.props.shadowColor !== undefined;
        if (hasStyleFields && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.42.0')) ctx.addIssue({ code: 'custom', path: np, message: 'Rectangle 静态样式需要 Schema 0.42.0' });
        const hasEdgeFields = ['edgeTopColor', 'edgeRightColor', 'edgeBottomColor', 'edgeLeftColor', 'edgeTopWidth', 'edgeRightWidth', 'edgeBottomWidth', 'edgeLeftWidth'].some(key => key in node.props);
        if (hasEdgeFields && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.54.0')) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: '纯色四边独立颜色/宽度需要 Schema 0.54.0' });
        const sizeError = fillStyleSizeError(node);
        if (sizeError) ctx.addIssue({ code: 'custom', path: [...np, 'bounds'], message: sizeError });
      }
      if (node.type === 'native_region') {
        if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.40.0')) ctx.addIssue({ code: 'custom', path: np, message: 'Native Region 需要 Schema 0.40.0 或更高版本' });
        if (node.parentContainerId !== undefined) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: 'Native Region 仅支持 Screen 根级归属；Page 归属请使用 CreativeTab.contentIds' });
      }
      if (node.type === 'minecraft:single_slot') {
        if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.55.0')) ctx.addIssue({ code: 'custom', path: np, message: 'Single Slot 需要 Schema 0.55.0 或更高版本' });
        if (node.parentContainerId !== undefined) {
          const parent = screen.nodes.find(candidate => candidate.id === node.parentContainerId);
          const visualInTemplate = parent?.type === 'minecraft:repeatable-list' && node.props.usage === 'visual_only';
          if (!visualInTemplate) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: node.props.usage === 'visual_only' ? 'visual_only Single Slot 仅可放入 Row Template 或作为 Screen 根级；其他容器首版不支持' : '真实 Menu Slot 需要稳定的 Menu Slot 身份；Ghost Selection 需要每行实例身份与外部目标绑定；不能放入 Row Template' });
        }
      }
      if (node.parentContainerId !== undefined && !['0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: '容器父子关系需要 Schema 0.26.0 或更高版本' });
      if (node.type === 'minecraft:scrollable-panel') {
        if (!['0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Scrollable Panel 需要 Schema 0.26.0 或更高版本' });
        const viewport = contentViewport(node);
        if (viewport.w < 1 || viewport.h < 1) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'padding'], message: 'padding 与 viewport 尺寸必须留下正数内容区域' });
        if (viewport.h > 0 && node.props.contentHeight < viewport.h) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'contentHeight'], message: '内容高度不能小于容器的可视内容高度' });
      }
      if (isCollapsiblePanelNode(node)) {
        if (!['0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Collapsible Panel 需要 Schema 0.27.0 或更高支持版本' });
        if (node.props.headerHeight >= node.bounds.h) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'headerHeight'], message: '展开高度必须大于标题栏高度' });
      }
      if (isRepeatableListNode(node)) {
        if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.51.0')) ctx.addIssue({ code: 'custom', path: np, message: 'Repeatable List 需要 Schema 0.51.0' });
        if (node.parentContainerId !== undefined) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: 'Repeatable List 首版仅支持 Screen 根级，不能嵌套在其他容器中' });
        if (screen.nodes.some(candidate => candidate.id !== node.id && candidate.type === 'minecraft:repeatable-list' && candidate.props.templateId === node.props.templateId)) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'templateId'], message: '同一 Screen 的 Row Template ID 不能重复' });
        if (repeatableTemplateChildren(node, screen.nodes).length > 64) ctx.addIssue({ code: 'custom', path: np, message: '单个 Row Template 最多 64 个模板子节点' });
        const error = repeatableListError(node, screen.nodes);
        if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
      }
      if (isTreeViewNode(node)) {
        if (!['0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Tree View 需要 Schema 0.28.0' });
        const error = treeViewError(node.props);
        if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
      }
      if (node.parentContainerId !== undefined) {
        const parent = screen.nodes.find(candidate => candidate.id === node.parentContainerId);
        if (!parent || !isContainerNode(parent)) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: '父节点必须引用同 Screen 内的容器' });
        else if (isRepeatableListNode(parent)) {
          const rejection = repeatableChildRejection(node.type, node.type === 'minecraft:single_slot' ? node.props.usage : undefined);
          if (rejection) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: rejection });
          const viewport = repeatableViewport(parent);
          if (node.bounds.x + node.bounds.w > viewport.w || node.bounds.y + node.bounds.h > parent.props.rowHeight) ctx.addIssue({ code: 'custom', path: [...np, 'bounds'], message: '模板子节点必须完整位于 Row Template 视口宽度和固定行高内' });
        } else if (isRepeatableListNode(node)) {
          ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: 'Repeatable List 首版仅支持 Screen 根级，不能嵌套在其他容器中' });
        } else {
          const crossContainer = isContainerNode(node) && node.type !== parent.type;
          if (isContainerNode(node) && !crossContainer) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: '首版只允许 Scrollable Panel 与 Collapsible Panel 交叉嵌套' });
          if (!isContainerNode(node)) { const rejection = scrollableChildRejection(node.type); if (rejection) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: rejection }); }
          const viewport = isScrollablePanelNode(parent) ? contentViewport(parent) : containerLocalViewport(parent);
          const content = isScrollablePanelNode(parent) ? contentSize(parent).height : Math.max(0, parent.bounds.h - parent.props.headerHeight);
          if (node.bounds.x + node.bounds.w > viewport.w || node.bounds.y + node.bounds.h > content) ctx.addIssue({ code: 'custom', path: [...np, 'bounds'], message: '子节点必须完整位于容器内容坐标范围内' });
          if (isContainerNode(node) && containerDepth(node, screen.nodes) > 1) ctx.addIssue({ code: 'custom', path: [...np, 'parentContainerId'], message: '首版每个容器分支最多包含两个容器节点' });
        }
      }
      if (isSelectionNode(node)) {
        if (!['0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: '选择控件需要 Schema 0.18.0' });
        const error = selectionError(node.props); if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
        if (node.type === 'minecraft:radio-group' && (node.props.orientation === 'vertical' ? node.bounds.h : node.bounds.w) < node.props.options.length * 20) ctx.addIssue({ code: 'custom', path: [...np, 'bounds'], message: '单选组每个选项至少需要20px布局空间' });
      }
      if (isTreeViewNode(node)) {
        if (!['0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Tree View 需要 Schema 0.28.0' });
        const error = treeViewError(node.props); if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
      }
      if (isProgressNode(node)) {
        if (!['0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Progress Bar 需要 Schema 0.19.0' });
        const error = progressError(node.props); if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
      }
      if (isImageNode(node)) {
        if (!['0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Image / Sprite 需要 Schema 0.22.0' });
        const error = imageError(node); if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
        if (node.props.tooltip !== undefined && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.57.0')) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'tooltip'], message: 'Image / Sprite Tooltip 需要 Schema 0.57.0' });
        if ((node.props.kind === 'texture' && node.source.member !== 'blit') || (node.props.kind === 'sprite' && node.source.member !== 'blitSprite') || (node.props.kind === 'embedded' && (node.source.member !== 'blit' || node.source.category !== 'custom-draw'))) ctx.addIssue({ code: 'custom', path: [...np, 'source', 'member'], message: 'Image 绘制成员必须与 Texture/Sprite 类型一致' });
      }
      if (isStatusNode(node)) {
        if (!['0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'Status Indicator 需要 Schema 0.21.0' });
          if (!['0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion) && node.props.statuses.some(status => status.text?.kind === 'translate')) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'statuses'], message: 'Status Translation Key 需要 Schema 0.22.0' });
        const error = statusError(node.props); if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
      }
      if (node.type === 'minecraft:numeric-input' || node.type === 'minecraft:slider') {
        if (!['0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: '数值控件需要 Schema 0.16.0' });
        const error = numericError(node.props);
        if (error) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: error });
      }
      if (node.type === 'minecraft:multi-line-text-widget') {
        if (!['0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'MultiLineTextWidget 需要 schema 0.15.0' });
        if (node.bounds.w !== node.props.maxWidth || node.bounds.h !== node.props.maxRows * 9) ctx.addIssue({ code: 'custom', path: [...np, 'bounds'], message: '多行文本预留区必须等于 maxWidth × (maxRows × 9)，不是原生测量尺寸' });
        const text = node.props.text.kind === 'literal' ? node.props.text.value : node.props.text.fallback;
        if (text.length > 4096) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'text'], message: '多行文本最多 4096 UTF-16 单元' });
      }
      if (node.type === 'minecraft:fitting-multi-line-text-widget') {
        if (!['0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: np, message: 'ReadOnlyScrollText 需要 Schema 0.23.0 或更高版本' });
        if (node.props.textShadow !== undefined && !['0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'textShadow'], message: '滚动文字阴影选项需要 Schema 0.24.0 或更高版本' });
        if (node.bounds.w < 9) ctx.addIssue({ code: 'custom', path: [...np, 'bounds', 'w'], message: '只读滚动文本区宽度必须至少 9px，以保留正数原生内宽' });
        const value = node.props.text.kind === 'literal' ? node.props.text.value : node.props.text.fallback;
        if (value.length > 4096) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'text'], message: '只读滚动文本最多 4096 UTF-16 单元' });
      }
      if (node.type === 'minecraft:creative-tab' && (node.props.tabMode !== undefined || node.props.navigationGroupId !== undefined || node.props.navigationTabId !== undefined)) {
        if (!['0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'tabMode'], message: 'Screen 导航标签需要 schema 0.14.0' });
        if (node.props.tabMode !== 'screen-navigation' || !node.props.navigationGroupId || !node.props.navigationTabId || node.props.groupId !== undefined || node.props.contentIds !== undefined) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: 'Screen 导航模式必须引用项目级组和标签 ID，且不能携带 H2-B 内容组字段' });
        const group = navigationGroups.find(item => item.id === node.props.navigationGroupId);
        if (!group || !group.tabs.some(tab => tab.id === node.props.navigationTabId)) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'navigationGroupId'], message: 'CreativeTab 导航组或标签不存在' });
        const identity = `${screen.id}:${node.props.navigationGroupId}:${node.props.navigationTabId}`;
        if (screenNavigationInstances.has(identity)) ctx.addIssue({ code: 'custom', path: [...np, 'props'], message: '同一 Screen 内导航组的标签实例不能重复' });
        screenNavigationInstances.add(identity);
      }
      if (node.type === 'minecraft:creative-tab' && (!['0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion) || node.bounds.w !== 26 || node.bounds.h !== 32)) ctx.addIssue({ code: 'custom', path: np, message: 'CreativeTab 需要 schema 0.10.0 和固定 26×32 尺寸' });
      if ((node.type === 'minecraft:checkbox' || node.type === 'minecraft:cycle-button') && !['0.4.0', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) {
        ctx.addIssue({ code: 'custom', path: [...np, 'type'], message: '此组件需要 schema 0.4.0' });
      }
      if (!['0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion) && node.type !== 'minecraft:scrollable-panel' && ((node.type !== 'minecraft:fill' && node.type !== 'minecraft:image' && node.type !== 'minecraft:string-widget' && node.type !== 'minecraft:multi-line-text-widget' && 'color' in node.props && node.props.color !== undefined) || ((node.type === 'minecraft:multi-line-text-widget' || node.type === 'minecraft:slider') && !node.props.textShadow))) ctx.addIssue({ code: 'custom', path: np, message: '自定义文字颜色/多行与滑块阴影选项需要 Schema 0.17.0' });
      if (node.type !== 'minecraft:fill' && node.type !== 'minecraft:image' && node.type !== 'minecraft:creative-tab' && node.type !== 'minecraft:fitting-multi-line-text-widget' && node.type !== 'minecraft:scrollable-panel' && 'textShadow' in node.props && node.props.textShadow !== undefined && !['0.5.0', '0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) {
        ctx.addIssue({ code: 'custom', path: [...np, 'props', 'textShadow'], message: '文字阴影需要 schema 0.5.0' });
      }
      if (node.type === 'minecraft:cycle-button') {
        const ids = node.props.options.map(option => option.id);
        if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'options'], message: '选项 ID 必须唯一' });
        if (!ids.includes(node.props.initialOptionId)) ctx.addIssue({ code: 'custom', path: [...np, 'props', 'initialOptionId'], message: '初始选项不存在' });
      }
      const spec = CATALOG[node.type];
      const embeddedImageSource = node.type === 'minecraft:image' && node.props.kind === 'embedded' && node.source.category === 'custom-draw' && node.source.className === 'gui-maker:embedded-image';
      if (!embeddedImageSource && (node.source.className !== spec.source.className || node.source.category !== spec.source.category)) {
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
      if ((groupId !== undefined || contentIds !== undefined) && !['0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: '标签组需要 schema 0.11.0' });
      if (!groupId && contentIds?.length) ctx.addIssue({ code: 'custom', path, message: '关联内容需要标签组' });
      if (groupId) groups.set(groupId, (groups.get(groupId) ?? 0) + (node.props.selected ? 1 : 0));
      if (new Set(contentIds ?? []).size !== (contentIds?.length ?? 0)) ctx.addIssue({ code: 'custom', path, message: '关联内容不能重复' });
      for (const targetId of contentIds ?? []) {
        const target = screen.nodes.find(n => n.id === targetId);
        if (target?.type === 'native_region' && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.48.0')) ctx.addIssue({ code: 'custom', path, message: 'Native Region 放入 Page 需要 Schema 0.48.0；低版本项目保持 Persistent' });
        if (!target || target.type === 'minecraft:creative-tab') ctx.addIssue({ code: 'custom', path, message: '关联组件不存在或是标签' });
        const owner = ownership.get(targetId); if (owner && owner !== groupId) ctx.addIssue({ code: 'custom', path, message: '同一组件不能属于多个标签组' });
        if (groupId) ownership.set(targetId, groupId);
      }
    });
    for (const count of groups.values()) if (count !== 1) ctx.addIssue({ code: 'custom', path: [...sp, 'nodes'], message: '每个标签组必须有且仅有一个初始选中标签' });
    if (screen.screenTargets !== undefined && !['0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path: [...sp, 'screenTargets'], message: 'Screen 目标声明需要 schema 0.7.0' });
    screen.screenTargets?.forEach((target, index) => { unique(target.id, [...sp, 'screenTargets', index, 'id']); if (target.boundScreenId !== undefined && (!['0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion) || !doc.screens.some(item => item.id === target.boundScreenId))) ctx.addIssue({ code: 'custom', path: [...sp, 'screenTargets', index, 'boundScreenId'], message: '绑定需要 0.12.0 且必须指向真实 Screen' }); });
    screen.behaviors.forEach((rule, index) => {
      const path = [...sp, 'behaviors', index]; unique(rule.id, [...path, 'id']);
      if (!['0.6.0', '0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: '行为规则需要 schema 0.6.0' });
      if ('actions' in rule && !['0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: '有序动作需要 schema 0.8.0' });
      if ((rule.event.type === 'rectangle-click' || actionsOf(rule).some(a => a.type === 'open_screen')) && !['0.7.0', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: 'F1 行为需要 schema 0.7.0' });
      if ((rule.event.type === 'slider-change' || actionsOf(rule).some(a => a.type === 'set-progress-value')) && !['0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) ctx.addIssue({ code: 'custom', path, message: 'Slider → Progress Bar 联动需要 Schema 0.29.0 或更高的兼容版本' });
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
      const typedTrigger = bindings.some(binding => binding.type === 'selection-change' || binding.type === 'slider-change');
      const extendedBranches = topActions.some(action => action.type === 'switch' || (action.type === 'if' && action.elseIf !== undefined));
      if (extendedBranches && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.45.0')) ctx.addIssue({ code: 'custom', path, message: 'Switch / Else If 需要 Schema 0.45.0' });
      if (extendedBranches && leafActions.length > MAX_RULE_BRANCH_ACTIONS) ctx.addIssue({ code: 'custom', path, message: `扩展分支规则的叶动作总数不能超过 ${MAX_RULE_BRANCH_ACTIONS}` });
      const inspectorActions = leafActions.some(action => action.type === 'set-visible' || action.type === 'set-text');
      if (inspectorActions && (typedTrigger || topActions.some(action => action.type === 'if')) && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.44.0')) ctx.addIssue({ code: 'custom', path, message: '选择状态可见性与文本动作需要 Schema 0.44.0' });
      if (topActions.some(action => action.type === 'set-exclusive-visible')) {
        if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.46.0')) ctx.addIssue({ code: 'custom', path, message: '互斥可见性映射需要 Schema 0.46.0' });
        if (rule.event.type !== 'selection-change' || bindings.some(binding => binding.type !== 'selection-change')) ctx.addIssue({ code: 'custom', path, message: '互斥可见性映射仅支持 selection-change 事件绑定' });
      }
      const dynamicText = leafActions.some(action => action.type === 'set-text' && 'value' in action);
      if (dynamicText && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.47.0')) ctx.addIssue({ code: 'custom', path, message: '类型化文本动作需要 Schema 0.47.0' });
      if (topActions.some(isBranchAction) && !typedTrigger) ctx.addIssue({ code: 'custom', path, message: '条件动作需要 selection-change 或 slider-change 事件' });
      const sliderStatus = rule.event.type === 'slider-change' && leafActions.some(action => action.type === 'set-status');
      if (sliderStatus && PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.37.0')) ctx.addIssue({ code:'custom',path,message:'Slider 状态赋值需要 Schema 0.37.0' });
      if (bindings.some(binding => binding.type === 'slider-change') ? leafActions.some(action => action.type !== 'set-progress-value' && action.type !== 'set-visible' && action.type !== 'set-text' && !(action.type === 'set-status' && 'statusId' in action)) : leafActions.some(action => action.type === 'set-progress-value')) ctx.addIssue({ code:'custom',path,message:'Slider 仅支持进度、直接状态、可见性与静态文本赋值' });
      if (bindings.some(binding => binding.type === 'selection-change') ? leafActions.some(action => !['set-status', 'set-visible', 'set-text', 'set-exclusive-visible'].includes(action.type)) : bindings.some(binding => binding.type !== 'slider-change') && leafActions.some(action => action.type === 'set-status')) ctx.addIssue({code:'custom',path,message:'选择事件仅支持状态、可见性、互斥可见性映射与文本赋值'});
      topActions.forEach((action, actionIndex) => {
        const actionPath = 'actions' in rule ? [...path, 'actions', actionIndex] : [...path, 'action'];
        const checks = behaviorConditions(action);
        if (action.type === 'switch') action.cases.forEach((branch, i) => checks.push({ path: ['cases', i, 'value'], condition: { type: 'compare', valueType: action.valueType, operator: 'equals', left: action.value, right: { type: 'constant', value: branch.value } } as BehaviorCondition }));
        if (action.type === 'set-text' && 'value' in action && isLookupExpression(action.value)) {
          const lookup = action.value;
          const lookupInput = lookup.input;
          // A constant Lookup input names an OptionId identity: it must exist on the owner controls.
          if (lookupInput.type === 'constant' && selectionSources.some(owner => !owner || !isSelectionNode(owner) || !owner.props.options.some(option => option.id === lookupInput.value))) ctx.addIssue({ code: 'custom', path: [...actionPath, 'value', 'input'], message: 'Lookup 常量键必须存在于每个事件来源控件中' });
        }
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
        checks.forEach(entry => check(entry.condition, [...actionPath, ...entry.path]));
      });
      const containerAncestor = (ancestorId: string, nodeId: string) => {
        const seen = new Set<string>(); let parent = screen.nodes.find(node => node.id === nodeId)?.parentContainerId;
        while (parent && !seen.has(parent)) { if (parent === ancestorId) return true; seen.add(parent); parent = screen.nodes.find(node => node.id === parent)?.parentContainerId; }
        return false;
      };
      const validateExclusiveAction = (action: ExclusiveVisibleAction, actionPath: (string | number)[]) => {
        const reader = action.value;
        const owners = reader.type === 'read-control-value' ? [screen.nodes.find(node => node.id === reader.nodeId)] : selectionSources;
        if (reader.type === 'read-control-value') {
          const readerNode = owners[0];
          if (!readerNode || !isSelectionNode(readerNode)) ctx.addIssue({ code: 'custom', path: [...actionPath, 'value', 'nodeId'], message: '互斥映射读取目标必须是同 Screen 的 Radio Group 或 Dropdown' });
        }
        const optionIds = new Set<string>(), targetIds = new Set<string>(), resolved: GuiNode[] = [];
        action.mapping.forEach((mapping, mappingIndex) => {
          const mappingPath = [...actionPath, 'mapping', mappingIndex];
          if (optionIds.has(mapping.optionId)) ctx.addIssue({ code: 'custom', path: [...mappingPath, 'optionId'], message: '互斥映射的 optionId 不能重复' });
          optionIds.add(mapping.optionId);
          if (targetIds.has(mapping.targetId)) ctx.addIssue({ code: 'custom', path: [...mappingPath, 'targetId'], message: '同一目标不能映射到多个选项；互斥映射要求目标唯一' });
          targetIds.add(mapping.targetId);
          if (owners.some(owner => !owner || !isSelectionNode(owner) || !owner.props.options.some(option => option.id === mapping.optionId))) ctx.addIssue({ code: 'custom', path: [...mappingPath, 'optionId'], message: '互斥映射 optionId 必须存在于读取控件或每个事件来源控件中' });
          const target = screen.nodes.find(node => node.id === mapping.targetId);
          if (!target) ctx.addIssue({ code: 'custom', path: [...mappingPath, 'targetId'], message: '互斥映射目标不存在于当前 Screen' });
          else if (target.type === 'native_region') ctx.addIssue({ code: 'custom', path: [...mappingPath, 'targetId'], message: 'Native Region 不支持运行时可见性映射' });
          else if (target.type === 'minecraft:creative-tab') ctx.addIssue({ code: 'custom', path: [...mappingPath, 'targetId'], message: 'CreativeTab 的分组可见性由 Page 管理，不能作为互斥映射目标' });
          else resolved.push(target);
        });
        for (let i = 0; i < resolved.length; i++) for (let j = i + 1; j < resolved.length; j++) {
          if (containerAncestor(resolved[i].id, resolved[j].id) || containerAncestor(resolved[j].id, resolved[i].id)) ctx.addIssue({ code: 'custom', path: actionPath, message: '互斥映射目标不能互为父子容器；隐藏祖先会连带隐藏后代' });
        }
      };
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
        if (isBranchAction(action)) {
          for (const branch of behaviorBranches(action)) branch.actions.forEach((leaf, index) => {
            const leafPath = [...actionPath, ...branch.path, index];
            if (leaf.type === 'set-status') validateStatusAction(leaf, leafPath);
            else if (leaf.type === 'set-visible' || leaf.type === 'set-text') {
              const target = screen.nodes.find(node => node.id === leaf.targetId);
              if (!target || target.type === 'native_region' || (leaf.type === 'set-text' && target.type !== 'minecraft:string-widget')) ctx.addIssue({ code: 'custom', path: [...leafPath, 'targetId'], message: '动作目标不存在或类型不匹配；Native Region 不支持 F2 动作' });
            }
            else if (!screen.nodes.some(node => node.id === leaf.targetId && node.type === 'minecraft:progress-bar')) ctx.addIssue({ code: 'custom', path: [...leafPath, 'targetId'], message: 'Progress Bar 动作目标不存在或类型不匹配' });
          });
        } else if (action.type === 'set-status') validateStatusAction(action, actionPath);
        else if (action.type === 'set-exclusive-visible') validateExclusiveAction(action, actionPath);
        else if (action.type === 'set-text' && 'value' in action) {
          const target = screen.nodes.find(node => node.id === action.targetId), value = action.value;
          if (!target || target.type !== 'minecraft:string-widget') ctx.addIssue({ code: 'custom', path: [...actionPath, 'targetId'], message: '类型化文本动作目标必须是同 Screen 的 StringWidget' });
          if (isLookupExpression(value)) {
            const mapping = screen.textMappings?.find(item => item.id === value.mappingId);
            if (!mapping) ctx.addIssue({ code: 'custom', path: [...actionPath, 'value', 'mappingId'], message: `Lookup 引用的命名映射 ${value.mappingId} 不存在于当前 Screen` });
            else if (mapping.inputType !== 'OptionId') ctx.addIssue({ code: 'custom', path: [...actionPath, 'value', 'mappingId'], message: 'Lookup 输入类型必须与映射声明的 inputType 一致' });
            const input = value.input;
            if (input.type === 'read-control-value') {
              const reader = screen.nodes.find(node => node.id === input.nodeId);
              if (!reader || !isSelectionNode(reader)) ctx.addIssue({ code: 'custom', path: [...actionPath, 'value', 'input', 'nodeId'], message: 'Lookup 读取目标必须是同 Screen 的 Radio Group 或 Dropdown' });
            }
            if (input.type === 'event-value' && bindings.some(binding => binding.type !== 'selection-change')) ctx.addIssue({ code: 'custom', path: [...actionPath, 'value', 'input'], message: '事件 OptionId 输入需要所有触发路径均为 selection-change' });
          }
        }
        else if (action.type === 'open_screen') {
          if (!screen.screenTargets?.some(target => target.id === action.targetScreenId)) ctx.addIssue({ code: 'custom', path: [...actionPath, 'targetScreenId'], message: 'Screen 目标未声明' });
        } else {
          const target = screen.nodes.find(node => node.id === action.targetId);
          if (target?.type === 'native_region') ctx.addIssue({ code: 'custom', path: [...actionPath, 'targetId'], message: 'Native Region 不支持 F2 动作；原生 Slot 可见性和交互需另行设计' });
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

export function parseProject(json: string, options: { allowImageTooltipUpgrade?: boolean } = {}): GuiProject {
  if (new TextEncoder().encode(json).byteLength > MAX_JSON_BYTES) throw new ValidationError('文件超过 5 MiB 上限');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new ValidationError('JSON 语法错误'); }
  if (options.allowImageTooltipUpgrade) value = upgradeLegacyImageTooltip(value);
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

/** A small, explicit import migration for files that already carry the 0.57 image tooltip field under an older version string. */
function upgradeLegacyImageTooltip(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const doc = value as Record<string, unknown>;
  const hasImageTooltip = Array.isArray(doc.screens) && doc.screens.some(screen => {
    if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return false;
    const nodes = (screen as Record<string, unknown>).nodes;
    return Array.isArray(nodes) && nodes.some(node => node && typeof node === 'object' && !Array.isArray(node) && (node as Record<string, unknown>).type === 'minecraft:image' && (node as Record<string, unknown>).props && typeof (node as Record<string, unknown>).props === 'object' && 'tooltip' in ((node as Record<string, unknown>).props as object));
  });
  if (!hasImageTooltip || typeof doc.schemaVersion !== 'string' || PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion as typeof PROJECT_SCHEMA_VERSIONS[number]) >= PROJECT_SCHEMA_VERSIONS.indexOf('0.57.0')) return value;
  const upgraded = structuredClone(doc);
  upgraded.schemaVersion = '0.57.0';
  const screens = upgraded.screens as { id?: string }[];
  upgraded.entryScreenId ??= screens[0]?.id;
  upgraded.screenTabGroups ??= [];
  upgraded.assets ??= [];
  return upgraded;
}

export function exportProject(doc: GuiProject): string {
  // Same gate in both directions: export never claims an invalid document is a valid project.
  const json = JSON.stringify(doc, null, 2);
  parseProject(json);
  return json;
}
