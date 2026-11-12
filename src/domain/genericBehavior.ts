import { CONDITIONAL_BEHAVIOR_CONTRACT } from './conditionalBehavior';
import { actionsOf, behaviorReadDependencies, behaviorLeafActions, eventBindingsOf, matchesBehaviorEvent, statusMappingsOf, statusAssignmentOf, type Behavior, type BehaviorCondition, type BehaviorLeafCondition, type BehaviorValue, type ConditionalBehaviorAction, type SwitchBehaviorAction, type GuiNode, type GuiScreen, type TextValueExpression, type TextSpec, isLookupExpression } from './schema';
import { isSelectionNode, type SelectionEvent } from './selection';
import { isStatusNode } from './statusIndicator';
import { validValue, type SliderChangeEvent } from './numeric';
import { mapSliderToProgress } from './progressBinding';
import { resolveOptionStatusMapping } from './selectionStatusBinding';
import { effectiveRuntimeVisibility } from './runtimeVisibility';
import { planExclusiveVisibility } from './exclusiveVisibility';
import { describeText, previewText, resolveTextMapping } from './textMapping';
import { containerAncestorsEnabled } from './collapsiblePanel';

export const BEHAVIOR_VALUE_TYPES = ['Boolean', 'Number', 'Text', 'OptionId', 'StatusId'] as const;
export const TYPED_EVENTS = {
  'selection-change': { label: '确认选择变化', valueType: 'OptionId', field: 'optionId', phase: 'confirm', sourceTypes: ['minecraft:radio-group', 'minecraft:dropdown'] },
  'slider-change': { label: '有效数值变化', valueType: 'Number', field: 'value', phase: 'change', sourceTypes: ['minecraft:slider'] },
} as const;
export const RUNTIME_PROPERTIES = {
  currentStatusId: { label: '当前状态', valueType: 'StatusId', targetType: 'minecraft:status-indicator', actionType: 'set-status' },
  currentValue: { label: '当前进度值', valueType: 'Number', targetType: 'minecraft:progress-bar', actionType: 'set-progress-value' },
} as const;
export type TypedEventType = keyof typeof TYPED_EVENTS;
export type RuntimeProperty = keyof typeof RUNTIME_PROPERTIES;
export type TypedBehaviorEvent = SelectionEvent | SliderChangeEvent;
export type RuntimeBehaviorState = Record<string, { text?: string; visible?: boolean; checked?: boolean; tabSelected?: boolean; progressValue?: number; statusId?: string; sliderValue?: number; optionId?: string }>;
export const isTypedEventSource = (node: GuiNode, event: TypedEventType) => (TYPED_EVENTS[event].sourceTypes as readonly string[]).includes(node.type);
export const isRuntimePropertyTarget = (node: GuiNode, property: RuntimeProperty) => node.type === RUNTIME_PROPERTIES[property].targetType;
export const GENERIC_BEHAVIOR_CONTRACT = {
  types: BEHAVIOR_VALUE_TYPES, implemented: { compare: ['OptionId', 'Number'], constants: ['OptionId', 'Number', 'StatusId'], Boolean: 'condition result and explicit set-visible boolean only', Text: 'literal set-text to StringWidget only; no Text operands or dynamic expressions' },
  events: TYPED_EVENTS, properties: RUNTIME_PROPERTIES,
  operators: { OptionId: ['equals', 'not-equals'], Number: ['equals', 'not-equals', 'greater-than', 'less-than', 'greater-or-equal', 'less-or-equal'] },
  compare: 'both operands have the declared valueType; current-event fields, same-Screen control session values and finite typed constants; OptionId equals/not-equals; Number also supports ordered comparisons; no implicit conversion or arithmetic',
  scope: 'same Screen stable references, explicit control values and current event only; OptionId and StatusId are distinct nominal types; no undeclared reads or shared variables',
  execution: 'one rule/action/branch interpreter for both event domains; preserve array order; execute exactly one branch; invalid/missing values execute neither branch; last valid action wins',
  adapter: 'legacy event-option lowers to a typed OptionId comparison at execution only; authority JSON is not rewritten; actions execute the finite set-status, set-progress-value, set-visible and literal set-text contracts',
  progress: 'currentValue consumes only the current validated Slider event via existing direct/normalize mapSliderToProgress; numeric constants are compare operands, not a new progress assignment mode',
  lifecycle: 'initialize source and target independently; no initial event; session values/logs reset on Screen open/navigation/restart/document changes; design initial values and PNG unchanged',
  controlReads: { scope: 'same Screen; committed session values initialized on open; trigger source updated first; one immutable read snapshot per event; hidden/disabled controls remain readable; missing or incompatible values are invalid; no cascaded events', types: { Number: 'Slider', OptionId: 'Radio Group or Dropdown' }, sliderStatus: 'slider-change may execute explicit constant statusId; option mappings remain selection-change only' },
  triggers: 'explicit eventBindings declare type, sourceId and payloadType for every subscription; legacy event and additionalSourceIds retain their original semantics; reading a control never subscribes to it; each matching rule executes at most once per event; current-event fields must exist on every bound event path',
  inspectorBinding: {
    schema: '0.44.0 enables set-visible and set-text in typed rules and if branches',
    visibilityTargets: 'same-Screen existing design nodes including ScrollablePanel and CollapsiblePanel; Native Region is forbidden',
    visibility: '(runtime visible override or existing design/Page-owned default) AND all ancestor visibility AND active Page membership; collapsed ancestors also gate rendering, hits and focus',
    hidden: 'do not draw, hit-test or traverse focus; release focus/pointer capture; retain input values, selection, scroll and expansion in the same Screen/Menu session',
    text: 'set-text accepts a literal string up to 4096 characters and targets only StringWidget display text; override its display at runtime without changing saved literal/translation metadata',
    initialization: 'typed set-visible targets initialize their session visible override from saved state.visible, including Page-owned targets; other Page-owned defaults retain legacy semantics. Source and text/status initial values initialize independently; no initial event or automatic rule execution; Java caller supplies business initialization',
    assignmentEvents: 'programmatic actions never emit user input events, subscribe to reads, cascade rules or open Screens',
    references: 'stable node IDs in the same Screen; aliases are display labels; Page-inactive controls remain readable at last valid value',
    unsupportedAssignments: ['Numeric Input current value', 'Radio Group/Dropdown current option'],
  },
  extendedBranches: CONDITIONAL_BEHAVIOR_CONTRACT.extendedBranches,
  exclusiveVisibility: {
    schema: '0.46.0; explicit save only; legacy rules are never migrated on load',
    action: 'one set-exclusive-visible action owns one OptionId value input and one ordered Option→Target table (max 32 entries)',
    value: 'event-value reads the current confirmed selection-change optionId; read-control-value reads the same-Screen Radio Group/Dropdown session value; a constant is an explicit OptionId identity; evaluated exactly once per event',
    execution: 'match one optionId, set only that target visible and hide every other mapped target; nodes outside the table are never touched; fallback hide-all hides every mapped target; keep-current changes nothing',
    validation: 'unique optionId and unique target per table; same-Screen existing targets; Native Region and CreativeTab targets rejected; ancestor/descendant target pairs rejected; every target validated before any write',
    gating: 'runtime overrides compose with active Page membership and ancestor visibility; a mapping never reveals content of an inactive Page',
    isolation: 'does not change design initial visibility, does not destroy hidden control values, emits no user events or navigation, and does not subscribe to the read control',
  },
  boolean: { operators: ['and', 'or', 'not'], maxDepth: 4, maxNodes: 32, evaluation: 'left to right short circuit; invalid propagates and skips both branches; skipped conditions are not evaluated', legacy: 'existing leaf conditions and action limits unchanged' },
  runtime: 'structured implementation intent only; implementer supplies Minecraft callbacks; no Blockly or JavaScript runtime and no generated Java',
} as const;

