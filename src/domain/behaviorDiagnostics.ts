import { actionsOf, eventBindingsOf, projectSchema, type BehaviorAction, type BehaviorCondition, type GuiNode, type GuiProject } from './schema';

export type DiagnosticKind = 'invalid-reference' | 'type-incompatible' | 'source-unavailable' | 'expected-skip' | 'no-matching-rule' | 'unmapped-option' | 'invalid-payload' | 'target-unavailable' | 'action-success' | 'unchanged' | 'condition-result' | 'information';
export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'success';
export type BehaviorDiagnostic = { kind: DiagnosticKind; severity: DiagnosticSeverity; message: string };
/** Classifies existing preview outcomes without dispatching events or interpreting rules a second time. */
export function classifyBehaviorOutcome(message: string): BehaviorDiagnostic {
  let kind: DiagnosticKind = 'information', severity: DiagnosticSeverity = 'info';
  if (/没有匹配.*规则|未匹配规则/.test(message)) kind = 'no-matching-rule';
  else if (/未映射/.test(message)) kind = 'unmapped-option';
  else if (/正常跳过|未选分支跳过|短路.*未求值/.test(message)) kind = 'expected-skip';
  else if (/来源.*(?:不可见|隐藏|禁用|未启用|不可用)|来源当前不可见|来源隐藏/.test(message)) { kind = 'source-unavailable'; severity = 'warning'; }
  else if (/载荷无效|事件值不是有效|值无效|非法事件值|条件未执行|\binvalid\b/.test(message)) { kind = 'invalid-payload'; severity = 'warning'; }
  else if (/目标.*(?:不存在|不可用)/.test(message)) { kind = 'target-unavailable'; severity = 'warning'; }
  else if (/类型不兼容|类型不匹配/.test(message)) { kind = 'type-incompatible'; severity = 'warning'; }
  else if (/引用无效|引用不存在/.test(message)) { kind = 'invalid-reference'; severity = 'warning'; }
  else if (/已是当前状态|数值未变化|无更新/.test(message)) kind = 'unchanged';
  else if (/已执行|已更新|已模拟执行/.test(message)) { kind = 'action-success'; severity = 'success'; }
  else if (/进入 then|进入 else/.test(message)) kind = 'condition-result';
  return { kind, severity, message };
}
export function classifyValidationIssue(message: string, code?: string): BehaviorDiagnostic {
  const kind: DiagnosticKind = /不存在|未声明|无效引用|必须引用/.test(message) ? 'invalid-reference' : /类型不匹配|类型不兼容|invalid_union|Invalid input/.test(`${code ?? ''} ${message}`) ? 'type-incompatible' : 'invalid-reference';
  return { kind, severity: 'error', message };
}
const f2Events: Partial<Record<GuiNode['type'], string[]>> = {
  'minecraft:button': ['button-click'], 'minecraft:checkbox': ['checkbox-change'], 'minecraft:fill': ['rectangle-click'],
  'minecraft:slider': ['slider-change'], 'minecraft:radio-group': ['selection-change'], 'minecraft:dropdown': ['selection-change'],
};
const builtIn = new Set<GuiNode['type']>(['minecraft:button', 'minecraft:checkbox', 'minecraft:edit-box', 'minecraft:cycle-button', 'minecraft:numeric-input', 'minecraft:slider', 'minecraft:radio-group', 'minecraft:dropdown', 'minecraft:tree-view', 'minecraft:scrollable-panel', 'minecraft:collapsible-panel', 'minecraft:fitting-multi-line-text-widget']);
const readOnly = new Set<GuiNode['type']>(['minecraft:status-indicator', 'minecraft:progress-bar', 'minecraft:image', 'minecraft:string-widget', 'minecraft:multi-line-text-widget']);
export type ActionReference = { path: string; type: BehaviorAction['type']; targetId?: string; targetCapability?: string; valueMode?: 'constant-status' | 'inline-map' | 'shared-map'; mapping?: 'direct' | 'normalize'; mapRef?: string; targetDeclarationId?: string; boundScreenId?: string | null };
export type RuleSummary = { screenId: string; ruleId: string; ruleIndex: number; event: { type: string; sourceIds: string[]; payloadType: string; payloadFields: string[] }; eventBindings: { type: string; sourceId: string; payloadType: string; payloadFields: string[] }[]; reads: { path: string; nodeId: string; valueType: 'Number' | 'OptionId' }[]; readDependencies: { path: string; nodeId: string; valueType: 'Number' | 'OptionId' }[]; actionTargets: ActionReference[]; conditions: { path: string; actionType: 'if'; type: string; operator: string; valueType: string; elseEmpty: boolean }[]; actions: ActionReference[]; staticValidation: { status: 'valid' | 'invalid'; issues: BehaviorDiagnostic[] }; runtimeResponsibility: string };
export type NodeBinding = { nodeId: string; sourceRuleIds: string[]; targetRuleIds: string[]; readRuleIds: string[]; f2EventTypes: string[]; declaredIntents: string[]; builtInInteraction: boolean; displayOnly: boolean; label: string; details: string };
const capabilities: Record<string, string> = { 'set-text': 'StringWidget.text', 'set-visible': 'node.visible', 'set-status': 'StatusIndicator.currentStatusId', 'set-progress-value': 'ProgressBar.currentValue', open_screen: 'Screen.navigation' };
export function buildBehaviorIndex(doc: GuiProject) {
  const parsed = projectSchema.safeParse(doc), issues = parsed.success ? [] : parsed.error.issues;
  return doc.screens.map((screen, screenIndex) => {
    const rules: RuleSummary[] = screen.behaviors.map((rule, ruleIndex) => {
      const eventType = rule.event.type, sourceIds = eventBindingsOf(rule).filter(binding => binding.type === rule.event.type).map(binding => binding.sourceId);
      const payloadType = eventType === 'selection-change' ? 'OptionId' : eventType === 'slider-change' ? 'Number' : 'none';
      const payloadFields = eventType === 'selection-change' ? ['screenId', 'nodeId', 'optionId', 'phase', 'source'] : eventType === 'slider-change' ? ['screenId', 'nodeId', 'value', 'phase'] : ['sourceId'];
      const eventBindings = eventBindingsOf(rule).map(binding => ({ ...binding, payloadFields: binding.type === 'selection-change' ? ['screenId','nodeId','optionId','phase','source'] : binding.type === 'slider-change' ? ['screenId','nodeId','value','phase'] : ['sourceId'] }));
      const conditions: RuleSummary['conditions'] = [], reads: RuleSummary['reads'] = [], actions: ActionReference[] = [];
      const leaf = (action: Exclude<BehaviorAction, { type: 'if' }>, path: string) => {
        if (action.type === 'open_screen') { const declaration = screen.screenTargets?.find(target => target.id === action.targetScreenId); actions.push({ path, type: action.type, targetCapability: capabilities[action.type], targetDeclarationId: action.targetScreenId, boundScreenId: declaration?.boundScreenId ?? null }); }
        else actions.push({ path, type: action.type, targetId: action.targetId, targetCapability: capabilities[action.type], ...(action.type === 'set-status' ? { valueMode: 'statusId' in action ? 'constant-status' as const : 'mapRef' in action ? 'shared-map' as const : 'inline-map' as const } : {}), ...(action.type === 'set-status' && 'mapRef' in action ? { mapRef: action.mapRef } : {}), ...(action.type === 'set-progress-value' ? { mapping: action.mapping } : {}) });
      };
      actionsOf(rule).forEach((action, index) => {
        const path = 'action' in rule ? 'action' : `actions[${index}]`;
        if (action.type !== 'if') { leaf(action, path); return; }
        const addCondition = (condition: BehaviorCondition, conditionPath: string) => {
          conditions.push({ path: conditionPath, actionType: 'if', type: condition.type, operator: condition.type === 'and' || condition.type === 'or' || condition.type === 'not' ? condition.type : condition.operator, valueType: condition.type === 'event-option' ? 'OptionId' : condition.type === 'compare' ? condition.valueType : 'Boolean', elseEmpty: action.elseActions.length === 0 });
          if (condition.type === 'compare') for (const side of ['left','right'] as const) { const operand = condition[side]; if (operand.type === 'read-control-value') reads.push({ path: `${conditionPath}.${side}`, nodeId: operand.nodeId, valueType: condition.valueType }); }
          if (condition.type === 'not') addCondition(condition.condition, `${conditionPath}.condition`);
          else if (condition.type === 'and' || condition.type === 'or') condition.conditions.forEach((child, i) => addCondition(child, `${conditionPath}.conditions[${i}]`));
        };
        addCondition(action.condition, `${path}.condition`);
        action.thenActions.forEach((entry, i) => leaf(entry, `${path}.thenActions[${i}]`));
        action.elseActions.forEach((entry, i) => leaf(entry, `${path}.elseActions[${i}]`));
      });
      const ruleIssues = issues.filter(issue => issue.path[0] === 'screens' && issue.path[1] === screenIndex && issue.path[2] === 'behaviors' && issue.path[3] === ruleIndex).map(issue => {
        const value = issue.path.reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<PropertyKey, unknown>)[key] : undefined, doc);
        const last = issue.path[issue.path.length - 1];
        if ((last === 'sourceId' || last === 'targetId') && typeof value === 'string' && screen.nodes.some(node => node.id === value) && /类型不匹配/.test(issue.message)) return { kind: 'type-incompatible' as const, severity: 'error' as const, message: issue.message };
        return classifyValidationIssue(issue.message, issue.code);
      });
      return { screenId: screen.id, ruleId: rule.id, ruleIndex, event: { type: eventType, sourceIds, payloadType, payloadFields }, eventBindings, reads, readDependencies: reads, actionTargets: actions.filter(action => !!action.targetId || !!action.targetDeclarationId), conditions, actions, staticValidation: { status: ruleIssues.length ? 'invalid' as const : 'valid' as const, issues: ruleIssues }, runtimeResponsibility: 'eventBindings 为全部触发来源，reads 为不自动订阅的读取依赖。事件是否发生、来源实际可见及启用状态、载荷、条件结果与动作结果均须在运行时判定；游戏实现者按权威规则顺序实现。' };
    });
    const nodes: NodeBinding[] = screen.nodes.map(node => {
      const sourceRuleIds = rules.filter(rule => rule.eventBindings.some(binding => binding.sourceId === node.id)).map(rule => rule.ruleId);
      const targetRuleIds = rules.filter(rule => rule.actions.some(action => action.targetId === node.id)).map(rule => rule.ruleId);
      const readRuleIds = rules.filter(rule => rule.reads.some(read => read.nodeId === node.id)).map(rule => rule.ruleId);
      const f2EventTypes = f2Events[node.type] ?? [], declaredIntents = Object.values(node.events).filter((value): value is string => typeof value === 'string');
      const label = sourceRuleIds.length && targetRuleIds.length ? '来源＋目标' : sourceRuleIds.length ? '事件来源' : targetRuleIds.length ? '动作目标' : readRuleIds.length ? '读取依赖' : f2EventTypes.length ? '事件未绑定' : readOnly.has(node.type) ? (declaredIntents.length ? '仅显示 · 意图未绑定' : '仅显示') : builtIn.has(node.type) ? (declaredIntents.length ? '内置交互 · 意图未绑定' : '内置交互') : '无行为绑定';
      const hints = [sourceRuleIds.length ? `来源：${sourceRuleIds.join('、')}` : f2EventTypes.length ? '可发出 F2 事件，尚未配置规则' : '', targetRuleIds.length ? `目标：${targetRuleIds.join('、')}` : '', readRuleIds.length ? `读取依赖：${readRuleIds.join('、')}；读取不自动触发规则` : '', f2EventTypes.length && !node.state.visible ? '来源设计初态隐藏；运行时可见性以会话状态为准' : '', f2EventTypes.length && 'enabled' in node.state && !node.state.enabled ? '来源设计初态禁用；运行时可用性以实例状态为准' : '', declaredIntents.length ? `声明事件意图：${declaredIntents.join('、')}；是否已绑定以规则为准` : '', builtIn.has(node.type) ? '具有控件内置交互，内置交互不等于 F2 业务绑定' : '', readOnly.has(node.type) ? '显示控件不自动建立业务绑定' : ''].filter(Boolean);
      return { nodeId: node.id, sourceRuleIds, targetRuleIds, readRuleIds, f2EventTypes, declaredIntents, builtInInteraction: builtIn.has(node.type), displayOnly: readOnly.has(node.type), label, details: hints.join('；') || '没有已配置的 F2 规则' };
    });
    return { screenId: screen.id, rules, nodes };
  });
}
export function buildBehaviorDiagnostics(doc: GuiProject, reference: { exportId: string; documentSha256: string }) {
  const validation = projectSchema.safeParse(doc);
  if (!validation.success) throw new Error('项目静态校验失败，拒绝生成行为诊断及导出');
  const screens = buildBehaviorIndex(doc).map(({ screenId, rules }) => ({ screenId, rules }));
  return { format: 'minecraft-gui-maker-behavior-diagnostics', version: '1.0.0', authoritative: false, reference: { exportId: reference.exportId, documentSha256: reference.documentSha256 }, authority: 'derived from the same validated project JSON snapshot; never execute this report or treat it as a second rule definition', staticValidation: 'valid project snapshot; illegal references and types are rejected before ZIP generation', runtimeUncertainty: 'no runtime source visibility, enabled state, branch result, mapped option or action success is inferred', screens };
}
