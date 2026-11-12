import type { GuiNode } from './schema';

/**
 * Static source-audit classification for Minecraft 1.21.1 / NeoForge 21.1.244.
 * This matrix describes reachability through the audited public API; it does not
 * claim that a browser preview matches native pixels.
 */
export type NativeColorCapability = 'native-public' | 'custom-renderer' | 'fixed-unreachable';
export type NativeShadowCapability = 'native-public' | 'always-on' | 'custom-renderer' | 'replace-widget';
export type NativeTextControl = {
  color: NativeColorCapability;
  shadow: NativeShadowCapability;
  colorEvidence: string;
  shadowEvidence: string;
  overflow: string;
  note: string;
};

export const NATIVE_TEXT_CAPABILITY = {
  'minecraft:button': {
    color: 'native-public', shadow: 'always-on',
    colorEvidence: 'AbstractWidget.getFGColor/setFGColor (public, NeoForge 21.1.244); AbstractButton.renderWidget:37-38',
    shadowEvidence: 'AbstractButton.renderWidget -> renderString -> renderScrollingString -> GuiGraphics.drawString default dropShadow=true',
    overflow: 'native renderScrollingString scrolls long text horizontally with a 2 GUI px inset; it does not ellipsize',
    note: '颜色可用 NeoForge setFGColor（非纯原版 API）；原版文字恒带阴影，textShadow=false 需覆写 renderString 或 renderWidget。',
  },
  'minecraft:cycle-button': {
    color: 'native-public', shadow: 'replace-widget',
    colorEvidence: 'inherits AbstractButton.renderWidget:37-38; setFGColor applies',
    shadowEvidence: 'inherits AbstractButton.renderString/renderScrollingString; package-private constructor prevents normal subclassing outside net.minecraft.client.gui.components',
    overflow: 'native renderScrollingString scrolls long text horizontally; label may be composed through options.generic_value',
    note: '颜色走 setFGColor；阴影恒开。构造器包内可见，关闭阴影只能替换/重写控件，不能正常子类化。',
  },
  'minecraft:string-widget': {
    color: 'native-public', shadow: 'always-on',
    colorEvidence: 'AbstractStringWidget.setColor (public); StringWidget.setColor covariantly public',
    shadowEvidence: 'StringWidget.renderWidget -> GuiGraphics.drawString default dropShadow=true; no shadow setter',
    overflow: 'native StringWidget truncates with an ellipsis when the game font is wider than the configured width',
    note: '颜色用 setColor；原版恒带阴影，textShadow=false 需子类覆写 public renderWidget。',
  },
  'minecraft:checkbox': {
    color: 'fixed-unreachable', shadow: 'replace-widget',
    colorEvidence: 'Checkbox constructor sets private MultiLineTextWidget color 14737632 (0xFFE0E0E0); inherited setFGColor is unused',
    shadowEvidence: 'Checkbox.renderWidget -> MultiLineTextWidget -> MultiLineLabel always draws shadow; package-private constructor prevents normal subclassing',
    overflow: 'text starts after the 17 px box plus 4 px spacing; wrapping uses the widget width and may overflow the right edge when maxWidth is too small',
    note: '原版文字色固定 0xFFE0E0E0，setFGColor 无效；阴影恒开；颜色或阴影差异都需替换/重写控件。',
  },
  'minecraft:edit-box': {
    color: 'native-public', shadow: 'native-public',
    colorEvidence: 'EditBox.setTextColor / setTextColorUneditable (public); renderWidget chooses by isEditable',
    shadowEvidence: 'EditBox.setTextShadow(boolean) / getTextShadow; applies to value, hint, suggestion and cursor glyph',
    overflow: 'EditBox scrolls/clips its value inside the field; browser measurement remains approximate',
    note: '唯一可直接关闭文字阴影的控件；选中区和矩形光标使用独立绘制。',
  },
  'minecraft:multi-line-text-widget': {
    color: 'native-public', shadow: 'always-on',
    colorEvidence: 'MultiLineTextWidget.setColor (public)',
    shadowEvidence: 'MultiLineTextWidget.renderWidget -> MultiLineLabel always draws shadow; no public shadow setter',
    overflow: 'wraps at maxWidth and limits to maxRows; height is derived from the label layout',
    note: '颜色可设；阴影恒开，textShadow=false 需自定义绘制或子类覆写。',
  },
  'minecraft:slider': {
    color: 'custom-renderer', shadow: 'custom-renderer',
    colorEvidence: 'AbstractSliderButton.renderWidget hardcodes 16777215 / 10526880; setFGColor is not read',
    shadowEvidence: 'AbstractSliderButton.renderWidget -> renderScrollingString -> drawString default true; abstract class is already subclassed by implementations',
    overflow: '2 GUI px inset; long text scrolls horizontally; value maps through width-8',
    note: '原版颜色硬编码，setFGColor 无效；需子类覆写 renderWidget 才能改色/关阴影。',
  },
  'minecraft:fitting-multi-line-text-widget': {
    color: 'native-public', shadow: 'always-on',
    colorEvidence: 'FittingMultiLineTextWidget.setColor (public) delegates to the private MultiLineTextWidget',
    shadowEvidence: 'inner MultiLineTextWidget -> MultiLineLabel always draws shadow; no public shadow setter',
    overflow: '9 px line height, inner padding, scrolls vertically; width wrapping is not the node bounds height',
    note: '颜色可设；阴影恒开，textShadow=false 需自定义绘制或替换内部文本渲染。',
  },
} as const satisfies Partial<Record<GuiNode['type'], NativeTextControl>>;

