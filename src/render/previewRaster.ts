/** Keep preview surfaces alive for as long as a queued Konva draw references them.
 * Closing an ImageBitmap in effect cleanup can race that draw and stop Layer.batchDraw.
 */
export async function decodePreviewRaster(data: Uint8Array, width: number, height: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }));
  try {
    if (bitmap.width !== width || bitmap.height !== height) throw new Error('PNG 解码尺寸不匹配');
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('无法创建纹理预览画布');
    ctx.drawImage(bitmap, 0, 0);
    return canvas;
  } finally { bitmap.close(); }
}
