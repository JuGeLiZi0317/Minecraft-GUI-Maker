import type * as Blockly from 'blockly/core';
import { actionsOf, behaviorLeafActions, legacySourcesOf as sourcesOf, isLookupExpression, type Behavior, type BehaviorAction, type ConditionalBehaviorAction, type SetStatusAction, type BehaviorCondition, type LookupExpressionSpec, type TextValueExpression, behaviorConditionSchema, behaviorActionSchema } from '../domain/schema';

export type BlockState = Blockly.serialization.blocks.State;
export type BehaviorWorkspaceState = { blocks?: { languageVersion: number; blocks: BlockState[] } };
export const BLOCK_TYPES = ['gui_switch', 'gui_if_chain', 'gui_on_selection', 'gui_selection_source', 'gui_event_option', 'gui_if_option', 'gui_if', 'gui_status_map', 'gui_mapping_pair', 'gui_shared_status_map', 'gui_set_status', 'gui_set_status_direct', 'gui_if_selection', 'gui_on_selection_single', 'gui_on_event', 'gui_event_value', 'gui_constant', 'gui_read_control', 'gui_compare', 'gui_and', 'gui_or', 'gui_not', 'gui_action', 'gui_set_visible', 'gui_set_text', 'gui_exclusive_visible', 'gui_exclusive_pair'] as const;
/** Compare editable behavior content even when the graph is incomplete. Layout and Blockly block IDs are UI state. */
export function workspaceDraftSignature(state: BehaviorWorkspaceState): string {
  const content = (block: BlockState): unknown => ({
    type: block.type, extraState: block.extraState, fields: block.fields ?? {}, enabled: block.enabled === false ? false : undefined,
    disabledReasons: block.disabledReasons?.length ? block.disabledReasons : undefined,
    inputs: Object.fromEntries(Object.entries(block.inputs ?? {}).map(([name, connection]) => [name, {
      block: connection.block ? content(connection.block) : undefined,
      shadow: connection.shadow ? content(connection.shadow) : undefined,
    }])),
    next: block.next ? { block: block.next.block ? content(block.next.block) : undefined, shadow: block.next.shadow ? content(block.next.shadow) : undefined } : undefined,
  });
  return JSON.stringify((state.blocks?.blocks ?? []).map(content));
}

const isStatus = (action: BehaviorAction): action is SetStatusAction => action.type === 'set-status';
const isInspectorAction = (action: BehaviorAction) => action.type === 'set-visible' || action.type === 'set-text';
const isExclusiveAction = (action: BehaviorAction) => action.type === 'set-exclusive-visible';
const isCondition = (action: BehaviorAction): action is ConditionalBehaviorAction => action.type === 'if';
export const canEditWithBlocks = (rule: Behavior) => (rule.event.type === 'selection-change' || rule.event.type === 'slider-change')
  && actionsOf(rule).every(action => isStatus(action) || isCondition(action) || action.type === 'switch' || action.type === 'set-progress-value' || isInspectorAction(action) || isExclusiveAction(action))
  && actionsOf(rule).flatMap(behaviorLeafActions).every(action => isInspectorAction(action) || isExclusiveAction(action) || (rule.event.type === 'slider-change' ? action.type === 'set-progress-value' || (action.type === 'set-status' && 'statusId' in action) : isStatus(action)))
  && 1 + sourcesOf(rule).length + actionsOf(rule).length * 8 + actionsOf(rule).flatMap(behaviorLeafActions).reduce((count, action) => count + 5 + ('optionMappings' in action ? action.optionMappings.length : 0) + ('mapping' in action && Array.isArray(action.mapping) ? action.mapping.length : 0), 0) <= 1000;