type ControlReader = (nodeId: string, valueType: 'Number' | 'OptionId') => number | string | undefined;
function resolveBehaviorValue(operand: BehaviorValue, valueType: 'Number' | 'OptionId', event: TypedBehaviorEvent, readControl?: ControlReader): number | string | undefined {
  if (operand.type === 'constant') return operand.value;
  if (operand.type === 'read-control-value') return readControl?.(operand.nodeId, valueType);
  if (valueType === 'Number' && event.type === 'slider-change') return event.value;
  if (valueType === 'OptionId' && event.type === 'selection-change') return event.optionId;
  return undefined;
}

function evaluateLeaf(condition: BehaviorLeafCondition, event: TypedBehaviorEvent, readControl?: (nodeId: string, valueType: 'Number' | 'OptionId') => number | string | undefined): { value: boolean; description: string } | { error: string } {
  if (condition.type === 'event-option') {
    if (event.type !== 'selection-change' || typeof event.optionId !== 'string') return { error: 'event-option 缺少本次事件 OptionId' };
    return { value: condition.operator === 'equals' ? event.optionId === condition.optionId : event.optionId !== condition.optionId, description: `event-option ${condition.operator} ${condition.optionId}` };
  }
  if ([condition.left, condition.right].some(v => v.type === 'event-value') && ((condition.valueType === 'Number' && event.type !== 'slider-change') || (condition.valueType === 'OptionId' && event.type !== 'selection-change'))) return { error: '比较类型与当前事件不兼容' };
  if (!(GENERIC_BEHAVIOR_CONTRACT.operators[condition.valueType] as readonly string[]).includes(condition.operator)) return { error: '不支持的比较操作符' };
  const left = resolveBehaviorValue(condition.left, condition.valueType, event, readControl);
  const right = resolveBehaviorValue(condition.right, condition.valueType, event, readControl);
  if (condition.left.type === 'read-control-value' && left === undefined) return { error: `读取控件 ${condition.left.nodeId} 失败：状态缺失或类型不兼容` };
  if (condition.right.type === 'read-control-value' && right === undefined) return { error: `读取控件 ${condition.right.nodeId} 失败：状态缺失或类型不兼容` };
  if (condition.valueType === 'Number' ? typeof left !== 'number' || typeof right !== 'number' || !Number.isFinite(left) || !Number.isFinite(right) : typeof left !== 'string' || typeof right !== 'string') return { error: `compare ${condition.valueType} 缺少或存在非法事件值` };
  const operator = condition.operator;
  let value: boolean;
  if (operator === 'equals') value = left === right;
  else if (operator === 'not-equals') value = left !== right;
  else if (typeof left === 'number' && typeof right === 'number') value = operator === 'greater-than' ? left > right : operator === 'less-than' ? left < right : operator === 'greater-or-equal' ? left >= right : left <= right;
  else return { error: '类型不兼容的比较操作符' };
  return { value, description: `compare ${condition.valueType} ${String(left)} ${operator} ${String(right)}` };
}

