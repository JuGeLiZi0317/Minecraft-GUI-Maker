/** Project-drawn bevel, in GUI logical pixels. No Minecraft texture is embedded. */
export const PANEL_STYLE = 'custom-bevel-1' as const;
export const NATIVE_PANEL_16 = 'supplied-panel-16' as const;
export const NATIVE_PANEL_32 = 'supplied-panel-32' as const;
export type PanelStyle = typeof PANEL_STYLE | typeof NATIVE_PANEL_16 | typeof NATIVE_PANEL_32;
export const PANEL_MIN_SIZE = 8;
export function panelTextureSide(width: number, height: number): 512 | 768 | 1024 {
  const longest = Math.max(width, height);
  if (longest <= 512) return 512;
  if (longest <= 768) return 768;
  if (longest <= 1024) return 1024;
  throw new Error('设计区宽或高超过 1024，无法导出方形 Panel 纹理；请缩小设计区或单独导出 JSON');
}
export function panelSource(style: PanelStyle) {
  return style === PANEL_STYLE ? 'project-drawn-custom' : 'user-supplied-minecraft-dispenser-derived';
}
export type PanelRect = { x: number; y: number; w: number; h: number; color: string };
export function panelRects(width: number, height: number): PanelRect[] {
  if (![width, height].every(n => Number.isInteger(n) && n >= PANEL_MIN_SIZE)) throw new Error('Panel 宽高均需至少 8 GUI px');
  return [
    { x: 0, y: 0, w: width, h: height, color: '#373737' },
    { x: 1, y: 1, w: width - 2, h: height - 2, color: '#555555' },
    { x: 2, y: 2, w: width - 4, h: height - 4, color: '#c6c6c6' },
    { x: 2, y: 2, w: width - 4, h: 1, color: '#ffffff' },
    { x: 2, y: 3, w: 1, h: height - 5, color: '#ffffff' },
    { x: 3, y: height - 3, w: width - 5, h: 1, color: '#8b8b8b' },
    { x: width - 3, y: 3, w: 1, h: height - 5, color: '#8b8b8b' },
  ];
}

/** Legacy documents omit bounds: their panel tracks the complete design area. */
export function panelBounds(screen: { designSize: { width: number; height: number }; background: { kind: 'none' } | { kind: 'panel'; bounds?: { x: number; y: number; w: number; h: number } } }) {
  return screen.background.kind === 'panel' && screen.background.bounds ? screen.background.bounds : { x: 0, y: 0, w: screen.designSize.width, h: screen.designSize.height };
}
