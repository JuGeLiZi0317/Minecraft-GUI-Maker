import { CATALOG, CATALOG_VERSION, TARGET, type NodeType } from './catalog';
import { PROJECT_SCHEMA_VERSIONS, type Bounds, type GuiNode, type GuiProject, type TextSpec } from './schema';
import { PANEL_MIN_SIZE } from './panel';
import { supportsTooltip } from './tooltip';

export const literal = (value: string): TextSpec => ({ kind: 'literal', value });
export const displayText = (text: TextSpec): string => text.kind === 'literal' ? text.value : text.fallback;
/** Edit transactions only; strict imports never normalize or repair user data. */
export function editNode(before: GuiNode, change: (node: GuiNode) => GuiNode): GuiNode {
  const previous = structuredClone(before), next = change(before);
  if (previous.type === 'minecraft:multi-line-text-widget' && next.type === previous.type) {
    if (next.props.maxWidth !== previous.props.maxWidth || next.props.maxRows !== previous.props.maxRows) {
      next.bounds = { ...next.bounds, w: next.props.maxWidth, h: next.props.maxRows * 9 };
    } else next.props = { ...next.props, maxWidth: next.bounds.w, maxRows: next.bounds.h / 9 };
  }
  return next;
}
export function emptyProject(): GuiProject {
  return {
    format: 'minecraft-gui-maker', schemaVersion: '0.1.0', catalogVersion: CATALOG_VERSION,
    target: structuredClone(TARGET), project: { id: 'project_main', name: 'Untitled interface', revision: 0 },
    screens: [{ id: 'screen_main', title: literal('Untitled screen'), base: 'screen',
      designSize: { width: 320, height: 180, unit: 'gui-px' }, placement: 'center', background: { kind: 'none' },
      nodes: [], variables: [], behaviors: [] }], assets: [],
  };
}
/** Repairs stale in-memory Panel geometry before a workspace-changing operation. Strict JSON parsing remains unchanged. */
export function repairInvalidPanelBounds(project: GuiProject): GuiProject {
  let repaired: GuiProject | undefined;
  for (let index = 0; index < project.screens.length; index++) {
    const screen = project.screens[index];
    if (screen.background.kind !== 'panel' || !screen.background.bounds) continue;
    const bounds = screen.background.bounds;
    if ([bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isInteger) && bounds.x >= 0 && bounds.y >= 0 && bounds.w >= PANEL_MIN_SIZE && bounds.h >= PANEL_MIN_SIZE && bounds.x + bounds.w <= screen.designSize.width && bounds.y + bounds.h <= screen.designSize.height) continue;
    repaired ??= structuredClone(project);
    const target = repaired.screens[index];
    if (target.background.kind === 'panel') target.background.bounds = { x: 0, y: 0, w: target.designSize.width, h: target.designSize.height };
  }
  return repaired ?? project;
}
export function createNode(type: NodeType, id: string, position = { x: 16, y: 16 }): GuiNode {
  const bounds = { ...position, ...CATALOG[type].size };
  const visible = { visible: true };
  switch (type) {
    case 'native_region': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { visible: true }, props: { kind: 'minecraft:player_inventory' }, events: {} };
    case 'minecraft:single_slot': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { visible: true }, props: { usage: 'inventory' }, events: {} };
    case 'minecraft:scrollable-panel': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { padding: 4, contentHeight: 180, initialScroll: 'top', backgroundColor: '#B020252D', borderColor: '#FF8795A5' }, events: {} };
    case 'minecraft:collapsible-panel': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { title: literal('Collapsible Panel'), headerHeight: 20, initialExpanded: true, headerColor: '#FF303D4B', backgroundColor: '#B020252D', textColor: '#FFFFFFFF', border: true, borderColor: '#FF8795A5' }, events: {} };
    case 'minecraft:repeatable-list': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: {
      rowHeight: 34, rowGap: 0, padding: 4, templateId: `template_${id}`.slice(0, 64),
      dataSource: { mode: 'external', bindingKey: 'external.items' }, initialScroll: 'top',
      backgroundColor: '#B020252D', borderColor: '#FF8795A5',
    }, events: {} };
    case 'minecraft:tree-view': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: {
      name: literal('Tree View'),
      items: [
        { id: 'item_root', label: literal('Root'), parentId: null, order: 0, selectable: false, disabled: false },
        { id: 'item_branch', label: literal('Branch'), parentId: 'item_root', order: 0, selectable: true, disabled: false },
        { id: 'item_leaf_a', label: literal('Leaf A'), parentId: 'item_branch', order: 0, selectable: true, disabled: false },
        { id: 'item_leaf_b', label: literal('Leaf B'), parentId: 'item_branch', order: 1, selectable: true, disabled: false },
        { id: 'item_other', label: literal('Other'), parentId: null, order: 1, selectable: true, disabled: false },
      ], initialExpandedIds: ['item_root', 'item_branch'], initialSelectedItemId: 'item_leaf_a',
    }, events: { change: 'tree-selection-change' } };
    case 'minecraft:status-indicator': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { name: literal('状态'), statuses: [{ statusId: 'status_running', label: literal('运行'), color: '#FF54B56A', text: literal('运行') }, { statusId: 'status_stopped', label: literal('停止'), color: '#FF808080', text: literal('停止') }, { statusId: 'status_warning', label: literal('警告'), color: '#FFFFB347', text: literal('警告') }], initialStatusId: 'status_stopped', shape: 'circle', showLabel: true, color: '#FFFFFFFF', textShadow: false }, events: { change: 'status-change' } };
    case 'minecraft:image': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { kind: 'texture', resourceId: 'minecraft:textures/gui/container/dispenser.png', textureWidth: 256, textureHeight: 256, uv: { x: 0, y: 0, width: 256, height: 256 } }, events: {} };
    case 'minecraft:fitting-multi-line-text-widget': return { id, type, bounds: { ...position, ...CATALOG[type].size }, source: { ...CATALOG[type].source }, state: visible, props: { text: literal('只读滚动文本区域\nRead only scrollable text'), color: '#FFE0E0E0', initialScroll: 'top', textShadow: true }, events: {} };
    case 'minecraft:progress-bar': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { min: 0, max: 100, initialValue: 50, direction: 'left-to-right', backgroundColor: '#FF202020', foregroundColor: '#FF55AA55', border: true, borderColor: '#FF404040', borderThickness: 1, display: 'percentage', color: '#FFFFFFFF', textShadow: false }, events: {} };
    case 'minecraft:radio-group':
    case 'minecraft:dropdown': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { name: literal('Choice'), color: '#FF404040', textShadow: false, options: [{ id: 'option_1', label: literal('One'), disabled: false }, { id: 'option_2', label: literal('Two'), disabled: false }, { id: 'option_3', label: literal('Three'), disabled: false }], initialSelectedOptionId: 'option_1', ...(type === 'minecraft:radio-group' ? { orientation: 'vertical' as const } : { visibleRows: 5 }) }, events: { change: 'selection-change' } } as GuiNode;
    case 'minecraft:numeric-input': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { color: '#FF404040', name: literal('Number'), min: 0, max: 100, step: 1, initialValue: 0, numericType: 'integer', format: { decimals: 0, unit: '' }, textShadow: false, bordered: true, editable: true, commitPolicy: 'enter-or-blur', errorMessage: '数值无效' }, events: { commit: 'numeric-commit' } };
    case 'minecraft:slider': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { color: '#FF404040', name: literal('Value'), min: 0, max: 100, step: 1, initialValue: 50, numericType: 'integer', format: { decimals: 0, unit: '' }, textShadow: false, showValue: true }, events: { change: 'slider-change' } };
    case 'minecraft:multi-line-text-widget': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { text: literal('Multi-line text\n说明文字'), color: '#FF404040', maxWidth: 150, maxRows: 4, align: 'center', textShadow: false }, events: {} };
    case 'minecraft:creative-tab': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { name: 'CreativeTab', column: 1, selected: false }, events: {} };
    case 'minecraft:button': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { message: literal('Button') }, events: {} };
    case 'minecraft:edit-box': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { color: '#FF404040', narration: literal('Input'), value: '', hint: literal('Enter text…'), maxLength: 32, bordered: true, editable: true }, events: {} };
    case 'minecraft:string-widget': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { text: literal('Text label'), color: '#FF404040', align: 'center' }, events: {} };
    case 'minecraft:fill': return { id, type, bounds, source: { ...CATALOG[type].source }, state: visible, props: { color: '#FF48546B' }, events: {} };
    case 'minecraft:checkbox': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { color: '#FF404040', message: literal('Checkbox'), selected: false, maxWidth: 120 }, events: {} };
    case 'minecraft:cycle-button': return { id, type, bounds, source: { ...CATALOG[type].source }, state: { ...visible, enabled: true }, props: { name: literal('Option'), options: [{ id: 'option_1', text: literal('One') }, { id: 'option_2', text: literal('Two') }], initialOptionId: 'option_1', displayFormat: 'name-and-value' }, events: {} };
  }
}
export function constrainBounds(bounds: Bounds, type: NodeType, screen: { width: number; height: number }): Bounds {
  const min = CATALOG[type].min;
  const w = type === 'native_region' ? 162 : type === 'minecraft:single_slot' ? 18 : type === 'minecraft:creative-tab' ? 26 : Math.max(min.w, Math.min(screen.width, type === 'minecraft:multi-line-text-widget' ? 8192 : Infinity, Math.round(bounds.w)));
  const rawHeight = Math.max(min.h, Math.min(screen.height, Math.round(bounds.h)));
  const h = type === 'native_region' ? 76 : type === 'minecraft:single_slot' ? 18 : type === 'minecraft:creative-tab' ? 32 : type === 'minecraft:multi-line-text-widget' ? Math.min(256, Math.max(1, Math.floor(rawHeight / 9))) * 9 : rawHeight;
  return { x: Math.max(0, Math.min(screen.width - w, Math.round(bounds.x))),
    y: Math.max(0, Math.min(screen.height - h, Math.round(bounds.y))), w, h };
}

