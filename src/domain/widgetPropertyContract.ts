import type { NodeType } from './catalog';

/**
 * Maintained audit manifest for persisted Widget properties. Statuses describe
 * responsibility/expected coverage, not proof that Minecraft pixels match a browser.
 * Rendering and Inspector branches remain manually audited in Q2_WIDGET_PROPERTY_CONTRACT.md.
 */
export type ContractStatus = 'REQUIRED' | 'APPLICABLE' | 'NOT_APPLICABLE' | 'EXTERNAL_IMPLEMENTATION';
export type RenderBoundary = 'NATIVE' | 'CUSTOM' | 'APPROXIMATE' | 'MIXED' | 'MANUAL_AUDIT';
export type PropertyFlow = {
  json: ContractStatus;
  schema: ContractStatus;
  inspector: ContractStatus;
  designCanvas: ContractStatus;
  behaviorPreview: ContractStatus;
  png: ContractStatus;
  agentSpec: ContractStatus;
  minecraft: ContractStatus;
  render: RenderBoundary;
  note?: string;
};
export type WidgetPropertyContract = {
  inspectorHandler: string;
  designRenderer: string;
  props: readonly string[];
  state: readonly string[];
  events: readonly string[];
  transient?: readonly string[];
  noParentContainer?: boolean;
  roles?: Readonly<Record<string, Partial<PropertyFlow>>>;
};

const flow = (render: RenderBoundary, note?: string): PropertyFlow => ({
  json: 'REQUIRED', schema: 'REQUIRED', inspector: 'APPLICABLE',
  designCanvas: 'APPLICABLE', behaviorPreview: 'APPLICABLE', png: 'APPLICABLE',
  agentSpec: 'REQUIRED', minecraft: 'EXTERNAL_IMPLEMENTATION', render, ...(note ? { note } : {}),
});
const scalar = (render: RenderBoundary, note?: string) => flow(render, note);
const identity = flow('MANUAL_AUDIT', '稳定身份用于引用；不是可视参数。');
identity.inspector = 'NOT_APPLICABLE'; identity.designCanvas = 'NOT_APPLICABLE';
identity.behaviorPreview = 'APPLICABLE'; identity.png = 'NOT_APPLICABLE';
const eventIntent = flow('MANUAL_AUDIT', '节点事件意图独立于 F2；只有 F2 合同列出的事件源会执行规则。');
eventIntent.inspector = 'NOT_APPLICABLE'; eventIntent.designCanvas = 'NOT_APPLICABLE'; eventIntent.png = 'NOT_APPLICABLE';
eventIntent.minecraft = 'EXTERNAL_IMPLEMENTATION';
const fixedInitial = flow('MANUAL_AUDIT', '权威初值用于设计 PNG；运行时当前值是会话/Screen 状态。');
const runtimeOnly = flow('MANUAL_AUDIT', '运行时临时状态不写入权威 JSON，也不要求 PNG 表示。');
runtimeOnly.json = 'NOT_APPLICABLE'; runtimeOnly.schema = 'NOT_APPLICABLE'; runtimeOnly.inspector = 'NOT_APPLICABLE';
runtimeOnly.designCanvas = 'NOT_APPLICABLE'; runtimeOnly.behaviorPreview = 'APPLICABLE'; runtimeOnly.png = 'NOT_APPLICABLE'; runtimeOnly.agentSpec = 'REQUIRED'; runtimeOnly.minecraft = 'EXTERNAL_IMPLEMENTATION';
const containerReference = flow('CUSTOM', '可选父级和坐标转换依赖当前容器合同；Tree View 首版为 Screen 根节点。');
containerReference.json = 'APPLICABLE'; containerReference.schema = 'APPLICABLE';

const baseProps = ['bounds.x', 'bounds.y', 'bounds.w', 'bounds.h', 'parentContainerId'] as const;
const visible = ['state.visible'] as const;
const enabled = ['state.visible', 'state.enabled'] as const;
const common = (props: readonly string[], state: readonly string[], events: readonly string[], options: Partial<WidgetPropertyContract> = {}): WidgetPropertyContract => ({
  inspectorHandler: 'Inspector.tsx：按 node.type 分支；见同名清单章节',
  designRenderer: 'Canvas.tsx + exports/designPng.ts：专用或共享绘制分支',
  props, state, events, ...options,
});

