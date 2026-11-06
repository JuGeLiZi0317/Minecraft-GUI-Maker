import { useCallback, useEffect, useRef, useState } from 'react';

/** BENTO-5 isolated prototypes: mock data + shared hooks. No production store,
 *  no IndexedDB, no exports. Visual language reuses src/styles/tokens.css. */

export type ProtoNode = { id: string; type: string; label: string; x: number; y: number; w: number; h: number; parent?: string };
export type ProtoScreen = { id: string; title: string; nodes: ProtoNode[] };
export type ProtoRule = { id: string; event: string; source: string; actions: string[] };

export const SCREENS: ProtoScreen[] = [
  {
    id: 'screen_main', title: '主界面',
    nodes: [
      { id: 'panel_1', type: 'minecraft:scrollable-panel', label: 'Scrollable Panel', x: 8, y: 40, w: 150, h: 110 },
      { id: 'button_1', type: 'minecraft:button', label: 'Button', x: 168, y: 44, w: 120, h: 20 },
      { id: 'edit_1', type: 'minecraft:edit-box', label: 'EditBox', x: 168, y: 72, w: 120, h: 20 },
      { id: 'slider_1', type: 'minecraft:slider', label: 'Slider', x: 16, y: 52, w: 130, h: 16, parent: 'panel_1' },
      { id: 'status_1', type: 'minecraft:status-indicator', label: 'Status Indicator', x: 168, y: 100, w: 88, h: 16 },
    ],
  },
  {
    id: 'screen_shop', title: '商店',
    nodes: [
      { id: 'tree_1', type: 'minecraft:tree-view', label: 'Tree View', x: 12, y: 16, w: 140, h: 120 },
      { id: 'button_2', type: 'minecraft:button', label: 'Button', x: 168, y: 120, w: 120, h: 20 },
    ],
  },
  { id: 'screen_settings', title: '设置', nodes: [{ id: 'check_1', type: 'minecraft:checkbox', label: 'Checkbox', x: 24, y: 24, w: 120, h: 20 }] },
];

export const RULES: Record<string, ProtoRule[]> = {
  screen_main: [
    { id: 'rule_1', event: 'button-click', source: 'button_1', actions: ['set-status → status_1', 'open_screen → screen_shop'] },
    { id: 'rule_2', event: 'slider-change', source: 'slider_1', actions: ['set-progress-value → status_1'] },
  ],
  screen_shop: [{ id: 'rule_3', event: 'selection-change', source: 'tree_1', actions: ['set-status → status_1'] }],
  screen_settings: [],
};

export const COMPONENT_TYPES = [
  { type: 'minecraft:scrollable-panel', label: 'Scrollable Panel', glyph: '▥' },
  { type: 'minecraft:collapsible-panel', label: 'Collapsible Panel', glyph: '▱' },
  { type: 'minecraft:tree-view', label: 'Tree View', glyph: '⌘' },
  { type: 'minecraft:image', label: 'Image / Sprite', glyph: '▧' },
  { type: 'minecraft:status-indicator', label: 'Status Indicator', glyph: '●' },
  { type: 'minecraft:progress-bar', label: 'Progress Bar', glyph: '▰' },
  { type: 'minecraft:radio-group', label: 'Radio Group', glyph: '◉' },
  { type: 'minecraft:dropdown', label: 'Dropdown', glyph: '▾' },
  { type: 'minecraft:numeric-input', label: 'Numeric Input', glyph: '#' },
  { type: 'minecraft:slider', label: 'Slider', glyph: '↔' },
  { type: 'minecraft:button', label: 'Button', glyph: '▣' },
  { type: 'minecraft:edit-box', label: 'EditBox', glyph: '⌨' },
  { type: 'minecraft:string-widget', label: 'StringWidget', glyph: 'T' },
  { type: 'minecraft:fill', label: 'Rectangle', glyph: '□' },
  { type: 'minecraft:checkbox', label: 'Checkbox', glyph: '☑' },
  { type: 'minecraft:cycle-button', label: 'CycleButton', glyph: '↻' },
];