/** Explicit Button/CycleButton color-mode choice is a 0.52.0 capability; absence preserves legacy rendering. */
/** Implementation notes are optional 0.53.0 design intent; absence never injects a field. */
/** Plain Rectangle per-edge borders are an explicit 0.54.0 capability. */
export function upgradeFillEdgeEdit(doc: GuiProject) {
  const hasEdges = doc.screens.some(screen => screen.nodes.some(node => node.type === 'minecraft:fill' &&
    ['edgeTopColor', 'edgeRightColor', 'edgeBottomColor', 'edgeLeftColor', 'edgeTopWidth', 'edgeRightWidth', 'edgeBottomWidth', 'edgeLeftWidth'].some(key => key in node.props)));
  if (!hasEdges) return;
  if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.54.0')) doc.schemaVersion = '0.54.0';
  doc.entryScreenId ??= doc.screens[0].id;
  doc.screenTabGroups ??= [];
}

export function upgradeImplementationNotesEdit(doc: GuiProject) {
  if (!doc.screens.some(screen => screen.implementationNotes !== undefined || screen.nodes.some(node => node.implementationNotes !== undefined))) return;
  if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.53.0')) doc.schemaVersion = '0.53.0';
  doc.entryScreenId ??= doc.screens[0].id;
  doc.screenTabGroups ??= [];
}

