import { buildBehaviorIndex, classifyValidationIssue } from '../domain/behaviorDiagnostics';
import { TYPED_EVENTS, createTypedRuleTemplate, type TypedEventType } from '../domain/genericBehavior';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import { createPortal } from 'react-dom';
import * as Blockly from 'blockly/core';
import * as Zh from 'blockly/msg/zh-hans';
import { currentScreen, editorStore } from '../editor/store';
import { actionsOf, behaviorLeafActions, conditionLeaves, eventBindingsOf, legacySourcesOf, CURRENT_PROJECT_SCHEMA_VERSION, parseProject, type Behavior, type BehaviorMap, type GuiProject } from '../domain/schema';
import { displayText } from '../domain/model';
import { isSelectionNode } from '../domain/selection';
import { isStatusNode } from '../domain/statusIndicator';
import { behaviorNodeLabel } from '../domain/behaviorLabels';
import { behaviorToWorkspace, workspaceToBehavior, workspaceDraftSignature, canEditWithBlocks, type BehaviorWorkspaceState } from '../behavior/blocklyModel';
import { behaviorToolbox, registerBehaviorBlocks, setBlockContext } from '../behavior/blocks';
import { canonical, readLayout, semanticFingerprint, validSnapshot, writeLayout } from '../behavior/layoutSnapshot';
import { localSession } from '../io/localSession';
import { useExportDraft } from '../exports/useExportDraft';
import { BLOCKLY_THEMES, bindBlocklyTheme, type BlocklyThemeMode } from './blocklyTheme';
import '../styles/blockly.css';

const blocklyMessages: Record<string, string> = {};
for (const [key, value] of Object.entries(Zh)) if (typeof value === 'string') blocklyMessages[key] = value;
Blockly.setLocale(blocklyMessages); registerBehaviorBlocks();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
type Screen = GuiProject['screens'][number];
type MapReference = { ruleId: string; actionIndex: number; targetId: string; targetLabel: string };
type ExplicitBinding = NonNullable<Behavior['eventBindings']>[number];

