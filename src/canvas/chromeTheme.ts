/** Editor chrome palette for the Konva assist layer (selection, guides, rulers, tabs,
 *  scrollbars, preview frame, diagnostics).
 *
 *  src/styles/tokens.css keeps the --canvas-* CSS tokens as the semantic spec of the
 *  style system; this typed module is the single runtime source for Konva drawing and
 *  tests/unit/canvas/chromeTheme.test.ts asserts the two never drift.
 *
 *  Minecraft WYSIWYG colors (design-surface matte, widget fallbacks, tree/selection
 *  widget pixels) are intentionally NOT part of this palette: they are theme-independent
 *  by contract and shared with src/exports/designPng.ts.
 */
export type CanvasChromeTheme = {
  /** Selection outline inner stroke, handles, hover outline, corner marks, ruler origin. */
  accent: string;
  /** Handle border ink. */
  accentInk: string;
  /** Dark outer halo behind the selection outline (contrast on the design surface). */
  selectionOutline: string;
  /** Smart alignment guides: low-saturation cyan-blue. */
  alignGuide: string;
  /** Equal-spacing marks: muted rose, distinct from alignment guides. */
  spacingLine: string;
  spacingText: string;
  /** Editing grid over the design surface. */
  grid: string;
  /** Dark guide ink over the theme-independent, light-grey Minecraft Panel. */
  panelGrid: string;
  rulerBg: string;
  rulerLine: string;
  rulerText: string;
  rulerTick: string;
  /** Other-screen tabs above each design surface. */
  tabActive: string;
  tabIdle: string;
  tabText: string;
  /** Container scrollbars drawn beside scrollable panels. */
  scrollTrack: string;
  scrollThumb: string;
  /** GUI Scale preview frame around the framebuffer. */
  previewFrame: string;
  previewFrameLine: string;
  /** Editor diagnostics drawn on canvas (truncation warnings, texture failure badge). */
  diagWarn: string;
  diagBadBg: string;
  diagBadText: string;
  /** Size chip next to the selection. */
  chipBg: string;
  chipLine: string;
  chipText: string;
  mono: string;
};

export const CANVAS_CHROME: Record<'dark' | 'light', CanvasChromeTheme> = {
  dark: {
    accent: '#83a8d6',
    accentInk: '#16202c',
    selectionOutline: '#0a0d12',
    alignGuide: '#6fc3d6',
    spacingLine: '#cf9fb0',
    spacingText: '#e6cdd5',
    grid: 'rgba(174,190,212,.4)',
    panelGrid: 'rgba(42,58,76,.7)',
    rulerBg: '#171c24',
    rulerLine: '#2c3540',
    rulerText: '#9eacbe',
    rulerTick: '#3d4855',
    tabActive: '#364a64',
    tabIdle: '#2b3440',
    tabText: '#dee6f2',
    scrollTrack: '#12161c',
    scrollThumb: '#4e5b6b',
    previewFrame: '#12161c',
    previewFrameLine: '#4e5b6b',
    diagWarn: '#d7b491',
    diagBadBg: '#3a262a',
    diagBadText: '#e29087',
    chipBg: 'rgba(40,47,57,.92)',
    chipLine: '#3d4855',
    chipText: '#9eacbe',
    mono: 'Cascadia Mono, Consolas, monospace',
  },
  light: {
    accent: '#5f7c9b',
    accentInk: '#ffffff',
    selectionOutline: '#0a0d12',
    alignGuide: '#8fd4e2',
    spacingLine: '#e3b7c4',
    spacingText: '#f0d8df',
    grid: 'rgba(208,222,240,.45)',
    panelGrid: 'rgba(42,58,76,.7)',
    rulerBg: '#f3f5f8',
    rulerLine: '#d5dce5',
    rulerText: '#64748b',
    rulerTick: '#afbaca',
    tabActive: '#dce7f4',
    tabIdle: '#dfe4eb',
    tabText: '#34465a',
    scrollTrack: '#dfe4eb',
    scrollThumb: '#afbaca',
    previewFrame: '#dfe4eb',
    previewFrameLine: '#afbaca',
    diagWarn: '#e2c3a4',
    diagBadBg: '#3a262a',
    diagBadText: '#e29087',
    chipBg: 'rgba(250,251,252,.92)',
    chipLine: '#cbd4df',
    chipText: '#64748b',
    mono: 'Cascadia Mono, Consolas, monospace',
  },
};

export const canvasChrome = (theme: 'dark' | 'light'): CanvasChromeTheme => CANVAS_CHROME[theme];
