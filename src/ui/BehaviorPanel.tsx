import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { useStore } from 'zustand';
import { editorStore } from '../editor/store';
import { actionsOf, type Behavior, type BehaviorAction, type GuiNode, type ScreenTarget } from '../domain/schema';
import { displayText } from '../domain/model';
import { CATALOG } from '../domain/catalog';
import { tabManaged, tabVisibility } from '../domain/tabGroups';
import { fontSession } from '../render/previewFont';

export type BehaviorPreview = Record<string, { text?: string; visible?: boolean; checked?: boolean; tabSelected?: boolean }>;
type EventType = Behavior['event']['type'];
type ActionType = BehaviorAction['type'];
type ActionDraft = { actionType: ActionType; targetId: string; text: string; visible: boolean };
type Draft = { id: string; eventType: EventType; sourceId: string; actions: ActionDraft[]; ordered: boolean };
const sources = (nodes: GuiNode[], type: EventType) => nodes.filter(n => n.type === (type === 'button-click' ? 'minecraft:button' : type === 'checkbox-change' ? 'minecraft:checkbox' : 'minecraft:fill'));
const targets = (nodes: GuiNode[], type: ActionType) => nodes.filter(n => type === 'set-visible' || (type === 'set-text' && n.type === 'minecraft:string-widget'));
const label = (node: GuiNode) => {
  const text = node.type === 'minecraft:button' || node.type === 'minecraft:checkbox' ? displayText(node.props.message) : node.type === 'minecraft:string-widget' ? displayText(node.props.text) : node.type === 'minecraft:edit-box' ? displayText(node.props.narration) : node.type === 'minecraft:cycle-button' ? displayText(node.props.name) : '';
  return `${node.id} · ${CATALOG[node.type].label}${text ? ` · ${text.slice(0, 48)}` : ''}`;
};
const fromRule = (r: Behavior): Draft => ({ id: r.id, eventType: r.event.type, sourceId: r.event.sourceId, ordered: 'actions' in r, actions: actionsOf(r).map(a => ({ actionType: a.type, targetId: a.type === 'open_screen' ? a.targetScreenId : a.targetId, text: a.type === 'set-text' ? a.text : '', visible: a.type === 'set-visible' ? a.visible : true })) });
function TextWidthHint({ text, node }: { text: string; node: GuiNode | undefined }) {
  const font = useSyncExternalStore(fontSession.subscribe, fontSession.get);
  if (!node || node.type !== 'minecraft:string-widget') return null;
  const ctx = document.createElement('canvas').getContext('2d'); if (!ctx) return <small>无法测量预览文字。</small>;
  ctx.font = `9px ${font.family}`; const width = ctx.measureText(text).width;
  return <small role="status">{width > node.bounds.w ? '文字可能超出目标宽度，预览可能截断' : '文字宽度未超出目标'}（浏览器近似；不改变组件尺寸，游戏效果待验证）。</small>;
}

