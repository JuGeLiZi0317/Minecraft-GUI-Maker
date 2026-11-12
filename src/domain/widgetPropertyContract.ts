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
  'native_region': common(['props.kind'], visible, [], { noParentContainer: true, roles: { 'props.kind': scalar('APPROXIMATE', '固定玩家背包区域，仅提供几何与近似背景；真实 Slot 由 Menu 创建。') } }),
  'minecraft:single_slot': common(['props.usage', 'props.placeholderItemId'], visible, [], { noParentContainer: true, roles: { 'props.usage': scalar('MANUAL_AUDIT', 'inventory 需要 Java Menu.addSlot；ghost_selection 为 Mod 外部选择接入点；visual_only 仅静态外观。'), 'props.placeholderItemId': scalar('APPROXIMATE', '仅设计态占位视觉，不是 ItemStack。') } }),
  'minecraft:button': common(['props.message', 'props.tooltip', 'props.color', 'props.colorMode', 'props.textShadow'], enabled, ['events.press'], { transient: ['runtime.focus', 'runtime.pressed'], roles: { 'props.colorMode': scalar('MANUAL_AUDIT', 'native 使用原生白/浅灰；neoforge 使用 setFGColor；缺省按旧项目颜色渲染。'), 'props.color': scalar('NATIVE', 'NeoForge AbstractWidget.setFGColor；不是纯原版 API；alpha 会被 widget alpha 覆盖。'), 'props.textShadow': scalar('MANUAL_AUDIT', '原生恒开，无 setter；false 需自定义 renderString/renderWidget。'), 'props.tooltip': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', render: 'NATIVE' }, 'events.press': eventIntent } }),
  'minecraft:edit-box': common(['props.narration', 'props.value', 'props.hint', 'props.maxLength', 'props.bordered', 'props.editable', 'props.color', 'props.textShadow', 'props.tooltip'], enabled, ['events.valueChanged'], { transient: ['runtime.value', 'runtime.focus'], roles: { 'props.value': fixedInitial, 'props.color': scalar('NATIVE', 'EditBox.setTextColor/setTextColorUneditable；颜色按 editable 切换。'), 'props.textShadow': scalar('NATIVE', 'NeoForge EditBox.setTextShadow(boolean) 直接控制。'), 'props.narration': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE' }, 'props.tooltip': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', render: 'NATIVE' }, 'events.valueChanged': eventIntent } }),
  'minecraft:string-widget': common(['props.text', 'props.color', 'props.align', 'props.textShadow'], visible, [], { roles: { 'props.color': scalar('NATIVE', 'AbstractStringWidget.setColor。'), 'props.textShadow': scalar('MANUAL_AUDIT', '原生恒开，无 setter；false 需子类覆写 renderWidget。') } }),
  'minecraft:fill': common(['props.color', 'props.stylePreset', 'props.borderColor', 'props.highlightColor', 'props.shadowColor'], visible, [], { roles: { 'props.color': scalar('NATIVE'), 'props.stylePreset': scalar('CUSTOM', '静态样式，Canvas/PNG/Bake 共用整数矩形。'), 'props.borderColor': scalar('CUSTOM'), 'props.highlightColor': scalar('CUSTOM'), 'props.shadowColor': scalar('CUSTOM') } }),
  'minecraft:checkbox': common(['props.message', 'props.selected', 'props.maxWidth', 'props.color', 'props.textShadow', 'props.tooltip'], enabled, [], { transient: ['runtime.checked'], roles: { 'props.selected': fixedInitial, 'props.color': scalar('CUSTOM', '原版 Checkbox 固定 0xFFE0E0E0，setFGColor 无效；自定义颜色只能替换/重写控件。'), 'props.textShadow': scalar('MANUAL_AUDIT', '原生恒开；构造器包内可见，textShadow=false 只能替换控件。'), 'props.tooltip': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', render: 'NATIVE' } } }),
  'minecraft:cycle-button': common(['props.name', 'props.options', 'props.initialOptionId', 'props.displayFormat', 'props.color', 'props.colorMode', 'props.textShadow', 'props.tooltip'], enabled, [], { transient: ['runtime.currentOptionId'], roles: { 'props.initialOptionId': fixedInitial, 'props.colorMode': scalar('MANUAL_AUDIT', 'native 使用原生白/浅灰；neoforge 使用 setFGColor；缺省按旧项目颜色渲染。'), 'props.color': scalar('NATIVE', '继承 AbstractButton.setFGColor；alpha 会被 widget alpha 覆盖。'), 'props.textShadow': scalar('MANUAL_AUDIT', '原生恒开；构造器包内可见，textShadow=false 只能替换控件。'), 'props.tooltip': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', render: 'NATIVE' } } }),
  'minecraft:creative-tab': common(['props.name', 'props.column', 'props.selected', 'props.groupId', 'props.contentIds', 'props.tabMode', 'props.navigationGroupId', 'props.navigationTabId'], visible, [], { transient: ['runtime.selectedTabId', 'runtime.currentScreenId'], roles: { 'props.name': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE' }, 'props.selected': fixedInitial, 'props.groupId': containerReference, 'props.contentIds': containerReference, 'props.tabMode': containerReference, 'props.navigationGroupId': containerReference, 'props.navigationTabId': containerReference } }),
  'minecraft:multi-line-text-widget': common(['props.text', 'props.color', 'props.maxWidth', 'props.maxRows', 'props.align', 'props.textShadow'], visible, [], { roles: { 'props.text': scalar('APPROXIMATE', '浏览器 wrap/font 是原生字体近似。'), 'props.maxWidth': scalar('MIXED'), 'props.maxRows': scalar('MIXED'), 'props.textShadow': scalar('MANUAL_AUDIT', '原生恒开，无 setter；false 需自定义绘制或子类覆写。') } }),
  'minecraft:numeric-input': common(['props.name', 'props.min', 'props.max', 'props.step', 'props.initialValue', 'props.numericType', 'props.format', 'props.color', 'props.textShadow', 'props.bordered', 'props.editable', 'props.commitPolicy', 'props.errorMessage', 'props.tooltip'], enabled, ['events.commit'], { transient: ['runtime.currentValue', 'runtime.draft', 'runtime.error', 'runtime.focus'], roles: { 'props.initialValue': fixedInitial, 'props.min': scalar('NATIVE'), 'props.max': scalar('NATIVE'), 'props.step': scalar('CUSTOM'), 'props.tooltip': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', render: 'NATIVE' }, 'events.commit': eventIntent } }),
  'minecraft:slider': common(['props.name', 'props.min', 'props.max', 'props.step', 'props.initialValue', 'props.numericType', 'props.format', 'props.color', 'props.textShadow', 'props.showValue', 'props.tooltip'], enabled, ['events.change'], { transient: ['runtime.currentValue', 'runtime.focus', 'runtime.capture'], roles: { 'props.initialValue': fixedInitial, 'props.step': scalar('CUSTOM'), 'props.color': scalar('CUSTOM', 'AbstractSliderButton.renderWidget 硬编码颜色；setFGColor 无效，需子类覆写。'), 'props.textShadow': scalar('MANUAL_AUDIT', '原生恒开；需子类覆写 renderWidget。'), 'props.tooltip': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', render: 'NATIVE' }, 'events.change': eventIntent } }),
  'minecraft:radio-group': common(['props.name', 'props.color', 'props.textShadow', 'props.options', 'props.initialSelectedOptionId', 'props.orientation', 'props.tooltip'], enabled, ['events.change'], { transient: ['runtime.selectedOptionId', 'runtime.focus', 'runtime.hover'], roles: { 'props.initialSelectedOptionId': fixedInitial, 'props.tooltip': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', render: 'NATIVE' }, 'events.change': eventIntent } }),
  'minecraft:dropdown': common(['props.name', 'props.color', 'props.textShadow', 'props.options', 'props.initialSelectedOptionId', 'props.visibleRows', 'props.tooltip'], enabled, ['events.change'], { transient: ['runtime.selectedOptionId', 'runtime.activeOptionId', 'runtime.expanded', 'runtime.focus', 'runtime.scroll'], roles: { 'props.initialSelectedOptionId': fixedInitial, 'props.tooltip': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', render: 'CUSTOM', note: '触发器级 Tooltip；根级浮层打开时抑制。' }, 'props.visibleRows': { designCanvas: 'APPLICABLE', behaviorPreview: 'APPLICABLE', png: 'APPLICABLE', render: 'CUSTOM', note: 'PNG 只表示闭合触发器；展开候选行和 active/focus 不导出。' }, 'events.change': eventIntent } }),
  'minecraft:progress-bar': common(['props.min', 'props.max', 'props.initialValue', 'props.direction', 'props.backgroundColor', 'props.foregroundColor', 'props.border', 'props.borderColor', 'props.borderThickness', 'props.display', 'props.color', 'props.textShadow'], visible, [], { transient: ['runtime.currentValue'], roles: { 'props.initialValue': fixedInitial, 'props.min': scalar('CUSTOM'), 'props.max': scalar('CUSTOM'), 'props.direction': scalar('CUSTOM', '四种方向由纯绘制几何处理；不接收输入事件。') } }),
  'minecraft:status-indicator': common(['props.name', 'props.statuses', 'props.initialStatusId', 'props.shape', 'props.showLabel', 'props.color', 'props.textShadow'], visible, ['events.change'], { transient: ['runtime.currentStatusId'], roles: { 'props.name': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE' }, 'props.initialStatusId': fixedInitial, 'events.change': eventIntent } }),
  'minecraft:image': common(['props.kind', 'props.resourceId', 'props.textureWidth', 'props.textureHeight', 'props.uv', 'props.spriteId'], visible, [], { roles: { 'props.resourceId': scalar('MIXED'), 'props.spriteId': scalar('MIXED'), 'props.uv': scalar('MIXED') } }),
  'minecraft:fitting-multi-line-text-widget': common(['props.text', 'props.color', 'props.initialScroll', 'props.textShadow'], visible, [], { transient: ['runtime.scroll', 'runtime.focus'], roles: { 'props.text': scalar('APPROXIMATE'), 'props.textShadow': scalar('MANUAL_AUDIT', '原生内部 MultiLineTextWidget 恒开阴影，无公开 setter。'), 'props.initialScroll': { inspector: 'NOT_APPLICABLE', render: 'NATIVE', note: '首版固定顶部策略；Inspector 不编辑。' } } }),
  'minecraft:scrollable-panel': common(['props.padding', 'props.contentHeight', 'props.initialScroll', 'props.backgroundColor', 'props.borderColor', 'props.tooltip'], enabled, [], { transient: ['runtime.scroll', 'runtime.capture', 'runtime.focus'], roles: { 'props.initialScroll': { inspector: 'NOT_APPLICABLE', render: 'CUSTOM', note: '首版固定顶部策略；滚动 offset 仅为会话状态。' }, 'props.padding': containerReference, 'props.contentHeight': containerReference, 'props.tooltip': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', render: 'CUSTOM' }, parentContainerId: containerReference } }),
  'minecraft:collapsible-panel': common(['props.title', 'props.headerHeight', 'props.initialExpanded', 'props.headerColor', 'props.backgroundColor', 'props.textColor', 'props.border', 'props.borderColor', 'props.tooltip'], enabled, [], { transient: ['runtime.expanded', 'runtime.focus'], roles: { 'props.initialExpanded': fixedInitial, 'props.tooltip': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', render: 'CUSTOM', note: '仅标题栏命中。' }, parentContainerId: containerReference } }),
  'minecraft:tree-view': common(['props.name', 'props.items', 'props.initialExpandedIds', 'props.initialSelectedItemId', 'props.tooltip'], enabled, ['events.change'], { noParentContainer: true, transient: ['runtime.expandedIds', 'runtime.selectedItemId', 'runtime.focusedItemId', 'runtime.scroll'], roles: { 'props.name': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE' }, 'props.initialExpandedIds': fixedInitial, 'props.initialSelectedItemId': fixedInitial, 'props.tooltip': { designCanvas: 'NOT_APPLICABLE', png: 'NOT_APPLICABLE', render: 'CUSTOM' }, 'events.change': eventIntent } }),
  'minecraft:repeatable-list': common(['props.rowHeight', 'props.rowGap', 'props.padding', 'props.templateId', 'props.dataSource', 'props.initialScroll', 'props.backgroundColor', 'props.borderColor', 'props.emptyText'], enabled, [], { noParentContainer: true, transient: ['runtime.scroll', 'runtime.capture', 'runtime.focus', 'runtime.rowCount', 'runtime.visibleRows'], roles: { 'props.rowHeight': scalar('CUSTOM', '固定行高；行数由外部数据决定。'), 'props.rowGap': scalar('CUSTOM'), 'props.padding': containerReference, 'props.templateId': containerReference, 'props.dataSource': scalar('MANUAL_AUDIT', 'Java 端绑定键；不生成业务集合。'), 'props.initialScroll': { inspector: 'NOT_APPLICABLE', render: 'CUSTOM', note: '首版固定顶部策略；滚动 offset 仅为会话状态。' }, 'props.emptyText': scalar('CUSTOM', '仅设计预览空态；不进入业务数据合同。') } }),
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
