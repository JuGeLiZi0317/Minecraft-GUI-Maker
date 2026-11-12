import { useExportDraft } from '../exports/useExportDraft';
import { buildBehaviorIndex, classifyBehaviorOutcome, classifyValidationIssue } from '../domain/behaviorDiagnostics';
import { canEditWithBlocks } from '../behavior/blocklyModel';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { useStore } from 'zustand';
import { currentScreen, editorStore } from '../editor/store';
import { actionsOf, behaviorLeafActions, eventBindingsOf, sourcesOf, matchesBehaviorEvent, F2_ACTION_TYPES, F2_EVENT_TYPES, CURRENT_PROJECT_SCHEMA_VERSION, projectSchema, PROJECT_SCHEMA_VERSIONS, type Behavior, type BehaviorAction, type GuiNode, type ScreenTarget } from '../domain/schema';
import { displayText } from '../domain/model';
import { CATALOG } from '../domain/catalog';
import { tabVisibility } from '../domain/tabGroups';
import { isScreenNavigationTab, navigationTarget } from '../domain/screenTabNavigation';
import { fontSession } from '../render/previewFont';
import { type ProgressMapping } from '../domain/progressBinding';
import type { SliderChangeEvent } from '../domain/numeric';
import type { SelectionEvent } from '../domain/selection';
import { isSelectionNode } from '../domain/selection';
import { isStatusNode } from '../domain/statusIndicator';
import { reduceTypedBehaviorEvent } from '../domain/genericBehavior';
import { effectiveRuntimeVisibility } from '../domain/runtimeVisibility';
import { behaviorNodeLabel } from '../domain/behaviorLabels';

export type BehaviorPreview = Record<string, { text?: string; visible?: boolean; checked?: boolean; tabSelected?: boolean; progressValue?: number; statusId?: string; sliderValue?: number; optionId?: string }>;
type BehaviorTrace = { id: number; sourceId: string; eventType: EventType; value?: number; optionId?: string; matchedRuleIds: string[]; outcomes: string[] };
type EventType = Behavior['event']['type'];
type ActionType = BehaviorAction['type'];
type ActionDraft = { actionType: Exclude<ActionType, 'if' | 'switch'>; targetId: string; text: string; visible: boolean; mapping: ProgressMapping; optionMappings: { optionId: string; statusId: string }[] };
type Draft = { id: string; eventType: EventType; sourceId: string; actions: ActionDraft[]; ordered: boolean };
const sources = (nodes: GuiNode[], type: EventType) => nodes.filter(n => type === 'button-click' ? n.type === 'minecraft:button' : type === 'checkbox-change' ? n.type === 'minecraft:checkbox' : type === 'slider-change' ? n.type === 'minecraft:slider' : type === 'selection-change' ? isSelectionNode(n) : n.type === 'minecraft:fill');
const targets = (nodes: GuiNode[], type: ActionType) => nodes.filter(n => n.type !== 'native_region' && (type === 'set-visible' || (type === 'set-text' && n.type === 'minecraft:string-widget') || (type === 'set-progress-value' && n.type === 'minecraft:progress-bar') || (type === 'set-status' && isStatusNode(n))));
const draftAction = (a: BehaviorAction): ActionDraft => {
  if (a.type === 'if' || a.type === 'switch' || a.type === 'set-exclusive-visible') return { actionType: 'set-visible', targetId: '', text: '', visible: true, mapping: 'direct', optionMappings: [] };
  return { actionType: a.type, targetId: a.type === 'open_screen' ? a.targetScreenId : a.targetId, text: a.type === 'set-text' && 'text' in a ? a.text : '', visible: a.type === 'set-visible' ? a.visible : true, mapping: a.type === 'set-progress-value' ? a.mapping : 'direct', optionMappings: a.type === 'set-status' && 'optionMappings' in a ? structuredClone(a.optionMappings) : [] };
};
const fromRule = (r: Behavior): Draft => ({ id: r.id, eventType: r.event.type, sourceId: r.event.sourceId, ordered: 'actions' in r, actions: actionsOf(r).map(draftAction) });
function TextWidthHint({ text, node }: { text: string; node: GuiNode | undefined }) {
  const font = useSyncExternalStore(fontSession.subscribe, fontSession.get);
  if (!node || node.type !== 'minecraft:string-widget') return null;
  const ctx = document.createElement('canvas').getContext('2d'); if (!ctx) return <small>无法测量预览文字。</small>;
  ctx.font = `9px ${font.family}`; const width = ctx.measureText(text).width;
  return <small role="status">{width > node.bounds.w ? '文字可能超出目标宽度，预览可能截断' : '文字宽度未超出目标'}（浏览器近似；不改变组件尺寸，游戏效果待验证）。</small>;
}

