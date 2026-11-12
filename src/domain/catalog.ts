/** Evidence: docs/minecraft/GUI_COMPONENT_AUDIT.md (1.21.1 / 21.1.244). */
export const TARGET = {
  edition: 'java', minecraft: '1.21.1', loader: { id: 'neoforge', version: '21.1.244' }, java: 21,
} as const;
export const CATALOG_VERSION = 'mc-1.21.1-neoforge-21.1.244-audit-1' as const;
export const CATALOG = {
  'native_region': { label: 'Player Inventory', subtitle: 'Native Regions · 玩家背包 27 + 9 格（几何近似预览）', glyph: '▦', size: { w: 162, h: 76 }, min: { w: 162, h: 76 }, source: { category: 'native-region', className: 'net.minecraft.world.inventory.Slot' }, construction: 'native AbstractContainerMenu slots + AbstractContainerScreen; GUI Maker exports geometry only', evidence: 'DispenserMenu.java:33-41; Slot.java:11-23; AbstractContainerScreen.java:119-120,143,245-246,637-647; Q3B_NATIVE_INVENTORY_AUDIT.md' },
  'minecraft:single_slot': { label: 'Single Slot', subtitle: 'Native Regions · 单个 18×18 原生槽位', glyph: '◫', size: { w: 18, h: 18 }, min: { w: 18, h: 18 }, source: { category: 'native-region', className: 'net.minecraft.world.inventory.Slot' }, construction: 'real Menu Slot, ghost-selection integration point, or static visual 18x18 frame; GUI Maker exports geometry and intent only', evidence: 'Slot.java:11-23; AbstractContainerScreen.java:119-120,143,245-246,637-647; Q3B_NATIVE_INVENTORY_AUDIT.md' },
  'minecraft:scrollable-panel': { label: 'Scrollable Panel', subtitle: '单轴可滚动内容视窗', glyph: '▥', size: { w: 180, h: 96 }, min: { w: 40, h: 32 }, source: { category: 'vanilla-draw', className: 'net.minecraft.client.gui.GuiGraphics', member: 'fill' }, construction: 'custom Screen-level viewport controller with child-local coordinates, clipping and input/focus routing', evidence: 'Screen.java; GuiGraphics.java#enableScissor/disableScissor; ContainerEventHandler.java; W0_WIDGET_CAPABILITY_AUDIT.md' },
  'minecraft:collapsible-panel': { label: 'Collapsible Panel', subtitle: '可展开或收起的复合容器', glyph: '▱', size: { w: 180, h: 96 }, min: { w: 40, h: 24 }, source: { category: 'vanilla-draw', className: 'net.minecraft.client.gui.GuiGraphics', member: 'fill' }, construction: 'custom Screen-level composite container with fixed child-local layout and collapsible viewport', evidence: 'Screen.java; GuiGraphics.java#fill; ContainerEventHandler.java' },
  'minecraft:repeatable-list': { label: 'Repeatable List', subtitle: '外部数据驱动的固定行高列表', glyph: '≣', size: { w: 180, h: 152 }, min: { w: 40, h: 32 }, source: { category: 'vanilla-draw', className: 'net.minecraft.client.gui.GuiGraphics', member: 'fill' }, construction: 'custom Screen-level list viewport with external row count, row-template child coordinates, scissoring and vertical scroll; no native generic row-template widget', evidence: 'GuiGraphics.java#enableScissor/disableScissor; AbstractSelectionList.java:48-130,165-231,252-375; W0_WIDGET_CAPABILITY_AUDIT.md' },
  'minecraft:tree-view': { label: 'Tree View', subtitle: '层级数据浏览与单项选择', glyph: '⌘', size: { w: 200, h: 126 }, min: { w: 60, h: 40 }, source: { category: 'vanilla-draw', className: 'net.minecraft.client.gui.GuiGraphics', member: 'fill' }, construction: 'custom static tree controller; may reuse ObjectSelectionList scrolling/focus infrastructure but supplies hierarchy, disclosure and separate selection semantics', evidence: 'AbstractSelectionList.java:48-130,165-231,252-375,524-553; ObjectSelectionList.java:15-72; ContainerObjectSelectionList.java:22-110,124-253; W0_WIDGET_CAPABILITY_AUDIT.md' },
  'minecraft:image': { label: 'Image / Sprite', subtitle: '只读贴图或 GUI Sprite', glyph: '▧', size: { w: 64, h: 64 }, min: { w: 1, h: 1 }, source: { category: 'vanilla-draw', className: 'net.minecraft.client.gui.GuiGraphics', member: 'blit' }, construction: 'custom Screen draw via GuiGraphics.blit or GuiGraphics.blitSprite; no AbstractWidget registration', evidence: 'ImageWidget.java:20-25,55-92; GuiGraphics.java:677-729,807-884' },
  'minecraft:fitting-multi-line-text-widget': { label: 'ReadOnlyScrollText', subtitle: '只读滚动文本区', glyph: '▤', size: { w: 140, h: 72 }, min: { w: 12, h: 1 }, source: { category: 'vanilla-widget', className: 'net.minecraft.client.gui.components.FittingMultiLineTextWidget' }, construction: 'constructor(x,y,width,height,message,font).setColor(color); addRenderableWidget for focus and ScrollWidget input routing', evidence: 'components/FittingMultiLineTextWidget.java:16-86; AbstractScrollWidget.java:23-198; GuiGraphics.java:201-231' },
  'minecraft:status-indicator': { label: 'Status Indicator', subtitle: '有限状态只读显示', glyph: '●', size: { w: 88, h: 16 }, min: { w: 12, h: 12 }, source: { category: 'vanilla-draw', className: 'net.minecraft.client.gui.GuiGraphics', member: 'fill' }, construction: 'Screen draw with GuiGraphics.fill + drawString; no interactive widget', evidence: 'GUI_COMPONENT_AUDIT.md:59-60; GuiGraphics#fill and #drawString' },
  'minecraft:progress-bar': { label: 'Progress Bar', subtitle: '只读进度显示', glyph: '▰', size: { w: 160, h: 12 }, min: { w: 1, h: 1 }, source: { category: 'vanilla-draw', className: 'net.minecraft.client.gui.GuiGraphics', member: 'fill' }, construction: 'screen draw with GuiGraphics.fill; no native ProgressBar widget', evidence: 'GuiGraphics.java:257' },
  'minecraft:radio-group': { label: 'Radio Group', subtitle: '互斥单选复合控件', glyph: '◉', size: { w: 140, h: 60 }, min: { w: 20, h: 20 }, source: { category: 'vanilla-widget', className: 'net.minecraft.client.gui.components.AbstractButton' }, construction: 'custom AbstractButton children + mutual exclusion coordinator', evidence: 'AbstractButton.java:23-65; ContainerEventHandler.java:24-115' },
  'minecraft:dropdown': { label: 'Dropdown', subtitle: 'Screen根级单选浮层', glyph: '▾', size: { w: 140, h: 20 }, min: { w: 20, h: 20 }, source: { category: 'vanilla-widget', className: 'net.minecraft.client.gui.components.AbstractWidget' }, construction: 'custom trigger + Screen-owned overlay and input controller', evidence: 'AbstractWidget.java; Screen.java; ContainerEventHandler.java; CommandSuggestions.java' },
  'minecraft:numeric-input': {
    label: 'Numeric Input', subtitle: 'EditBox 数值校验与提交', glyph: '#', size: { w: 120, h: 20 }, min: { w: 12, h: 12 },
    source: { category: 'vanilla-widget', className: 'net.minecraft.client.gui.components.EditBox' },
    construction: 'constructor + explicit numeric draft/validation/commit adapter', evidence: 'components/EditBox.java:95-138,308-410; neoforge/client/gui/ConfigurationScreen.java:861-905',
  },
  'minecraft:slider': {
    label: 'Slider', subtitle: '原版单值滑块适配', glyph: '↔', size: { w: 150, h: 20 }, min: { w: 9, h: 9 },
    source: { category: 'vanilla-widget', className: 'net.minecraft.client.gui.components.AbstractSliderButton' },
    construction: 'subclass + updateMessage/applyValue + quantized keyboard adapter', evidence: 'components/AbstractSliderButton.java:19-151',
  },
  'minecraft:button': {
    label: 'Button', subtitle: '原版按钮', glyph: '▣', size: { w: 150, h: 20 }, min: { w: 9, h: 9 },
    source: { category: 'vanilla-widget', className: 'net.minecraft.client.gui.components.Button' },
    construction: 'builder', evidence: 'components/Button.java:22',
  },
  'minecraft:edit-box': {
    label: 'EditBox', subtitle: '原版单行输入', glyph: '⌨', size: { w: 120, h: 20 }, min: { w: 12, h: 12 },
    source: { category: 'vanilla-widget', className: 'net.minecraft.client.gui.components.EditBox' },
    construction: 'constructor', evidence: 'components/EditBox.java:83',
  },
  'minecraft:string-widget': {
    label: 'StringWidget', subtitle: '原版文本标签', glyph: 'T', size: { w: 100, h: 16 }, min: { w: 1, h: 1 },
    source: { category: 'vanilla-widget', className: 'net.minecraft.client.gui.components.StringWidget' },
    construction: 'constructor', evidence: 'components/StringWidget.java:25',
  },
  'minecraft:fill': {
    label: 'Rectangle', subtitle: '原版矩形绘制', glyph: '□', size: { w: 80, h: 40 }, min: { w: 1, h: 1 },
    source: { category: 'vanilla-draw', className: 'net.minecraft.client.gui.GuiGraphics', member: 'fill' },
    construction: 'draw', evidence: 'GuiGraphics.java:257',
  },
  'minecraft:checkbox': {
    label: 'Checkbox', subtitle: '原版复选框', glyph: '☑', size: { w: 120, h: 20 }, min: { w: 17, h: 17 },
    source: { category: 'vanilla-widget', className: 'net.minecraft.client.gui.components.Checkbox' },
    construction: 'builder', evidence: 'components/Checkbox.java:29-99',
  },
  'minecraft:cycle-button': {
    label: 'CycleButton', subtitle: '原版循环按钮', glyph: '↻', size: { w: 150, h: 20 }, min: { w: 9, h: 9 },
    source: { category: 'vanilla-widget', className: 'net.minecraft.client.gui.components.CycleButton' },
    construction: 'builder', evidence: 'components/CycleButton.java:68-125,152-261',
  },
  'minecraft:creative-tab': {
    label: 'CreativeTab', subtitle: '顶部标签视觉', glyph: '▱', size: { w: 26, h: 32 }, min: { w: 26, h: 32 },
    source: { category: 'screen-internal', className: 'net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen' },
    construction: 'screen-draw', evidence: 'CreativeModeInventoryScreen.java:840-935',
  },
  'minecraft:multi-line-text-widget': {
    label: 'MultiLineTextWidget', subtitle: '原版多行说明文本', glyph: '≡', size: { w: 150, h: 36 }, min: { w: 1, h: 9 },
    source: { category: 'vanilla-widget', className: 'net.minecraft.client.gui.components.MultiLineTextWidget' },
    construction: 'constructor + setMaxWidth/setMaxRows/setCentered/setColor', evidence: 'components/MultiLineTextWidget.java:19-78; MultiLineLabel.java:56-139',
  },
} as const;
export type NodeType = keyof typeof CATALOG;
export const NODE_TYPES: NodeType[] = Object.keys(CATALOG) as NodeType[];