const chain = (blocks: BlockState[]): BlockState | undefined => blocks.reduceRight<BlockState | undefined>((next, block) => ({ ...block, ...(next ? { next: { block: next } } : {}) }), undefined);
const statusValueToBlock = (action: SetStatusAction): BlockState => {
  if ('statusId' in action) return { type: 'gui_set_status_direct', fields: { TARGET: action.targetId, STATUS: action.statusId } };
  const pairs = 'optionMappings' in action ? chain(action.optionMappings.map(mapping => ({ type: 'gui_mapping_pair', fields: { OPTION: mapping.optionId, STATUS: mapping.statusId } }))) : undefined;
  const value: BlockState = 'mapRef' in action
    ? { type: 'gui_shared_status_map', fields: { MAP: action.mapRef }, inputs: { OPTION: { block: { type: 'gui_event_option' } } } }
    : { type: 'gui_status_map', inputs: { OPTION: { block: { type: 'gui_event_option' } }, ...(pairs ? { PAIRS: { block: pairs } } : {}) } };
  return { type: 'gui_set_status', fields: { TARGET: action.targetId }, inputs: { VALUE: { block: value } } };
};
const operandToBlock = (value: Extract<BehaviorCondition, { type: 'compare' }>['left'], valueType: 'OptionId' | 'Number'): BlockState => value.type === 'event-value' ? { type: 'gui_event_value', fields: { FIELD: value.field } } : value.type === 'read-control-value' ? { type: 'gui_read_control', fields: { TYPE: valueType, TARGET: value.nodeId } } : { type: 'gui_constant', fields: { TYPE: valueType, VALUE: value.value } };
const lookupToBlock = (value: LookupExpressionSpec): BlockState => ({ type: 'gui_lookup', fields: { MAPPING: value.mappingId }, inputs: { INPUT: { block: operandToBlock(value.input, 'OptionId') } } });
/** Typed text value: a literal constant or a Lookup; both carry the GuiText connection type. */
const textValueToBlock = (value: TextValueExpression): BlockState => isLookupExpression(value) ? lookupToBlock(value) : value.kind === 'literal'
  ? ({ type: 'gui_constant', fields: { TYPE: 'Text', VALUE: value.value } })
  : ({ type: 'gui_text_constant', fields: { KEY: value.key, FALLBACK: value.fallback } });