export function BehaviorPanel({ preview, setPreview, mode, setMode, canClick, triggerRef, sliderTriggerRef, selectionTriggerRef, onResetPreview, onOpenScreen, onOpenBlocklyRule, onDraftChange, close, notify }: { preview: BehaviorPreview | null; setPreview: (value: BehaviorPreview | null) => void; mode: boolean; setMode: (value: boolean) => void; canClick: boolean; triggerRef: RefObject<((id: string) => void) | null>; sliderTriggerRef: RefObject<((event: SliderChangeEvent) => void) | null>; selectionTriggerRef: RefObject<((event: SelectionEvent) => void) | null>; onResetPreview: () => void; onOpenScreen: (screenId: string) => void; onOpenBlocklyRule: (ruleId: string) => void; onDraftChange: (dirty: boolean) => void; close: () => void; notify: (message: string, error?: boolean) => void }) {
  const previewRef = useRef(preview); previewRef.current = preview;
  const setSessionPreview = (value: BehaviorPreview | null) => { previewRef.current = value; setPreview(value); };
  const operation = useStore(editorStore, state => state.operation);
  const doc = useStore(editorStore, s => s.doc), blocked = useStore(editorStore, s => s.blocked), gesture = useStore(editorStore, s => s.gesture), selected = useStore(editorStore, s => s.selected);
  const screen = useStore(editorStore, currentScreen), nodes = screen.nodes, screens = screen.screenTargets ?? [];
  const label = (node: GuiNode) => behaviorNodeLabel(node, screen);
  const selectedIndex = useMemo(() => buildBehaviorIndex(doc).find(item => item.screenId === screen.id), [doc, screen.id]);
  const selectedBinding = selectedIndex?.nodes.find(item => item.nodeId === selected);
  const relatedRules = selectedIndex?.rules.filter(rule => rule.eventBindings.some(binding => binding.sourceId === selected) || rule.actions.some(action => action.targetId === selected) || rule.reads.some(read => read.nodeId === selected)) ?? [];
  const screenId = useStore(editorStore, s => s.currentScreenId);
  const screenBindingSupported = PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) >= PROJECT_SCHEMA_VERSIONS.indexOf('0.12.0');
  const [draft, setDraft] = useState<Draft | null>(null), [targetDraft, setTargetDraft] = useState<ScreenTarget | null>(null), [navigation, setNavigation] = useState<string | null>(null), [collapsed, setCollapsed] = useState(false);
  const hasDraft = !!draft || !!targetDraft;
  useExportDraft({ validate: () => { if (hasDraft) throw new Error('行为面板有未保存草稿，请先保存或取消编辑'); }, commit: () => {} });
  useEffect(() => { onDraftChange(hasDraft); }, [hasDraft, onDraftChange]);
  useEffect(() => { if (operation === 'delete') { setDraft(null); setTargetDraft(null); } }, [doc, operation]);
  const [trace, setTrace] = useState<BehaviorTrace[]>([]), traceSequence = useRef(0);
  const lastSliderValues = useRef<Record<string, number>>({});
  const clearSessionTrace = () => { setTrace([]); traceSequence.current = 0; lastSliderValues.current = {}; };
  const previousDocument = useRef(doc);
  useEffect(() => { if (previousDocument.current !== doc) { previousDocument.current = doc; setSessionPreview(null); setMode(false); setNavigation(null); } }, [doc, setPreview, setMode]);
  useEffect(() => { setTrace([]); traceSequence.current = 0; lastSliderValues.current = {}; }, [screenId, doc, mode]);
  const recordTrace = (entry: Omit<BehaviorTrace, 'id'>) => { const item = { ...entry, id: ++traceSequence.current }; setTrace(previous => [...previous, item].slice(-30)); };
  const ids = () => new Set([doc.project.id, ...doc.screens.flatMap(item => [item.id, ...item.nodes.map(n => n.id), ...item.behaviors.map(r => r.id), ...(item.screenTargets ?? []).map(t => t.id)])]);
  const create = () => {
    const used = ids(); let i = 1; while (used.has(`rule_${i}`)) i++;
    const chosen = nodes.find(n => n.id === selected), eventType: EventType = chosen && isSelectionNode(chosen) ? 'selection-change' : chosen?.type === 'minecraft:slider' ? 'slider-change' : chosen?.type === 'minecraft:fill' ? 'rectangle-click' : chosen?.type === 'minecraft:checkbox' ? 'checkbox-change' : sources(nodes, 'button-click').length ? 'button-click' : sources(nodes, 'checkbox-change').length ? 'checkbox-change' : 'rectangle-click';
    const actionType: ActionType = eventType === 'selection-change' ? 'set-status' : eventType === 'slider-change' ? 'set-progress-value' : eventType === 'rectangle-click' && screens.length ? 'open_screen' : targets(nodes, 'set-text').length ? 'set-text' : 'set-visible';
    setDraft({ id: `rule_${i}`, eventType, sourceId: sources(nodes, eventType).some(n => n.id === selected) ? selected! : sources(nodes, eventType)[0]?.id ?? '', ordered: false, actions: [{ actionType, targetId: actionType === 'open_screen' ? screens[0]?.id ?? '' : targets(nodes, actionType)[0]?.id ?? '', text: '', visible: true, mapping: 'direct', optionMappings: [] }] });
  };
  const save = () => {
    if (!draft) return;
    if (editorStore.getState().currentScreenId !== screenId) { notify('Screen 已切换，请重新编辑行为', true); return; }
    const event: Behavior['event'] = { type: draft.eventType, sourceId: draft.sourceId };
    const actions: BehaviorAction[] = draft.actions.map(a => a.actionType === 'set-text' ? { type: 'set-text', targetId: a.targetId, text: a.text } : a.actionType === 'set-visible' ? { type: 'set-visible', targetId: a.targetId, visible: a.visible } : a.actionType === 'set-progress-value' ? { type: 'set-progress-value', targetId: a.targetId, mapping: a.mapping } : a.actionType === 'set-status' ? { type: 'set-status', targetId: a.targetId, optionMappings: a.optionMappings } : { type: 'open_screen', targetScreenId: a.targetId });
    const rule: Behavior = draft.ordered || actions.length > 1 ? { id: draft.id, event, actions } : { id: draft.id, event, action: actions[0] };
    try { editorStore.getState().saveBehavior(rule); setDraft(null); notify('行为规则已保存'); } catch (error) { const candidate = structuredClone(doc), owner = candidate.screens.find(item => item.id === screenId); if (owner) { const index = owner.behaviors.findIndex(item => item.id === rule.id); if (index < 0) owner.behaviors.push(rule); else owner.behaviors[index] = rule; } candidate.schemaVersion = CURRENT_PROJECT_SCHEMA_VERSION; candidate.entryScreenId ??= candidate.screens[0].id; candidate.screenTabGroups ??= []; const issue = buildBehaviorIndex(candidate).find(item => item.screenId === screenId)?.rules.find(item => item.ruleId === rule.id)?.staticValidation.issues[0] ?? classifyValidationIssue((error as Error).message); notify(`保存失败（${issue.kind === 'type-incompatible' ? '类型不兼容' : '引用或配置无效'}）：${(error as Error).message}`, true); }
  };
  const simulate = (source: GuiNode) => {
    if (editorStore.getState().currentScreenId !== screenId) return;
    if (source.type === 'minecraft:creative-tab') {
      if (!(preview?.[source.id]?.visible ?? source.state.visible)) return;
      if (isScreenNavigationTab(source)) {
        const target = navigationTarget(source, doc.screenTabGroups ?? []);
        if (!target) { notify('导航标签目标无效，已阻止切换', true); return; }
        setSessionPreview({}); setNavigation(target.targetScreenId); clearSessionTrace(); onOpenScreen(target.targetScreenId);
        notify(`已打开 Screen ${target.targetScreenId}；目标局部状态按设计初态重新初始化`); return;
      }
      if (!source.props.groupId) return;
      const next = structuredClone(preview ?? {}); for (const n of nodes) if (n.type === 'minecraft:creative-tab' && n.props.groupId === source.props.groupId) next[n.id] = { ...next[n.id], tabSelected: n.id === source.id };
      setSessionPreview(next); setNavigation(null); notify('已切换标签预览；设计初态不变'); return;
    }
    if (!['minecraft:button', 'minecraft:checkbox', 'minecraft:fill'].includes(source.type)) return;
    const state = preview ?? {}, visible = effectiveRuntimeVisibility(nodes, preview, null)(source);
    const type = source.type === 'minecraft:button' ? 'button-click' : source.type === 'minecraft:checkbox' ? 'checkbox-change' : 'rectangle-click';
    if (!visible || !tabVisibility(nodes, preview)(source.id) || ('enabled' in source.state && !source.state.enabled)) {
      recordTrace({ sourceId: source.id, eventType: type, matchedRuleIds: [], outcomes: ['事件未执行：来源当前不可见、未启用或不属于活动标签内容'] }); notify('触发组件当前不可见或未启用', true); return;
    }
    const next = structuredClone(state);
    if (source.type === 'minecraft:checkbox') next[source.id] = { ...next[source.id], checked: !(next[source.id]?.checked ?? source.props.selected) };
    const matched = screen.behaviors.filter(r => r.event.sourceId === source.id && r.event.type === type);
    const outcomes: string[] = [];
    let destination: string | null = null;
    navigationActions: for (const rule of matched) {
      for (const a of actionsOf(rule)) {
        if (a.type === 'if' || a.type === 'switch' || a.type === 'set-exclusive-visible') { outcomes.push(`规则 ${rule.id}：${a.type} 仅由受支持的类型化选择事件执行`); continue; }
        if (a.type === 'open_screen') {
          const target = screens.find(item => item.id === a.targetScreenId);
          if (!target?.boundScreenId) { outcomes.push(`规则 ${rule.id}：open_screen ${a.targetScreenId} 未执行：${target ? '尚未绑定真实 Screen' : 'Screen 声明不存在'}`); continue; }
          destination = a.targetScreenId; outcomes.push(`规则 ${rule.id}：open_screen ${a.targetScreenId} → ${target.boundScreenId} 已执行`);
          break navigationActions;
        } else if (a.type === 'set-progress-value' || a.type === 'set-status') outcomes.push(`规则 ${rule.id}：${a.type} 必须由对应的强类型控件事件执行`);
        else {
          const target = nodes.find(node => node.id === a.targetId);
          if (!target) outcomes.push(`规则 ${rule.id}：${a.type} 目标 ${a.targetId} 不存在，未执行`);
          else { next[a.targetId] = { ...next[a.targetId], ...(a.type === 'set-text' && 'text' in a ? { text: a.text } : { visible: a.type === 'set-visible' ? a.visible : undefined }) }; outcomes.push(`规则 ${rule.id}：${a.type} → ${a.targetId} 已模拟执行`); }
        }
      }
    }
    setSessionPreview(next); setNavigation(destination);
    if (destination) {
      const target = screens.find(item => item.id === destination);
      if (!target?.boundScreenId) { recordTrace({ sourceId: source.id, eventType: type, matchedRuleIds: matched.map(rule => rule.id), outcomes: outcomes.length ? outcomes : [`导航目标 ${destination} 未执行`] }); notify(`导航目标 ${destination} 尚未绑定真实 Screen`, true); return; }
      recordTrace({ sourceId: source.id, eventType: type, matchedRuleIds: matched.map(rule => rule.id), outcomes: outcomes.length ? outcomes : ['导航已执行'] });
      clearSessionTrace();
      onOpenScreen(target.boundScreenId); notify(`已打开 ${target.name}（${target.boundScreenId}）；仅行为预览会话变更`); return;
    }
    if (!matched.length) outcomes.push('事件已触发；没有匹配的 F2 规则（仅控件内置交互可能改变预览）');
    recordTrace({ sourceId: source.id, eventType: type, matchedRuleIds: matched.map(rule => rule.id), outcomes });
    notify('已模拟触发；仅预览状态改变');
  };
  const simulateSliderChange = (event: SliderChangeEvent) => {
    if (!mode || event.screenId !== screenId || editorStore.getState().currentScreenId !== screenId) return;
    const source = nodes.find(node => node.id === event.nodeId);
    if (!source || source.type !== 'minecraft:slider') return;
    const sourceVisible = effectiveRuntimeVisibility(nodes, preview, null)(source);
    const eventType: EventType = 'slider-change';
    if (!Number.isFinite(event.value) || !sourceVisible || !tabVisibility(nodes, preview)(source.id) || !source.state.enabled) {
      recordTrace({ sourceId: source.id, eventType, value: event.value, matchedRuleIds: [], outcomes: [!Number.isFinite(event.value) ? 'Slider 事件未执行：事件载荷无效' : 'Slider 事件未执行：来源隐藏、未启用或不属于活动标签内容'] }); return;
    }
    if (lastSliderValues.current[source.id] === event.value) return;
    lastSliderValues.current[source.id] = event.value;
    const result = reduceTypedBehaviorEvent(screen, previewRef.current, event, { sourceVisible });
    setSessionPreview(result.next);
    recordTrace({ sourceId: source.id, eventType, value: event.value, matchedRuleIds: result.matchedRuleIds, outcomes: result.outcomes });
  };
  const simulateSelectionChange = (event: SelectionEvent) => {
    if (!mode || event.phase !== 'confirm' || event.screenId !== screenId || editorStore.getState().currentScreenId !== screenId) return;
    const source = nodes.find(node => node.id === event.nodeId);
    if (!source || !isSelectionNode(source)) return;
    const eventType: EventType = 'selection-change';
    const option = source.props.options.find(item => item.id === event.optionId);
    const sourceVisible = effectiveRuntimeVisibility(nodes, preview, null)(source);
    if (!option || option.disabled || !source.state.enabled || !sourceVisible || !tabVisibility(nodes, preview)(source.id)) {
      recordTrace({ sourceId: source.id, eventType, optionId: event.optionId, matchedRuleIds: [], outcomes: [!option ? 'selection-change 未执行：事件载荷无效' : option.disabled ? 'selection-change：禁用选项正常跳过' : 'selection-change 未执行：来源隐藏、未启用或不属于活动标签内容'] }); return;
    }
    const result = reduceTypedBehaviorEvent(screen, previewRef.current, event, { sourceVisible });
    setSessionPreview(result.next);
    recordTrace({ sourceId: source.id, eventType, optionId: event.optionId, matchedRuleIds: result.matchedRuleIds, outcomes: result.outcomes });
  };
  useLayoutEffect(() => {
    const trigger = (id: string) => { const source = nodes.find(n => n.id === id); if (source) simulate(source); };
    triggerRef.current = trigger;
    return () => { if (triggerRef.current === trigger) triggerRef.current = null; };
  });
  useLayoutEffect(() => {
    sliderTriggerRef.current = simulateSliderChange;
    return () => { if (sliderTriggerRef.current === simulateSliderChange) sliderTriggerRef.current = null; };
  });
  useLayoutEffect(() => {
    selectionTriggerRef.current = simulateSelectionChange;
    return () => { if (selectionTriggerRef.current === simulateSelectionChange) selectionTriggerRef.current = null; };
  });
  const reset = () => { setSessionPreview(null); setMode(false); setNavigation(null); clearSessionTrace(); onResetPreview(); };
  const unboundIntents = nodes.filter(node => Object.values(node.events).some(event => !!event && (event === 'slider-change' || event === 'selection-change' ? !screen.behaviors.some(rule => matchesBehaviorEvent(rule, event, node.id)) : !F2_EVENT_TYPES.includes(event as typeof F2_EVENT_TYPES[number]))));
  const behaviorValidation = useMemo(() => projectSchema.safeParse(doc), [doc]);
  const invalidRules = screen.behaviors.flatMap(rule => {
    const source = nodes.find(node => node.id === rule.event.sourceId);
    const reasons = [] as string[];
    if (!source || eventBindingsOf(rule).some(binding => !sources(nodes, binding.type).some(node => node.id === binding.sourceId))) reasons.push('事件来源类型或 ID 不可用');
    for (const action of actionsOf(rule)) {
      if (action.type === 'if' || action.type === 'switch' || action.type === 'set-exclusive-visible') continue;
      if (action.type === 'open_screen') { const target = screens.find(item => item.id === action.targetScreenId); if (!target) reasons.push(`目标 ${action.targetScreenId} 未声明`); else if (!target.boundScreenId) reasons.push(`导航 ${action.targetScreenId} 未绑定`); }
      else if (!nodes.some(node => node.id === action.targetId && (action.type === 'set-progress-value' ? node.type === 'minecraft:progress-bar' : action.type === 'set-status' ? isStatusNode(node) : action.type !== 'set-text' || node.type === 'minecraft:string-widget'))) reasons.push(`动作目标 ${action.targetId} 不可用`);
    }
    if (!behaviorValidation.success) for (const issue of behaviorValidation.error.issues) if (issue.path[0] === 'screens' && doc.screens[Number(issue.path[1])]?.id === screen.id && issue.path[2] === 'behaviors' && screen.behaviors[Number(issue.path[3])]?.id === rule.id) reasons.push(issue.message);
    return reasons.length ? [{ id: rule.id, reasons }] : [];
  });
  return <section className="behavior-panel" style={collapsed ? { width: 'auto' } : undefined} role="dialog" aria-label="行为" data-testid="behavior-panel" data-draft={hasDraft}>
    <div className="export-panel-heading"><strong>行为 · F2 原型</strong>{hasDraft && <span className="behavior-draft-status" role="status">有未保存草稿</span>}<button onClick={() => setCollapsed(!collapsed)}>{collapsed ? '展开行为面板' : '收起行为面板'}</button><button aria-label="关闭行为" onClick={close}>✕</button></div>
    <div hidden={collapsed}>
    <p>Slider 只有显式添加 slider-change → set-progress-value 规则时才会驱动 Progress Bar。其余 F2 事件/动作按已保存规则顺序执行。</p>
    <div className="behavior-capability" data-testid="behavior-capability"><strong>当前 Screen：{screen.behaviors.length} 条 F2 规则</strong><details className="behavior-capability-details"><summary>能力与实现约束</summary><div><p>F2 事件 ID：{F2_EVENT_TYPES.join('、')}。动作 ID：{F2_ACTION_TYPES.join('、')}。</p><p>Slider 在有效数值变化时即时触发；同值、焦点和重绘不会触发。Radio Group / Dropdown 只在确认改变选中 optionId 时触发；Dropdown active 候选移动不触发。</p><p>选择和 Slider 可设置同 Screen 普通节点或容器可见性、StringWidget 字符串常量和合法 statusId。选项映射仅用于选择事件。条件可读取同 Screen 控件的当前值，读取不自动触发规则。未映射选项保持目标状态不变并记录；不按 label 推断。状态仅存于 PreviewSession。</p><p>Numeric Input、Tree 等节点事件仍是未绑定意图；Progress Bar、Status Indicator、Image / Sprite 是显示控件。目标类型分别受 set-progress-value / set-status 限制。</p><p>映射 direct 会把 Slider 值 clamp 到目标范围；normalize 按两端范围线性插值。Slider 常量范围按 normalize 映射到目标最小值。目标没有步进。</p><p>其他动作限制：set-text 目标为 StringWidget；set-visible 目标为当前 Screen 节点；open_screen 仅在目标声明显式绑定真实 Screen 后导航，不按名称推断。</p>
      </div></details>
      {invalidRules.length > 0 && <div role="status" className="behavior-validation"><strong>规则诊断</strong>{invalidRules.map(item => <p key={item.id}>{item.id}：{item.reasons.join('；')}</p>)}</div>}
      {unboundIntents.length > 0 && <p>未绑定控件事件：{unboundIntents.map(node => `${node.id}（${CATALOG[node.type].label}：${Object.values(node.events).filter(Boolean).join('、')}）`).join('；')}</p>}
    </div>
    {selectedBinding && <section className="behavior-related" aria-label="选中组件关联行为" data-testid="behavior-related"><strong>选中组件 · {selectedBinding.nodeId} · {selectedBinding.label}</strong><p>{selectedBinding.details}</p>{relatedRules.length === 0 ? <p>该组件没有已配置的关联规则。</p> : relatedRules.map(summary => { const rule = screen.behaviors.find(item => item.id === summary.ruleId)!; const roles = [summary.eventBindings.some(binding => binding.sourceId === selectedBinding.nodeId) ? '事件来源' : '', summary.actions.some(action => action.targetId === selectedBinding.nodeId) ? '动作目标' : '', summary.reads.some(read => read.nodeId === selectedBinding.nodeId) ? '读取依赖' : ''].filter(Boolean).join('、'); return <div className="behavior-rule" key={summary.ruleId}><strong>{summary.ruleId} · {roles}</strong><p>事件绑定：{summary.eventBindings.map(binding => `${binding.sourceId} / ${binding.type} / ${binding.payloadType}`).join('、')}</p>{summary.reads.map(read => <p key={read.path}>读取：{read.path} · {read.nodeId} / {read.valueType}（只读依赖，不自动触发）</p>)}{summary.conditions.map(condition => <p key={condition.path}>条件：if · {condition.path} · {condition.type} / {condition.operator}</p>)}{summary.actions.map(action => <p key={action.path}>动作：{action.path} · {action.type} · {action.targetId ? `目标 ${action.targetId} / ${action.targetCapability}` : `Screen 声明 ${action.targetDeclarationId} → ${action.boundScreenId ?? '未绑定'}`}{action.mapRef ? ` · 共享映射 ${action.mapRef}` : ''}{action.mapping ? ` · 映射 ${action.mapping}` : ''}</p>)}{canEditWithBlocks(rule) ? <button type="button" disabled={mode || !!blocked || !!gesture} onClick={() => onOpenBlocklyRule(summary.ruleId)}>在 Blockly 定位 {summary.ruleId}</button> : <button type="button" onClick={() => { const element = document.querySelector<HTMLElement>(`[data-behavior-rule-id="${CSS.escape(summary.ruleId)}"]`); element?.scrollIntoView({ block: 'nearest' }); element?.focus(); }}>定位 F2 规则 {summary.ruleId}（Blockly 暂不支持）</button>}</div>; })}</section>}
    <fieldset disabled={!!blocked || !!gesture || mode}>
      <strong>目标 Screen 声明</strong><p>规则仍引用声明 ID；显式绑定真实 Screen 后，行为测试才会切换。</p>
      {screens.map(target => <div className="behavior-rule" key={target.id}><span>{target.id} · {target.name} · {target.boundScreenId ? `已绑定 ${target.boundScreenId}` : '未绑定'}</span><button onClick={() => setTargetDraft(target)}>重命名 {target.id}</button><button onClick={() => { try { editorStore.getState().deleteScreenTarget(target.id); } catch (e) { notify((e as Error).message, true); } }}>删除目标 {target.id}</button></div>)}
      <button onClick={() => { const used = ids(); let i = 1; while (used.has(`screen_${i}`)) i++; setTargetDraft({ id: `screen_${i}`, name: '' }); }}>新增 Screen 目标</button>
      {targetDraft && <div className="behavior-editor"><strong>目标 ID：{targetDraft.id}</strong><label>显示名称<input aria-label="Screen 目标名称" maxLength={128} value={targetDraft.name} onChange={e => setTargetDraft({ ...targetDraft, name: e.target.value })}/></label>{screenBindingSupported && <label>绑定真实 Screen<select aria-label="绑定真实 Screen" value={targetDraft.boundScreenId ?? ''} onChange={e => setTargetDraft({ ...targetDraft, ...(e.target.value ? { boundScreenId: e.target.value } : { boundScreenId: undefined }) })}><option value="">保持未绑定</option>{doc.screens.map(item => <option key={item.id} value={item.id}>{displayText(item.title)} · {item.id}</option>)}</select></label>}<button disabled={!targetDraft.name.trim()} onClick={() => { try { editorStore.getState().saveScreenTarget({ ...targetDraft, name: targetDraft.name.trim() }); setTargetDraft(null); notify('Screen 目标已保存'); } catch (e) { notify((e as Error).message, true); } }}>保存 Screen 目标</button><button onClick={() => setTargetDraft(null)}>取消目标编辑</button></div>}
      <button onClick={create}>新增规则</button>
      {screen.behaviors.map(rule => { const sharedMap = actionsOf(rule).some(action => action.type === 'set-status' && 'mapRef' in action); const conditional = actionsOf(rule).some(action => action.type === 'if' || action.type === 'switch'); const constant = actionsOf(rule).flatMap(behaviorLeafActions).some(action => action.type === 'set-status' && 'statusId' in action); const exclusive = actionsOf(rule).some(action => action.type === 'set-exclusive-visible'); const blockOnly = !!rule.eventBindings || sourcesOf(rule).length > 1 || sharedMap || conditional || constant || exclusive; return <div className="behavior-rule" key={rule.id} data-behavior-rule-id={rule.id} tabIndex={-1}><span>{rule.id}：{eventBindingsOf(rule).map(binding => { const item = nodes.find(node => node.id === binding.sourceId); return `${item ? label(item) : `${binding.sourceId} · 来源不可用`} / ${binding.type}`; }).join('；')} → {actionsOf(rule).map(a => a.type === 'switch' ? `switch ${a.valueType} / ${a.cases.length} cases` : a.type === 'if' ? `if ${a.condition.type === 'event-option' ? `${a.condition.operator} ${a.condition.optionId}` : a.condition.type === 'compare' ? `${a.condition.operator} ${a.condition.valueType}` : a.condition.type.toUpperCase()}` : a.type === 'set-exclusive-visible' ? `exclusive ${a.mapping.length} 项 / ${a.fallback}` : `${a.type === 'open_screen' ? a.targetScreenId : a.targetId} / ${a.type}`).join(' → ')}{invalidRules.some(item => item.id === rule.id) ? ' · 有待处理诊断' : ' · 来源与目标有效'}</span><button disabled={blockOnly} title={blockOnly ? '该规则含 Blockly 条件或共享行为，请在 Blockly 中编辑' : undefined} onClick={() => setDraft(fromRule(rule))}>编辑 {rule.id}</button>{blockOnly && <button type="button" onClick={() => onOpenBlocklyRule(rule.id)}>在 Blockly 中编辑</button>}<button onClick={() => editorStore.getState().deleteBehavior(rule.id)}>删除 {rule.id}</button></div>; })}
      {draft && <div className="behavior-editor">
        <strong>规则 {draft.id}</strong>
        <label>事件<select aria-label="行为事件" value={draft.eventType} onChange={e => { const eventType = e.target.value as EventType, progressId = nodes.find(node => node.type === 'minecraft:progress-bar')?.id ?? '', statusId = nodes.find(isStatusNode)?.id ?? '', fallbackId = targets(nodes, 'set-visible')[0]?.id ?? ''; const actions = draft.actions.map(action => eventType === 'slider-change' ? { ...action, actionType: 'set-progress-value' as const, targetId: nodes.some(node => node.id === action.targetId && node.type === 'minecraft:progress-bar') ? action.targetId : progressId, optionMappings: [] } : eventType === 'selection-change' ? { ...action, actionType: 'set-status' as const, targetId: nodes.some(node => node.id === action.targetId && isStatusNode(node)) ? action.targetId : statusId, optionMappings: [] } : action.actionType === 'set-progress-value' || action.actionType === 'set-status' ? { ...action, actionType: 'set-visible' as const, targetId: fallbackId, optionMappings: [] } : action); setDraft({ ...draft, eventType, sourceId: sources(nodes, eventType)[0]?.id ?? '', actions }); }}><option value="button-click">Button 点击</option><option value="checkbox-change">Checkbox 值变化</option><option value="rectangle-click">Rectangle 点击</option><option value="slider-change">Slider 有效数值变化</option><option value="selection-change">Radio Group / Dropdown 选择确认</option></select></label>
        <label>触发组件<select aria-label="触发组件" value={draft.sourceId} onChange={e => { const sourceId = e.target.value, source = nodes.find(node => node.id === sourceId); const actions = draft.actions.map(action => ({ ...action, optionMappings: action.actionType === 'set-status' && source && isSelectionNode(source) ? action.optionMappings.filter(mapping => source.props.options.some(option => option.id === mapping.optionId)) : action.optionMappings })); setDraft({ ...draft, sourceId, actions }); }}><option value="">请选择</option>{sources(nodes, draft.eventType).map(n => <option key={n.id} value={n.id}>{label(n)}</option>)}</select></label>
        {draft.actions.map((action, index) => {
          const suffix = index ? ` ${index + 1}` : '';
          const change = (patch: Partial<ActionDraft>) => setDraft({ ...draft, actions: draft.actions.map((a, i) => i === index ? { ...a, ...patch } : a) });
          const move = (step: number) => { const list = [...draft.actions], to = index + step; [list[index], list[to]] = [list[to], list[index]]; setDraft({ ...draft, actions: list, ordered: true }); };
          return <div className="behavior-action" key={index}><strong>动作 {index + 1}</strong>
            <label>动作<select aria-label={`行为动作${suffix}`} value={action.actionType} onChange={e => { const actionType = e.target.value as Exclude<ActionType, 'if' | 'switch'>; change({ actionType, targetId: actionType === 'open_screen' ? screens[0]?.id ?? '' : targets(nodes, actionType)[0]?.id ?? '', optionMappings: [] }); }}>
              {draft.eventType === 'slider-change' ? <option value="set-progress-value">设置 Progress Bar 数值</option> : draft.eventType === 'selection-change' ? <option value="set-status">设置 Status Indicator 状态</option> : <><option value="set-text">设置 StringWidget 文本</option><option value="set-visible">设置组件可见性</option><option value="open_screen">打开目标 Screen（声明）</option></>}
            </select></label>
            <label>{action.actionType === 'open_screen' ? '目标 Screen' : '目标组件'}<select aria-label={`${action.actionType === 'open_screen' ? '目标 Screen' : '目标组件'}${suffix}`} value={action.targetId} onChange={e => { const targetId = e.target.value, target = nodes.find(node => node.id === targetId); change({ targetId, optionMappings: action.actionType === 'set-status' && target && isStatusNode(target) ? action.optionMappings.filter(mapping => target.props.statuses.some(status => status.statusId === mapping.statusId)) : action.optionMappings }); }}><option value="">请选择</option>{action.actionType === 'open_screen' ? screens.map(t => <option key={t.id} value={t.id}>{t.id} · {t.name}</option>) : targets(nodes, action.actionType).map(n => <option key={n.id} value={n.id}>{label(n)}</option>)}</select></label>
            {action.actionType === 'set-progress-value' ? <label>数值映射<select aria-label={`Progress Bar 映射${suffix}`} value={action.mapping} onChange={e => change({ mapping: e.target.value as ProgressMapping })}><option value="direct">direct · 直接传值并限制到目标范围</option><option value="normalize">normalize · 按源/目标范围线性映射</option></select></label> : action.actionType === 'set-status' ? <fieldset className="selection-status-mappings" aria-label={`选项到状态映射${suffix}`}><legend>optionId → statusId 映射</legend>{(() => { const source = nodes.find(node => node.id === draft.sourceId), target = nodes.find(node => node.id === action.targetId); if (!source || !isSelectionNode(source) || !target || !isStatusNode(target)) return <p>请选择有效的 Radio Group / Dropdown 与 Status Indicator。</p>; return <>{source.props.options.map(option => <label key={option.id}>{option.id} · {displayText(option.label)}<select aria-label={`${option.id} 对应状态${suffix}`} value={action.optionMappings.find(mapping => mapping.optionId === option.id)?.statusId ?? ''} onChange={e => { const statusId = e.target.value; change({ optionMappings: action.optionMappings.filter(mapping => mapping.optionId !== option.id).concat(statusId ? [{ optionId: option.id, statusId }] : []) }); }}><option value="">未映射（保持状态）</option>{target.props.statuses.map(status => <option key={status.statusId} value={status.statusId}>{status.statusId} · {displayText(status.label)}</option>)}</select></label>)}<p>只保存选项 ID 与状态 ID 的明确对应关系；未映射选项不会改变目标状态。</p></>; })()}</fieldset> : action.actionType === 'set-text' ? <><label>新文本<input aria-label={`行为文本${suffix}`} maxLength={4096} value={action.text} onChange={e => change({ text: e.target.value })}/></label><TextWidthHint text={action.text} node={nodes.find(n => n.id === action.targetId)}/></> : action.actionType === 'set-visible' ? <label>可见性<select aria-label={`行为可见性${suffix}`} value={String(action.visible)} onChange={e => change({ visible: e.target.value === 'true' })}><option value="true">显示</option><option value="false">隐藏</option></select></label> : <p>已绑定目标可在行为测试中打开；未绑定目标仍是实现意图。</p>}
            <button type="button" aria-label={`上移动作 ${index + 1}`} disabled={index === 0} onClick={() => move(-1)}>上移</button><button type="button" aria-label={`下移动作 ${index + 1}`} disabled={index === draft.actions.length - 1} onClick={() => move(1)}>下移</button><button type="button" aria-label={`删除动作 ${index + 1}`} disabled={draft.actions.length === 1} onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, i) => i !== index), ordered: true })}>删除动作</button>
          </div>;
        })}
        <button disabled={draft.actions.length >= 50} onClick={() => { const actionType: ActionType = draft.eventType === 'selection-change' ? 'set-status' : draft.eventType === 'slider-change' ? 'set-progress-value' : 'set-visible'; setDraft({ ...draft, ordered: true, actions: [...draft.actions, { actionType, targetId: targets(nodes, actionType)[0]?.id ?? '', text: '', visible: true, mapping: 'direct', optionMappings: [] }] }); }}>添加动作</button>
        <button className="primary" disabled={!draft.sourceId || draft.actions.some(a => !a.targetId)} onClick={save}>保存规则</button><button onClick={() => setDraft(null)}>取消编辑</button>
      </div>}
    </fieldset>
    <div className="behavior-session"><strong>测试行为</strong><p>使用工作区的“交互预览”统一入口。启用后，画布点击同时模拟原生控件交互并执行 F2 规则；CreativeTab 内容切换和 Screen 导航也在此会话中运行。状态仅临时保留，不写入设计数据。</p>
      <p role="status">{mode ? '交互预览已开启' : '交互预览已关闭'} · {mode ? '可点击画布或使用下方模拟触发' : '请使用工作区顶部的交互预览按钮'}</p>
      {nodes.filter(n => n.type === 'minecraft:button' || n.type === 'minecraft:checkbox' || n.type === 'minecraft:fill' || (n.type === 'minecraft:creative-tab' && (!!n.props.groupId || n.props.tabMode === 'screen-navigation'))).map(n => <button key={n.id} disabled={!mode || !canClick || !!gesture} onClick={() => simulate(n)}>模拟触发 {n.id}{n.type === 'minecraft:checkbox' ? `（${(preview?.[n.id]?.checked ?? n.props.selected) ? '已勾选' : '未勾选'}）` : ''}</button>)}
      <button disabled={!mode} onClick={reset}>重置预览</button>
      {preview && <div className="behavior-session-state" data-testid="behavior-preview" role="status" tabIndex={0} aria-label="当前预览状态">预览中：{JSON.stringify(preview)}{navigation && (screens.find(t => t.id === navigation)?.boundScreenId ? ` · 导航目标：${navigation}（${screens.find(t => t.id === navigation)?.name ?? ''}）` : ` · 导航意图：${navigation}（${screens.find(t => t.id === navigation)?.name ?? ''}）；未切换 Screen`)}</div>}
      {mode && <div className="behavior-log" data-testid="behavior-event-log" role="log" aria-label="行为执行日志" tabIndex={0} aria-live="polite"><strong>本 Screen 预览记录（最近 {trace.length}/30）</strong>{trace.length === 0 ? <p>尚无事件。点击 F2 来源、改变 Slider 有效值或确认 Radio/Dropdown 选择后会记录触发、匹配规则与动作结果；记录只属于当前 Screen 预览会话。</p> : [...trace].reverse().map(item => <div key={item.id}><strong>{item.eventType} · {item.sourceId}{item.value !== undefined ? ` = ${item.value}` : ''}{item.optionId !== undefined ? ` · optionId ${item.optionId}` : ''}</strong><span>{item.matchedRuleIds.length ? ` · 匹配：${item.matchedRuleIds.join('、')}` : ' · 未匹配规则'}</span>{item.outcomes.map((outcome, index) => { const diagnostic = classifyBehaviorOutcome(outcome); return <p key={index} data-diagnostic-kind={diagnostic.kind} data-severity={diagnostic.severity}><span className="behavior-diagnostic-kind">{({ 'invalid-reference': '引用无效', 'type-incompatible': '类型不兼容', 'source-unavailable': '来源不可用', 'expected-skip': '正常跳过', 'no-matching-rule': '无匹配规则', 'unmapped-option': '选项未映射', 'invalid-payload': '载荷无效', 'target-unavailable': '目标不可用', 'action-success': '动作成功', unchanged: '无变化', 'condition-result': '条件结果', information: '信息' } as const)[diagnostic.kind]} · </span>{outcome}</p>; })}</div>)}</div>}
    </div>
    </div>
  </section>;
}