export function evaluateBehaviorCondition(condition: BehaviorCondition, event: TypedBehaviorEvent, trace?: string[], validateLeaf?: (leaf: BehaviorLeafCondition) => string | undefined, readControl?: (nodeId: string, valueType: 'Number' | 'OptionId') => number | string | undefined): { value: boolean; description: string } | { error: string } {
  const walk = (node: BehaviorCondition, path: string): { value: boolean; description: string } | { error: string } => {
    if (node.type === 'not') {
      const child = walk(node.condition, `${path}.condition`);
      if ('error' in child) return child;
      const value = !child.value; trace?.push(`${path} NOT → ${value}`); return { value, description: `NOT ${child.value}` };
    }
    if (node.type === 'and' || node.type === 'or') {
      if (node.conditions.length < 2) return { error: '布尔条件子项不足' };
      for (let i = 0; i < node.conditions.length; i++) {
        const child = walk(node.conditions[i], `${path}.conditions[${i}]`);
        if ('error' in child) return child;
        if ((node.type === 'and' && !child.value) || (node.type === 'or' && child.value)) {
          if (i + 1 < node.conditions.length) trace?.push(`${path} 短路：conditions[${i + 1}..${node.conditions.length - 1}] 未求值`);
          trace?.push(`${path} ${node.type.toUpperCase()} → ${child.value}`); return { value: child.value, description: node.type.toUpperCase() };
        }
      }
      const value = node.type === 'and'; trace?.push(`${path} ${node.type.toUpperCase()} → ${value}`); return { value, description: node.type.toUpperCase() };
    }
    const issue = validateLeaf?.(node);
    const result = issue ? { error: issue } : evaluateLeaf(node, event, readControl);
    trace?.push('error' in result ? `${path} invalid：${result.error}` : `${path} ${result.description} → ${result.value}`);
    return result;
  };
  return walk(condition, 'condition');
}