export function upgradeColorModeEdit(doc: GuiProject) {
  const hasMode = doc.screens.some(screen => screen.nodes.some(node =>
    (node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button') && node.props.colorMode !== undefined));
  if (!hasMode) return;
  if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.52.0')) doc.schemaVersion = '0.52.0';
  doc.entryScreenId ??= doc.screens[0].id;
  doc.screenTabGroups ??= [];
}

export function upgradeTextStyleEdit(doc: GuiProject) {
  if (doc.runtimePolicy || doc.screens.some(s => s.nodes.some(n => n.type !== 'minecraft:creative-tab' && n.type !== 'minecraft:fill' && n.type !== 'minecraft:image' && n.type !== 'minecraft:scrollable-panel' && n.type !== 'minecraft:collapsible-panel' && ((n.type !== 'minecraft:string-widget' && n.type !== 'minecraft:multi-line-text-widget' && 'color' in n.props && n.props.color !== undefined) || ((n.type === 'minecraft:multi-line-text-widget' || n.type === 'minecraft:slider') && !n.props.textShadow))))) {
    if (!['0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0', '0.27.0', '0.28.0', '0.29.0', '0.30.0', '0.31.0', '0.32.0', '0.33.0', '0.34.0', '0.35.0', '0.36.0', '0.37.0', '0.38.0', '0.39.0', '0.40.0', '0.41.0', '0.42.0', '0.43.0', '0.44.0', '0.45.0', '0.46.0', '0.47.0', '0.48.0', '0.49.0', '0.50.0', '0.51.0', '0.52.0', '0.53.0', '0.54.0', '0.55.0', '0.56.0', '0.57.0'].includes(doc.schemaVersion)) doc.schemaVersion = '0.17.0'; doc.entryScreenId ??= doc.screens[0].id; doc.screenTabGroups ??= [];
  }
}

/** Editor naming metadata; never used as runtime identity or rendered text. */
export function upgradeNodeAliasEdit(doc: GuiProject) {
  if (!doc.screens.some(screen => screen.nodes.some(node => node.alias !== undefined))) return;
  if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.39.0')) doc.schemaVersion = '0.39.0';
  doc.entryScreenId ??= doc.screens[0].id;
  doc.screenTabGroups ??= [];
}

/** Newly exposed widget tooltips are an explicit 0.49.0 capability; Button already had the field. */
export function upgradeTooltipEdit(doc: GuiProject) {
  const hasImageTooltip = doc.screens.some(screen => screen.nodes.some(node => node.type === 'minecraft:image' && node.props.tooltip !== undefined));
  if (hasImageTooltip) {
    if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.57.0')) doc.schemaVersion = '0.57.0';
    doc.entryScreenId ??= doc.screens[0].id;
    doc.screenTabGroups ??= [];
    return;
  }
  const hasTooltip = doc.screens.some(screen => screen.nodes.some(node => node.type !== 'minecraft:button' && supportsTooltip(node) && node.props.tooltip !== undefined));
  if (!hasTooltip) return;
  if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.49.0')) doc.schemaVersion = '0.49.0';
  doc.entryScreenId ??= doc.screens[0].id;
  doc.screenTabGroups ??= [];
}

/** Repeatable List / Row Template is an explicit 0.51.0 capability. */
export function upgradeRepeatableListEdit(doc: GuiProject) {
  if (!doc.screens.some(screen => screen.nodes.some(node => node.type === 'minecraft:repeatable-list'))) return;
  if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.51.0')) doc.schemaVersion = '0.51.0';
  doc.entryScreenId ??= doc.screens[0].id;
  doc.screenTabGroups ??= [];
}

/** Project-level language resources are an explicit 0.50.0 capability; editing them never rewrites TextSpec. */
export function upgradeLocalizationResourceEdit(doc: GuiProject) {
  if (!doc.localization && doc.project.modId === undefined) return;
  if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.50.0')) doc.schemaVersion = '0.50.0';
  doc.entryScreenId ??= doc.screens[0].id;
  doc.screenTabGroups ??= [];
}

/** New optional Fill paint fields are added only when a designer explicitly edits a Rectangle style. */
export function upgradeFillStyleEdit(doc: GuiProject) {
  const hasStyle = doc.screens.some(screen => screen.nodes.some(node => node.type === 'minecraft:fill' &&
    (node.props.stylePreset !== undefined || node.props.borderColor !== undefined || node.props.highlightColor !== undefined || node.props.shadowColor !== undefined)));
  if (!hasStyle) return;
  if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.42.0')) doc.schemaVersion = '0.42.0';
  doc.entryScreenId ??= doc.screens[0].id;
  doc.screenTabGroups ??= [];
}

/** Persist localization naming/reversible translation-mode metadata only after an explicit edit. */
export function upgradeLocalizationEdit(doc: GuiProject) {
  const hasDraftKey = doc.screens.some(screen => screen.nodes.some(node => {
    const scan = (value: unknown): boolean => !!value && typeof value === 'object' && (Array.isArray(value) ? value.some(scan) : Object.entries(value).some(([key, child]) => key === 'disabledKey' || scan(child)));
    return scan(node.props);
  }));
  if (doc.project.localizationNamespace === undefined && !hasDraftKey) return;
  if (PROJECT_SCHEMA_VERSIONS.indexOf(doc.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.43.0')) doc.schemaVersion = '0.43.0';
  doc.entryScreenId ??= doc.screens[0].id;
  doc.screenTabGroups ??= [];
}
