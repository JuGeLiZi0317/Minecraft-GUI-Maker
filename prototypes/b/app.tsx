/* Prototype B · Modular Bento —— 隔离交互原型（设计探索，非正式应用）。
 * 信息架构策略：所有功能模块以常驻卡片组织，关系显式、密度高。
 * 只用 ../shared 的模拟数据；不连接真实 store / IndexedDB / 导出。 */
import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
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
} from '../shared';
import type { ProtoNode, ProtoScreen } from '../shared';
import '../shared.css';
import './proto-b.css';

type Mode = 'design' | 'behavior';
type CardId = 'tree' | 'catalog' | 'canvas' | 'inspector' | 'behavior';

const DESIGN_W = 320;
const DESIGN_H = 180;

const EVENT_OPTIONS = ['button-click', 'selection-change', 'slider-change', 'value-change'];
const ACTION_OPTIONS = ['set-status', 'open-screen', 'set-progress-value', 'set-text'];

/** 每张 Bento 卡的骨架：卡头（折叠 chevron + 标题 + 附加区）+ 可折叠卡体。 */
function BentoCard({ title, collapsed, onToggle, headExtra, bodyClass, children }: {
  title: string; collapsed: boolean; onToggle: () => void; headExtra?: ReactNode; bodyClass?: string; children: ReactNode;
}) {
  return (
    <section className={`proto-card proto-b-card${collapsed ? ' proto-b-collapsed' : ''}`} aria-label={`${title} 卡片`}>
      <header className="proto-card-head">
        <button type="button" className="proto-b-chev" aria-pressed={!collapsed}
          aria-label={`${collapsed ? '展开' : '折叠'} ${title} 卡片`} onClick={onToggle}>
          {collapsed ? '▸' : '▾'}
        </button>
        <strong>{title}</strong>
        <span className="grow" />
        {headExtra}
      </header>
      {!collapsed && <div className={`proto-body${bodyClass ? ` ${bodyClass}` : ''}`}>{children}</div>}
    </section>
  );
}

/** Inspector 类型专属节：按节点类型给出模拟属性字段（不回写权威数据）。 */
function TypeSpecificFields({ node }: { node: ProtoNode }) {
  const text = (
    <label className="proto-field"><span>文本（模拟）</span><input type="text" defaultValue={node.label} /></label>
  );
  let body: ReactNode = <div className="proto-note">该类型暂无专属属性（模拟）。</div>;
  if (node.type === 'minecraft:button' || node.type === 'minecraft:edit-box' || node.type === 'minecraft:string-widget') {
    body = text;
  } else if (node.type === 'minecraft:slider' || node.type === 'minecraft:progress-bar') {
    body = (
      <div className="proto-grid2">
        <label className="proto-field"><span>最小值（模拟）</span><input type="number" defaultValue={0} /></label>
        <label className="proto-field"><span>最大值（模拟）</span><input type="number" defaultValue={100} /></label>
      </div>
    );
  } else if (node.type === 'minecraft:checkbox') {
    body = (
      <label className="proto-field"><span>选中态（模拟）</span>
        <select defaultValue="false"><option value="false">false</option><option value="true">true</option></select>
      </label>
    );
  } else if (node.type === 'minecraft:tree-view') {
    body = <label className="proto-field"><span>树项数量（模拟）</span><input type="number" defaultValue={5} /></label>;
  }
  return <div className="proto-section"><h4>{node.type}</h4>{body}</div>;
}