export default function BlocklyBehaviorEditor({ active, openRuleId, setMode, notify, onDirtyChange, beforeScreenChange, theme, toolbarHost }: { toolbarHost: HTMLElement | null; theme: BlocklyThemeMode; beforeScreenChange: () => void; active: boolean; openRuleId: string | null; setMode: (active: boolean) => void; notify: (message: string, error?: boolean) => void; onDirtyChange: (dirty: boolean) => void }) {
  const doc = useStore(editorStore, state => state.doc), blocked = useStore(editorStore, state => state.blocked), screen = useStore(editorStore, currentScreen);
  const operation = useStore(editorStore, state => state.operation);
  const host = useRef<HTMLDivElement>(null), workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  const themeController = useRef<ReturnType<typeof bindBlocklyTheme> | null>(null);
  const baseDoc = useRef<GuiProject>(doc), mapBaseDoc = useRef<GuiProject>(doc), original = useRef<Behavior | undefined>(undefined), draftBaseline = useRef(''), ruleId = useRef('');
  const draftScreenId = useRef(screen.id), seenScreenId = useRef(screen.id), dirtyRef = useRef(false), refreshRef = useRef<() => void>(() => {});
  const workspaceDirtyRef = useRef(false), mapDirtyRef = useRef(false);
  const loadGeneration = useRef(0), layoutWrites = useRef<Promise<void>>(Promise.resolve());
  const [draftScreen, setDraftScreen] = useState<Screen>(screen);
  const [dirty, setDirty] = useState(false), [message, setMessage] = useState('正在创建 Blockly 工作区…'), [conflict, setConflict] = useState(false);
  const [selected, setSelected] = useState(screen.behaviors.find(canEditWithBlocks)?.id ?? ''), [ready, setReady] = useState(false);
  const [genericEvent, setGenericEvent] = useState<TypedEventType>('selection-change');
  const [candidate, setCandidate] = useState<Behavior | null>(null), [mapDraft, setMapDraft] = useState<BehaviorMap | null>(null);
  const [draftRule, setDraftRule] = useState<Behavior | null>(null);
  const [multiTrigger, setMultiTrigger] = useState(false), [extraBindings, setExtraBindings] = useState<ExplicitBinding[]>([]);
  const triggerDraft = useRef<{ multi: boolean; extras: ExplicitBinding[] }>({ multi: false, extras: [] });
  const triggerBaseline = useRef('');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null), [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [mapPanelOpen, setMapPanelOpen] = useState(true), [mapPanelWidth, setMapPanelWidth] = useState(300), [mapDrawerOpen, setMapDrawerOpen] = useState(false);
  const syncDirty = () => { const value = workspaceDirtyRef.current || mapDirtyRef.current; dirtyRef.current = value; onDirtyChange(value); setDirty(value); };
  const markDirty = (value: boolean) => { workspaceDirtyRef.current = value; syncDirty(); };
  const markMapDirty = (value: boolean) => { mapDirtyRef.current = value; syncDirty(); };
  const read = () => {
    const rule = workspaceToBehavior(Blockly.serialization.workspaces.save(workspace.current!) as BehaviorWorkspaceState, ruleId.current, original.current);
    delete rule.eventBindings;
    if (!triggerDraft.current.multi) return rule;
    if (rule.event.type !== 'selection-change' && rule.event.type !== 'slider-change') throw new Error('多事件触发需要选择或滑条事件入口');
    const type = rule.event.type;
    const legacy = legacySourcesOf(rule).map(sourceId => type === 'selection-change'
      ? { type: 'selection-change' as const, sourceId, payloadType: 'OptionId' as const }
      : { type: 'slider-change' as const, sourceId, payloadType: 'Number' as const });
    const bindings = [...legacy, ...triggerDraft.current.extras].filter((binding, index, all) => all.findIndex(other => other.type === binding.type && other.sourceId === binding.sourceId) === index);
    return { ...rule, event: { type, sourceId: rule.event.sourceId }, eventBindings: bindings } as Behavior;
  };
  const validate = (rule: Behavior) => {
    const current = editorStore.getState(), clone = structuredClone(current.doc), owner = clone.screens.find(item => item.id === draftScreenId.current);
    if (!owner || current.currentScreenId !== draftScreenId.current) throw new Error('当前 Blockly 草稿属于先前 Screen；请重新载入当前 Screen 后再保存');
    const index = owner.behaviors.findIndex(item => item.id === rule.id);
    if (index < 0) owner.behaviors.push(rule); else owner.behaviors[index] = rule;
    clone.schemaVersion = CURRENT_PROJECT_SCHEMA_VERSION;
    try { parseProject(JSON.stringify(clone)); } catch (error) {
      const issue = buildBehaviorIndex(clone).find(item => item.screenId === owner.id)?.rules.find(item => item.ruleId === rule.id)?.staticValidation.issues[0] ?? classifyValidationIssue((error as Error).message);
      throw new Error(`${issue.kind === 'type-incompatible' ? '类型不兼容' : '引用或配置无效'}：${(error as Error).message}`);
    }
  };
  refreshRef.current = () => {
    if (!workspace.current) return;
    for (const block of [...workspace.current.getAllBlocks(false), ...(workspace.current.getFlyout()?.getWorkspace().getAllBlocks(false) ?? [])]) { block.getSvgRoot().dataset.blockType = block.type; block.getSvgRoot().dataset.blockId = block.id; }
    try {
      const state = Blockly.serialization.workspaces.save(workspace.current!) as BehaviorWorkspaceState;
      markDirty(workspaceDraftSignature(state) !== draftBaseline.current || JSON.stringify(triggerDraft.current) !== triggerBaseline.current);
      const next = read(); setDraftRule(next); setCandidate(next);
      try { validate(next); setMessage('连接与引用有效；规则仍只在点击保存时写入项目。'); }
      catch (error) { setCandidate(null); setMessage((error as Error).message); }
    } catch (error) {
      setCandidate(null); setDraftRule(null);
      const owner = editorStore.getState().doc.screens.find(item => item.id === draftScreenId.current);
      const emptyStarter = !original.current && !workspaceDirtyRef.current && (!owner?.nodes.some(isSelectionNode) || !owner.nodes.some(isStatusNode));
      setMessage(emptyStarter ? '此 Screen 暂无可配置的选择联动；添加选择控件与状态指示器后可新建规则。' : (error as Error).message);
    }
  };
  const persistLayout = (owner: Screen, rule: Behavior, state: BehaviorWorkspaceState) => {
    const localId = localSession.status.getState().localId;
    if (!localId || editorStore.getState().blocked) return Promise.resolve();
    return writeLayout(localId, { version: 1, blocklyVersion: Blockly.VERSION, screenId: owner.id, ruleId: rule.id, fingerprint: semanticFingerprint(rule, owner.behaviorMaps ?? []), state }).catch(() => { setMessage('Blockly 布局缓存不可用；权威规则未受影响。'); });
  };
  const scheduleLayout = () => {
    if (!original.current || workspaceDirtyRef.current || mapDirtyRef.current || !workspace.current) return;
    const owner = editorStore.getState().doc.screens.find(item => item.id === draftScreenId.current), rule = original.current;
    if (!owner || !owner.behaviors.some(item => item.id === rule.id && canonical(item) === canonical(rule))) return;
    const state = Blockly.serialization.workspaces.save(workspace.current) as BehaviorWorkspaceState;
    layoutWrites.current = layoutWrites.current.then(() => persistLayout(owner, rule, state));
  };
  const load = (id?: string, simple = false, typedEvent?: TypedEventType) => {
    const generation = ++loadGeneration.current;
    const current = editorStore.getState(), owner = currentScreenOf(current.doc, current.currentScreenId), existing = owner.behaviors.find(item => item.id === id);
    let rule = existing;
    if (!rule) {
      const used = new Set([current.doc.project.id, ...current.doc.screens.flatMap(item => [item.id, ...item.nodes.map(node => node.id), ...item.behaviors.map(item => item.id), ...(item.screenTargets ?? []).map(item => item.id)]), ...(current.doc.screenTabGroups ?? []).flatMap(group => [group.id, ...group.tabs.map(tab => tab.id)])]);
      let index = 1; while (used.has(`rule_${index}`)) index++;
      const source = owner.nodes.find(isSelectionNode), target = owner.nodes.find(isStatusNode);
      const assignment = { type: 'set-status' as const, targetId: target?.id ?? '', statusId: target?.props.initialStatusId ?? '' };
      rule = { id: `rule_${index}`, event: { type: 'selection-change', sourceId: source?.id ?? '' }, actions: simple ? [{ type: 'if', condition: { type: 'event-option', operator: 'equals', optionId: source?.props.options[0]?.id ?? '' }, thenActions: [assignment], elseActions: [{ ...assignment }] }] : [{ type: 'set-status', targetId: target?.id ?? '', optionMappings: [] }] };
      if (typedEvent) rule = createTypedRuleTemplate(owner, `rule_${index}`, typedEvent);
    }
    if (!canEditWithBlocks(rule)) { setMessage('该规则不在 B1 范围内，请使用 F2 表单；权威规则已完整保留。'); return; }
    setDraftScreen(owner); draftScreenId.current = owner.id; seenScreenId.current = owner.id;
    baseDoc.current = current.doc; mapBaseDoc.current = current.doc; original.current = existing ? structuredClone(existing) : undefined; ruleId.current = rule.id; setSelected(existing?.id ?? ''); setConflict(false);
    const triggerState = { multi: !!existing?.eventBindings, extras: structuredClone(existing?.eventBindings?.slice(1) ?? []) };
    triggerDraft.current = triggerState; triggerBaseline.current = JSON.stringify(triggerState); setMultiTrigger(triggerState.multi); setExtraBindings(triggerState.extras);
    setMapDraft(null); markMapDirty(false); setSelectedBlockId(null); setSelectedMapId(null);
    setBlockContext(workspace.current!, owner);
    Blockly.Events.disable();
    try { Blockly.serialization.workspaces.load(behaviorToWorkspace(rule), workspace.current!); workspace.current!.clearUndo(); }
    finally { Blockly.Events.enable(); }
    // A starter template may have empty source/target fields. Capture its
    // editable content without requiring conversion into a valid F2 behavior.
    draftBaseline.current = workspaceDraftSignature(Blockly.serialization.workspaces.save(workspace.current!) as BehaviorWorkspaceState);
    refreshRef.current();
    workspace.current!.scrollCenter();
    const localId = localSession.status.getState().localId;
    if (existing && localId) {
      const generated = behaviorToWorkspace(existing);
      void readLayout(localId, owner.id, existing.id).then(raw => {
        if (generation !== loadGeneration.current || dirtyRef.current || !workspace.current || baseDoc.current !== editorStore.getState().doc) return;
        if (raw === undefined) return;
        try {
          if (!validSnapshot(raw, owner.id, existing, owner.behaviorMaps ?? [], Blockly.VERSION)) throw new Error('版本或规则语义不匹配');
          // Compare translated behavior against the generated graph, never trust stored graph as authority.
          if (canonical(workspaceToBehavior(raw.state, existing.id, existing)) !== canonical(workspaceToBehavior(generated, existing.id, existing))) throw new Error('积木行为与权威规则不一致');
          Blockly.Events.disable();
          try { Blockly.serialization.workspaces.load(raw.state, workspace.current); workspace.current.clearUndo();
            const loaded = Blockly.serialization.workspaces.save(workspace.current) as BehaviorWorkspaceState;
            if (canonical(workspaceToBehavior(loaded, existing.id, existing)) !== canonical(workspaceToBehavior(generated, existing.id, existing))) throw new Error('恢复后的积木与规则不一致');
          }
          finally { Blockly.Events.enable(); }
          draftBaseline.current = workspaceDraftSignature(Blockly.serialization.workspaces.save(workspace.current) as BehaviorWorkspaceState);
          refreshRef.current(); workspace.current.scrollCenter(); setMessage('已恢复本机 Blockly 布局；业务规则仍以项目为准。');
        } catch {
          Blockly.Events.disable();
          try { Blockly.serialization.workspaces.load(generated, workspace.current); workspace.current.clearUndo(); }
          finally { Blockly.Events.enable(); }
          draftBaseline.current = workspaceDraftSignature(Blockly.serialization.workspaces.save(workspace.current) as BehaviorWorkspaceState);
          refreshRef.current(); setMessage('Blockly 布局快照无效或不兼容，已从权威规则重新生成；规则未改变。');
        }
      }).catch(() => { if (generation === loadGeneration.current) setMessage('Blockly 布局缓存不可用，已从权威规则生成。'); });
    }
  };
  useEffect(() => {
    const ws = Blockly.inject(host.current!, { theme: BLOCKLY_THEMES[theme], toolbox: behaviorToolbox, media: `${import.meta.env.BASE_URL}blockly-media/`, sounds: false, trashcan: true, maxBlocks: 1000, zoom: { controls: true, wheel: true, startScale: 0.6, minScale: 0.35, maxScale: 1.5 }, move: { scrollbars: true, drag: true, wheel: true } });
    themeController.current = bindBlocklyTheme(ws);
    workspace.current = ws; setBlockContext(ws, screen); load(selected || undefined); setReady(true);
    const changed = (event: Blockly.Events.Abstract) => {
      if (event.type === Blockly.Events.SELECTED) {
        const id = (event as Blockly.Events.Selected).newElementId ?? null; setSelectedBlockId(id);
        const block = id ? ws.getBlockById(id) : null;
        if (block?.type === 'gui_shared_status_map') setSelectedMapId(block.getFieldValue('MAP') || null);
      } else if (!event.isUiEvent) { ++loadGeneration.current; refreshRef.current(); scheduleLayout(); }
    };
    ws.addChangeListener(changed);
    const resize = new ResizeObserver(() => { if (active) Blockly.svgResize(ws); }); resize.observe(host.current!);
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { ++loadGeneration.current; resize.disconnect(); window.removeEventListener('beforeunload', unload); ws.removeChangeListener(changed); themeController.current?.dispose(); themeController.current = null; ws.dispose(); workspace.current = null; onDirtyChange(false); };
  }, []); // Keep one Blockly instance alive across mode and Screen switches so its draft and undo stack survive.
  useEffect(() => { themeController.current?.apply(theme); }, [theme]);
  useEffect(() => { if (active && workspace.current) requestAnimationFrame(() => { if (workspace.current) Blockly.svgResize(workspace.current); }); }, [active, mapPanelOpen, mapPanelWidth]);
  useEffect(() => {
    if (seenScreenId.current === screen.id) return;
    seenScreenId.current = screen.id;
    if (dirtyRef.current && !(operation === 'delete' && baseDoc.current !== doc)) { setConflict(true); setMessage(`未保存草稿属于 Screen ${draftScreenId.current}；已切换到 ${screen.id}，草稿保留但不能保存到新 Screen。重新载入会放弃旧草稿。`); }
    else load(screen.behaviors.find(canEditWithBlocks)?.id);
  }, [screen.id]);
  useEffect(() => {
    if (active && openRuleId && !dirtyRef.current && !conflict && screen.behaviors.some(rule => rule.id === openRuleId && canEditWithBlocks(rule))) load(openRuleId);
  }, [active, openRuleId]);
  useEffect(() => {
    if (baseDoc.current === doc) return;
    if (operation === 'delete') { load(screen.behaviors.find(rule => rule.id === selected && canEditWithBlocks(rule))?.id); return; }
    if (dirtyRef.current) { setConflict(true); setMessage('项目已变化，当前 Blockly 草稿已保留但不能覆盖新文档。请显式放弃并重新载入。'); }
    else load(screen.behaviors.find(rule => rule.id === selected && canEditWithBlocks(rule))?.id);
  }, [doc]);
  useExportDraft({ validate: () => { if (dirtyRef.current) throw new Error('Blockly 有未保存草稿，请先保存积木规则或放弃草稿'); }, commit: () => {} });
  const save = async () => {
    try {
      if (baseDoc.current !== editorStore.getState().doc) throw new Error('项目已变化，请重新载入积木草稿');
      const rule = read(); validate(rule);
      // Unchanged opening/serialization does not write new fields or upgrade old projects.
      if (!original.current || !same(rule, original.current)) editorStore.getState().saveBehavior(rule);
      const savedOwner = currentScreenOf(editorStore.getState().doc, draftScreenId.current);
      const savedState = Blockly.serialization.workspaces.save(workspace.current!) as BehaviorWorkspaceState;
      layoutWrites.current = layoutWrites.current.then(() => persistLayout(savedOwner, rule, savedState));
      const savedDoc = editorStore.getState().doc, savedGeneration = loadGeneration.current;
      await layoutWrites.current;
      if (loadGeneration.current !== savedGeneration || editorStore.getState().doc !== savedDoc || editorStore.getState().currentScreenId !== savedOwner.id) { setMessage('规则已保存；项目随后发生变化，未覆盖当前工作区。'); return; }
      load(rule.id); setMessage('积木规则已保存；与 F2 共用同一规则、预览和 ZIP 合同。'); notify('Blockly 积木规则已保存');
    } catch (error) { setMessage((error as Error).message); }
  };
  const mapReferences = (mapId: string): MapReference[] => draftScreen.behaviors.flatMap(rule => actionsOf(rule).flatMap((action, actionIndex) => behaviorLeafActions(action).flatMap(leaf => {
    const target = leaf.type === 'set-status' ? draftScreen.nodes.find(node => node.id === leaf.targetId) : undefined;
    return leaf.type === 'set-status' && 'mapRef' in leaf && leaf.mapRef === mapId ? [{ ruleId: rule.id, actionIndex, targetId: leaf.targetId, targetLabel: target ? behaviorNodeLabel(target, draftScreen) : leaf.targetId }] : [];
  })));
  const beginNewMap = (copy?: BehaviorMap) => {
    const used = new Set(draftScreen.behaviorMaps?.map(map => map.id) ?? []); let index = 1; while (used.has(`behavior_map_${index}`)) index++;
    mapBaseDoc.current = editorStore.getState().doc; markMapDirty(true);
    setMapDraft(copy ? { ...structuredClone(copy), id: `behavior_map_${index}`, name: `${copy.name} 副本` } : { id: `behavior_map_${index}`, name: `状态映射 ${index}`, mappings: [] });
  };
  const allOptions = [...new Map(draftScreen.nodes.filter(isSelectionNode).flatMap(node => node.props.options.map(option => [option.id, `${displayText(option.label)} · ${option.id}`] as const))).entries()];
  const allStatuses = [...new Map(draftScreen.nodes.filter(isStatusNode).flatMap(node => node.props.statuses.map(status => [status.statusId, `${displayText(status.label)} · ${status.statusId}`] as const))).entries()];
  const locateReference = (reference: MapReference, mapId: string) => {
    if (dirty) { setMessage('请先保存或放弃当前积木草稿，再定位到其他规则中的引用。'); return; }
    const locate = () => {
      const ws = workspace.current; if (!ws) return;
      const block = ws.getAllBlocks(false).find(item => {
        if (item.type !== 'gui_set_status' || item.getFieldValue('TARGET') !== reference.targetId) return false;
        const value = item.getInputTargetBlock('VALUE'); return value?.type === 'gui_shared_status_map' && value.getFieldValue('MAP') === mapId;
      });
      if (block) { block.select(); ws.centerOnBlock(block.id); setSelectedBlockId(block.id); setSelectedMapId(mapId); setMessage(`已定位到 ${reference.ruleId} 的共享映射动作。`); }
      else setMessage('当前积木规则中未找到该映射引用，请确认规则草稿已载入。');
    };
    if (reference.ruleId !== selected) { load(reference.ruleId); requestAnimationFrame(locate); }
    else locate();
    setMapDrawerOpen(false);
  };
  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return; event.preventDefault();
    const target = event.currentTarget, startX = event.clientX, initial = mapPanelWidth; target.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => setMapPanelWidth(Math.max(270, Math.min(560, initial + startX - pointer.clientX)));
    const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  };
  const selectedBlock = selectedBlockId ? workspace.current?.getBlockById(selectedBlockId) : null;
  const selectedBlockFields = selectedBlock?.inputList.flatMap(input => input.fieldRow.filter(field => field.name).map(field => [field.name, field.getText(), field.getValue()] as const)) ?? [];
  let graphRule: Behavior | undefined;
  try { if (workspace.current) graphRule = workspaceToBehavior(Blockly.serialization.workspaces.save(workspace.current) as BehaviorWorkspaceState, ruleId.current, original.current); } catch { /* Incomplete graphs are diagnosed separately. */ }
  const graphSources = graphRule ? legacySourcesOf(graphRule) : [];
  const reads = draftRule ? actionsOf(draftRule).flatMap(action => action.type === 'if' ? conditionLeaves(action.condition).flatMap(condition => condition.type === 'compare' ? [condition.left, condition.right].flatMap(value => value.type === 'read-control-value' ? [value.nodeId] : []) : []) : []) : [];
  const targets = draftRule ? actionsOf(draftRule).flatMap(behaviorLeafActions).flatMap(action => 'targetId' in action ? [action.targetId] : []) : [];
  const updateTriggers = (multi: boolean, extras: ExplicitBinding[]) => { triggerDraft.current = { multi, extras }; setMultiTrigger(multi); setExtraBindings(extras); ++loadGeneration.current; refreshRef.current(); };
  const blockNames: Record<string, string> = { gui_on_event: '类型化事件入口', gui_event_value: '当前事件载荷', gui_constant: '类型化常量', gui_compare: '类型化比较', gui_action: '运行时属性动作', gui_on_selection_single: '单来源选择事件', gui_if_selection: '如果当前选择是', gui_set_status_direct: '直接设置状态', gui_on_selection: '选择变化事件', gui_selection_source: '选择控件来源', gui_event_option: '当前事件 optionId', gui_if_option: 'optionId 条件比较', gui_if: '如果 / 否则分支', gui_status_map: '内联状态映射', gui_shared_status_map: '共享状态映射', gui_mapping_pair: '映射项', gui_set_status: '设置指示器状态' };
  const mapPanel = <aside className={`blockly-sidebar ${mapDrawerOpen ? 'drawer-open' : ''}`} aria-label="Blockly 属性与共享映射面板" data-testid="blockly-sidebar" onClick={event => event.stopPropagation()}>
    <div className="blockly-sidebar-heading"><strong>属性与共享映射</strong><button type="button" aria-label="关闭映射侧栏" onClick={() => { setMapPanelOpen(false); setMapDrawerOpen(false); }}>×</button></div>
    {selectedBlock && <section className="blockly-selection-info" aria-label="选中积木属性"><strong>{blockNames[selectedBlock.type] ?? selectedBlock.type}</strong><code>{selectedBlock.id}</code>{selectedBlockFields.map(([name, value, stableId]) => <div key={name}><span>{name}</span><code>{value || '（未设置）'}</code>{stableId && stableId !== value && <small>{stableId}</small>}</div>)}{selectedBlock.type === 'gui_shared_status_map' && <button type="button" onClick={() => { const id = selectedBlock.getFieldValue('MAP'); setSelectedMapId(id || null); document.querySelector(`[data-map-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' }); }}>查看此映射</button>}</section>}
    <div className="blockly-maps" aria-label="共享状态映射" data-testid="blockly-maps">
      <div><strong>Screen 共享映射（{draftScreen.behaviorMaps?.length ?? 0}）</strong><details className="blockly-map-help"><summary>共享映射说明</summary><small>同一 map ID 的动作读取同一份有序 optionId → statusId 定义；名称和显示文字不参与匹配。</small></details></div>
      {!(draftScreen.behaviorMaps?.length) && <p className="blockly-map-empty">尚无共享映射。创建一次，可供本 Screen 的多个动作引用。</p>}
      <div className="blockly-map-list">{(draftScreen.behaviorMaps ?? []).map(map => { const refs = mapReferences(map.id); return <div key={map.id} className={`blockly-map-row ${selectedMapId === map.id ? 'selected' : ''}`} data-map-id={map.id}>
        <button type="button" className="blockly-map-select" onClick={() => setSelectedMapId(map.id)}><strong>{map.name}</strong><code>{map.id}</code><small>{map.mappings.length} 项 · {refs.length} 个引用</small></button>
        <div className="blockly-map-actions"><button disabled={dirty || !!blocked || conflict} onClick={() => { mapBaseDoc.current = editorStore.getState().doc; markMapDirty(true); setMapDraft(structuredClone(map)); setSelectedMapId(map.id); }}>编辑</button><button disabled={dirty || !!blocked || conflict || refs.length > 0} title={refs.length ? '先解除所有动作引用' : undefined} onClick={() => { try { editorStore.getState().deleteBehaviorMap(map.id); if (mapDraft?.id === map.id) { setMapDraft(null); markMapDirty(false); } } catch (error) { setMessage((error as Error).message); } }}>删除</button><button disabled={dirty || !!blocked || conflict} onClick={() => beginNewMap(map)}>复制</button></div>
        {!!refs.length && <div className="blockly-map-references"><span>关联规则与动作</span>{refs.map((reference, index) => <button key={`${reference.ruleId}-${reference.actionIndex}-${index}`} type="button" disabled={dirty || conflict} onClick={() => locateReference(reference, map.id)}>{reference.ruleId} · 动作 {reference.actionIndex + 1}<small>{reference.targetLabel}</small></button>)}</div>}
      </div>; })}</div>
      <button type="button" disabled={dirty || !!blocked || conflict} onClick={() => beginNewMap()}>新建共享映射</button>
      {mapDraft && <div className="blockly-map-editor"><strong>{mapDraft.id} · {(draftScreen.behaviorMaps ?? []).some(map => map.id === mapDraft.id) ? '编辑' : '新建'}</strong><label>映射名称<input aria-label="共享映射名称" value={mapDraft.name} maxLength={128} onChange={event => setMapDraft({ ...mapDraft, name: event.target.value })}/></label>{mapDraft.mappings.map((mapping, index) => <div className="blockly-map-pair" key={`${mapDraft.id}-${index}`}><label>optionId<select aria-label={`共享映射选项 ${index + 1}`} value={mapping.optionId} onChange={event => setMapDraft({ ...mapDraft, mappings: mapDraft.mappings.map((item, i) => i === index ? { ...item, optionId: event.target.value } : item) })}><option value="">请选择</option>{allOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><span>→</span><label>statusId<select aria-label={`共享映射状态 ${index + 1}`} value={mapping.statusId} onChange={event => setMapDraft({ ...mapDraft, mappings: mapDraft.mappings.map((item, i) => i === index ? { ...item, statusId: event.target.value } : item) })}><option value="">请选择</option>{allStatuses.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><button type="button" aria-label={`删除映射项 ${index + 1}`} onClick={() => setMapDraft({ ...mapDraft, mappings: mapDraft.mappings.filter((_, i) => i !== index) })}>删除项</button></div>)}<button type="button" disabled={mapDraft.mappings.length >= 100 || !allOptions.length || !allStatuses.length} onClick={() => setMapDraft({ ...mapDraft, mappings: [...mapDraft.mappings, { optionId: allOptions[0][0], statusId: allStatuses[0][0] }] })}>添加映射项</button><button type="button" disabled={!!blocked || conflict || !mapDraft.name.trim() || mapDraft.mappings.some(item => !item.optionId || !item.statusId) || new Set(mapDraft.mappings.map(item => item.optionId)).size !== mapDraft.mappings.length} onClick={() => { try { if (mapBaseDoc.current !== editorStore.getState().doc || editorStore.getState().currentScreenId !== draftScreenId.current) throw new Error('Screen 或项目已变化，请重新载入映射草稿'); editorStore.getState().saveBehaviorMap(mapDraft); baseDoc.current = editorStore.getState().doc; mapBaseDoc.current = baseDoc.current; const nextScreen = currentScreenOf(baseDoc.current, draftScreenId.current); setDraftScreen(nextScreen); setBlockContext(workspace.current!, nextScreen); setMapDraft(null); markMapDirty(false); setMessage('共享映射已保存；所有引用均通过 Schema 校验。'); } catch (error) { setMessage((error as Error).message); } }}>保存映射定义</button><button type="button" onClick={() => { setMapDraft(null); markMapDirty(false); }}>取消</button></div>}
    </div>
  </aside>;
  return <section className={`blockly-editor ${active ? 'active' : 'inactive'} ${mapPanelOpen ? 'maps-open' : 'maps-collapsed'}`} role="region" aria-label="Blockly 行为工作区" data-testid="blockly-editor" aria-hidden={!active} style={{ '--blockly-sidebar-width': `${mapPanelWidth}px` } as CSSProperties}>


    {toolbarHost && createPortal(<>
    <div className="blockly-context-heading" role="group" aria-label="Blockly 工作区操作"><div><strong>Blockly 行为</strong><label>当前 Screen<select aria-label="Blockly 当前 Screen" disabled={!!blocked} value={screen.id} onChange={event => { try { beforeScreenChange(); editorStore.getState().switchScreen(event.target.value); } catch (error) { notify((error as Error).message, true); } }}>{doc.screens.map(item => <option key={item.id} value={item.id}>{displayText(item.title)} · {item.id}</option>)}</select></label><label>规则<select aria-label="Blockly 规则" value={selected} disabled={dirty || !ready || conflict} onChange={event => { setSelected(event.target.value); load(event.target.value); }}><option value="">新规则</option>{draftScreen.behaviors.map(rule => <option key={rule.id} value={rule.id} disabled={!canEditWithBlocks(rule)}>{rule.id}{canEditWithBlocks(rule) ? '' : ' · B1 未支持，保留 F2 编辑'}</option>)}</select></label><small>{draftScreen.id === screen.id ? displayText(screen.title) : `草稿来源：${displayText(draftScreen.title)}`}</small><span className="blockly-rule-event">{graphRule?.event.type ?? '待配置事件'}</span><span className={`blockly-draft-badge ${dirty ? 'dirty' : ''}`}>{dirty ? '未保存草稿' : '与项目一致'}</span></div><div><button type="button" className="blockly-map-panel-toggle" aria-expanded={mapPanelOpen} onClick={() => setMapPanelOpen(!mapPanelOpen)}>{mapPanelOpen ? '收起映射面板' : '共享映射'}</button><button type="button" className="blockly-map-drawer-toggle" onClick={() => setMapDrawerOpen(true)}>共享映射</button></div></div>
      <fieldset className="blockly-trigger-config" disabled={!ready || conflict || !!blocked}>
        <legend>事件触发配置</legend>
        <label><input type="radio" name="blockly-trigger-mode" checked={!multiTrigger} onChange={() => updateTriggers(false, extraBindings)}/>指定事件触发</label>
        <label><input type="radio" name="blockly-trigger-mode" checked={multiTrigger} onChange={() => updateTriggers(true, extraBindings)}/>多事件触发</label>
        <details className="blockly-trigger-help"><summary>触发与读取说明</summary><p>读取某个控件不代表该控件变化会触发规则。多事件模式中勾选需要主动订阅的来源；当前支持 Radio Group、Dropdown 和 Slider 的变化事件。</p></details>
        {multiTrigger && draftScreen.nodes.filter(node => isSelectionNode(node) || node.type === 'minecraft:slider').map(node => {
          const binding: ExplicitBinding = node.type === 'minecraft:slider' ? { type:'slider-change', sourceId:node.id, payloadType:'Number' } : { type:'selection-change', sourceId:node.id, payloadType:'OptionId' };
          const fromGraph = graphRule?.event.type === binding.type && graphSources.includes(node.id);
          const checked = !!fromGraph || extraBindings.some(item => item.type === binding.type && item.sourceId === binding.sourceId);
          return <label key={`${binding.type}:${node.id}`}><input type="checkbox" aria-label={`触发 ${node.id}`} checked={checked} disabled={!!fromGraph} onChange={event => updateTriggers(true, event.target.checked ? [...extraBindings, binding] : extraBindings.filter(item => item.type !== binding.type || item.sourceId !== binding.sourceId))}/>{behaviorNodeLabel(node, draftScreen)} · {binding.type} · {binding.payloadType}{fromGraph ? '（积木入口）' : ''}</label>;
        })}
        <p>触发来源：{draftRule ? eventBindingsOf(draftRule).map(binding => `${binding.sourceId} / ${binding.type} / ${binding.payloadType}`).join('、') : '请先完成事件入口'}</p>
        <details className="blockly-dependencies"><summary>读取依赖与动作目标</summary><p>读取依赖：{[...new Set(reads)].join('、') || '无'}；动作目标：{[...new Set(targets)].join('、') || '无'}</p></details>
      </fieldset>
    </>, toolbarHost)}
    <div className="blockly-editor-main"><div className="blockly-center">
      <div className="blockly-editor-controls" aria-label="规则编辑操作"><button disabled={!dirty || mapDraft !== null || !!blocked || conflict || !candidate} onClick={save}>保存积木规则</button><button disabled={!ready} onClick={() => workspace.current?.undo(false)}>撤销积木</button><button disabled={!ready} onClick={() => workspace.current?.undo(true)}>重做积木</button><button disabled={!ready} onClick={() => load(screen.behaviors.find(rule => rule.id === selected && canEditWithBlocks(rule))?.id)}>放弃草稿并重新载入</button><button type="button" onClick={() => setMode(false)}>返回 GUI 设计</button><details className="blockly-create-tools"><summary>新建规则</summary><div className="blockly-template-options"><label>新规则事件<select aria-label="通用规则事件" value={genericEvent} onChange={event => setGenericEvent(event.target.value as TypedEventType)}>{Object.entries(TYPED_EVENTS).map(([id, spec]) => <option key={id} value={id}>{spec.label}（{spec.valueType}）</option>)}</select></label><button disabled={dirty || !ready || !!blocked || conflict} onClick={() => load(undefined, false, genericEvent)}>新建通用规则</button><button disabled={dirty || !ready || !!blocked || conflict} onClick={() => load(undefined, true)}>新建简单条件规则</button><button disabled={dirty || !ready || !!blocked || conflict} onClick={() => load()}>新建共享规则</button></div></details></div>
      {conflict && <div className="blockly-conflict" role="alert">当前积木仍保留在 {draftScreen.id} 草稿中。请显式放弃并重新载入当前 Screen；此草稿不会写入 {screen.id}。</div>}
      <p role="status" data-testid="blockly-diagnostic" className={`blockly-diagnostic ${!candidate && ready && (dirty || !!original.current) ? 'attention' : ''}`}>{dirty ? '未保存草稿 · ' : '与项目一致 · '}{message}</p>

      <div className="blockly-host" ref={host} data-testid="blockly-workspace"/>
      <details className="blockly-semantic-details"><summary>行为语义预览（未提交）</summary><pre data-testid="blockly-semantic-preview">{candidate ? JSON.stringify(candidate, null, 2) : '请修复积木连接和引用'}</pre></details>
      <details className="blockly-help"><summary>帮助与能力合同</summary><div>    <p className="blockly-editor-intro">事件发生 → 读取本次事件的类型化值 → 比较与分支 → 更新目标支持的运行时属性。通用入口支持选项身份与数值；快捷积木沿用同一 F2 合同。切换工作模式保留草稿。</p>      <small className="blockly-editor-contract">通用条件支持 OptionId / Number 同类型比较；分支按顺序执行目标能力允许的动作。旧 event-option 与快捷积木继续可用；布尔条件最多嵌套 4 层、32 个节点；if 动作不能嵌套。直接赋值使用合法状态 ID；映射模式的未映射选项保持目标状态。每项映射必须存在于每个来源；非法引用禁止保存。共享映射按 Screen 隔离，修改会影响所有引用，删除前必须解除引用；复制会创建独立 map ID。已保存规则的布局缓存在本机；未提交草稿不持久化。规则保存沿用项目事务。</small></div></details>
    </div>{mapPanelOpen && <><div className="blockly-sidebar-resizer" role="separator" aria-label="调整共享映射面板宽度" onPointerDown={beginResize}/>{mapPanel}</>}</div>

    {mapDrawerOpen && <div className="blockly-drawer-backdrop" onClick={() => setMapDrawerOpen(false)}>{mapPanel}</div>}
    <small className="blockly-surface-status">{conflict ? `规则草稿仍属于 ${draftScreen.id}` : `${draftScreen.behaviors.length} 条 Screen 规则 · ${(draftScreen.behaviorMaps ?? []).length} 个共享映射`}</small>
  </section>;
}
function currentScreenOf(doc: GuiProject, id: string) { const screen = doc.screens.find(screen => screen.id === id); if (!screen) throw new Error('当前 Screen 不存在'); return screen; }
