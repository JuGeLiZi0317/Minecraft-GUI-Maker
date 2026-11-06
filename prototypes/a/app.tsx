import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  COMPONENT_TYPES, EXPORT_ENTRIES, MENU_STRUCTURE, RESOURCE_STATE, RULES, SCREENS,
  MockCanvas, ThemeButton, useDragWidth, useProtoTheme, type ProtoNode,
} from '../shared';
import '../shared.css';
import './proto-a.css';

type RailKey = 'screens' | 'structure' | 'components' | 'behavior' | null;

function App() {
  const { theme, toggle } = useProtoTheme();
  const [mode, setMode] = useState<'design' | 'behavior'>('design');
  const [screenId, setScreenId] = useState(SCREENS[0].id);
  const [screens, setScreens] = useState(SCREENS);
  const [selected, setSelected] = useState<string | null>(null);
  const [rail, setRail] = useState<RailKey>('structure');
  const [grid, setGrid] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [resourceOpen, setResourceOpen] = useState(false);
  const [status, setStatus] = useState('原型 A · Canvas First · 模拟数据');
  const [draftRule, setDraftRule] = useState<string | null>(null);
  const left = useDragWidth(240, 180, 420, 1);
  const right = useDragWidth(300, 240, 460, -1);

  const screen = screens.find(s => s.id === screenId)!;
  const node = screen.nodes.find(n => n.id === selected) ?? null;
  const rules = RULES[screenId] ?? [];
  const badges = useMemo(() => Object.fromEntries(rules.map(r => [r.source, r.id])), [rules]);
  const related = node ? rules.filter(r => r.source === node.id || r.actions.some(a => a.includes(node.id))) : [];
  const railKey: RailKey = mode === 'behavior' && rail === null ? 'behavior' : rail;

  const addNode = (type: string, label: string) => {
    const id = `${type.split(':')[1]}_${screen.nodes.length + 1}`;
    const node: ProtoNode = { id, type, label, x: 24 + (screen.nodes.length % 4) * 16, y: 24 + (screen.nodes.length % 4) * 14, w: 120, h: 20 };
    setScreens(list => list.map(s => (s.id === screenId ? { ...s, nodes: [...s.nodes, node] } : s)));
    setSelected(id);
    setStatus(`模拟添加：${id}`);
  };
  const patchNode = (patch: Partial<ProtoNode>) => {
    if (!node) return;
    setScreens(list => list.map(s => (s.id === screenId ? { ...s, nodes: s.nodes.map(n => (n.id === node.id ? { ...n, ...patch } : n)) } : s)));
  };
  const menuClick = (entry: string) => setStatus(`模拟：${entry}`);

  return (
    <div className="proto-app">
      <header className="proto-card proto-topbar">
        <span className="proto-brand"><i>▧</i>Minecraft GUI Maker <small style={{ color: 'var(--text-3)', fontSize: 10 }}>Prototype A</small></span>
        <div className="proto-seg" role="group" aria-label="工作模式">
          <button type="button" aria-pressed={mode === 'design'} onClick={() => { setMode('design'); setRail('structure'); }}>GUI 设计</button>
          <button type="button" aria-pressed={mode === 'behavior'} onClick={() => { setMode('behavior'); setRail('behavior'); }}>Behavior</button>
        </div>
        <nav className="proto-tabs" aria-label="Screen 切换">
          {screens.map(s => <button key={s.id} type="button" aria-pressed={s.id === screenId} onClick={() => { setScreenId(s.id); setSelected(null); }}>{s.title} · {s.id}</button>)}
        </nav>
        <span className="proto-spacer" />
        <label className="proto-chip"><input type="checkbox" aria-label="显示网格" checked={grid} onChange={e => setGrid(e.target.checked)} style={{ width: 12, height: 12 }} />网格</label>
        <span className="proto-chip">200%</span>
        <div style={{ position: 'relative' }}>
          <button type="button" aria-expanded={resourceOpen} onClick={() => setResourceOpen(v => !v)}>资源包检查</button>
          {resourceOpen && (
            <div className="proto-popover" role="dialog" aria-label="资源包检查">
              <strong style={{ fontSize: 11 }}>资源 · {RESOURCE_STATE.base}</strong>
              <p className="proto-note">覆盖：{RESOURCE_STATE.overlay ?? '无'}。原型不读取真实资源。</p>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => menuClick('选择已有资源包')}>选择已有资源包</button>
                <button type="button" onClick={() => menuClick('使用默认样式')}>使用默认样式</button>
                <button type="button" onClick={() => menuClick('选择客户端 JAR')}>选择客户端 JAR</button>
              </div>
              <div className="proto-section"><h4>Sprite 诊断</h4>{RESOURCE_STATE.diagnostics.map(d => <p className="proto-note" key={d}>{d}</p>)}</div>
              <div className="proto-section"><h4>Sprite 查询</h4>{RESOURCE_STATE.spriteQuery.map(s => <span className="proto-chip" key={s} style={{ margin: '0 4px 4px 0' }}>{s}</span>)}</div>
            </div>
          )}
        </div>
        <button type="button" className="primary" onClick={() => setExportOpen(true)}>导出</button>
        <nav className="proto-menus" aria-label="原型菜单">
          {Object.entries(MENU_STRUCTURE).map(([name, entries]) => (
            <details key={name}><summary>{name}</summary><div>{entries.map(entry => <button key={entry} type="button" onClick={() => menuClick(entry)}>{entry}</button>)}</div></details>
          ))}
        </nav>
        <ThemeButton theme={theme} toggle={toggle} />
      </header>

      <div className="proto-a-body">
        <div className="proto-a-left">
          <nav className="proto-card proto-rail" aria-label="面板导轨">
            <button type="button" aria-label="Screen 列表" aria-pressed={railKey === 'screens'} title="Screen 列表" onClick={() => setRail(rail === 'screens' ? null : 'screens')}>▤</button>
            <button type="button" aria-label="项目结构" aria-pressed={railKey === 'structure'} title="项目结构" onClick={() => setRail(rail === 'structure' ? null : 'structure')}>⌘</button>
            <button type="button" aria-label="组件目录" aria-pressed={railKey === 'components'} title="组件目录" onClick={() => setRail(rail === 'components' ? null : 'components')}>▥</button>
            <button type="button" aria-label="行为规则" aria-pressed={railKey === 'behavior'} title="行为规则" onClick={() => setRail(rail === 'behavior' ? null : 'behavior')}>⚡</button>
            <span className="proto-a-railnote">CANVAS FIRST</span>
          </nav>
          {railKey && (
            <>
              <section className="proto-card proto-a-panel" style={{ width: left.width }} aria-label={`面板：${railKey}`}>
                <div className="proto-card-head"><strong>{{ screens: 'Screens', structure: '项目结构', components: '组件目录', behavior: '行为规则' }[railKey]}</strong><span className="grow" /><button type="button" aria-label="关闭面板" onClick={() => setRail(null)}>✕</button></div>
                <div className="proto-body">
                  {railKey === 'screens' && <div className="proto-list">{screens.map(s => <button key={s.id} type="button" aria-pressed={s.id === screenId} onClick={() => { setScreenId(s.id); setSelected(null); }}>{s.title}<small>{s.nodes.length}</small></button>)}</div>}
                  {railKey === 'structure' && (
                    <div className="proto-list">
                      {screen.nodes.filter(n => !n.parent).map(n => (
                        <span key={n.id}>
                          <button type="button" aria-pressed={selected === n.id} onClick={() => setSelected(n.id)}>{n.id}<small>{n.label}</small></button>
                          {screen.nodes.filter(c => c.parent === n.id).map(c => <button key={c.id} type="button" className="indent" aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}>{c.id}<small>{c.label}</small></button>)}
                        </span>
                      ))}
                    </div>
                  )}
                  {railKey === 'components' && <div className="proto-list">{COMPONENT_TYPES.map(c => <button key={c.type} type="button" onClick={() => addNode(c.type, c.label)}><span aria-hidden="true">{c.glyph}</span>{c.label}</button>)}</div>}
                  {railKey === 'behavior' && (
                    <div className="proto-list">
                      {rules.length === 0 && <p className="proto-note">当前 Screen 没有 F2 规则。</p>}
                      {rules.map(r => <button key={r.id} type="button" aria-pressed={draftRule === r.id} onClick={() => { setDraftRule(r.id); setSelected(r.source); }}>{r.id}<small>{r.event}</small></button>)}
                    </div>
                  )}
                </div>
              </section>
              <div className="proto-resizer" role="separator" aria-label="调整面板宽度" onPointerDown={left.onStart} />
            </>
          )}
        </div>

        <main className="proto-card proto-a-canvas-card">
          <div className="proto-a-canvas-head">
            <strong style={{ color: 'var(--text-1)', fontSize: 11 }}>{screen.title}</strong>
            <span>320 × 180 GUI px</span>
            <span className="grow" />
            {mode === 'behavior' && <span className="proto-chip">行为模式 · {rules.length} 规则</span>}
            <button type="button" onClick={() => menuClick('新增画布')}>+ Screen</button>
          </div>
          <MockCanvas nodes={screen.nodes} selected={selected} onSelect={setSelected} grid={grid} badges={mode === 'behavior' ? badges : undefined} />
          {exportOpen && (
            <aside className="proto-drawer" role="dialog" aria-label="导出结果">
              <div className="proto-card-head"><strong>导出 · 同一快照派生物</strong><span className="grow" /><button type="button" aria-label="关闭导出" onClick={() => setExportOpen(false)}>✕</button></div>
              <div className="proto-body">
                <span className="proto-chip">批次 EXP-PROTO-001</span> <span className="proto-chip">SHA-256 …模拟</span>
                <div className="proto-list" style={{ marginTop: 8 }}>{EXPORT_ENTRIES.map(e => <button key={e.label} type="button" onClick={() => menuClick(`下载 ${e.label}`)}><span className="proto-chip">{e.kind}</span>{e.label}</button>)}</div>
                <div className="proto-section"><h4>Prompt 摘要</h4><p className="proto-note">只读派生：目标 1.21.1 / NeoForge 21.1.244 / Java 21；权威 JSON 为唯一可重导入来源。</p></div>
              </div>
            </aside>
          )}
        </main>

        <div className="proto-resizer" role="separator" aria-label="调整属性栏宽度" onPointerDown={right.onStart} />
        <aside className={`proto-card proto-a-inspector ${inspectorOpen ? '' : 'collapsed'}`} style={{ width: right.width }} aria-label="Inspector">
          <div className="proto-card-head">
            <strong>Inspector</strong>
            {!inspectorOpen && <span className="grow" />}
            {inspectorOpen && <span className="grow" />}
            <button type="button" aria-label={inspectorOpen ? '折叠属性栏' : '展开属性栏'} aria-pressed={!inspectorOpen} onClick={() => setInspectorOpen(v => !v)}>{inspectorOpen ? '›' : '‹'}</button>
          </div>
          <div className="proto-body">
            {!node && <>
              <div className="proto-field"><span>项目</span><input aria-label="项目名称" defaultValue="Untitled interface" /></div>
              <div className="proto-grid2">
                <label className="proto-field"><span>设计区宽</span><input aria-label="设计区宽" type="number" defaultValue={320} /></label>
                <label className="proto-field"><span>设计区高</span><input aria-label="设计区高" type="number" defaultValue={180} /></label>
              </div>
              <p className="proto-note">未选择组件。在画布或结构面板中选择组件以编辑变换与属性。</p>
            </>}
            {node && <>
              <div className="proto-card-head" style={{ border: 0, padding: 0, minHeight: 0, marginBottom: 6 }}><strong>{node.id}</strong><span className="proto-chip">{node.label}</span></div>
              <div className="proto-grid2">
                {(['x', 'y', 'w', 'h'] as const).map(key => (
                  <label className="proto-field" key={key}><span>{key.toUpperCase()}</span>
                    <input aria-label={`${node.id} ${key}`} type="number" value={node[key]} onChange={e => patchNode({ [key]: Number(e.target.value) } as Partial<ProtoNode>)} /></label>
                ))}
              </div>
              <div className="proto-section"><h4>父容器</h4>
                <label className="proto-field"><select aria-label="父容器" value={node.parent ?? ''} onChange={e => patchNode({ parent: e.target.value || undefined })}>
                  <option value="">Screen 根节点</option>
                  {screen.nodes.filter(n => n.type.includes('panel') && n.id !== node.id).map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
                </select></label>
              </div>
              {mode === 'behavior' && <div className="proto-section"><h4>关联行为</h4>
                {related.length === 0 ? <p className="proto-note">该组件没有已配置的关联规则。</p> : related.map(r => <div className="proto-rule" key={r.id}><strong>{r.id}</strong> · {r.event}<br />{r.actions.join('；')}</div>)}
                <button type="button" style={{ marginTop: 6 }} onClick={() => menuClick(`在 Blockly 定位 ${related[0]?.id ?? ''}`)}>在 Blockly 定位</button>
              </div>}
            </>}
          </div>
        </aside>
      </div>

      <footer className="proto-card proto-statusbar">
        <span role="status">{status}</span><span className="grow" />
        <span>{screen.id} · 320 × 180</span><span>200%</span><span>{RESOURCE_STATE.base}</span><span>Schema 0.38.0（模拟）</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
