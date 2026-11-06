/** Prototype C · Adaptive Workspace（BENTO-5 隔离原型，模拟数据，不连接真实 store/IndexedDB/导出）。
 *  信息架构策略：任务自适应工作区——按 Design / Behavior / Resources / Export 四种任务模式
 *  重组主工作区；header 下方一条持久上下文条在模式切换间保持 屏/选中/规则 的连续性。 */
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  COMPONENT_TYPES,
  EXPORT_ENTRIES,
  MENU_STRUCTURE,
  RESOURCE_STATE,
  RULES,
  SCREENS,
  MockCanvas,
  ThemeButton,
  useDragWidth,
  useProtoTheme,
  type ProtoNode,
  type ProtoRule,
  type ProtoScreen,
} from '../shared';
import '../shared.css';
import './proto-c.css';

type Mode = 'design' | 'behavior' | 'resources' | 'export';
type Draft = { event: string; source: string; actions: string[] };

const MODES: { id: Mode; label: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'resources', label: 'Resources' },
  { id: 'export', label: 'Export' },
];

const EVENT_OPTIONS = ['button-click', 'slider-change', 'selection-change', 'checkbox-change'];
const ACTION_OPTIONS = ['set-status → status_1', 'set-progress-value → status_1', 'open_screen → screen_shop'];
const BATCH_ID = 'batch_20261105_01';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const actionOptionsFor = (current: string): string[] =>
  ACTION_OPTIONS.includes(current) ? ACTION_OPTIONS : [current, ...ACTION_OPTIONS];
const glyphFor = (type: string): string => COMPONENT_TYPES.find(c => c.type === type)?.glyph ?? '□';

