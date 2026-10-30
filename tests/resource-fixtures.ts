import { deflateRawSync } from 'node:zlib';

export const meta = JSON.stringify({ pack: { pack_format: 34, description: 'synthetic' } });
export function zipFixture(files: Array<{ name: string; data: string | Uint8Array; deflate?: boolean; mode?: number; descriptor?: boolean }>): Buffer {
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name), raw = Buffer.from(file.data), packed = file.deflate ? deflateRawSync(raw) : raw;
    let crc = 0xffffffff; for (const b of raw) { crc ^= b; for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; } crc = (crc ^ 0xffffffff) >>> 0;
    const flags = 0x800 | (file.descriptor ? 8 : 0);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt16LE(flags, 6); h.writeUInt16LE(file.deflate ? 8 : 0, 8); if (!file.descriptor) { h.writeUInt32LE(crc, 14); h.writeUInt32LE(packed.length, 18); h.writeUInt32LE(raw.length, 22); } h.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(0x0314, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(flags, 8); c.writeUInt16LE(file.deflate ? 8 : 0, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(((file.mode ?? 0x8000) << 16) >>> 0, 38); c.writeUInt32LE(offset, 42);
    const descriptor = file.descriptor ? Buffer.alloc(16) : Buffer.alloc(0); if (file.descriptor) { descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc, 4); descriptor.writeUInt32LE(packed.length, 8); descriptor.writeUInt32LE(raw.length, 12); }
    local.push(h, name, packed, descriptor); central.push(c, name); offset += h.length + name.length + packed.length + descriptor.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export const packFiles = () => [{ name: 'pack.mcmeta', data: meta, deflate: true }, { name: 'assets/example/test.txt', data: 'synthetic payload', deflate: true }];
