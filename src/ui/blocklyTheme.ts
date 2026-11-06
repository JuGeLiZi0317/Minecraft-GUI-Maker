import * as Blockly from 'blockly/core';

export type BlocklyThemeMode = 'light' | 'dark';

/** Mirrors the Bento surface tokens. Blocks keep their existing semantic hues. */
export const BLOCKLY_PALETTE = {
  dark: { workspace: '#1a2028', panel: '#282f39', text: '#dee6f2', scroll: '#7e8da0', accent: '#83a8d6' },
  light: { workspace: '#f3f5f8', panel: '#fafbfc', text: '#34465a', scroll: '#7b8a9e', accent: '#5f7c9b' },
} as const;

const define = (mode: BlocklyThemeMode) => {
  const p = BLOCKLY_PALETTE[mode];
  return Blockly.Theme.defineTheme(`gui-maker-${mode}`, {
    name: `gui-maker-${mode}`, base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: p.workspace,
      toolboxBackgroundColour: p.panel, toolboxForegroundColour: p.text,
      flyoutBackgroundColour: p.panel, flyoutForegroundColour: p.text, flyoutOpacity: 1,
      scrollbarColour: p.scroll, scrollbarOpacity: 0.7,
      insertionMarkerColour: p.accent, insertionMarkerOpacity: 0.4,
      selectedGlowColour: p.accent, selectedGlowOpacity: 0.8,
      cursorColour: p.accent, markerColour: p.accent,
    },
  });
};
export const BLOCKLY_THEMES = { light: define('light'), dark: define('dark') };

/** ThemeManager in Blockly 13.4 closes field editors in setTheme(). Defer that
 * call while a text editor is live, preserving its unfinished input and Escape.
 * HTML popup colors follow the resolved application theme immediately. */
export function bindBlocklyTheme(workspace: Blockly.WorkspaceSvg) {
  const widget = Blockly.WidgetDiv.getDiv();
  // DropDownDiv is recreated after closing; CSS uses its official theme class.
  const surfaces = [widget, Blockly.Tooltip.getDiv()];
  for (const surface of surfaces) surface?.classList.add('gui-maker-blockly-ui');
  let pending: Blockly.Theme | null = null;
  const applyPending = () => {
    if (!pending || (Blockly.WidgetDiv.isVisible() && widget?.querySelector('input, textarea'))) return;
    const theme = pending; pending = null;
    if (workspace.getTheme() !== theme) workspace.setTheme(theme);
  };
  const observer = new MutationObserver(applyPending);
  if (widget) observer.observe(widget, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  return {
    apply(mode: BlocklyThemeMode) { pending = BLOCKLY_THEMES[mode]; applyPending(); },
    dispose() { pending = null; observer.disconnect(); for (const surface of surfaces) surface?.classList.remove('gui-maker-blockly-ui'); },
  };
}