export function usesControlState(screen: GuiScreen): boolean {
  if (screen.behaviors.some(rule => (rule.event.type === 'selection-change' || rule.event.type === 'slider-change') && actionsOf(rule).flatMap(behaviorLeafActions).some(action => action.type === 'set-visible' || action.type === 'set-text' || action.type === 'set-exclusive-visible'))) return true;
  return screen.behaviors.some(rule => !!rule.eventBindings || actionsOf(rule).some(a => a.type === 'switch' || behaviorReadDependencies(a).length > 0) || (rule.event.type === 'slider-change' && actionsOf(rule).flatMap(behaviorLeafActions).some(a => a.type === 'set-status')));
}
export function initialControlState(screen: GuiScreen): RuntimeBehaviorState {
  if (!usesControlState(screen)) return {};
  const result: RuntimeBehaviorState = {};
  for (const node of screen.nodes) {
    if (node.type === 'minecraft:slider') result[node.id] = { sliderValue: node.props.initialValue };
    else if (isSelectionNode(node)) result[node.id] = { optionId: node.props.initialSelectedOptionId };
  }
  for (const rule of screen.behaviors) {
    if (rule.event.type !== 'selection-change' && rule.event.type !== 'slider-change') continue;
    for (const action of actionsOf(rule).flatMap(behaviorLeafActions)) {
      if (action.type !== 'set-visible') continue;
      const target = screen.nodes.find(node => node.id === action.targetId);
      if (target && target.type !== 'native_region') result[target.id] = { ...result[target.id], visible: target.state.visible };
    }
  }
  return result;
}

