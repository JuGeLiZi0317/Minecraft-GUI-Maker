/** Verified against Window.calculateScale/setGuiScale, Options.guiScale (1.21.1 / 21.1.244).
 * This is a behavioral specification, not copied Minecraft source or a font/rendering implementation.
 */
export function guiScalePreview(framebufferWidth: number, framebufferHeight: number, requested: number, forceUnicode = false) {
  if (![framebufferWidth, framebufferHeight].every(n => Number.isSafeInteger(n) && n > 0 && n <= 2147483647)
    || !Number.isSafeInteger(requested) || requested < 0 || requested > 2147483646) throw new Error('GUI Scale 参数必须为合法正整数，等级0表示自动');
  // Equivalent to increasing an integer scale while the next GUI viewport remains >=320x240.
  const available = Math.max(1, Math.min(Math.floor(framebufferWidth / 320), Math.floor(framebufferHeight / 240)));
  const even = (n: number) => forceUnicode && n % 2 === 1 ? n + 1 : n;
  const effectiveScale = even(requested === 0 ? available : Math.min(requested, available));
  return { framebufferWidth, framebufferHeight, requested, forceUnicode, effectiveScale, maxLevel: even(available),
    logicalWidth: Math.ceil(framebufferWidth / effectiveScale), logicalHeight: Math.ceil(framebufferHeight / effectiveScale) };
}
export type GuiScalePreview = ReturnType<typeof guiScalePreview>;
export const MAX_EDITABLE_DESIGN_SIZE = 8192;