export const MENU_STRUCTURE: Record<string, string[]> = {
  文件: ['新的GUI项目', '导入设计 JSON', '下载设计 JSON', '生成 PNG 和单项导出', '打包 ZIP'],
  编辑: ['撤销操作', '重做操作'],
  视图: ['资源包检查', '字体', '左侧自动隐藏', '右侧自动隐藏', '打开 GUI Scale 设置', '切换网格', '智能参考线', '智能吸附', '主题：浅色', '主题：深色', '主题：跟随系统'],
  模式: ['切换行为面板'],
  工具: ['使用选择工具', '使用平移工具', '重置画布视图'],
  帮助: ['滚轮缩放、右键平移。Ctrl+Z 撤销，Ctrl+Shift+Z 重做。设计 JSON 是权威数据。'],
};

export const EXPORT_ENTRIES = [
  { kind: 'PNG', label: '设计区 PNG（逻辑 1×）' },
  { kind: 'PNG', label: '放大参考 PNG（2×）' },
  { kind: 'MD', label: 'Agent 实现规格' },
  { kind: 'MD', label: 'Prompt 摘要' },
  { kind: 'JSON', label: 'export manifest' },
  { kind: 'ZIP', label: '同快照 ZIP 包' },
];

export const RESOURCE_STATE = {
  base: '中性预览（未载入客户端资源）',
  overlay: null as string | null,
  diagnostics: ['button sprite：未载入资源包，使用中性回退', 'slider sprite：未载入资源包，使用中性回退'],
  spriteQuery: ['minecraft:button', 'minecraft:slider', 'minecraft:checkbox', 'minecraft:cycle_button'],
};

export function useProtoTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggle = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, setTheme, toggle };
}

/** Pointer-based width dragging for prototype sidebars (mirrors production interaction shape). */
export function useDragWidth(initial: number, min: number, max: number, direction: 1 | -1 = 1) {
  const [width, setWidth] = useState(initial);
  const state = useRef<{ x: number; w: number } | null>(null);
  const onStart = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    state.current = { x: e.clientX, w: width };
    const move = (ev: PointerEvent) => {
      if (!state.current) return;
      const next = state.current.w + direction * (ev.clientX - state.current.x);
      setWidth(Math.max(min, Math.min(max, Math.round(next))));
    };
    const up = () => { state.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [width, min, max, direction]);
  return { width, setWidth, onStart };
}

export function ThemeButton({ theme, toggle }: { theme: 'dark' | 'light'; toggle: () => void }) {
  return <button type="button" aria-label="切换主题" title={`当前：${theme === 'dark' ? '深色' : '浅色'}`} onClick={toggle}>{theme === 'dark' ? '☾' : '☀'}</button>;
}

/** Mock canvas: design surface with node rectangles; click selects. */
export function MockCanvas({ nodes, selected, onSelect, grid, badges, onGesture }: {
  nodes: ProtoNode[]; selected: string | null; onSelect: (id: string | null) => void; grid: boolean; badges?: Record<string, string>; onGesture?: () => void;
}) {
  return <div className={`proto-canvas ${grid ? 'grid-on' : ''}`} role="application" aria-label="原型画布" onPointerDown={e => { if (e.target === e.currentTarget) onSelect(null); }}>
    <div className="proto-design">
      {nodes.map(node => (
        <button key={node.id} type="button" className={`proto-node ${selected === node.id ? 'selected' : ''}`} aria-label={`选择 ${node.id}`} aria-pressed={selected === node.id}
          style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
          onPointerDown={() => onGesture?.()} onClick={() => onSelect(node.id)}>
          <span>{node.id}</span>
          {badges?.[node.id] && <i className="proto-badge" title={badges[node.id]}>F2</i>}
        </button>
      ))}
    </div>
  </div>;
}