function PrototypeB() {
  const { theme, setTheme, toggle } = useProtoTheme();
  const [screens, setScreens] = useState<ProtoScreen[]>(() =>
    SCREENS.map(s => ({ ...s, nodes: s.nodes.map(n => ({ ...n })) })));
  const [activeScreenId, setActiveScreenId] = useState<string>(SCREENS[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('design');
  const [gridOn, setGridOn] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<CardId, boolean>>(
    { tree: false, catalog: false, canvas: false, inspector: false, behavior: false });
  const [status, setStatus] = useState('就绪 · 原型 B（模拟数据，不写权威 JSON）');
  const [exportOpen, setExportOpen] = useState(false);
  const [resourceOpen, setResourceOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ w: DESIGN_W, h: DESIGN_H });
  const [draft, setDraft] = useState({ event: EVENT_OPTIONS[0], source: '', action: ACTION_OPTIONS[0] });
  const left = useDragWidth(268, 180, 420, 1);
  const right = useDragWidth(312, 240, 460, -1);

  const activeScreen = screens.find(s => s.id === activeScreenId) ?? screens[0];
  const selectedNode = activeScreen.nodes.find(n => n.id === selectedId) ?? null;
  const rules = RULES[activeScreenId] ?? [];
  const behaviorMode = mode === 'behavior';

  const badges = useMemo(() => {
    if (!behaviorMode) return undefined;
    const b: Record<string, string> = {};
    for (const r of rules) b[r.source] = r.event;
    return b;
  }, [behaviorMode, activeScreenId]);

  /** 结构树顺序：根节点 → 其子节点（缩进）→ 兜底孤儿节点。 */
  const orderedNodes = useMemo(() => {
    const out: ProtoNode[] = [];
    const roots = activeScreen.nodes.filter(n => !n.parent);
    for (const r of roots) {
      out.push(r);
      for (const c of activeScreen.nodes.filter(n => n.parent === r.id)) out.push(c);
    }
    const seen = new Set(out.map(n => n.id));
    for (const n of activeScreen.nodes) if (!seen.has(n.id)) out.push(n);
    return out;
  }, [activeScreen]);

  const toggleCard = (id: CardId) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  const patchNode = (id: string, patch: Partial<ProtoNode>) => {
    setScreens(prev => prev.map(s => s.id !== activeScreenId ? s
      : { ...s, nodes: s.nodes.map(n => n.id !== id ? n : { ...n, ...patch }) }));
  };

  const handleSelect = (id: string | null) => {
    setSelectedId(id);
    setStatus(id ? `选中 ${id}（${activeScreen.title}）` : '已取消选中');
  };

  const switchScreen = (id: string) => {
    const target = screens.find(s => s.id === id);
    setActiveScreenId(id);
    setSelectedId(null);
    setStatus(`切换到屏：${target?.title ?? id}（模拟）`);
  };

  const addComponent = (t: { type: string; label: string; glyph: string }) => {
    const base = t.type.split(':')[1] ?? 'node';
    const id = `${base}_new${addedCount + 1}`;
    const node: ProtoNode = {
      id, type: t.type, label: t.label,
      x: 16 + ((addedCount * 14) % 176), y: 16 + ((addedCount * 11) % 140), w: 96, h: 18,
    };
    setScreens(prev => prev.map(s => s.id !== activeScreenId ? s : { ...s, nodes: [...s.nodes, node] }));
    setAddedCount(c => c + 1);
    setSelectedId(id);
    setStatus(`模拟：添加组件 ${t.label} → ${activeScreen.title}（${id}）`);
  };

  const runMenuItem = (item: string) => {
    setOpenMenu(null);
    if (item === '切换网格') setGridOn(g => !g);
    else if (item === '主题：浅色') setTheme('light');
    else if (item === '主题：深色') setTheme('dark');
    else if (item === '切换行为面板') setMode(m => (m === 'design' ? 'behavior' : 'design'));
    else if (item === '资源包检查') setResourceOpen(true);
    setStatus(`模拟：${item}`);
  };

  const numField = (label: string, key: 'x' | 'y' | 'w' | 'h', value: number) => (
    <label className="proto-field">
      <span>{label}</span>
      <input type="number" value={value} disabled={behaviorMode}
        onChange={e => {
          const v = Number(e.target.value);
          if (selectedNode && Number.isFinite(v)) {
            const patch: Partial<ProtoNode> = {};
            patch[key] = Math.round(v);
            patchNode(selectedNode.id, patch);
            setStatus(`${selectedNode.id}.${key} = ${Math.round(v)}（模拟写入，已同步画布）`);
          }
        }} />
    </label>
  );

  const canvasCard = (
    <BentoCard title="画布" collapsed={collapsed.canvas} onToggle={() => toggleCard('canvas')} bodyClass="proto-b-canvas-body"
      headExtra={<>
        <span className="proto-chip">{activeScreen.title}</span>
        {behaviorMode && <span className="proto-chip proto-b-chip-mode">行为模式</span>}
        <span className="grow" />
        <span className="proto-chip" title="缩放（模拟，固定 2×）">缩放 200%</span>
        <button type="button" aria-pressed={gridOn} aria-label="切换网格"
          onClick={() => { setGridOn(g => !g); setStatus(`模拟：网格${gridOn ? '关' : '开'}`); }}>
          网格
        </button>
      </>}>
      <MockCanvas nodes={activeScreen.nodes} selected={selectedId} onSelect={handleSelect} grid={gridOn} badges={badges} />
    </BentoCard>
  );

  return (
    <div className="proto-app proto-b-app">
      {/* ① header 卡片：品牌 + 模式分段 + 全菜单 + 主题 + 导出/资源 */}
      <header className="proto-card proto-b-header">
        <div className="proto-topbar">
          <div className="proto-brand"><i>B</i>Minecraft GUI Maker<span className="proto-b-sub">Prototype B · Modular Bento</span></div>
          <div className="proto-seg" role="group" aria-label="工作模式">
            <button type="button" aria-pressed={!behaviorMode} onClick={() => setMode('design')}>GUI 设计</button>
            <button type="button" aria-pressed={behaviorMode} onClick={() => setMode('behavior')}>Blockly 行为</button>
          </div>
          <nav className="proto-menus" aria-label="主菜单">
            {Object.entries(MENU_STRUCTURE).map(([menu, items]) => (
              <details key={menu} open={openMenu === menu}>
                <summary onClick={e => { e.preventDefault(); setOpenMenu(cur => (cur === menu ? null : menu)); }}>{menu}</summary>
                <div>
                  {items.map(item => (
                    <button key={item} type="button" onClick={() => runMenuItem(item)}>{item}</button>
                  ))}
                </div>
              </details>
            ))}
          </nav>
          <span className="proto-spacer" />
          <ThemeButton theme={theme} toggle={toggle} />
          <div className="proto-b-pop-anchor">
            <button type="button" aria-pressed={resourceOpen} aria-label="资源状态"
              onClick={() => { setResourceOpen(o => !o); setExportOpen(false); }}>资源</button>
            {resourceOpen && (
              <div className="proto-popover" role="dialog" aria-label="资源状态（模拟）">
                <div className="proto-card-head proto-b-pop-head">
                  <strong>资源状态</strong><span className="grow" />
                  <button type="button" aria-label="关闭资源弹层" onClick={() => setResourceOpen(false)}>✕</button>
                </div>
                <div className="proto-section"><h4>Base</h4><div className="proto-note">{RESOURCE_STATE.base}</div></div>
                <div className="proto-section"><h4>Overlay</h4>
                  <div className="proto-note">{RESOURCE_STATE.overlay ?? '无覆盖资源包（null）'}</div></div>
                <div className="proto-section"><h4>诊断（{RESOURCE_STATE.diagnostics.length}）</h4>
                  {RESOURCE_STATE.diagnostics.map(d => <div className="proto-note" key={d}>· {d}</div>)}</div>
                <div className="proto-section"><h4>Sprite 查询</h4>
                  <div className="proto-b-chips">
                    {RESOURCE_STATE.spriteQuery.map(q => <span className="proto-chip" key={q}>{q}</span>)}
                  </div></div>
              </div>
            )}
          </div>
          <button type="button" className="primary" aria-pressed={exportOpen}
            onClick={() => { setExportOpen(o => !o); setResourceOpen(false); }}>导出</button>
        </div>
      </header>

      {/* 主区：CSS Grid 三列卡片，左右列可拖宽 */}
      <main className="proto-b-main" style={{
        '--proto-b-left': `${left.width}px`,
        '--proto-b-right': `${right.width}px`,
      } as CSSProperties}>
        {/* 左列：② Screens+结构树卡 / ③ 组件目录卡 */}
        <div className="proto-b-stack">
          <BentoCard title="Screens · 结构树" collapsed={collapsed.tree} onToggle={() => toggleCard('tree')}
            headExtra={<span className="proto-chip">{activeScreen.nodes.length} 节点</span>}>
            <div className="proto-tabs proto-b-tabs" role="tablist" aria-label="屏切换">
              {screens.map(s => (
                <button key={s.id} type="button" role="tab" aria-pressed={s.id === activeScreenId}
                  onClick={() => switchScreen(s.id)}>{s.title}</button>
              ))}
            </div>
            <button type="button" style={{ marginTop: 6 }} onClick={() => {
              const id = `screen_${screens.length + 1}`;
              setScreens(prev => [...prev, { id, title: `新屏 ${prev.length + 1}`, nodes: [] }]);
              switchScreen(id);
              setStatus(`模拟：新增画布 ${id}`);
            }}>+ Screen（模拟）</button>
            <div className="proto-list proto-b-tree">
              {orderedNodes.map(n => (
                <button key={n.id} type="button" className={n.parent ? 'indent' : undefined}
                  aria-pressed={n.id === selectedId} onClick={() => handleSelect(n.id)}>
                  {behaviorMode && badges?.[n.id] && <span className="proto-b-glyph" title="有行为规则">F2</span>}
                  <span>{n.label}</span><small>{n.id}</small>
                </button>
              ))}
            </div>
          </BentoCard>

          <BentoCard title="组件目录" collapsed={collapsed.catalog} onToggle={() => toggleCard('catalog')}
            headExtra={<span className="proto-chip">{COMPONENT_TYPES.length} 种</span>}>
            <div className="proto-note">点击组件模拟添加到当前屏（mock 坐标）。</div>
            <div className="proto-list">
              {COMPONENT_TYPES.map(t => (
                <button key={t.type} type="button" onClick={() => addComponent(t)}>
                  <span className="proto-b-glyph">{t.glyph}</span><span>{t.label}</span><small>{t.type}</small>
                </button>
              ))}
            </div>
          </BentoCard>
        </div>

        <div className="proto-resizer proto-b-resizer" role="separator" aria-orientation="vertical"
          aria-label="左列宽度" title="拖动调整左列宽度" onPointerDown={left.onStart} />

        {/* 中列：画布大卡 */}
        {canvasCard}

        <div className="proto-resizer proto-b-resizer" role="separator" aria-orientation="vertical"
          aria-label="右列宽度" title="拖动调整右列宽度" onPointerDown={right.onStart} />

        {/* 右列：④ Inspector 卡 / ⑤ Behavior 卡 */}
        <div className="proto-b-stack">
          <BentoCard title="Inspector" collapsed={collapsed.inspector} onToggle={() => toggleCard('inspector')}
            headExtra={<span className="proto-chip">{selectedNode ? selectedNode.id : '文档'}</span>}>
            {behaviorMode && (
              <div className="proto-note proto-b-readonly">行为模式：Inspector 只读（模拟）。回到 GUI 设计模式后可编辑变换字段——Inspector 与 Behavior 卡分别负责结构与行为。</div>
            )}
            {!selectedNode ? (
              <>
                <div className="proto-note">
                  文档摘要：{screens.length} 屏 · 当前屏「{activeScreen.title}」（{activeScreenId}）· {activeScreen.nodes.length} 节点 · 规则 {rules.length} 条
                </div>
                <div className="proto-section"><h4>画布尺寸（模拟）</h4>
                  <div className="proto-grid2">
                    <label className="proto-field"><span>宽</span>
                      <input type="number" value={canvasSize.w}
                        onChange={e => setCanvasSize(s => ({ ...s, w: Number(e.target.value) || s.w }))} /></label>
                    <label className="proto-field"><span>高</span>
                      <input type="number" value={canvasSize.h}
                        onChange={e => setCanvasSize(s => ({ ...s, h: Number(e.target.value) || s.h }))} /></label>
                  </div>
                  <div className="proto-note">画布尺寸为模拟字段，不影响画布渲染（固定 320×180 @2×）。</div>
                </div>
              </>
            ) : (
              <>
                <div className="proto-section" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}><h4>变换</h4>
                  <div className="proto-grid2">
                    {numField('X', 'x', selectedNode.x)}
                    {numField('Y', 'y', selectedNode.y)}
                    {numField('W', 'w', selectedNode.w)}
                    {numField('H', 'h', selectedNode.h)}
                  </div>
                </div>
                <TypeSpecificFields node={selectedNode} />
                <div className="proto-section"><h4>父容器</h4>
                  <div className="proto-note">
                    {selectedNode.parent ? `parent：${selectedNode.parent}（子节点，坐标相对父容器）` : '无（屏幕顶层节点）'}
                  </div>
                </div>
              </>
            )}
          </BentoCard>

          <BentoCard title="Behavior" collapsed={collapsed.behavior} onToggle={() => toggleCard('behavior')}
            headExtra={<>
              <span className="proto-chip">{rules.length} 规则</span>
              {behaviorMode && <span className="proto-chip proto-b-chip-mode">草稿编辑</span>}
            </>}>
            {behaviorMode && (
              <div className="proto-section" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
                <h4>行为草稿（模拟 Blockly）</h4>
                <div className="proto-grid2">
                  <label className="proto-field"><span>事件</span>
                    <select value={draft.event} onChange={e => setDraft(d => ({ ...d, event: e.target.value }))}>
                      {EVENT_OPTIONS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                    </select></label>
                  <label className="proto-field"><span>来源节点</span>
                    <select value={draft.source} onChange={e => setDraft(d => ({ ...d, source: e.target.value }))}>
                      <option value="">（选择节点）</option>
                      {activeScreen.nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
                    </select></label>
                  <label className="proto-field"><span>动作</span>
                    <select value={draft.action} onChange={e => setDraft(d => ({ ...d, action: e.target.value }))}>
                      {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select></label>
                </div>
                <button type="button" className="primary"
                  onClick={() => setStatus(draft.source
                    ? `模拟：保存行为草稿 ${draft.event} ← ${draft.source} → ${draft.action}（未写权威 JSON）`
                    : '模拟：草稿缺少来源节点，未保存')}>
                  保存草稿（模拟）
                </button>
              </div>
            )}
            {rules.length === 0 && <div className="proto-note">当前屏暂无行为规则。</div>}
            {rules.map(r => {
              const linked = r.source === selectedId;
              return (
                <div key={r.id} className={`proto-rule${linked ? ' proto-b-rule-linked' : ''}`}>
                  <strong>{r.id}</strong> · {r.event} ← {r.source}
                  {linked && <span className="proto-chip proto-b-chip-linked">关联选中</span>}
                  <div>{r.actions.join('；')}</div>
                  <button type="button"
                    onClick={() => setStatus(`模拟：在 Blockly 定位 ${r.id}（source：${r.source}）`)}>
                    在 Blockly 定位
                  </button>
                </div>
              );
            })}
            <div className="proto-note">高亮规则 = 与当前选中节点关联；F2 角标（行为模式）= 规则来源节点。</div>
          </BentoCard>
        </div>

        {/* 导出抽屉（右侧抽屉卡，限定在主工作区内，不遮挡 header） */}
        {exportOpen && (
          <aside className="proto-drawer proto-b-drawer" role="dialog" aria-label="导出（模拟）">
            <div className="proto-card-head">
              <strong>导出（模拟）</strong><span className="grow" />
              <span className="proto-chip">同快照批次 #B-042</span>
              <button type="button" aria-label="关闭导出抽屉" onClick={() => setExportOpen(false)}>✕</button>
            </div>
            <div className="proto-body">
              <div className="proto-list">
                {EXPORT_ENTRIES.map(e => (
                  <button key={e.label} type="button"
                    onClick={() => setStatus(`模拟：导出 ${e.kind} · ${e.label}（批次 #B-042）`)}>
                    <span className="proto-chip">{e.kind}</span><span>{e.label}</span>
                  </button>
                ))}
              </div>
              <div className="proto-note">原型 B 中导出仅为模拟入口，不生成任何文件。</div>
            </div>
          </aside>
        )}
      </main>

      {/* 底部状态栏 */}
      <footer className="proto-statusbar">
        <span>{activeScreen.title} · {canvasSize.w}×{canvasSize.h}</span>
        <span>缩放 200%</span>
        <span>资源：{RESOURCE_STATE.overlay ? '已载入覆盖' : '中性预览'}</span>
        <span>Schema 0.38.0（模拟）</span>
        <span className="grow" />
        <span className="proto-b-status-msg" role="status">{status}</span>
      </footer>
    </div>
  );
}

const container = document.getElementById('root');
if (container) createRoot(container).render(<PrototypeB />);