export function BehaviorPanel({ preview, setPreview, mode, setMode, canClick, triggerRef, close, notify }: { preview: BehaviorPreview | null; setPreview: (value: BehaviorPreview | null) => void; mode: boolean; setMode: (value: boolean) => void; canClick: boolean; triggerRef: RefObject<((id: string) => void) | null>; close: () => void; notify: (message: string, error?: boolean) => void }) {
  const doc = useStore(editorStore, s => s.doc), blocked = useStore(editorStore, s => s.blocked), gesture = useStore(editorStore, s => s.gesture), selected = useStore(editorStore, s => s.selected);
  const screen = doc.screens[0], nodes = screen.nodes, screens = screen.screenTargets ?? [];
  const [draft, setDraft] = useState<Draft | null>(null), [targetDraft, setTargetDraft] = useState<ScreenTarget | null>(null), [navigation, setNavigation] = useState<string | null>(null), [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setPreview(null); setMode(false); setNavigation(null); }, [doc, setPreview, setMode]);
  useEffect(() => () => { triggerRef.current = null; }, [triggerRef]);
  const ids = () => new Set([doc.project.id, screen.id, ...nodes.map(n => n.id), ...screen.behaviors.map(r => r.id), ...screens.map(t => t.id)]);
  const create = () => {
    const used = ids(); let i = 1; while (used.has(`rule_${i}`)) i++;
    const chosen = nodes.find(n => n.id === selected), eventType: EventType = chosen?.type === 'minecraft:fill' ? 'rectangle-click' : chosen?.type === 'minecraft:checkbox' ? 'checkbox-change' : sources(nodes, 'button-click').length ? 'button-click' : sources(nodes, 'checkbox-change').length ? 'checkbox-change' : 'rectangle-click';
    const actionType: ActionType = eventType === 'rectangle-click' && screens.length ? 'open_screen' : targets(nodes, 'set-text').length ? 'set-text' : 'set-visible';
    setDraft({ id: `rule_${i}`, eventType, sourceId: sources(nodes, eventType).some(n => n.id === selected) ? selected! : sources(nodes, eventType)[0]?.id ?? '', ordered: false, actions: [{ actionType, targetId: actionType === 'open_screen' ? screens[0]?.id ?? '' : targets(nodes, actionType)[0]?.id ?? '', text: '', visible: true }] });
  };
  const save = () => {
    if (!draft) return;
    const event: Behavior['event'] = { type: draft.eventType, sourceId: draft.sourceId };
    const actions: BehaviorAction[] = draft.actions.map(a => a.actionType === 'set-text' ? { type: 'set-text', targetId: a.targetId, text: a.text } : a.actionType === 'set-visible' ? { type: 'set-visible', targetId: a.targetId, visible: a.visible } : { type: 'open_screen', targetScreenId: a.targetId });
    const rule: Behavior = draft.ordered || actions.length > 1 ? { id: draft.id, event, actions } : { id: draft.id, event, action: actions[0] };
    try { editorStore.getState().saveBehavior(rule); setDraft(null); notify('行为规则已保存'); } catch (error) { notify((error as Error).message, true); }
  };
  const simulate = (source: GuiNode) => {
    if (source.type === 'minecraft:creative-tab') {
      if (!source.props.groupId || !(preview?.[source.id]?.visible ?? source.state.visible)) return;
      const next = structuredClone(preview ?? {}); for (const n of nodes) if (n.type === 'minecraft:creative-tab' && n.props.groupId === source.props.groupId) next[n.id] = { ...next[n.id], tabSelected: n.id === source.id };
      setPreview(next); setNavigation(null); notify('已切换标签预览；设计初态不变'); return;
    }
    if (!['minecraft:button', 'minecraft:checkbox', 'minecraft:fill'].includes(source.type)) return;
    const state = preview ?? {}, visible = state[source.id]?.visible ?? (tabManaged(nodes).has(source.id) ? true : source.state.visible);
    if (!visible || !tabVisibility(nodes, preview)(source.id) || ('enabled' in source.state && !source.state.enabled)) { notify('触发组件当前不可见或未启用', true); return; }
    const next = structuredClone(state);
    if (source.type === 'minecraft:checkbox') next[source.id] = { ...next[source.id], checked: !(next[source.id]?.checked ?? source.props.selected) };
    const type = source.type === 'minecraft:button' ? 'button-click' : source.type === 'minecraft:checkbox' ? 'checkbox-change' : 'rectangle-click';
    let destination: string | null = null;
    for (const rule of screen.behaviors.filter(r => r.event.sourceId === source.id && r.event.type === type)) {
      for (const a of actionsOf(rule)) {
      if (a.type === 'open_screen') destination = a.targetScreenId;
      else next[a.targetId] = { ...next[a.targetId], ...(a.type === 'set-text' ? { text: a.text } : { visible: a.visible }) };
      }
    }
    setPreview(next); setNavigation(destination); notify(destination ? '已模拟导航意图；没有切换 Screen' : '已模拟触发；仅预览状态改变');
  };
  triggerRef.current = id => { const source = nodes.find(n => n.id === id); if (source) simulate(source); };
  const reset = () => { setPreview(null); setMode(false); setNavigation(null); };
  return <section className="behavior-panel" style={collapsed ? { width: 'auto' } : undefined} role="dialog" aria-label="行为" data-testid="behavior-panel">
    <div className="export-panel-heading"><strong>行为 · F2 原型</strong><button onClick={() => setCollapsed(!collapsed)}>{collapsed ? '展开行为面板' : '收起行为面板'}</button><button aria-label="关闭行为" onClick={() => { reset(); close(); }}>✕</button></div>
    <div hidden={collapsed}>
    <p>每条规则包含一个事件和按顺序执行的动作。被规则引用的组件不能删除；请先修改或删除规则。</p>
    <fieldset disabled={!!blocked || !!gesture || mode}>
      <strong>目标 Screen 声明</strong><p>仅声明 ID 和名称，不创建画布或实现切换。</p>
      {screens.map(target => <div className="behavior-rule" key={target.id}><span>{target.id} · {target.name}</span><button onClick={() => setTargetDraft(target)}>重命名 {target.id}</button><button onClick={() => { try { editorStore.getState().deleteScreenTarget(target.id); } catch (e) { notify((e as Error).message, true); } }}>删除目标 {target.id}</button></div>)}
      <button onClick={() => { const used = ids(); let i = 1; while (used.has(`screen_${i}`)) i++; setTargetDraft({ id: `screen_${i}`, name: '' }); }}>新增 Screen 目标</button>
      {targetDraft && <div className="behavior-editor"><strong>目标 ID：{targetDraft.id}</strong><label>显示名称<input aria-label="Screen 目标名称" maxLength={128} value={targetDraft.name} onChange={e => setTargetDraft({ ...targetDraft, name: e.target.value })}/></label><button disabled={!targetDraft.name.trim()} onClick={() => { try { editorStore.getState().saveScreenTarget({ ...targetDraft, name: targetDraft.name.trim() }); setTargetDraft(null); notify('Screen 目标已保存'); } catch (e) { notify((e as Error).message, true); } }}>保存 Screen 目标</button><button onClick={() => setTargetDraft(null)}>取消目标编辑</button></div>}
      <button onClick={create}>新增规则</button>
      {screen.behaviors.map(rule => <div className="behavior-rule" key={rule.id}><span>{rule.id}：{rule.event.sourceId} / {rule.event.type} → {actionsOf(rule).map(a => `${a.type === 'open_screen' ? a.targetScreenId : a.targetId} / ${a.type}`).join(' → ')}</span><button onClick={() => setDraft(fromRule(rule))}>编辑 {rule.id}</button><button onClick={() => editorStore.getState().deleteBehavior(rule.id)}>删除 {rule.id}</button></div>)}
      {draft && <div className="behavior-editor">
        <strong>规则 {draft.id}</strong>
        <label>事件<select aria-label="行为事件" value={draft.eventType} onChange={e => { const eventType = e.target.value as EventType; setDraft({ ...draft, eventType, sourceId: sources(nodes, eventType)[0]?.id ?? '' }); }}><option value="button-click">Button 点击</option><option value="checkbox-change">Checkbox 值变化</option><option value="rectangle-click">Rectangle 点击</option></select></label>
        <label>触发组件<select aria-label="触发组件" value={draft.sourceId} onChange={e => setDraft({ ...draft, sourceId: e.target.value })}><option value="">请选择</option>{sources(nodes, draft.eventType).map(n => <option key={n.id} value={n.id}>{label(n)}</option>)}</select></label>
        {draft.actions.map((action, index) => {
          const suffix = index ? ` ${index + 1}` : '';
          const change = (patch: Partial<ActionDraft>) => setDraft({ ...draft, actions: draft.actions.map((a, i) => i === index ? { ...a, ...patch } : a) });
          const move = (step: number) => { const list = [...draft.actions], to = index + step; [list[index], list[to]] = [list[to], list[index]]; setDraft({ ...draft, actions: list, ordered: true }); };
          return <div className="behavior-action" key={index}><strong>动作 {index + 1}</strong>
            <label>动作<select aria-label={`行为动作${suffix}`} value={action.actionType} onChange={e => { const actionType = e.target.value as ActionType; change({ actionType, targetId: actionType === 'open_screen' ? screens[0]?.id ?? '' : targets(nodes, actionType)[0]?.id ?? '' }); }}><option value="set-text">设置 StringWidget 文本</option><option value="set-visible">设置组件可见性</option><option value="open_screen">打开目标 Screen（声明）</option></select></label>
            <label>{action.actionType === 'open_screen' ? '目标 Screen' : '目标组件'}<select aria-label={`${action.actionType === 'open_screen' ? '目标 Screen' : '目标组件'}${suffix}`} value={action.targetId} onChange={e => change({ targetId: e.target.value })}><option value="">请选择</option>{action.actionType === 'open_screen' ? screens.map(t => <option key={t.id} value={t.id}>{t.id} · {t.name}</option>) : targets(nodes, action.actionType).map(n => <option key={n.id} value={n.id}>{label(n)}</option>)}</select></label>
            {action.actionType === 'set-text' ? <><label>新文本<input aria-label={`行为文本${suffix}`} maxLength={4096} value={action.text} onChange={e => change({ text: e.target.value })}/></label><TextWidthHint text={action.text} node={nodes.find(n => n.id === action.targetId)}/></> : action.actionType === 'set-visible' ? <label>可见性<select aria-label={`行为可见性${suffix}`} value={String(action.visible)} onChange={e => change({ visible: e.target.value === 'true' })}><option value="true">显示</option><option value="false">隐藏</option></select></label> : <p>只记录导航意图，目标 Screen 由开发者创建和切换。</p>}
            <button type="button" aria-label={`上移动作 ${index + 1}`} disabled={index === 0} onClick={() => move(-1)}>上移</button><button type="button" aria-label={`下移动作 ${index + 1}`} disabled={index === draft.actions.length - 1} onClick={() => move(1)}>下移</button><button type="button" aria-label={`删除动作 ${index + 1}`} disabled={draft.actions.length === 1} onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, i) => i !== index), ordered: true })}>删除动作</button>
          </div>;
        })}
        <button disabled={draft.actions.length >= 50} onClick={() => setDraft({ ...draft, ordered: true, actions: [...draft.actions, { actionType: 'set-visible', targetId: targets(nodes, 'set-visible')[0]?.id ?? '', text: '', visible: true }] })}>添加动作</button>
        <button disabled={!draft.sourceId || draft.actions.some(a => !a.targetId)} onClick={save}>保存规则</button><button onClick={() => setDraft(null)}>取消编辑</button>
      </div>}
    </fieldset>
    <div><strong>测试行为</strong><p>模拟触发仅改变临时状态；导航只显示目标，不切换 Screen。</p>
      <button disabled={!canClick || !!gesture} aria-pressed={mode} onClick={() => { if (mode) reset(); else { setPreview({}); setNavigation(null); setMode(true); } }}>{mode ? '退出画布行为测试' : '开始画布行为测试'}</button>
      {nodes.filter(n => n.type === 'minecraft:button' || n.type === 'minecraft:checkbox' || n.type === 'minecraft:fill' || (n.type === 'minecraft:creative-tab' && !!n.props.groupId)).map(n => <button key={n.id} onClick={() => simulate(n)}>模拟触发 {n.id}{n.type === 'minecraft:checkbox' ? `（${(preview?.[n.id]?.checked ?? n.props.selected) ? '已勾选' : '未勾选'}）` : ''}</button>)}
      <button onClick={reset}>重置预览</button>
      {preview && <div data-testid="behavior-preview" role="status">预览中：{JSON.stringify(preview)}{navigation && ` · 导航意图：${navigation}（${screens.find(t => t.id === navigation)?.name ?? ''}）；未切换 Screen`}</div>}
    </div>
    </div>
  </section>;
}