const genericLeafToBlock = (action: ConditionalBehaviorAction['thenActions'][number]): BlockState => {
  if (action.type === 'set-visible') return { type: 'gui_set_visible', fields: { TARGET: action.targetId, VISIBLE: String(action.visible) } };
  if (action.type === 'set-text') return 'text' in action ? { type: 'gui_set_text', fields: { TARGET: action.targetId, TEXT: action.text } } : { type: 'gui_set_text', fields: { TARGET: action.targetId }, inputs: { VALUE: { block: textValueToBlock(action.value) } } };
  return action.type === 'set-progress-value'
  ? { type: 'gui_action', fields: { PROPERTY: 'currentValue', TARGET: action.targetId, MAPPING: action.mapping }, inputs: { VALUE: { block: { type: 'gui_event_value', fields: { FIELD: 'value' } } } } }
  : { type: 'gui_action', fields: { PROPERTY: 'currentStatusId', TARGET: action.targetId }, inputs: { VALUE: { block: 'statusId' in action ? { type: 'gui_constant', fields: { TYPE: 'StatusId', VALUE: action.statusId } } : statusValueToBlock(action).inputs!.VALUE.block! } } };
};
const conditionToBlock = (condition: BehaviorCondition): BlockState => {
  if (condition.type === 'event-option') return { type: 'gui_if_option', fields: { OPERATOR: condition.operator, OPTION: condition.optionId }, inputs: { EVENT: { block: { type: 'gui_event_option' } } } };
  if (condition.type === 'not') return { type: 'gui_not', inputs: { CONDITION: { block: conditionToBlock(condition.condition) } } };
  if (condition.type === 'and' || condition.type === 'or') return { type: `gui_${condition.type}`, extraState: { count: condition.conditions.length }, inputs: Object.fromEntries(condition.conditions.map((c, i) => [`C${i}`, { block: conditionToBlock(c) }])) };
  return { type: 'gui_compare', fields: { TYPE: condition.valueType, OPERATOR: condition.operator }, inputs: { LEFT: { block: operandToBlock(condition.left, condition.valueType) }, RIGHT: { block: operandToBlock(condition.right, condition.valueType) } } };
};
const actionToBlock = (action: BehaviorAction): BlockState => {
  if (action.type === 'switch') return { type: 'gui_switch', fields: { TYPE: action.valueType }, extraState: { count: action.cases.length, hasDefault: action.defaultActions !== undefined, valueType: action.valueType }, inputs: {
    VALUE: { block: operandToBlock(action.value, action.valueType) },
    ...Object.fromEntries(action.cases.flatMap((entry, i) => [[`CASE${i}`, { block: operandToBlock(typeof entry.value === 'number' ? { type: 'constant', value: entry.value } : { type: 'constant', value: entry.value }, action.valueType) }], [`DO${i}`, { block: chain(entry.actions.map(genericLeafToBlock)) }]])),
    ...(action.defaultActions !== undefined ? { FALLBACK: { block: chain(action.defaultActions.map(genericLeafToBlock)) } } : {}),
  } };
  if (action.type === 'if' && action.elseIf !== undefined) {
    const branches = [{ condition: action.condition, actions: action.thenActions }, ...action.elseIf];
    return { type: 'gui_if_chain', extraState: { count: branches.length, hasDefault: action.elseActions.length > 0 }, inputs: {
      ...Object.fromEntries(branches.flatMap((entry, i) => [[`CONDITION${i}`, { block: conditionToBlock(entry.condition) }], [`DO${i}`, { block: chain(entry.actions.map(genericLeafToBlock)) }]])),
      ...(action.elseActions.length ? { FALLBACK: { block: chain(action.elseActions.map(genericLeafToBlock)) } } : {}),
    } };
  }
  if (action.type === 'set-exclusive-visible') return { type: 'gui_exclusive_visible', fields: { FALLBACK: action.fallback }, inputs: {
    VALUE: { block: operandToBlock(action.value, 'OptionId') },
    MAPPING: { block: chain(action.mapping.map(entry => ({ type: 'gui_exclusive_pair', fields: { OPTION: entry.optionId, TARGET: entry.targetId } })))! },
  } };
  if (action.type === 'set-progress-value' || action.type === 'set-visible' || action.type === 'set-text') return genericLeafToBlock(action);
  if (action.type === 'if' && action.condition.type !== 'event-option') return { type: 'gui_if', inputs: {
    CONDITION: { block: conditionToBlock(action.condition) },
    THEN: { ...(chain(action.thenActions.map(genericLeafToBlock)) ? { block: chain(action.thenActions.map(genericLeafToBlock)) } : {}) },
    ELSE: { ...(chain(action.elseActions.map(genericLeafToBlock)) ? { block: chain(action.elseActions.map(genericLeafToBlock)) } : {}) },
  } };
  if (action.type === 'if' && action.condition.type === 'event-option' && action.condition.operator === 'equals' && [...action.thenActions, ...action.elseActions].some(leaf => 'statusId' in leaf)) return { type: 'gui_if_selection', fields: { OPTION: action.condition.optionId }, inputs: {
    THEN: { ...(chain(action.thenActions.map(actionToBlock)) ? { block: chain(action.thenActions.map(actionToBlock)) } : {}) },
    ELSE: { ...(chain(action.elseActions.map(actionToBlock)) ? { block: chain(action.elseActions.map(actionToBlock)) } : {}) },
  } };
  if (action.type === 'if' && action.condition.type === 'event-option') return { type: 'gui_if', inputs: {
    CONDITION: { block: { type: 'gui_if_option', fields: { OPERATOR: action.condition.operator, OPTION: action.condition.optionId }, inputs: { EVENT: { block: { type: 'gui_event_option' } } } } },
    THEN: { ...(chain(action.thenActions.map(actionToBlock)) ? { block: chain(action.thenActions.map(actionToBlock)) } : {}) },
    ELSE: { ...(chain(action.elseActions.map(actionToBlock)) ? { block: chain(action.elseActions.map(actionToBlock)) } : {}) },
  } };
  if (action.type !== 'set-status') throw new Error(`Blockly 不支持动作 ${action.type}`);
  return statusValueToBlock(action);
};

