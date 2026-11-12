export const EMBEDDED_IMAGE_MAX_FILES = 32;
export const EMBEDDED_IMAGE_MAX_BYTES = 3_000_000;
export const EMBEDDED_IMAGE_MAX_BASE64 = 4_200_000;
export const EMBEDDED_IMAGE_MAX_TOTAL_BASE64 = 4_200_000;
export type EmbeddedImageAsset = { id: string; name: string; mime: 'image/png'; width: number; height: number; data: string };

export function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function embeddedPngError(bytes: Uint8Array): string | null {
  if (bytes.length < 33) return 'PNG 文件过短';
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'PNG 文件头无效';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) return 'PNG 缺少 IHDR';
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16_777_216) return 'PNG 尺寸超过上限';
  return null;
}

export function embeddedAssetError(asset: EmbeddedImageAsset): string | null {
  if (asset.mime !== 'image/png') return '嵌入式贴图必须是 PNG';
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(asset.data)) return '嵌入式贴图数据不是 base64';
  if (asset.data.length > EMBEDDED_IMAGE_MAX_BASE64) return '嵌入式贴图超过 4.2 MB base64 上限';
  try {
    const bytes = decodeBase64(asset.data), error = embeddedPngError(bytes);
    if (error) return error;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(16) !== asset.width || view.getUint32(20) !== asset.height) return '嵌入式贴图尺寸与 PNG 不一致';
  } catch { return '嵌入式贴图不是有效 base64'; }
  return null;
}

export const EMBEDDED_IMAGE_CONTRACT = {
  version: '1.0.0',
  storage: 'PNG bytes are stored as base64 in project.assets; the authoritative project JSON remains the complete source',
  scope: 'design preview and export only; GUI Maker does not add a Minecraft texture pack or runtime blit implementation',
  bake: 'Embedded Image nodes can be members of a Static Bake Group; the Bake PNG embeds the uploaded pixels',
  limits: { files: 32, bytes: 3_000_000, base64: 4_200_000, totalBase64: 4_200_000, width: 8192, height: 8192, pixels: 16_777_216 },
  authority: 'The asset is user-provided content, not a vanilla resource; the user is responsible for rights and redistribution',
} as const;