/** Field lists are explicit. Tests compare their roots to the actual strict Zod node schemas. */
export const WIDGET_PROPERTY_CONTRACT: Record<NodeType, WidgetPropertyContract> = {
  'minecraft:button': common(['props.message', 'props.tooltip', 'props.color', 'props.textShadow'], enabled, ['events.press'], { transient: ['runtime.focus', 'runtime.pressed'], roles: { 'props.tooltip': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', render: 'NATIVE' }, 'events.press': eventIntent } }),
  'minecraft:edit-box': common(['props.narration', 'props.value', 'props.hint', 'props.maxLength', 'props.bordered', 'props.editable', 'props.color', 'props.textShadow'], enabled, ['events.valueChanged'], { transient: ['runtime.value', 'runtime.focus'], roles: { 'props.value': fixedInitial, 'props.narration': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE' }, 'events.valueChanged': eventIntent } }),
  'minecraft:string-widget': common(['props.text', 'props.color', 'props.align', 'props.textShadow'], visible, []),
  'minecraft:fill': common(['props.color'], visible, [], { roles: { 'props.color': scalar('NATIVE') } }),
  'minecraft:checkbox': common(['props.message', 'props.selected', 'props.maxWidth', 'props.color', 'props.textShadow'], enabled, [], { transient: ['runtime.checked'], roles: { 'props.selected': fixedInitial, 'props.color': scalar('APPROXIMATE', '原版 Checkbox 文字颜色固定；自定义颜色需游戏端绘制。') } }),
  'minecraft:cycle-button': common(['props.name', 'props.options', 'props.initialOptionId', 'props.displayFormat', 'props.color', 'props.textShadow'], enabled, [], { transient: ['runtime.currentOptionId'], roles: { 'props.initialOptionId': fixedInitial } }),
  'minecraft:creative-tab': common(['props.name', 'props.column', 'props.selected', 'props.groupId', 'props.contentIds', 'props.tabMode', 'props.navigationGroupId', 'props.navigationTabId'], visible, [], { transient: ['runtime.selectedTabId', 'runtime.currentScreenId'], roles: { 'props.name': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE' }, 'props.selected': fixedInitial, 'props.groupId': containerReference, 'props.contentIds': containerReference, 'props.tabMode': containerReference, 'props.navigationGroupId': containerReference, 'props.navigationTabId': containerReference } }),
  'minecraft:multi-line-text-widget': common(['props.text', 'props.color', 'props.maxWidth', 'props.maxRows', 'props.align', 'props.textShadow'], visible, [], { roles: { 'props.text': scalar('APPROXIMATE', '浏览器 wrap/font 是原生字体近似。'), 'props.maxWidth': scalar('MIXED'), 'props.maxRows': scalar('MIXED') } }),
  'minecraft:numeric-input': common(['props.name', 'props.min', 'props.max', 'props.step', 'props.initialValue', 'props.numericType', 'props.format', 'props.color', 'props.textShadow', 'props.bordered', 'props.editable', 'props.commitPolicy', 'props.errorMessage'], enabled, ['events.commit'], { transient: ['runtime.currentValue', 'runtime.draft', 'runtime.error', 'runtime.focus'], roles: { 'props.initialValue': fixedInitial, 'props.min': scalar('NATIVE'), 'props.max': scalar('NATIVE'), 'props.step': scalar('CUSTOM'), 'events.commit': eventIntent } }),
  'minecraft:slider': common(['props.name', 'props.min', 'props.max', 'props.step', 'props.initialValue', 'props.numericType', 'props.format', 'props.color', 'props.textShadow', 'props.showValue'], enabled, ['events.change'], { transient: ['runtime.currentValue', 'runtime.focus', 'runtime.capture'], roles: { 'props.initialValue': fixedInitial, 'props.step': scalar('CUSTOM'), 'events.change': eventIntent } }),
  'minecraft:radio-group': common(['props.name', 'props.color', 'props.textShadow', 'props.options', 'props.initialSelectedOptionId', 'props.orientation'], enabled, ['events.change'], { transient: ['runtime.selectedOptionId', 'runtime.focus', 'runtime.hover'], roles: { 'props.initialSelectedOptionId': fixedInitial, 'events.change': eventIntent } }),
  'minecraft:dropdown': common(['props.name', 'props.color', 'props.textShadow', 'props.options', 'props.initialSelectedOptionId', 'props.visibleRows'], enabled, ['events.change'], { transient: ['runtime.selectedOptionId', 'runtime.activeOptionId', 'runtime.expanded', 'runtime.focus', 'runtime.scroll'], roles: { 'props.initialSelectedOptionId': fixedInitial, 'props.visibleRows': { designCanvas: 'APPLICABLE', behaviorPreview: 'APPLICABLE', png: 'APPLICABLE', render: 'CUSTOM', note: 'PNG 只表示闭合触发器；展开候选行和 active/focus 不导出。' }, 'events.change': eventIntent } }),
  'minecraft:progress-bar': common(['props.min', 'props.max', 'props.initialValue', 'props.direction', 'props.backgroundColor', 'props.foregroundColor', 'props.border', 'props.borderColor', 'props.borderThickness', 'props.display', 'props.color', 'props.textShadow'], visible, [], { transient: ['runtime.currentValue'], roles: { 'props.initialValue': fixedInitial, 'props.min': scalar('CUSTOM'), 'props.max': scalar('CUSTOM'), 'props.direction': scalar('CUSTOM', '四种方向由纯绘制几何处理；不接收输入事件。') } }),
  'minecraft:status-indicator': common(['props.name', 'props.statuses', 'props.initialStatusId', 'props.shape', 'props.showLabel', 'props.color', 'props.textShadow'], visible, ['events.change'], { transient: ['runtime.currentStatusId'], roles: { 'props.name': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE' }, 'props.initialStatusId': fixedInitial, 'events.change': eventIntent } }),
  'minecraft:image': common(['props.kind', 'props.resourceId', 'props.textureWidth', 'props.textureHeight', 'props.uv', 'props.spriteId'], visible, [], { roles: { 'props.resourceId': scalar('MIXED'), 'props.spriteId': scalar('MIXED'), 'props.uv': scalar('MIXED') } }),
  'minecraft:fitting-multi-line-text-widget': common(['props.text', 'props.color', 'props.initialScroll', 'props.textShadow'], visible, [], { transient: ['runtime.scroll', 'runtime.focus'], roles: { 'props.text': scalar('APPROXIMATE'), 'props.initialScroll': { inspector: 'NOT_APPLICABLE', render: 'NATIVE', note: '首版固定顶部策略；Inspector 不编辑。' } } }),
  'minecraft:scrollable-panel': common(['props.padding', 'props.contentHeight', 'props.initialScroll', 'props.backgroundColor', 'props.borderColor'], enabled, [], { transient: ['runtime.scroll', 'runtime.capture', 'runtime.focus'], roles: { 'props.initialScroll': { inspector: 'NOT_APPLICABLE', render: 'CUSTOM', note: '首版固定顶部策略；滚动 offset 仅为会话状态。' }, 'props.padding': containerReference, 'props.contentHeight': containerReference, parentContainerId: containerReference } }),
  'minecraft:collapsible-panel': common(['props.title', 'props.headerHeight', 'props.initialExpanded', 'props.headerColor', 'props.backgroundColor', 'props.textColor', 'props.border', 'props.borderColor'], enabled, [], { transient: ['runtime.expanded', 'runtime.focus'], roles: { 'props.initialExpanded': fixedInitial, parentContainerId: containerReference } }),
  'minecraft:tree-view': common(['props.name', 'props.items', 'props.initialExpandedIds', 'props.initialSelectedItemId'], enabled, ['events.change'], { noParentContainer: true, transient: ['runtime.expandedIds', 'runtime.selectedItemId', 'runtime.focusedItemId', 'runtime.scroll'], roles: { 'props.name': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE' }, 'props.initialExpandedIds': fixedInitial, 'props.initialSelectedItemId': fixedInitial, 'events.change': eventIntent } }),
};

const propPrefix = 'props.';
export function widgetPropertyPaths(type: NodeType): string[] {
  const item = WIDGET_PROPERTY_CONTRACT[type];
  return [
    'id', ...baseProps,
    ...(item.state ?? []).map(path => path.startsWith('state.') ? path : `state.${path}`),
    ...item.props.map(path => path.startsWith(propPrefix) ? path : `${propPrefix}${path}`),
    ...item.events.map(path => path.startsWith('events.') ? path : `events.${path}`),
  ];
}

export function propertyFlow(type: NodeType, path: string): PropertyFlow {
  if (path.startsWith('runtime.') && WIDGET_PROPERTY_CONTRACT[type].transient?.includes(path)) return runtimeOnly;
  if (path === 'id') return identity;
  if (path === 'parentContainerId') return WIDGET_PROPERTY_CONTRACT[type].noParentContainer ? { ...containerReference, json: 'NOT_APPLICABLE', schema: 'APPLICABLE', inspector: 'NOT_APPLICABLE', designCanvas: 'NOT_APPLICABLE', behaviorPreview: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', agentSpec: 'NOT_APPLICABLE', minecraft: 'NOT_APPLICABLE' } : containerReference;
  if (path.startsWith('events.')) return eventIntent;
  const role = WIDGET_PROPERTY_CONTRACT[type].roles?.[path];
  return { ...scalar('APPROXIMATE'), ...role } as PropertyFlow;
}

/** Manual audit routing references. These labels do not claim automated UI branch coverage. */