/** Generate an editor graph from authority. No Blockly graph is stored in the project. */
function buildBehaviorWorkspace(rule: Behavior): BehaviorWorkspaceState {
  if (!canEditWithBlocks(rule)) throw new Error('Blockly 支持 selection-change / slider-change 及状态、进度、可见性、静态文本的有限动作。原规则保持原样');
  if (rule.event.type === 'slider-change' || actionsOf(rule).some(action => action.type === 'if' && action.condition.type !== 'event-option')) {
    if (sourcesOf(rule).length === 1) return { blocks: { languageVersion: 0, blocks: [{ type: 'gui_on_event', x: 24, y: 24, fields: { EVENT: rule.event.type, SOURCE: rule.event.sourceId }, inputs: { DO: { block: chain(actionsOf(rule).map(action => action.type === 'set-status' || action.type === 'set-progress-value' ? genericLeafToBlock(action) : actionToBlock(action)))! } } }] } };
  }
  const sources = chain(sourcesOf(rule).map(id => ({ type: 'gui_selection_source', fields: { SOURCE: id } })));
  const actions = chain(actionsOf(rule).map(actionToBlock));
  if (sourcesOf(rule).length === 1 && actionsOf(rule).flatMap(behaviorLeafActions).some(action => action.type === 'set-status' && 'statusId' in action)) return { blocks: { languageVersion: 0, blocks: [{ type: 'gui_on_selection_single', x: 24, y: 24, fields: { SOURCE: rule.event.sourceId }, inputs: { DO: { ...(actions ? { block: actions } : {}) } } }] } };
  return { blocks: { languageVersion: 0, blocks: [{ type: 'gui_on_selection', x: 24, y: 24, inputs: { SOURCES: { block: sources! }, DO: { ...(actions ? { block: actions } : {}) } } }] } };
}