function App() {
  const { theme, toggle } = useProtoTheme();

  /* ---- 全局（App 层提升）状态：模式切换不丢失屏选择与节点选中 ---- */
  const [mode, setMode] = useState<Mode>('design');
  const [screens, setScreens] = useState<ProtoScreen[]>(() => clone(SCREENS));
  const [rules, setRules] = useState<Record<string, ProtoRule[]>>(() => clone(RULES));
  const [screenId, setScreenId] = useState<string>(SCREENS[0].id);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  /* ---- 工作区通用状态 ---- */
  const [grid, setGrid] = useState(true);
  const [status, setStatus] = useState('就绪 · Prototype C 任务自适应工作区（模拟数据）');
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  /* ---- 布局状态 ---- */
  const [collapsed, setCollapsed] = useState(false);
  const [leftTab, setLeftTab] = useState<'structure' | 'catalog'>('structure');
  const left = useDragWidth(240, 180, 420, 1);
  const right = useDragWidth(300, 240, 460, -1);

  /* ---- Resources / Export 模式本地模拟状态 ---- */
  const [overlay, setOverlay] = useState<string | null>(RESOURCE_STATE.overlay);
  const [spriteQueryInput, setSpriteQueryInput] = useState(RESOURCE_STATE.spriteQuery[0]);
  const [batchSha, setBatchSha] = useState('9f3c2ab7');

  const screen = screens.find(s => s.id === screenId) ?? screens[0];
  const screenRules = rules[screen.id] ?? [];
  const selectedNode = screen.nodes.find(n => n.id === selectedNodeId) ?? null;
  const selectedRule = screenRules.find(r => r.id === selectedRuleId) ?? null;
  const modeLabel = MODES.find(m => m.id === mode)?.label ?? mode;

  /* 结构树顺序：根节点在前，其子节点紧随其后（缩进渲染）。 */
  const orderedNodes = useMemo(() => {
    const roots = screen.nodes.filter(n => !n.parent);
    const out: ProtoNode[] = [];
    for (const r of roots) {
      out.push(r);
      out.push(...screen.nodes.filter(n => n.parent === r.id));
    }
    for (const n of screen.nodes) {
      if (n.parent && !roots.some(r => r.id === n.parent)) out.push(n);
    }
    return out;
  }, [screen]);

  /* Behavior 模式：规则来源节点 → 事件徽标。 */
  const badges = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of screenRules) map[r.source] = r.event;
    return map;
  }, [screenRules]);

  /* 上下文条第三段面包屑：Behavior 下优先显示规则，其余显示选中节点。 */
  const contextTarget = mode === 'behavior' && selectedRuleId ? selectedRuleId : selectedNodeId;

  const switchMode = (next: Mode) => {
    setMode(next);
    const label = MODES.find(m => m.id === next)?.label ?? next;
    setStatus(`任务模式：${label} · 屏与选中上下文已保留`);
  };

  const switchScreen = (id: string) => {
    setScreenId(id);
    setSelectedNodeId(null);
    setSelectedRuleId(null);
    setDraft(null);
    setStatus(`切换到 Screen：${id}`);
  };

  const clearSelection = () => {
    setSelectedNodeId(null);
    setSelectedRuleId(null);
    setDraft(null);
    setStatus('已清除当前选中');
  };

  const patchNode = (id: string, patch: Partial<ProtoNode>) => {
    setScreens(prev => prev.map(s =>
      s.id === screenId ? { ...s, nodes: s.nodes.map(n => (n.id === id ? { ...n, ...patch } : n)) } : s));
  };

  const patchNodeNumber = (id: string, key: 'x' | 'y' | 'w' | 'h', raw: string) => {
    const v = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(v)) patchNode(id, { [key]: v });
  };

  const addNodeFromCatalog = (type: string, label: string) => {
    const short = type.split(':')[1]?.replace(/-/g, '_') ?? 'node';
    const existing = new Set(screen.nodes.map(n => n.id));
    let i = 1;
    let id = `${short}_${i}`;
    while (existing.has(id)) { i += 1; id = `${short}_${i}`; }
    const node: ProtoNode = { id, type, label, x: 20 + ((i * 12) % 90), y: 148, w: 96, h: 20 };
    setScreens(prev => prev.map(s => (s.id === screenId ? { ...s, nodes: [...s.nodes, node] } : s)));
    setSelectedNodeId(id);
    setStatus(`模拟：从目录添加组件 ${label}（${id}）`);
  };

  const selectRule = (rule: ProtoRule) => {
    setSelectedRuleId(rule.id);
    setDraft({ event: rule.event, source: rule.source, actions: [...rule.actions] });
    setSelectedNodeId(rule.source);
    setStatus(`规则 ${rule.id} · 来源节点 ${rule.source} 已在画布高亮`);
  };

  const handleCanvasSelect = (id: string | null) => {
    setSelectedNodeId(id);
    if (mode !== 'behavior') return;
    const rule = id ? screenRules.find(r => r.source === id) : undefined;
    if (rule) {
      selectRule(rule);
    } else {
      setSelectedRuleId(null);
      setDraft(null);
    }
  };

  const saveDraft = () => {
    if (!selectedRuleId || !draft) return;
    setRules(prev => ({
      ...prev,
      [screenId]: (prev[screenId] ?? []).map(r =>
        r.id === selectedRuleId ? { ...r, event: draft.event, source: draft.source, actions: [...draft.actions] } : r),
    }));
    setStatus(`模拟：保存规则草稿 → ${selectedRuleId}`);
  };

  const discardDraft = () => {
    if (!selectedRule) return;
    setDraft({ event: selectedRule.event, source: selectedRule.source, actions: [...selectedRule.actions] });
    setStatus('模拟：放弃草稿修改，已从规则恢复');
  };

  const regenerateBatch = () => {
    const sha = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
    setBatchSha(sha);
    setStatus(`模拟：重新生成导出批次 → ${BATCH_ID} · ${sha}`);
  };

  /* ============================== 渲染 ============================== */

  const contextBar = (
    <div className="proto-card proto-c-contextbar" role="toolbar" aria-label="持久上下文条">
      <nav className="proto-c-crumbs" aria-label="上下文面包屑">
        <button type="button" className="proto-c-crumb proto-c-crumb-mode"
          onClick={() => setStatus(`当前任务模式：${modeLabel}`)}>{modeLabel}</button>
        <span className="proto-c-sep" aria-hidden="true">›</span>
        <button type="button" className="proto-c-crumb"
          onClick={() => setStatus(`当前 Screen：${screen.id}（${screen.title}）`)}>{screen.id}</button>
        <span className="proto-c-sep" aria-hidden="true">›</span>
        {contextTarget ? (
          <button type="button" className="proto-c-crumb proto-c-crumb-sel"
            aria-label={`清除选中 ${contextTarget}`} onClick={clearSelection}>
            {contextTarget} <span aria-hidden="true">✕</span>
          </button>
        ) : (
          <span className="proto-c-crumb-empty">未选中</span>
        )}
      </nav>
      <div className="proto-c-contextbar-actions">
        <button type="button" title="撤销（模拟）" onClick={() => setStatus('模拟：撤销操作')}>↩ 撤销</button>
        <button type="button" title="重做（模拟）" onClick={() => setStatus('模拟：重做操作')}>↪ 重做</button>
        <button type="button" aria-pressed={grid} title="切换画布网格"
          onClick={() => setGrid(g => { setStatus(g ? '网格：关' : '网格：开'); return !g; })}>网格</button>
        <span className="proto-chip" title="画布缩放（模拟）">缩放 200%</span>
      </div>
    </div>
  );

  const leftColumn = (
    <>
      <section className="proto-card proto-c-side" data-collapsed={collapsed}
        style={collapsed ? undefined : { width: left.width }} aria-label="左栏">
        <div className="proto-card-head">
          <button type="button" className="proto-c-chev" aria-expanded={!collapsed}
            aria-label={collapsed ? '展开左栏' : '折叠左栏'} title={collapsed ? '展开左栏' : '折叠左栏'}
            onClick={() => setCollapsed(c => !c)}>{collapsed ? '▸' : '◂'}</button>
          {!collapsed && mode === 'design' && (
            <>
              <strong>工作区</strong>
              <span className="grow" />
              <div className="proto-tabs" role="group" aria-label="左栏视图">
                <button type="button" aria-pressed={leftTab === 'structure'}
                  onClick={() => setLeftTab('structure')}>结构</button>
                <button type="button" aria-pressed={leftTab === 'catalog'}
                  onClick={() => setLeftTab('catalog')}>目录</button>
              </div>
            </>
          )}
          {!collapsed && mode === 'behavior' && (
            <>
              <strong>行为规则</strong>
              <span className="grow" />
              <span className="proto-chip">{screenRules.length} 条</span>
            </>
          )}
        </div>
        {!collapsed && (
          <div className="proto-body">
            <div className="proto-tabs proto-c-screens" role="tablist" aria-label="Screen 切换">
              {screens.map(s => (
                <button key={s.id} type="button" role="tab" aria-selected={s.id === screen.id}
                  aria-pressed={s.id === screen.id} onClick={() => switchScreen(s.id)}>{s.title}</button>
              ))}
            </div>
            <button type="button" style={{ marginTop: 6 }} onClick={() => {
              const id = `screen_${screens.length + 1}`;
              setScreens(prev => [...prev, { id, title: `新屏 ${prev.length + 1}`, nodes: [] }]);
              switchScreen(id);
              setStatus(`模拟：新增画布 ${id}`);
            }}>+ Screen（模拟）</button>

            {mode === 'design' && leftTab === 'structure' && (
              <div className="proto-section">
                <h4>结构树 · {screen.id}</h4>
                <div className="proto-list">
                  {orderedNodes.map(n => (
                    <button key={n.id} type="button" className={n.parent ? 'indent' : undefined}
                      aria-pressed={selectedNodeId === n.id} onClick={() => handleCanvasSelect(n.id)}>
                      <span className="proto-c-glyph" aria-hidden="true">{glyphFor(n.type)}</span>
                      {n.label}
                      <small>{n.id}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'design' && leftTab === 'catalog' && (
              <div className="proto-section">
                <h4>组件目录（点击添加）</h4>
                <p className="proto-note">点击任一组件，模拟添加到 {screen.id}。</p>
                <div className="proto-list">
                  {COMPONENT_TYPES.map(ct => (
                    <button key={ct.type} type="button" onClick={() => addNodeFromCatalog(ct.type, ct.label)}>
                      <span className="proto-c-glyph" aria-hidden="true">{ct.glyph}</span>
                      {ct.label}
                      <small>{ct.type}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'behavior' && (
              <div className="proto-section">
                <h4>规则 · {screen.id}</h4>
                {screenRules.length === 0 && <p className="proto-note">当前 Screen 没有行为规则。</p>}
                {screenRules.map(rule => (
                  <button key={rule.id} type="button" className="proto-rule proto-c-rule-btn"
                    aria-pressed={selectedRuleId === rule.id} onClick={() => selectRule(rule)}>
                    <strong>{rule.id}</strong> · {rule.event} ← {rule.source}
                    <span className="proto-c-rule-actions">
                      {rule.actions.map(a => <span key={a}>{a}</span>)}
                    </span>
                  </button>
                ))}
                <p className="proto-note">点击规则：画布高亮其来源节点，右侧载入草稿。</p>
              </div>
            )}
          </div>
        )}
      </section>
      {!collapsed && (
        <div className="proto-resizer" role="separator" aria-orientation="vertical"
          title="拖动调整左栏宽度" onPointerDown={left.onStart} />
      )}
    </>
  );

  const canvasColumn = (
    <section className="proto-card proto-c-center" aria-label="画布">
      <div className="proto-card-head">
        <strong>画布</strong>
        <span className="grow" />
        <span className="proto-chip">{screen.title}</span>
        <span className="proto-chip">{screen.nodes.length} 节点</span>
        {mode === 'behavior' && <span className="proto-chip">F2 = 规则事件</span>}
      </div>
      <div className="proto-body proto-c-fill">
        <MockCanvas nodes={screen.nodes} grid={grid} badges={mode === 'behavior' ? badges : undefined}
          selected={mode === 'behavior' && selectedRule ? selectedRule.source : selectedNodeId}
          onSelect={handleCanvasSelect} />
      </div>
    </section>
  );

  const inspectorColumn = (
    <>
      <div className="proto-resizer" role="separator" aria-orientation="vertical"
        title="拖动调整右栏宽度" onPointerDown={right.onStart} />
      <section className="proto-card proto-c-side" style={{ width: right.width }} aria-label="右栏">
        <div className="proto-card-head">
          <strong>Inspector</strong>
          <span className="grow" />
          <span className="proto-chip">{selectedNode ? selectedNode.id : '未选中'}</span>
        </div>
        <div className="proto-body">
          {selectedNode ? (
            <>
              <div className="proto-field">
                <span>Label</span>
                <input value={selectedNode.label} aria-label="节点 Label"
                  onChange={e => patchNode(selectedNode.id, { label: e.target.value })} />
              </div>
              <div className="proto-field">
                <span>Type</span>
                <span className="proto-chip">{selectedNode.type}</span>
              </div>
              <div className="proto-section">
                <h4>几何（编辑即反映到画布）</h4>
                <div className="proto-grid2">
                  <div className="proto-field"><span>X</span>
                    <input type="number" value={selectedNode.x} aria-label="X"
                      onChange={e => patchNodeNumber(selectedNode.id, 'x', e.target.value)} /></div>
                  <div className="proto-field"><span>Y</span>
                    <input type="number" value={selectedNode.y} aria-label="Y"
                      onChange={e => patchNodeNumber(selectedNode.id, 'y', e.target.value)} /></div>
                  <div className="proto-field"><span>W</span>
                    <input type="number" value={selectedNode.w} aria-label="W"
                      onChange={e => patchNodeNumber(selectedNode.id, 'w', e.target.value)} /></div>
                  <div className="proto-field"><span>H</span>
                    <input type="number" value={selectedNode.h} aria-label="H"
                      onChange={e => patchNodeNumber(selectedNode.id, 'h', e.target.value)} /></div>
                </div>
              </div>
              <div className="proto-section">
                <h4>层级</h4>
                <p className="proto-note">父节点：{selectedNode.parent ?? '（根节点）'}</p>
              </div>
              <p className="proto-note">模拟编辑：无历史栈，不写入权威 JSON。</p>
            </>
          ) : (
            <>
              <p className="proto-note">未选中节点。在画布或左栏结构树中选择一个节点。</p>
              <div className="proto-section">
                <h4>当前 Screen</h4>
                <div className="proto-c-kv"><span className="proto-c-kv-key">ID</span>
                  <span className="proto-c-kv-val">{screen.id}</span></div>
                <div className="proto-c-kv"><span className="proto-c-kv-key">标题</span>
                  <span className="proto-c-kv-val">{screen.title}</span></div>
                <div className="proto-c-kv"><span className="proto-c-kv-key">节点数</span>
                  <span className="proto-c-kv-val">{screen.nodes.length}</span></div>
                <div className="proto-c-kv"><span className="proto-c-kv-key">规则数</span>
                  <span className="proto-c-kv-val">{screenRules.length}</span></div>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );

  const ruleDraftColumn = (
    <>
      <div className="proto-resizer" role="separator" aria-orientation="vertical"
        title="拖动调整右栏宽度" onPointerDown={right.onStart} />
      <section className="proto-card proto-c-side" style={{ width: right.width }} aria-label="规则草稿编辑器">
        <div className="proto-card-head">
          <strong>规则草稿</strong>
          <span className="grow" />
          <span className="proto-chip">{selectedRuleId ?? '未选择'}</span>
        </div>
        <div className="proto-body">
          {selectedRule && draft ? (
            <>
              <div className="proto-field">
                <span>事件</span>
                <select value={draft.event} aria-label="事件"
                  onChange={e => setDraft(d => (d ? { ...d, event: e.target.value } : d))}>
                  {(EVENT_OPTIONS.includes(draft.event) ? EVENT_OPTIONS : [draft.event, ...EVENT_OPTIONS])
                    .map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="proto-field">
                <span>来源节点</span>
                <select value={draft.source} aria-label="来源节点"
                  onChange={e => setDraft(d => (d ? { ...d, source: e.target.value } : d))}>
                  {(screen.nodes.some(n => n.id === draft.source)
                    ? screen.nodes.map(n => n.id)
                    : [draft.source, ...screen.nodes.map(n => n.id)])
                    .map(id => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>
              <div className="proto-section">
                <h4>动作（{draft.actions.length}）</h4>
                {draft.actions.map((action, i) => (
                  <div className="proto-c-action-row" key={`${action}-${i}`}>
                    <select value={action} aria-label={`动作 ${i + 1}`}
                      onChange={e => setDraft(d => (d
                        ? { ...d, actions: d.actions.map((a, j) => (j === i ? e.target.value : a)) }
                        : d))}>
                      {actionOptionsFor(action).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <button type="button" aria-label={`移除动作 ${i + 1}`} title="移除动作"
                      onClick={() => setDraft(d => (d ? { ...d, actions: d.actions.filter((_, j) => j !== i) } : d))}>✕</button>
                  </div>
                ))}
                <button type="button"
                  onClick={() => setDraft(d => (d ? { ...d, actions: [...d.actions, ACTION_OPTIONS[0]] } : d))}>
                  ＋ 添加动作
                </button>
              </div>
              <div className="proto-section">
                <div className="proto-c-btn-row">
                  <button type="button" className="primary" onClick={saveDraft}>保存草稿（模拟）</button>
                  <button type="button" onClick={discardDraft}>放弃修改</button>
                </div>
                <p className="proto-note">保存会更新左栏规则列表与画布徽标；不写入权威 JSON。</p>
              </div>
            </>
          ) : (
            <p className="proto-note">在左栏选择一条规则以编辑草稿；点击画布中带 F2 徽标的节点也可定位其规则。</p>
          )}
        </div>
      </section>
    </>
  );

  const resourcesMode = (
    <div className="proto-c-two">
      <section className="proto-card proto-c-panel" aria-label="资源包">
        <div className="proto-card-head"><strong>资源包</strong><span className="grow" />
          <span className="proto-chip">{overlay ? 'Overlay 已载入' : '中性预览'}</span></div>
        <div className="proto-body">
          <div className="proto-c-kv"><span className="proto-c-kv-key">Base</span>
            <span className="proto-c-kv-val">{RESOURCE_STATE.base}</span></div>
          <div className="proto-c-kv"><span className="proto-c-kv-key">Overlay</span>
            <span className="proto-c-kv-val">{overlay ?? '（未设置）'}</span></div>
          <p className="proto-note">资源包决定 Sprite / 字段的真实预览；未载入时使用中性回退（模拟，不读取真实文件）。</p>
          <div className="proto-c-btn-row">
            <button type="button" onClick={() => { setOverlay('社区资源包 v2（模拟）'); setStatus('模拟：选择资源包 → 社区资源包 v2'); }}>选择资源包</button>
            <button type="button" onClick={() => { setOverlay(null); setStatus('模拟：使用默认中性预览'); }}>使用默认</button>
            <button type="button" onClick={() => { setOverlay('客户端 JAR 1.21.1（模拟）'); setStatus('模拟：选择客户端 JAR → 1.21.1'); }}>选择客户端 JAR</button>
          </div>
        </div>
      </section>
      <section className="proto-card proto-c-panel" aria-label="诊断">
        <div className="proto-card-head"><strong>诊断</strong><span className="grow" />
          <span className="proto-chip">{RESOURCE_STATE.diagnostics.length} 条</span></div>
        <div className="proto-body">
          <ul className="proto-c-diag-list">
            {RESOURCE_STATE.diagnostics.map(d => <li className="proto-c-diag-item" key={d}>{d}</li>)}
          </ul>
          <div className="proto-section">
            <h4>Sprite 查询（模拟）</h4>
            <div className="proto-c-query-row">
              <input value={spriteQueryInput} aria-label="sprite 查询输入" placeholder="minecraft:button"
                onChange={e => setSpriteQueryInput(e.target.value)} />
              <button type="button" className="primary"
                onClick={() => setStatus(`模拟：sprite 查询 ${spriteQueryInput} → 中性回退`)}>查询</button>
            </div>
            <div className="proto-c-chips">
              {RESOURCE_STATE.spriteQuery.map(q => (
                <button type="button" className="proto-chip proto-c-query-chip" key={q}
                  onClick={() => { setSpriteQueryInput(q); setStatus(`模拟：sprite 查询 ${q} → 中性回退`); }}>{q}</button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const exportMode = (
    <div className="proto-c-two">
      <section className="proto-card proto-c-panel" aria-label="导出批次">
        <div className="proto-card-head"><strong>导出批次</strong><span className="grow" />
          <span className="proto-chip">同一快照</span></div>
        <div className="proto-body">
          <div className="proto-c-kv"><span className="proto-c-kv-key">批次 ID</span>
            <span className="proto-c-kv-val"><span className="proto-chip">{BATCH_ID}</span></span></div>
          <div className="proto-c-kv"><span className="proto-c-kv-key">快照 SHA</span>
            <span className="proto-c-kv-val"><span className="proto-chip">{batchSha}</span></span></div>
          <div className="proto-c-kv"><span className="proto-c-kv-key">Screen 数</span>
            <span className="proto-c-kv-val">{screens.length}</span></div>
          <p className="proto-note">全部派生物由同一不可变快照生成；重新生成会得到新的 SHA（模拟）。</p>
          <div className="proto-c-btn-row">
            <button type="button" className="primary" onClick={regenerateBatch}>重新生成批次</button>
          </div>
        </div>
      </section>
      <section className="proto-card proto-c-panel" aria-label="派生物">
        <div className="proto-card-head"><strong>派生物</strong><span className="grow" />
          <span className="proto-chip">{EXPORT_ENTRIES.length} 项</span></div>
        <div className="proto-body">
          {EXPORT_ENTRIES.map((entry, i) => (
            <div className="proto-c-export-row" key={`${entry.kind}-${i}`}>
              <span className="proto-chip">{entry.kind}</span>
              <span className="proto-c-export-label">{entry.label}</span>
              <button type="button" onClick={() => setStatus(`模拟：下载 ${entry.label}`)}>下载</button>
            </div>
          ))}
          <p className="proto-note">下载均为模拟动作，不产生真实文件。</p>
        </div>
      </section>
    </div>
  );

  return (
    <div className="proto-app">
      <header className="proto-card proto-topbar">
        <div className="proto-brand"><i>C</i>Minecraft GUI Maker
          <span className="proto-c-mode-tag">Adaptive Workspace</span></div>
        <div className="proto-seg" role="group" aria-label="任务模式">
          {MODES.map(m => (
            <button key={m.id} type="button" aria-pressed={mode === m.id}
              onClick={() => switchMode(m.id)}>{m.label}</button>
          ))}
        </div>
        <span className="proto-spacer" />
        <nav className="proto-menus" aria-label="主菜单">
          {Object.entries(MENU_STRUCTURE).map(([menu, items]) => (
            <details key={menu} open={openMenu === menu}
              onToggle={e => {
                const nowOpen = e.currentTarget.open;
                setOpenMenu(prev => (nowOpen ? menu : prev === menu ? null : prev));
              }}>
              <summary>{menu}</summary>
              <div>
                {items.map(item => (
                  <button key={item} type="button"
                    onClick={() => { setStatus(`模拟：${item}`); setOpenMenu(null); }}>{item}</button>
                ))}
              </div>
            </details>
          ))}
        </nav>
        <ThemeButton theme={theme} toggle={toggle} />
      </header>

      {contextBar}

      {mode === 'design' && (
        <div className="proto-c-work">
          {leftColumn}
          {canvasColumn}
          {inspectorColumn}
        </div>
      )}
      {mode === 'behavior' && (
        <div className="proto-c-work">
          {leftColumn}
          {canvasColumn}
          {ruleDraftColumn}
        </div>
      )}
      {mode === 'resources' && resourcesMode}
      {mode === 'export' && exportMode}

      <footer className="proto-card proto-statusbar">
        <span className="proto-c-status-text" role="status">{status}</span>
        <span className="grow" />
        <span className="proto-chip">{modeLabel}</span>
        <span className="proto-chip">{screen.id}</span>
        <span className="proto-chip">{theme === 'dark' ? '深色' : '浅色'}</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
