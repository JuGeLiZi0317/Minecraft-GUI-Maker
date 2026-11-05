import { actionsOf, conditionLeaves, eventBindingsOf, matchesBehaviorEvent, statusMappingsOf, statusAssignmentOf, type Behavior, type BehaviorCondition, type BehaviorLeafCondition, type ConditionalBehaviorAction, type GuiNode, type GuiScreen } from './schema';
import { isSelectionNode, type SelectionEvent } from './selection';
import { isStatusNode } from './statusIndicator';
import { validValue, type SliderChangeEvent } from './numeric';
import { mapSliderToProgress } from './progressBinding';
import { resolveOptionStatusMapping } from './selectionStatusBinding';

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
  types: BEHAVIOR_VALUE_TYPES, implemented: { compare: ['OptionId', 'Number'], constants: ['OptionId', 'Number', 'StatusId'], Boolean: 'condition result only', Text: 'reserved; no new generic value/condition/action support' },
  events: TYPED_EVENTS, properties: RUNTIME_PROPERTIES,
  operators: { OptionId: ['equals', 'not-equals'], Number: ['equals', 'not-equals', 'greater-than', 'less-than', 'greater-or-equal', 'less-or-equal'] },
  compare: 'both operands have the declared valueType; current-event fields, same-Screen control session values and finite typed constants; OptionId equals/not-equals; Number also supports ordered comparisons; no implicit conversion or arithmetic',
  scope: 'same Screen stable references, explicit control values and current event only; OptionId and StatusId are distinct nominal types; no undeclared reads or shared variables',
  execution: 'one rule/action/branch interpreter for both event domains; preserve array order; execute exactly one branch; invalid/missing values execute neither branch; last valid action wins',
  adapter: 'legacy event-option lowers to a typed OptionId comparison at execution only; authority JSON is not rewritten; generic actions lower to existing set-status or set-progress-value contracts',
  progress: 'currentValue consumes only the current validated Slider event via existing direct/normalize mapSliderToProgress; numeric constants are compare operands, not a new progress assignment mode',
  lifecycle: 'initialize source and target independently; no initial event; session values/logs reset on Screen open/navigation/restart/document changes; design initial values and PNG unchanged',
  controlReads: { scope: 'same Screen; committed session values initialized on open; trigger source updated first; one immutable read snapshot per event; hidden/disabled controls remain readable; missing or incompatible values are invalid; no cascaded events', types: { Number: 'Slider', OptionId: 'Radio Group or Dropdown' }, sliderStatus: 'slider-change may execute explicit constant statusId; option mappings remain selection-change only' },
  triggers: 'explicit eventBindings declare type, sourceId and payloadType for every subscription; legacy event and additionalSourceIds retain their original semantics; reading a control never subscribes to it; each matching rule executes at most once per event; current-event fields must exist on every bound event path',
  boolean: { operators: ['and', 'or', 'not'], maxDepth: 4, maxNodes: 32, evaluation: 'left to right short circuit; invalid propagates and skips both branches; skipped conditions are not evaluated', legacy: 'existing leaf conditions and action limits unchanged' },
  runtime: 'structured implementation intent only; implementer supplies Minecraft callbacks; no Blockly or JavaScript runtime and no generated Java',
} as const;

function evaluateLeaf(condition: BehaviorLeafCondition, event: TypedBehaviorEvent, readControl?: (nodeId: string, valueType: 'Number' | 'OptionId') => number | string | undefined): { value: boolean; description: string } | { error: string } {
  if (condition.type === 'event-option') {
    if (event.type !== 'selection-change' || typeof event.optionId !== 'string') return { error: 'event-option 缺少本次事件 OptionId' };
    return { value: condition.operator === 'equals' ? event.optionId === condition.optionId : event.optionId !== condition.optionId, description: `event-option ${condition.operator} ${condition.optionId}` };
  }
  if ([condition.left, condition.right].some(v => v.type === 'event-value') && ((condition.valueType === 'Number' && event.type !== 'slider-change') || (condition.valueType === 'OptionId' && event.type !== 'selection-change'))) return { error: '比较类型与当前事件不兼容' };
  if (!(GENERIC_BEHAVIOR_CONTRACT.operators[condition.valueType] as readonly string[]).includes(condition.operator)) return { error: '不支持的比较操作符' };
  const read = (operand: typeof condition.left): number | string | undefined => operand.type === 'constant' ? operand.value : operand.type === 'read-control-value' ? readControl?.(operand.nodeId, condition.valueType) : condition.valueType === 'Number' ? event.type === 'slider-change' ? event.value : undefined : event.type === 'selection-change' ? event.optionId : undefined;
  const left = read(condition.left), right = read(condition.right);
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
  return screen.behaviors.some(rule => !!rule.eventBindings || actionsOf(rule).some(a => a.type === 'if' && conditionLeaves(a.condition).some(c => c.type === 'compare' && [c.left,c.right].some(v => v.type === 'read-control-value'))) || (rule.event.type === 'slider-change' && actionsOf(rule).some(a => a.type === 'set-status' || (a.type === 'if' && [...a.thenActions,...a.elseActions].some(leaf => leaf.type === 'set-status')))));
}
export function initialControlState(screen: GuiScreen): RuntimeBehaviorState {
  if (!usesControlState(screen)) return {};
  const result: RuntimeBehaviorState = {}; for (const node of screen.nodes) { if (node.type === 'minecraft:slider') result[node.id] = {sliderValue:node.props.initialValue}; else if (isSelectionNode(node)) result[node.id] = {optionId:node.props.initialSelectedOptionId}; } return result;
}