/** Existing selection and Slider callbacks enter this same ordered F2 interpreter. UI retains lifecycle/visibility guards. */
export function reduceTypedBehaviorEvent(screen: GuiScreen, previous: RuntimeBehaviorState | null, event: TypedBehaviorEvent, availability?: { sourceVisible: boolean }) {
  const next = structuredClone(previous ?? {}), outcomes: string[] = [], matchedRuleIds: string[] = [];
  const source = screen.nodes.find(node => node.id === event.nodeId);
  const visibilityState = source && availability ? { ...previous, [source.id]: { ...previous?.[source.id], visible: availability.sourceVisible } } : previous;
  if (event.screenId !== screen.id || !source || !isTypedEventSource(source, event.type) || !('enabled' in source.state) || !source.state.enabled || !containerAncestorsEnabled(source, screen.nodes) || !effectiveRuntimeVisibility(screen.nodes, visibilityState, availability ? null : {})(source)) return { next, outcomes: ['事件来源不可用或不属于当前 Screen，未执行'], matchedRuleIds };
  if (event.type === 'slider-change' ? source.type !== 'minecraft:slider' || event.phase !== 'change' || !Number.isFinite(event.value) || !validValue(source.props, event.value) : !isSelectionNode(source) || event.phase !== 'confirm' || !source.props.options.some(option => option.id === event.optionId)) return { next, outcomes: ['事件载荷无效，未执行任何规则'], matchedRuleIds };
  if (event.type === 'selection-change' && isSelectionNode(source) && source.props.options.find(option => option.id === event.optionId)?.disabled) return { next, outcomes: ['禁用选项正常跳过，未执行任何规则'], matchedRuleIds };
  if (usesControlState(screen)) next[source.id] = { ...next[source.id], ...(event.type === 'slider-change' ? { sliderValue:event.value } : { optionId:event.optionId }) };
  const readView = structuredClone(next);
  /** Lookup is a deterministic pure value: one input evaluation, no state write, no event. */
  const resolveTextValue = (owner: GuiScreen, expression: TextValueExpression, current: TypedBehaviorEvent, read: ControlReader, ruleId: string, log: string[]): TextSpec | null => {
    if (!isLookupExpression(expression)) return expression;
    const mapping = owner.textMappings?.find(item => item.id === expression.mappingId);
    const input = resolveBehaviorValue(expression.input, 'OptionId', current, read);
    const result = resolveTextMapping(mapping, typeof input === 'string' ? input : undefined, true, !!mapping);
    if (result.kind === 'invalid') { log.push(`规则 ${ruleId}：Lookup ${expression.mappingId} 拒绝执行：${result.reason}`); return null; }
    if (result.kind === 'matched') log.push(`规则 ${ruleId}：Lookup ${expression.mappingId} 读取 ${result.key} → ${describeText(result.value)}`);
    else log.push(`规则 ${ruleId}：Lookup ${expression.mappingId} 读取 ${String(input)} 未匹配，使用 fallback ${describeText(result.value)}`);
    return result.value;
  };
  type Leaf = ConditionalBehaviorAction['thenActions'][number];
  const execute = (ruleId: string, action: Leaf) => {
    const target = screen.nodes.find(node => node.id === action.targetId);
    if (action.type === 'set-visible' || action.type === 'set-text') {
      if (!target || target.type === 'native_region' || (action.type === 'set-text' && target.type !== 'minecraft:string-widget')) {
        outcomes.push(`规则 ${ruleId}：${action.type} 目标 ${action.targetId} 不存在或类型不兼容，未执行`);
        return;
      }
      if (action.type === 'set-text') {
        const text = 'value' in action ? resolveTextValue(screen, action.value, event, readNode, ruleId, outcomes) : ({ kind: 'literal' as const, value: action.text });
        if (!text) return;
        next[target.id] = { ...next[target.id], text: previewText(text) };
        outcomes.push(`规则 ${ruleId}：set-text → ${target.id} 已执行（${describeText(text)}）`);
        return;
      }
      next[target.id] = { ...next[target.id], visible: action.visible };
      outcomes.push(`规则 ${ruleId}：${action.type} → ${target.id} 已执行`);
      return;
    }
    if (action.type === 'set-progress-value') {
      if (event.type !== 'slider-change' || source.type !== 'minecraft:slider') { outcomes.push(`规则 ${ruleId}：Progress Bar 事件类型不兼容，未执行`); return; }
      if (!target) { outcomes.push(`规则 ${ruleId}：Progress Bar 目标 ${action.targetId} 不存在，未执行`); return; }
      if (target.type !== 'minecraft:progress-bar') { outcomes.push(`规则 ${ruleId}：Progress Bar 目标 ${action.targetId} 类型不兼容，未执行`); return; }
      const mapped = mapSliderToProgress(source.props, target.props, event.value, action.mapping);
      if ('error' in mapped) { outcomes.push(`规则 ${ruleId}：映射失败，${mapped.error}`); return; }
      if ((next[target.id]?.progressValue ?? target.props.initialValue) === mapped.value) { outcomes.push(`规则 ${ruleId}：set-progress-value → ${target.id} 数值未变化，无更新`); return; }
      next[target.id] = { ...next[target.id], progressValue: mapped.value }; outcomes.push(`规则 ${ruleId}：set-progress-value → ${target.id} 已更新为 ${mapped.value}（${action.mapping}）`); return;
    }
    if (event.type !== 'selection-change' && !('statusId' in action)) { outcomes.push(`规则 ${ruleId}：映射需要 selection-change 事件，未执行`); return; }
    if (!target) { outcomes.push(`规则 ${ruleId}：Status Indicator 目标 ${action.targetId} 不存在，未执行`); return; }
    if (!isStatusNode(target)) { outcomes.push(`规则 ${ruleId}：Status Indicator 目标 ${action.targetId} 类型不兼容，未执行`); return; }
    const mapping = 'statusId' in action ? { kind: target.props.statuses.some(status => status.statusId === action.statusId) ? 'mapped' as const : 'invalid' as const, statusId: action.statusId } : resolveOptionStatusMapping(event.type === 'selection-change' ? event.optionId : '', statusMappingsOf(screen, action), target.props.statuses.map(status => status.statusId));
    if (mapping.kind === 'unmapped') { outcomes.push(`规则 ${ruleId}：optionId ${event.type === 'selection-change' ? event.optionId : ''} 未映射到 ${target.id}；状态保持不变`); return; }
    if (mapping.kind === 'invalid') { outcomes.push(`规则 ${ruleId}：statusId ${mapping.statusId} 在目标 ${target.id} 中不存在，未执行`); return; }
    if ((next[target.id]?.statusId ?? target.props.initialStatusId) === mapping.statusId) { outcomes.push(`规则 ${ruleId}：set-status → ${target.id} / ${mapping.statusId} 已是当前状态，无更新`); return; }
    next[target.id] = { ...next[target.id], statusId: mapping.statusId }; outcomes.push(`规则 ${ruleId}：set-status → ${target.id} / ${mapping.statusId} 已执行`);
  };
  /** One immutable read snapshot per rule; lookups reuse it and never subscribe to the read control. */
  const readNode = (nodeId: string, valueType: 'Number' | 'OptionId'): number | string | undefined => {
    const owner = screen.nodes.find(node => node.id === nodeId), state = readView[nodeId];
    if (valueType === 'Number') return owner?.type === 'minecraft:slider' && state && typeof state.sliderValue === 'number' && validValue(owner.props, state.sliderValue) ? state.sliderValue : undefined;
    return owner && isSelectionNode(owner) && state && typeof state.optionId === 'string' && owner.props.options.some(option => option.id === state.optionId) ? state.optionId : undefined;
  };
  for (const rule of screen.behaviors.filter(rule => matchesBehaviorEvent(rule, event.type, source.id))) {
    matchedRuleIds.push(rule.id);
    for (const action of actionsOf(rule)) {
      const readControl = (nodeId: string, valueType: 'Number' | 'OptionId'): number | string | undefined => {
        const target = screen.nodes.find(node => node.id === nodeId), state = readView[nodeId];
        if (valueType === 'Number') return target?.type === 'minecraft:slider' && state && typeof state.sliderValue === 'number' && validValue(target.props, state.sliderValue) ? state.sliderValue : undefined;
        return target && isSelectionNode(target) && state && typeof state.optionId === 'string' && target.props.options.some(option => option.id === state.optionId) ? state.optionId : undefined;
      };
      const validateLeaf = (c: BehaviorLeafCondition) => {
          const optionIds = c.type === 'event-option' ? [c.optionId] : c.valueType === 'OptionId' ? [c.left, c.right].flatMap(value => value.type === 'constant' ? [value.value] : []) : [];
          const readIds = c.type === 'compare' ? [c.left,c.right].flatMap(v => v.type === 'read-control-value' ? [v.nodeId] : []) : [];
          const hasEvent = c.type === 'event-option' || (c.type === 'compare' && [c.left,c.right].some(v => v.type === 'event-value'));
          const selectionSources = eventBindingsOf(rule).filter(binding => binding.type === 'selection-change').map(binding => binding.sourceId);
          const ownerIds = readIds.length ? [...readIds, ...(hasEvent ? selectionSources : [])] : selectionSources;
          return optionIds.some(id => ownerIds.some(sourceId => { const owner = screen.nodes.find(node => node.id === sourceId); return !owner || !isSelectionNode(owner) || !owner.props.options.some(option => option.id === id); })) ? '条件选项引用无效' : undefined;
        };
      if (action.type === 'set-exclusive-visible') {
        const readValue = resolveBehaviorValue(action.value, 'OptionId', event, readControl);
        const resolution = planExclusiveVisibility(action.mapping, typeof readValue === 'string' ? readValue : undefined, action.fallback, screen.nodes);
        if (resolution.kind === 'invalid') { outcomes.push(`规则 ${rule.id}：set-exclusive-visible 拒绝执行：${resolution.reason}`); continue; }
        if (resolution.kind === 'keep-current') { outcomes.push(`规则 ${rule.id}：set-exclusive-visible 读取 optionId=${readValue} 未匹配，fallback=keep-current，未修改任何目标`); continue; }
        for (const write of resolution.writes) next[write.targetId] = { ...next[write.targetId], visible: write.visible };
        if (resolution.kind === 'matched') outcomes.push(`规则 ${rule.id}：set-exclusive-visible 读取 optionId=${resolution.optionId}，命中 ${resolution.optionId} → 显示 ${resolution.writes.find(write => write.visible)?.targetId}`);
        else outcomes.push(`规则 ${rule.id}：set-exclusive-visible 读取 optionId=${readValue} 未匹配，fallback=hide-all`);
        const hidden = resolution.writes.filter(write => !write.visible).map(write => write.targetId);
        if (hidden.length) outcomes.push(`规则 ${rule.id}：set-exclusive-visible 隐藏 ${hidden.join('、')}`);
        continue;
      }
      if (action.type === 'switch') {
        const value = resolveBehaviorValue(action.value, action.valueType, event, readControl);
        const invalid = action.valueType === 'Number' ? typeof value !== 'number' || !Number.isFinite(value) : typeof value !== 'string';
        const invalidCase = action.cases.some(entry => validateLeaf({ type: 'compare', valueType: action.valueType, operator: 'equals', left: action.value, right: { type: 'constant', value: entry.value } } as BehaviorLeafCondition));
        if (invalid || invalidCase) { outcomes.push(`规则 ${rule.id}：switch invalid，所有分支跳过`); continue; }
        const index = action.cases.findIndex(entry => entry.value === value);
        if (index < 0 && !action.defaultActions) { outcomes.push(`规则 ${rule.id}：switch 无匹配且无 Default，正常跳过`); continue; }
        outcomes.push(`规则 ${rule.id}：switch → ${index < 0 ? 'default' : `case[${index}]`}`);
        for (const leaf of (index < 0 ? action.defaultActions ?? [] : action.cases[index].actions)) execute(rule.id, leaf);
        continue;
      }
      if (action.type === 'if' && action.elseIf !== undefined) {
        const branches = [{ condition: action.condition, actions: action.thenActions }, ...action.elseIf];
        let selected: Leaf[] = action.elseActions;
        for (let index = 0; index < branches.length; index++) {
          const trace: string[] = [];
          const result = evaluateBehaviorCondition(branches[index].condition, event, trace, validateLeaf, readControl);
          outcomes.push(...trace.map(line => `规则 ${rule.id}：branch[${index}] ${line}`));
          if ('error' in result) { selected = []; outcomes.push(`规则 ${rule.id}：条件未执行，${result.error}；整个分支链跳过`); break; }
          if (result.value) { selected = branches[index].actions; outcomes.push(`规则 ${rule.id}：进入 branch[${index}]`); break; }
        }
        for (const leaf of selected) execute(rule.id, leaf);
        continue;
      }
      if (action.type === 'if') {
        const trace: string[] = [];
        const result = evaluateBehaviorCondition(action.condition, event, trace, validateLeaf, readControl);
        if (action.condition.type !== 'event-option' && action.condition.type !== 'compare') outcomes.push(...trace.map(line => `规则 ${rule.id}：${line}`));
        if ('error' in result) { outcomes.push(`规则 ${rule.id}：条件未执行，${result.error}；两分支均跳过`); continue; }
        const active = result.value ? action.thenActions : action.elseActions, skipped = result.value ? action.elseActions : action.thenActions;
        outcomes.push(`规则 ${rule.id}：${result.description} → ${result.value ? 'true' : 'false'}，进入 ${result.value ? 'then' : 'else'}`);
        if (skipped.length) outcomes.push(`规则 ${rule.id}：未选分支跳过 ${skipped.length} 个动作`);
        if (!result.value && !active.length) outcomes.push(`规则 ${rule.id}：条件为假且 else 为空，正常跳过`);
        for (const leaf of active) execute(rule.id, leaf);
      } else if (action.type === 'set-status' || action.type === 'set-progress-value' || action.type === 'set-visible' || action.type === 'set-text') execute(rule.id, action);
      else outcomes.push(`规则 ${rule.id}：${action.type} 不适用于 ${event.type}，未执行`);
    }
  }
  if (!matchedRuleIds.length) outcomes.push(`${event.type} 已触发；没有匹配规则，未修改目标`);
  return { next, matchedRuleIds, outcomes };
}