/** Interpret only the allowlisted Blockly shapes into the existing strong F2 contract. No code generation. */
export function workspaceToBehavior(state: BehaviorWorkspaceState, ruleId: string, original?: Behavior): Behavior {
  const roots = state.blocks?.blocks ?? [];
  if (roots.length !== 1) throw new Error('需要且只能有一个选择变化事件入口；请连接或删除游离积木');
  const visited = new Set<BlockState>();
  const visit = (block: BlockState | undefined, type: string, inputs: string[] = [], fields: string[] = [], next = false): BlockState => {
    if (!block || block.type !== type) throw new Error(`积木连接不完整：需要 ${type}`);
    if (visited.has(block) || visited.size >= 1000) throw new Error('积木图重复、循环或超出 B1 上限');
    visited.add(block);
    if (block.enabled === false || block.disabledReasons?.length) throw new Error('请删除或启用被禁用的积木；不会静默忽略它');
    if ((!next && block.next) || Object.keys(block.inputs ?? {}).some(key => !inputs.includes(key)) || Object.keys(block.fields ?? {}).some(key => !fields.includes(key))) throw new Error(`积木 ${type} 含未支持的连接或字段`);
    return block;
  };
  const input = (block: BlockState, name: string) => { const connection = block.inputs?.[name]; if (connection?.shadow) throw new Error('不接受隐式 shadow 行为'); return connection?.block; };
  const next = (block: BlockState) => { if (block.next?.shadow) throw new Error('不接受 shadow 动作'); return block.next?.block; };
  const field = (block: BlockState, name: string): string => { const value = block.fields?.[name]; if (typeof value !== 'string' || !value) throw new Error(`请配置 ${name} 字段`); return value; };
  const generic = roots[0].type === 'gui_on_event';
  const single = generic || roots[0].type === 'gui_on_selection_single';
  const root = generic ? visit(roots[0], 'gui_on_event', ['DO'], ['EVENT', 'SOURCE']) : single ? visit(roots[0], 'gui_on_selection_single', ['DO'], ['SOURCE']) : visit(roots[0], 'gui_on_selection', ['SOURCES', 'DO']);
  const ids: string[] = single ? [field(root, 'SOURCE')] : [];
  for (let block = input(root, 'SOURCES'); block; block = next(block)) { visit(block, 'gui_selection_source', [], ['SOURCE'], true); ids.push(field(block, 'SOURCE')); }
  if (!ids.length) throw new Error('至少需要一个有效来源控件');
  if (new Set(ids).size !== ids.length) throw new Error('来源 ID 不能重复');
  const parseStatus = (block: BlockState | undefined): SetStatusAction => {
    if (block?.type === 'gui_action') {
      visit(block, 'gui_action', ['VALUE'], ['PROPERTY', 'TARGET'], true);
      if (field(block, 'PROPERTY') !== 'currentStatusId') throw new Error('此动作需要 StatusId 能力');
      const value = input(block, 'VALUE');
      if (value?.type === 'gui_constant') { visit(value, 'gui_constant', [], ['TYPE', 'VALUE']); if (field(value, 'TYPE') !== 'StatusId') throw new Error('状态能力参数需要 StatusId，不能隐式转换'); return { type: 'set-status', targetId: field(block, 'TARGET'), statusId: field(value, 'VALUE') }; }
    }
    if (block?.type === 'gui_set_status_direct') { visit(block, 'gui_set_status_direct', [], ['TARGET', 'STATUS'], true); return { type: 'set-status', targetId: field(block, 'TARGET'), statusId: field(block, 'STATUS') }; }
    if (block?.type !== 'gui_action') visit(block, 'gui_set_status', ['VALUE'], ['TARGET'], true);
    const mapping = input(block!, 'VALUE');
    if (mapping?.type === 'gui_constant') { visit(mapping, 'gui_constant', [], ['TYPE', 'VALUE']); if (field(mapping, 'TYPE') !== 'StatusId') throw new Error('状态参数需要 StatusId，不能隐式转换'); return { type: 'set-status', targetId: field(block!, 'TARGET'), statusId: field(mapping, 'VALUE') }; }
    if (mapping?.type === 'gui_shared_status_map') {
      visit(mapping, 'gui_shared_status_map', ['OPTION'], ['MAP']); visit(input(mapping, 'OPTION'), 'gui_event_option');
      return { type: 'set-status', targetId: field(block!, 'TARGET'), mapRef: field(mapping, 'MAP') };
    }
    const inline = visit(mapping, 'gui_status_map', ['OPTION', 'PAIRS']); visit(input(inline, 'OPTION'), 'gui_event_option');
    const optionMappings: { optionId: string; statusId: string }[] = [];
    for (let pair = input(inline, 'PAIRS'); pair; pair = next(pair)) { visit(pair, 'gui_mapping_pair', [], ['OPTION', 'STATUS'], true); optionMappings.push({ optionId: field(pair, 'OPTION'), statusId: field(pair, 'STATUS') }); }
    return { type: 'set-status', targetId: field(block!, 'TARGET'), optionMappings };
  };
  const parseLeaf = (block: BlockState): ConditionalBehaviorAction['thenActions'][number] => {
    if (block.type === 'gui_set_visible') {
      visit(block, 'gui_set_visible', [], ['TARGET', 'VISIBLE'], true);
      const visible = field(block, 'VISIBLE');
      if (visible !== 'true' && visible !== 'false') throw new Error('可见性动作需要显式 Boolean 值');
      return { type: 'set-visible', targetId: field(block, 'TARGET'), visible: visible === 'true' };
    }
    if (block.type === 'gui_set_text') {
      const targetId = field(visit(block, 'gui_set_text', ['VALUE'], ['TARGET', 'TEXT'], true), 'TARGET'), valueBlock = input(block, 'VALUE');
      if (valueBlock) {
        if (typeof block.fields?.TEXT === 'string' && block.fields.TEXT) throw new Error('显示文本动作不能同时使用字符串字段与值输入');
        return behaviorActionSchema.parse({ type: 'set-text', targetId, value: parseTextValue(valueBlock) }) as ConditionalBehaviorAction['thenActions'][number];
      }
      if (typeof block.fields?.TEXT !== 'string') throw new Error('显示文本动作需要字符串常量或类型化文本值');
      return { type: 'set-text', targetId, text: block.fields.TEXT };
    }
    if (block.type === 'gui_action' && block.fields?.PROPERTY === 'currentValue') {
      visit(block, 'gui_action', ['VALUE'], ['PROPERTY', 'TARGET', 'MAPPING'], true);
      if (input(block, 'VALUE')?.type !== 'gui_event_value') throw new Error('当前进度值仅支持本次事件数值，Number 常量目前仅用于比较');
      const value = visit(input(block, 'VALUE'), 'gui_event_value', [], ['FIELD']);
      if (field(value, 'FIELD') !== 'value') throw new Error('进度能力需要当前事件 Number 值');
      const mapping = field(block, 'MAPPING'); if (mapping !== 'direct' && mapping !== 'normalize') throw new Error('不支持的数值映射');
      return { type: 'set-progress-value', targetId: field(block, 'TARGET'), mapping };
    }
    return parseStatus(block);
  };
  const parseStatusChain = (block: BlockState | undefined) => {
    const result: ConditionalBehaviorAction['thenActions'] = [];
    for (let current = block; current; current = next(current)) {
      if (!['gui_set_status', 'gui_set_status_direct', 'gui_action', 'gui_set_visible', 'gui_set_text'].includes(current.type)) throw new Error('if 分支只允许受支持的叶动作；不支持嵌套条件');
      result.push(parseLeaf(current));
    }
    return result;
  };
  const parseOperand = (value: BlockState | undefined, valueType: 'OptionId' | 'Number') => {
      if (value?.type === 'gui_event_option' && valueType === 'OptionId') { visit(value, 'gui_event_option'); return { type: 'event-value' as const, field: 'optionId' as const }; }
      if (value?.type === 'gui_event_value') { visit(value, 'gui_event_value', [], ['FIELD']); const payload = field(value, 'FIELD'); if (payload !== (valueType === 'Number' ? 'value' : 'optionId')) throw new Error('事件值与比较类型不兼容'); return { type: 'event-value' as const, field: payload }; }
      if (value?.type === 'gui_read_control') { visit(value, 'gui_read_control', [], ['TYPE', 'TARGET']); if (field(value, 'TYPE') !== valueType) throw new Error('读取类型不兼容'); return { type: 'read-control-value' as const, nodeId: field(value, 'TARGET') }; }
      const constant = visit(value, 'gui_constant', [], ['TYPE', 'VALUE']);
      if (field(constant, 'TYPE') !== valueType) throw new Error('常量与比较类型不兼容；OptionId 不等于 StatusId');
      const raw = constant.fields?.VALUE;
      if (valueType === 'Number') { if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error('Number 常量必须为有限数，不接受字符串转换'); return { type: 'constant' as const, value: raw }; }
      return { type: 'constant' as const, value: field(constant, 'VALUE') };
    };
  const parseTextValue = (block: BlockState): TextValueExpression => {
    if (block.type === 'gui_text_constant') {
      visit(block, 'gui_text_constant', [], ['KEY', 'FALLBACK']);
      return { kind: 'translate', key: field(block, 'KEY'), fallback: typeof block.fields?.FALLBACK === 'string' ? block.fields.FALLBACK : '' };
    }
    if (block.type === 'gui_constant') {
      visit(block, 'gui_constant', [], ['TYPE', 'VALUE']);
      if (field(block, 'TYPE') !== 'Text') throw new Error('文本值需要 Text 常量，不能隐式转换');
      const raw = block.fields?.VALUE;
      if (typeof raw !== 'string') throw new Error('Text 常量必须是字符串');
      return { kind: 'literal', value: raw };
    }
    visit(block, 'gui_lookup', ['INPUT'], ['MAPPING']);
    return { type: 'lookup', mappingId: field(block, 'MAPPING'), input: parseOperand(input(block, 'INPUT'), 'OptionId') as LookupExpressionSpec['input'] };
  };
  const parseExclusive = (block: BlockState): BehaviorAction => {
    visit(block, 'gui_exclusive_visible', ['VALUE', 'MAPPING'], ['FALLBACK'], true);
    const fallback = field(block, 'FALLBACK');
    if (fallback !== 'hide-all' && fallback !== 'keep-current') throw new Error('互斥可见性映射需要 hide-all 或 keep-current 回退');
    const mapping: { optionId: string; targetId: string }[] = [];
    for (let pair = input(block, 'MAPPING'); pair; pair = next(pair)) {
      visit(pair, 'gui_exclusive_pair', [], ['OPTION', 'TARGET'], true);
      mapping.push({ optionId: field(pair, 'OPTION'), targetId: field(pair, 'TARGET') });
    }
    if (!mapping.length) throw new Error('互斥可见性映射至少需要一个 选项 → 目标 条目');
    return behaviorActionSchema.parse({ type: 'set-exclusive-visible', value: parseOperand(input(block, 'VALUE'), 'OptionId'), mapping, fallback }) as BehaviorAction;
  };
  const parseCompare = (block: BlockState): BehaviorCondition => {
    visit(block, 'gui_compare', ['LEFT', 'RIGHT'], ['TYPE', 'OPERATOR']);
    const valueType = field(block, 'TYPE'), operator = field(block, 'OPERATOR');
    if (valueType !== 'OptionId' && valueType !== 'Number') throw new Error('比较仅支持 OptionId / Number');

    const candidate = { type: 'compare', valueType, operator, left: parseOperand(input(block, 'LEFT'), valueType), right: parseOperand(input(block, 'RIGHT'), valueType) };
    return behaviorConditionSchema.parse(candidate);
  };
      let count = 0;
      const parseCondition = (node: BlockState | undefined, depth: number): BehaviorCondition => {
        if (++count > 32 || depth > 4) throw new Error('条件树最多 32 节点、布尔组合最多 4 层');
        if (node?.type === 'gui_compare') return parseCompare(node);
        if (node?.type === 'gui_not') { visit(node, 'gui_not', ['CONDITION']); return { type: 'not', condition: parseCondition(input(node, 'CONDITION'), depth + 1) }; }
        if (node?.type === 'gui_and' || node?.type === 'gui_or') {
          const names = Object.keys(node.inputs ?? {}).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
          if (names.length < 2 || names.some((name, i) => name !== `C${i}`)) throw new Error('且/或需要至少两个连续条件');
          visit(node, node.type, names); return { type: node.type === 'gui_and' ? 'and' : 'or', conditions: names.map(name => parseCondition(input(node, name), depth + 1)) };
        }
        const legacy = visit(node, 'gui_if_option', ['EVENT'], ['OPTION', 'OPERATOR']); visit(input(legacy, 'EVENT'), 'gui_event_option');
        const optionId = field(legacy, 'OPTION'), operator = field(legacy, 'OPERATOR');
        if (operator !== 'equals' && operator !== 'not-equals') throw new Error('条件操作符仅支持 equals / not-equals');
        return { type: 'event-option', operator, optionId };
      };
  const actions: BehaviorAction[] = [];
  for (let block = input(root, 'DO'); block; block = next(block)) {
    if (['gui_set_status', 'gui_set_status_direct', 'gui_action', 'gui_set_visible', 'gui_set_text'].includes(block.type)) actions.push(parseLeaf(block));
    else if (block.type === 'gui_exclusive_visible') actions.push(parseExclusive(block));
    else if (block.type === 'gui_switch' || block.type === 'gui_if_chain') {
      const shape = block.extraState as { count?: number; hasDefault?: boolean } | undefined;
      const size = shape?.count;
      if (!Number.isInteger(size) || size! < 1 || size! > 16) throw new Error('分支数量必须为 1–16');
      const isSwitch = block.type === 'gui_switch';
      const names = Array.from({ length: size! }, (_, i) => [`${isSwitch ? 'CASE' : 'CONDITION'}${i}`, `DO${i}`]).flat();
      visit(block, block.type, [...names, ...(isSwitch ? ['VALUE'] : []), ...(shape?.hasDefault ? ['FALLBACK'] : [])], isSwitch ? ['TYPE'] : [], true);
      const fallback = shape?.hasDefault ? parseStatusChain(input(block, 'FALLBACK')) : undefined;
      if (isSwitch) {
        const valueType = field(block, 'TYPE');
        if (valueType !== 'OptionId' && valueType !== 'Number') throw new Error('Switch 仅支持 OptionId / Number');
        const value = parseOperand(input(block, 'VALUE'), valueType);
        const cases = Array.from({ length: size! }, (_, i) => {
          const constant = input(block!, `CASE${i}`);
          if (constant?.type !== 'gui_constant') throw new Error(`Case ${i + 1} 必须为类型化常量`);
          const operand = parseOperand(constant, valueType);
          if (operand.type !== 'constant') throw new Error('Case 必须为常量');
          return { value: operand.value, actions: parseStatusChain(input(block!, `DO${i}`)) };
        });
        actions.push(behaviorActionSchema.parse({ type: 'switch', valueType, value, cases, ...(fallback ? { defaultActions: fallback } : {}) }));
      } else {
        const branches = Array.from({ length: size! }, (_, i) => {
          count = 0;
          return { condition: behaviorConditionSchema.parse(parseCondition(input(block!, `CONDITION${i}`), 0)), actions: parseStatusChain(input(block!, `DO${i}`)) };
        });
        actions.push(behaviorActionSchema.parse({ type: 'if', condition: branches[0].condition, thenActions: branches[0].actions, elseIf: branches.slice(1), elseActions: fallback ?? [] }));
      }
    }
    else if (block.type === 'gui_if_selection') {
      visit(block, 'gui_if_selection', ['THEN', 'ELSE'], ['OPTION'], true);
      const thenActions = parseStatusChain(input(block, 'THEN')), elseActions = parseStatusChain(input(block, 'ELSE'));
      if (!thenActions.length) throw new Error('请至少连接一个 then 分支动作');
      actions.push({ type: 'if', condition: { type: 'event-option', operator: 'equals', optionId: field(block, 'OPTION') }, thenActions, elseActions });
    }
    else if (block.type === 'gui_if') {
      visit(block, 'gui_if', ['CONDITION', 'THEN', 'ELSE'], [], true);
      const conditionBlock = input(block, 'CONDITION');
      count = 0;
      const condition = behaviorConditionSchema.parse(parseCondition(conditionBlock, 0));
      const branches = { thenActions: parseStatusChain(input(block, 'THEN')), elseActions: parseStatusChain(input(block, 'ELSE')) };
      if (!branches.thenActions.length) throw new Error('请至少连接一个 then 分支动作');
      actions.push({ type: 'if', condition, ...branches });
    } else throw new Error(`不支持的动作积木 ${block.type}`);
  }
  if (!actions.length) throw new Error('至少需要一个动作');
  const eventType = generic ? field(root, 'EVENT') : 'selection-change';
  if (eventType !== 'selection-change' && eventType !== 'slider-change') throw new Error('通用入口暂不支持该事件');
  const event: Behavior['event'] = eventType === 'slider-change' ? { type: eventType, sourceId: ids[0] } : { type: 'selection-change', sourceId: ids[0], ...(ids.length > 1 ? { additionalSourceIds: ids.slice(1) } : {}) };
  const bindings = original?.eventBindings ? { eventBindings: structuredClone(original.eventBindings) } : {};
  return original && 'action' in original && actions.length === 1 ? { id: ruleId, event, ...bindings, action: actions[0] } : { id: ruleId, event, ...bindings, actions };
}

/** Blockly checks a child's output before loading fields: shape metadata must precede connection. It is editor-only, never authority JSON. */
export function behaviorToWorkspace(rule: Behavior): BehaviorWorkspaceState {
  const state = buildBehaviorWorkspace(rule);
  const shape = (block: BlockState) => {
    if (block.type === 'gui_event_value') block.extraState = { field: block.fields?.FIELD };
    if (block.type === 'gui_constant' || block.type === 'gui_compare' || block.type === 'gui_read_control') block.extraState = { valueType: block.fields?.TYPE };
    if (block.type === 'gui_action') block.extraState = { property: block.fields?.PROPERTY };
    for (const connection of Object.values(block.inputs ?? {})) if (connection.block) shape(connection.block);
    if (block.next?.block) shape(block.next.block);
  };
  for (const block of state.blocks?.blocks ?? []) shape(block);
  return state;
}
