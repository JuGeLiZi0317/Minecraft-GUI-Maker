import type { ExportFile } from './bundle';

// Stored ZIP: at most 64 MiB of entry data, plus metadata and one final Blob.
// Blob parts avoid a second contiguous ZIP allocation; browser Blob storage is implementation-dependent.
export const ZIP_DATA_LIMIT = 64 * 1024 * 1024;
const encode = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => { let crc = value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); return crc >>> 0; });
const yieldUi = () => new Promise<void>(resolve => setTimeout(resolve, 0));
async function crc32(bytes: Uint8Array, verify: () => void): Promise<number> {
  let crc = 0xffffffff;
  for (let start = 0; start < bytes.length; start += 1024 * 1024) {
    const end = Math.min(bytes.length, start + 1024 * 1024);
    for (let i = start; i < end; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 255];
    await yieldUi(); verify();
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function header(size: number) { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; }
export async function buildZip(files: readonly ExportFile[], verify: () => void = () => {}): Promise<Blob> {
  if (!files.length || files.length > 65535 || files.reduce((sum, file) => sum + file.bytes.byteLength, 0) > ZIP_DATA_LIMIT) throw new Error('ZIP 内容超过 64 MiB 打包上限');
  const names = new Set<string>(), parts: BlobPart[] = [], central: Uint8Array[] = []; let offset = 0, centralSize = 0;
  for (const file of files) {
    verify();
    if (!file.name || /[\\/\u0000-\u001f]/.test(file.name) || file.name === '.' || file.name === '..' || names.has(file.name.toLowerCase())) throw new Error('ZIP 文件名无效或重复');
    names.add(file.name.toLowerCase()); const name = encode.encode(file.name), crc = await crc32(file.bytes, verify);
    if (name.length > 65535) throw new Error('ZIP 文件名过长');
    const local = header(30 + name.length); local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x800, true);
    local.view.setUint16(12, 0x21, true); local.view.setUint32(14, crc, true); local.view.setUint32(18, file.bytes.length, true); local.view.setUint32(22, file.bytes.length, true); local.view.setUint16(26, name.length, true); local.bytes.set(name, 30);
    const dir = header(46 + name.length); dir.view.setUint32(0, 0x02014b50, true); dir.view.setUint16(4, 20, true); dir.view.setUint16(6, 20, true); dir.view.setUint16(8, 0x800, true);
    dir.view.setUint16(14, 0x21, true); dir.view.setUint32(16, crc, true); dir.view.setUint32(20, file.bytes.length, true); dir.view.setUint32(24, file.bytes.length, true); dir.view.setUint16(28, name.length, true); dir.view.setUint32(42, offset, true); dir.bytes.set(name, 46);
    parts.push(local.bytes.buffer, Uint8Array.from(file.bytes).buffer); central.push(dir.bytes); centralSize += dir.bytes.length; offset += local.bytes.length + file.bytes.length;
    // Allow session changes to be observed between entries.
    await yieldUi();
  }
  verify(); const end = header(22); end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, files.length, true); end.view.setUint16(10, files.length, true); end.view.setUint32(12, centralSize, true); end.view.setUint32(16, offset, true);
  const blob = new Blob([...parts, ...central.map(c => c.buffer as ArrayBuffer), end.bytes.buffer], { type: 'application/zip' }); verify(); return blob;
}
