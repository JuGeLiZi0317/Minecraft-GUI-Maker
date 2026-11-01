/** Evidence: docs/minecraft/GUI_COMPONENT_AUDIT.md (1.21.1 / 21.1.244). */
export const TARGET = {
  edition: 'java', minecraft: '1.21.1', loader: { id: 'neoforge', version: '21.1.244' }, java: 21,
} as const;
export const CATALOG_VERSION = 'mc-1.21.1-neoforge-21.1.244-audit-1' as const;
export const CATALOG = {
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