export type ButtonColorMode = 'native' | 'neoforge';
export type ColorModeNode = Extract<GuiNode, { type: 'minecraft:button' | 'minecraft:cycle-button' }>;

/** Absence preserves the legacy custom-color preview; only a truly colorless legacy node falls back to native. */
export function effectiveButtonColorMode(node: ColorModeNode): ButtonColorMode {
  return node.props.colorMode ?? (node.props.color === undefined ? 'native' : 'neoforge');
}

export const BUTTON_COLOR_MODE_CONTRACT = {
  version: '1.0.0',
  field: 'optional props.colorMode on minecraft:button and minecraft:cycle-button; requires Schema 0.52.0 only when explicitly saved',
  modes: {
    native: 'use the native Button/CycleButton FGColor defaults: white when enabled, light grey when disabled; does not call setFGColor; hide color controls',
    neoforge: 'use AbstractWidget.setFGColor with the exported props.color; expose the ARGB color controls',
  },
  legacy: 'absent colorMode preserves earlier projects: a saved color renders as before; a colorless legacy node previews native white',
  alpha: 'setFGColor is ORed with widget alpha; export only RGB in the game adapter, or document that alpha is not independently expressible',
  webPreview: 'Canvas, Reference PNG and ZIP design PNG share the same effectiveButtonColorMode decision; native white/light-grey is an approximation of the game font color',
  authority: 'colorMode is design intent; the game adapter decides whether to call setFGColor or use native defaults. No Java code is generated.',
} as const;

export type NativeTextDiagnostic = {
  nodeId: string;
  nodeType: GuiNode['type'];
  code: 'shadow-always-on' | 'shadow-replace-widget' | 'checkbox-color-fixed' | 'slider-color-hardcoded' | 'fgcolor-alpha-dropped' | 'cycle-label-translation';
  severity: 'warning' | 'info';
  message: string;
  implementation: string;
};

const affectedShadow = new Set<GuiNode['type']>([
  'minecraft:button', 'minecraft:cycle-button', 'minecraft:string-widget', 'minecraft:checkbox',
  'minecraft:multi-line-text-widget', 'minecraft:slider', 'minecraft:fitting-multi-line-text-widget',
]);

/** Emit only actionable differences; absent textShadow remains legacy design data and is summarised separately. */
export function nativeTextDiagnostics(nodes: readonly GuiNode[]): NativeTextDiagnostic[] {
  const result: NativeTextDiagnostic[] = [];
  for (const node of nodes) {
    if (!affectedShadow.has(node.type) || !('textShadow' in node.props) || node.props.textShadow !== false) continue;
    const capability = NATIVE_TEXT_CAPABILITY[node.type as keyof typeof NATIVE_TEXT_CAPABILITY];
    if (!capability) continue;
    const replace = capability.shadow === 'replace-widget';
    result.push({
      nodeId: node.id, nodeType: node.type, code: replace ? 'shadow-replace-widget' : 'shadow-always-on', severity: 'warning',
      message: replace ? '原生渲染恒带文字阴影，且该控件不能正常子类化；textShadow=false 只能替换/重写控件。' : '原生渲染恒带文字阴影；textShadow=false 只是设计意图，游戏端需自定义绘制。',
      implementation: capability.note,
    });
  }
  for (const node of nodes) {
    if (node.type === 'minecraft:checkbox' && node.props.color !== undefined && node.props.color.toUpperCase() !== '#FFE0E0E0') {
      result.push({ nodeId: node.id, nodeType: node.type, code: 'checkbox-color-fixed', severity: 'warning',
        message: '原版 Checkbox 文字色固定为 0xFFE0E0E0；props.color 不会被原生 setFGColor 应用。',
        implementation: '使用自定义控件或替换文字渲染路径；不要假设 Checkbox 有颜色 setter。' });
    }
    if (node.type === 'minecraft:slider' && node.props.color !== undefined) {
      result.push({ nodeId: node.id, nodeType: node.type, code: 'slider-color-hardcoded', severity: 'warning',
        message: '原版 AbstractSliderButton 在 renderWidget 内硬编码文字颜色；setFGColor 不生效。',
        implementation: '子类覆写 public renderWidget 使用设计颜色；这是自定义实现，不是公开属性。' });
    }
    if ((node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button') && node.props.colorMode !== 'native' && 'color' in node.props && node.props.color && node.props.color.slice(1, 3).toUpperCase() !== 'FF') {
      result.push({ nodeId: node.id, nodeType: node.type, code: 'fgcolor-alpha-dropped', severity: 'warning',
        message: 'AbstractButton 以按位或叠加 widget alpha；setFGColor 传入的 ARGB alpha 会被覆盖，半透明文字不可表达。',
        implementation: '导出时只传 0x00RRGGBB，运行时透明度使用 setAlpha；不要用文字 alpha 表达隐藏。' });
    }
    if (node.type === 'minecraft:cycle-button' && node.props.displayFormat === 'name-and-value') {
      result.push({ nodeId: node.id, nodeType: node.type, code: 'cycle-label-translation', severity: 'info',
        message: '原生 name-and-value 通过 options.generic_value（en_us 为 "%s: %s"）组合，不是固定字符串拼接。',
        implementation: '保持翻译键语义；自定义格式需要覆盖 options.generic_value 或自定义 setMessage，不能当作普通选项字段。' });
    }
  }
  return result;
}

export function nativeTextCapabilityNote(node: GuiNode): string | null {
  const capability = NATIVE_TEXT_CAPABILITY[node.type as keyof typeof NATIVE_TEXT_CAPABILITY];
  return capability ? `${capability.note} ${capability.overflow}` : null;
}

export const NATIVE_TEXT_CAPABILITY_VERSION = '1.0.0' as const;