/** Existing selection and Slider callbacks enter this same ordered F2 interpreter. UI retains lifecycle/visibility guards. */
export function reduceTypedBehaviorEvent(screen: GuiScreen, previous: RuntimeBehaviorState | null, event: TypedBehaviorEvent, availability?: { sourceVisible: boolean }) {
  const next = structuredClone(previous ?? {}), outcomes: string[] = [], matchedRuleIds: string[] = [];
  const source = screen.nodes.find(node => node.id === event.nodeId);
  if (event.screenId !== screen.id || !source || !isTypedEventSource(source, event.type) || !('enabled' in source.state) || !source.state.enabled || !(availability?.sourceVisible ?? previous?.[source.id]?.visible ?? source.state.visible)) return { next, outcomes: ['事件来源不可用或不属于当前 Screen，未执行'], matchedRuleIds };
  if (event.type === 'slider-change' ? source.type !== 'minecraft:slider' || event.phase !== 'change' || !Number.isFinite(event.value) || !validValue(source.props, event.value) : !isSelectionNode(source) || event.phase !== 'confirm' || !source.props.options.some(option => option.id === event.optionId)) return { next, outcomes: ['事件载荷无效，未执行任何规则'], matchedRuleIds };
  if (event.type === 'selection-change' && isSelectionNode(source) && source.props.options.find(option => option.id === event.optionId)?.disabled) return { next, outcomes: ['禁用选项正常跳过，未执行任何规则'], matchedRuleIds };
  if (usesControlState(screen)) next[source.id] = { ...next[source.id], ...(event.type === 'slider-change' ? { sliderValue:event.value } : { optionId:event.optionId }) };
  const readView = structuredClone(next);
  type Leaf = ConditionalBehaviorAction['thenActions'][number];
  const execute = (ruleId: string, action: Leaf) => {
    const target = screen.nodes.find(node => node.id === action.targetId);
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
  for (const rule of screen.behaviors.filter(rule => matchesBehaviorEvent(rule, event.type, source.id))) {
    matchedRuleIds.push(rule.id);
    for (const action of actionsOf(rule)) {
      if (action.type === 'if') {
        const trace: string[] = [];
        const result = evaluateBehaviorCondition(action.condition, event, trace, c => {
          const optionIds = c.type === 'event-option' ? [c.optionId] : c.valueType === 'OptionId' ? [c.left, c.right].flatMap(value => value.type === 'constant' ? [value.value] : []) : [];
          const readIds = c.type === 'compare' ? [c.left,c.right].flatMap(v => v.type === 'read-control-value' ? [v.nodeId] : []) : [];
          const hasEvent = c.type === 'event-option' || (c.type === 'compare' && [c.left,c.right].some(v => v.type === 'event-value'));
          const selectionSources = eventBindingsOf(rule).filter(binding => binding.type === 'selection-change').map(binding => binding.sourceId);
          const ownerIds = readIds.length ? [...readIds, ...(hasEvent ? selectionSources : [])] : selectionSources;
          return optionIds.some(id => ownerIds.some(sourceId => { const owner = screen.nodes.find(node => node.id === sourceId); return !owner || !isSelectionNode(owner) || !owner.props.options.some(option => option.id === id); })) ? '条件选项引用无效' : undefined;
        }, (nodeId, valueType) => {
          const target = screen.nodes.find(node => node.id === nodeId), state = readView[nodeId];
          if (valueType === 'Number') return target?.type === 'minecraft:slider' && state && typeof state.sliderValue === 'number' && validValue(target.props, state.sliderValue) ? state.sliderValue : undefined;
          return target && isSelectionNode(target) && state && typeof state.optionId === 'string' && target.props.options.some(o => o.id === state.optionId) ? state.optionId : undefined;
        });
        if (action.condition.type !== 'event-option' && action.condition.type !== 'compare') outcomes.push(...trace.map(line => `规则 ${rule.id}：${line}`));
        if ('error' in result) { outcomes.push(`规则 ${rule.id}：条件未执行，${result.error}；两分支均跳过`); continue; }
        const active = result.value ? action.thenActions : action.elseActions, skipped = result.value ? action.elseActions : action.thenActions;
        outcomes.push(`规则 ${rule.id}：${result.description} → ${result.value ? 'true' : 'false'}，进入 ${result.value ? 'then' : 'else'}`);
        if (skipped.length) outcomes.push(`规则 ${rule.id}：未选分支跳过 ${skipped.length} 个动作`);
        if (!result.value && !active.length) outcomes.push(`规则 ${rule.id}：条件为假且 else 为空，正常跳过`);
        for (const leaf of active) execute(rule.id, leaf);
      } else if (action.type === 'set-status' || action.type === 'set-progress-value') execute(rule.id, action);
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