export const typedEventSpecification = (type: TypedEventType) => ({ type, phase: TYPED_EVENTS[type].phase, payload: type === 'selection-change' ? ['screenId', 'nodeId', 'optionId', 'phase', 'source'] : ['screenId', 'nodeId', 'value', 'phase'] });
export const conditionalLeafSpecification = (action: ConditionalBehaviorAction['thenActions'][number]) => action.type === 'set-status' ? { targetId: action.targetId, ...statusAssignmentOf(action) } : { ...action };

/** Explicit editor starter only; it creates no authority until the user saves. */
export function createTypedRuleTemplate(screen: GuiScreen, id: string, eventType: TypedEventType): Behavior {
  const source = screen.nodes.find(node => isTypedEventSource(node, eventType));
  const property = eventType === 'slider-change' ? 'currentValue' : 'currentStatusId';
  const target = screen.nodes.find(node => isRuntimePropertyTarget(node, property));
  const leaf: ConditionalBehaviorAction['thenActions'][number] = property === 'currentValue'
    ? { type: 'set-progress-value', targetId: target?.id ?? '', mapping: 'normalize' }
    : { type: 'set-status', targetId: target?.id ?? '', statusId: target && isStatusNode(target) ? target.props.initialStatusId : '' };
  const condition: BehaviorCondition = eventType === 'slider-change'
    ? { type: 'compare', valueType: 'Number', operator: 'greater-than', left: { type: 'event-value', field: 'value' }, right: { type: 'constant', value: source?.type === 'minecraft:slider' ? source.props.initialValue : 0 } }
    : { type: 'compare', valueType: 'OptionId', operator: 'equals', left: { type: 'event-value', field: 'optionId' }, right: { type: 'constant', value: source && isSelectionNode(source) ? source.props.initialSelectedOptionId : '' } };
  return { id, event: eventType === 'slider-change' ? { type: eventType, sourceId: source?.id ?? '' } : { type: eventType, sourceId: source?.id ?? '' }, actions: [{ type: 'if', condition, thenActions: [leaf], elseActions: [] }] };
}

/** Derived projections retain the exact authority branch shape. */
export function branchActionSpecification(action: ConditionalBehaviorAction | SwitchBehaviorAction) {
  if (action.type === 'switch') return { ...action, cases: action.cases.map(entry => ({ ...entry, actions: entry.actions.map(conditionalLeafSpecification) })), ...(action.defaultActions ? { defaultActions: action.defaultActions.map(conditionalLeafSpecification) } : {}) };
  return { ...action, thenActions: action.thenActions.map(conditionalLeafSpecification), elseActions: action.elseActions.map(conditionalLeafSpecification), ...(action.elseIf !== undefined ? { elseIf: action.elseIf.map(entry => ({ ...entry, actions: entry.actions.map(conditionalLeafSpecification) })) } : {}) };
}
