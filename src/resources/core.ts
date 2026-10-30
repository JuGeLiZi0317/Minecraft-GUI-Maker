/** Isolated, in-memory single resource-pack index. No GUI or storage dependency. */
export const LIMITS = Object.freeze({ input: 128 * 1024 * 1024, entries: 20_000, file: 16 * 1024 * 1024,
  total: 128 * 1024 * 1024, json: 2 * 1024 * 1024, ratio: 200, pngAxis: 8192, pngPixels: 16_777_216, directory: 16 * 1024 * 1024 });
export type Failure = 'invalid' | 'unsupported' | 'cancelled';
export class ResourceError extends Error { constructor(public readonly code: Failure, message: string) { super(message); } }
function fail(message: string, code: Failure = 'invalid'): never { throw new ResourceError(code, message); }
function check(signal?: AbortSignal) { if (signal?.aborted) fail('读取已取消', 'cancelled'); }
function pathOf(path: string, directory = false): string {
  if (!path || path.length > 1024 || /[\\\x00-\x1f\x7f]/.test(path) || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) fail('非法路径');
  const parts = (directory && path.endsWith('/') ? path.slice(0, -1) : path).split('/');
  if (parts.length > 64 || parts.some(p => !p || p === '.' || p === '..')) fail('非法路径段或目录层数超限');
  return parts.join('/');
}
function validateAssetPath(path: string) {
  if (!path.startsWith('assets/')) return;
  const parts = path.split('/');
  if (parts.length < 3 || !/^[a-z0-9_.-]+$/.test(parts[1]) || parts.slice(2).some(p => !/^[a-z0-9_.-]+$/.test(p))) fail('非法资源命名空间或路径');
}
function u16(v: DataView, i: number) { return v.getUint16(i, true); }
function u32(v: DataView, i: number) { return v.getUint32(i, true); }
async function slice(blob: Blob, start: number, end: number) { return new Uint8Array(await blob.slice(start, end).arrayBuffer()); }
type Entry = { path: string; size: number; compressed: number; crc?: number; method: number; flags?: number; offset?: number; limit?: number; lazy?: boolean; file?: Blob };
type Input = { kind: 'zip'; blob: Blob } | { kind: 'directory'; files: ReadonlyArray<{ path: string; file: Blob }> };
export type Query = { status: 'valid'; path: string; layer: string; size: number } | { status: 'missing' | 'invalid' | 'unsupported'; diagnostic: string };
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crcUpdate(crc: number, bytes: Uint8Array) { for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return crc >>> 0; }

async function zipEntries(blob: Blob, signal?: AbortSignal, client = false): Promise<Entry[]> {
  if (blob.size > LIMITS.input || blob.size < 22) fail('ZIP 输入大小超限或格式损坏');
  const tailStart = Math.max(0, blob.size - 65557), tail = await slice(blob, tailStart, blob.size); check(signal);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength); let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tv, i) === 0x06054b50 && i + 22 + u16(tv, i + 20) === tail.length) { e = i; break; }
  if (e < 0) fail('ZIP 结束记录缺失');
  const count = u16(tv, e + 10), size = u32(tv, e + 12), start = u32(tv, e + 16);
  if (u16(tv, e + 4) || u16(tv, e + 6) || u16(tv, e + 8) !== count || count === 65535 || size === 0xffffffff || start === 0xffffffff) fail('不支持分卷或 ZIP64', 'unsupported');
  if (count > (client ? 30_000 : LIMITS.entries) || size > LIMITS.directory || start + size !== tailStart + e) fail('ZIP 中央目录超限或无效');
  const bytes = await slice(blob, start, start + size), v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out: Entry[] = [];
  const seen = new Set<string>(), decoder = new TextDecoder('utf-8', { fatal: true }); let i = 0, declared = 0;
  for (let n = 0; n < count; n++) {
    check(signal); if (i + 46 > size || u32(v, i) !== 0x02014b50) fail('ZIP 中央目录损坏');
    const made = u16(v, i + 4), flags = u16(v, i + 8), method = u16(v, i + 10), crc = u32(v, i + 16), compressed = u32(v, i + 20), length = u32(v, i + 24);
    const nl = u16(v, i + 28), xl = u16(v, i + 30), cl = u16(v, i + 32), disk = u16(v, i + 34), attr = u32(v, i + 38), offset = u32(v, i + 42);
    if (i + 46 + nl + xl + cl > size || disk || length === 0xffffffff || compressed === 0xffffffff || offset === 0xffffffff) fail('ZIP 条目无效或 ZIP64', 'unsupported');
    if ((flags & ~(client ? 0x0808 : 0x0800)) || (method !== 0 && method !== 8)) fail('ZIP 加密、数据描述符、标志或压缩方式不支持', 'unsupported');
    if ((made >>> 8) === 3 && ((attr >>> 16) & 0xf000) === 0xa000) fail('拒绝符号链接');
    let raw: string; try { raw = decoder.decode(bytes.subarray(i + 46, i + 46 + nl)); } catch { return fail('ZIP 文件名不是有效 UTF-8'); }
    const dir = raw.endsWith('/'), path = pathOf(raw, dir), key = path.toLowerCase();
    if (seen.has(key)) fail('ZIP 路径重复或大小写冲突'); seen.add(key);
    if (!dir && (!client || path === 'version.json' || (path.startsWith('assets/') && path !== 'assets/.mcassetsroot'))) {
      validateAssetPath(path); declared += length;
      if ((method === 0 && length !== compressed) || length > LIMITS.file || declared > LIMITS.total || (length > 0 && (compressed === 0 || length > compressed * LIMITS.ratio))) fail('ZIP 声明大小或压缩比超限');
      if ((path.endsWith('.json') || path.endsWith('.mcmeta')) && length > LIMITS.json) fail('JSON 超限');
      out.push({ path, size: length, compressed, crc, method, flags, offset });
    }
    i += 46 + nl + xl + cl;
  }
  if (i !== size) fail('ZIP 中央目录长度不匹配');
  if (client) {
    const sorted = [...out].sort((a, b) => a.offset! - b.offset!);
    for (let n = 0; n < sorted.length; n++) {
      const entry = sorted[n], limit = n + 1 < sorted.length ? sorted[n + 1].offset! : start;
      if (entry.offset! >= limit || limit > start) fail('客户端 ZIP 条目偏移重叠或越界');
      entry.limit = limit; entry.lazy = true;
    }
    return out;
  }
  const ranges: Array<[number, number]> = [];
  for (const entry of out) {
    check(signal); const off = entry.offset!; if (off + 30 > start) fail('ZIP 本地头越界');
    const h = await slice(blob, off, off + 30), hv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    if (u32(hv, 0) !== 0x04034b50 || u16(hv, 8) !== entry.method) fail('ZIP 本地头不匹配');
    const flags = u16(hv, 6), nl = u16(hv, 26), xl = u16(hv, 28), dataStart = off + 30 + nl + xl, end = dataStart + entry.compressed;
    if (flags !== entry.flags || end > start) fail('ZIP 本地头或数据越界');
    let local: string; try { local = decoder.decode(await slice(blob, off + 30, off + 30 + nl)); } catch { return fail('ZIP 本地文件名无效'); }
    if (local !== entry.path) fail('ZIP 本地与中央文件名不一致');
    let rangeEnd = end;
    if (flags & 8) {
      if ((u32(hv, 14) && u32(hv, 14) !== entry.crc) || (u32(hv, 18) && u32(hv, 18) !== entry.compressed) || (u32(hv, 22) && u32(hv, 22) !== entry.size)) fail('ZIP 本地头与中央目录不一致');
      if (end + 16 > start) fail('ZIP 数据描述符越界');
      const d = await slice(blob, end, end + 16), dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
      if (u32(dv, 0) !== 0x08074b50 || u32(dv, 4) !== entry.crc || u32(dv, 8) !== entry.compressed || u32(dv, 12) !== entry.size) fail('不支持或损坏的 ZIP 数据描述符', 'unsupported');
      rangeEnd += 16;
    } else if (u32(hv, 14) !== entry.crc || u32(hv, 18) !== entry.compressed || u32(hv, 22) !== entry.size) fail('ZIP 本地与中央大小或 CRC 不一致');
    entry.offset = dataStart; ranges.push([off, rangeEnd]);
  }
  ranges.sort((a, b) => a[0] - b[0]); for (let n = 1; n < ranges.length; n++) if (ranges[n][0] < ranges[n - 1][1]) fail('ZIP 数据区域重叠');
  return out;
}

async function read(entry: Entry, input: Input, signal?: AbortSignal): Promise<Uint8Array> {
  check(signal);
  let dataOffset = entry.offset;
  if (entry.lazy && input.kind === 'zip') {
    const off = entry.offset!, limit = entry.limit!; if (off + 30 > limit) fail('ZIP 本地头越界');
    const h = await slice(input.blob, off, off + 30), hv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    if (u32(hv, 0) !== 0x04034b50 || u16(hv, 6) !== entry.flags || u16(hv, 8) !== entry.method) fail('ZIP 本地头不匹配');
    const nl = u16(hv, 26), xl = u16(hv, 28); dataOffset = off + 30 + nl + xl;
    const end = dataOffset + entry.compressed, descriptorSize = entry.flags! & 8 ? 16 : 0;
    if (end + descriptorSize > limit) fail('ZIP 数据或描述符越界');
    let name: string; try { name = new TextDecoder('utf-8', { fatal: true }).decode(await slice(input.blob, off + 30, off + 30 + nl)); } catch { return fail('ZIP 本地文件名无效'); }
    if (name !== entry.path) fail('ZIP 本地与中央文件名不一致');
    if (entry.flags! & 8) {
      if ((u32(hv, 14) && u32(hv, 14) !== entry.crc) || (u32(hv, 18) && u32(hv, 18) !== entry.compressed) || (u32(hv, 22) && u32(hv, 22) !== entry.size)) fail('ZIP 本地头与中央目录不一致');
      const d = await slice(input.blob, end, end + 16), dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
      if (u32(dv, 0) !== 0x08074b50 || u32(dv, 4) !== entry.crc || u32(dv, 8) !== entry.compressed || u32(dv, 12) !== entry.size) fail('不支持或损坏的 ZIP 数据描述符', 'unsupported');
    } else if (u32(hv, 14) !== entry.crc || u32(hv, 18) !== entry.compressed || u32(hv, 22) !== entry.size) fail('ZIP 本地与中央大小或 CRC 不一致');
    check(signal);
  }
  const blob = input.kind === 'zip' ? input.blob.slice(dataOffset!, dataOffset! + entry.compressed) : entry.file!;
  let stream: ReadableStream<Uint8Array> = blob.stream();
  if (entry.method === 8) {
    try { stream = stream.pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>); } catch { return fail('浏览器不支持 deflate-raw 流式解压', 'unsupported'); }
  }
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let size = 0, crc = 0xffffffff;
  const abort = () => { void reader.cancel().catch(() => {}); }; signal?.addEventListener('abort', abort, { once: true });
  try {
    for (;;) { check(signal); const next = await reader.read(); check(signal); if (next.done) break;
      size += next.value.length; if (size > LIMITS.file || size > entry.size || (entry.compressed && size > entry.compressed * LIMITS.ratio)) fail('实际解压大小超限');
      chunks.push(next.value); crc = crcUpdate(crc, next.value);
    }
  } catch (error) { if (signal?.aborted) fail('读取已取消', 'cancelled'); if (error instanceof ResourceError) throw error; return fail('文件流或压缩数据损坏'); }
  finally { signal?.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (size !== entry.size || (entry.crc !== undefined && ((crc ^ 0xffffffff) >>> 0) !== entry.crc)) fail('实际大小或 CRC 不匹配');
  const result = new Uint8Array(size); let pos = 0; for (const chunk of chunks) { result.set(chunk, pos); pos += chunk.length; }
  return result;
}
function validatePng(data: Uint8Array) {
  const signature = [137,80,78,71,13,10,26,10]; if (data.length < 33 || !signature.every((b, i) => data[i] === b)) fail('PNG 文件头无效');
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (v.getUint32(8) !== 13 || String.fromCharCode(...data.slice(12,16)) !== 'IHDR') fail('PNG IHDR 无效');
  const w = v.getUint32(16), h = v.getUint32(20); if (!w || !h || w > LIMITS.pngAxis || h > LIMITS.pngAxis || w * h > LIMITS.pngPixels) fail('PNG 尺寸超限');
}
function packMeta(data: Uint8Array) {
  let value: any; try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); } catch { return fail('pack.mcmeta 无效'); }
  const p = value?.pack; if (!p || typeof p !== 'object' || !Number.isInteger(p.pack_format) || !('description' in p) || !['string', 'object'].includes(typeof p.description) || p.description === null) fail('pack.mcmeta 缺少 pack 格式或描述');
  if ('filter' in value || 'overlays' in value || 'neoforge:overlays' in value) fail('暂不支持 filter 或 overlay', 'unsupported');
  let min = p.pack_format, max = p.pack_format;
  if (p.supported_formats !== undefined) {
    const s = p.supported_formats;
    if (Number.isInteger(s)) min = max = s;
    else if (Array.isArray(s) && s.length === 2 && s.every(Number.isInteger)) [min, max] = s;
    else if (s && Number.isInteger(s.min_inclusive) && Number.isInteger(s.max_inclusive)) { min = s.min_inclusive; max = s.max_inclusive; }
    else fail('supported_formats 无效');
    if (min > max) fail('supported_formats 范围无效');
    if (p.pack_format < min || p.pack_format > max) min = max = p.pack_format;
  }
  if (34 < min || 34 > max) fail('资源包不兼容 format 34', 'unsupported');
}

export class ResourceSession {
  private closed = false; private readonly abort = new AbortController(); private actualClientBytes = 0;
  constructor(private input: Input | null, private readonly entries: Map<string, Entry>, readonly layer: string, private readonly client = false) {}
  private charge(length: number) { if (this.client) { this.actualClientBytes += length; if (this.actualClientBytes > LIMITS.total) fail('客户端会话实际读取总量超限'); } }
  close() { this.closed = true; this.abort.abort(); this.input = null; this.entries.clear(); }
  query(path: string): Query {
    if (this.closed) return { status: 'invalid', diagnostic: '会话已关闭' };
    try { const normalized = pathOf(path); validateAssetPath(normalized); if (!normalized.startsWith('assets/')) return { status: 'unsupported', diagnostic: '只查询 assets 下的文件' };
      const entry = this.entries.get(normalized); return entry ? { status: 'valid', path: normalized, layer: this.layer, size: entry.size } : { status: 'missing', diagnostic: '资源不存在' };
    } catch { return { status: 'invalid', diagnostic: '资源路径无效' }; }
  }
  async read(path: string, signal?: AbortSignal): Promise<Uint8Array> {
    if (this.query(path).status !== 'valid') fail('资源不可读取');
    const combined = signal ? AbortSignal.any([signal, this.abort.signal]) : this.abort.signal;
    const bytes = await read(this.entries.get(path)!, this.input!, combined); if (this.closed) fail('会话已关闭'); this.charge(bytes.length); return bytes;
  }
  /** Root metadata is exposed only to the client verifier, never via public asset lookup. */
  async readClientVersion(signal?: AbortSignal): Promise<Uint8Array> {
    if (this.closed || !this.input || !this.entries.has('version.json')) fail('客户端版本信息缺失');
    const bytes = await read(this.entries.get('version.json')!, this.input, signal); this.charge(bytes.length); return bytes;
  }
}

export async function prepareClient(blob: Blob, layer: string, signal?: AbortSignal): Promise<ResourceSession> {
  check(signal); if (!layer || layer.length > 128) fail('资源层标识无效');
  const input: Input = { kind: 'zip', blob }, entries = await zipEntries(blob, signal, true);
  const map = new Map(entries.map(e => [e.path, e])), session = new ResourceSession(input, map, layer, true);
  try {
    let version: { id?: string; pack_version?: { resource?: number } };
    try { version = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await session.readClientVersion(signal))); } catch (error) { if (error instanceof ResourceError) throw error; return fail('客户端 version.json 无效'); }
    if (version?.id !== '1.21.1' || version.pack_version?.resource !== 34) fail('客户端自报版本或资源格式不匹配', 'unsupported');
    for (const path of ['assets/minecraft/atlases/gui.json', 'assets/minecraft/textures/gui/sprites/widget/button.png', 'assets/minecraft/textures/gui/sprites/widget/button_highlighted.png', 'assets/minecraft/textures/gui/sprites/widget/button_disabled.png', 'assets/minecraft/textures/gui/sprites/widget/text_field.png', 'assets/minecraft/textures/gui/sprites/widget/text_field_highlighted.png']) {
      if (session.query(path).status !== 'valid') fail(`客户端缺少基础资源：${path}`);
      const bytes = await session.read(path, signal); if (path.endsWith('.png')) validatePng(bytes);
    }
    check(signal); return session;
  } catch (error) { session.close(); throw error; }
}

export async function prepareSession(input: Input, layer: string, signal?: AbortSignal): Promise<ResourceSession> {
  check(signal); if (!layer || layer.length > 128) fail('资源层标识无效');
  let entries: Entry[];
  if (input.kind === 'zip') entries = await zipEntries(input.blob, signal);
  else {
    if (input.files.length > LIMITS.entries) fail('目录文件数量超限');
    const seen = new Set<string>(); let total = 0;
    entries = input.files.map(({ path: raw, file }) => { check(signal); const path = pathOf(raw), key = path.toLowerCase(); validateAssetPath(path);
      if (seen.has(key)) fail('目录路径重复或大小写冲突'); seen.add(key); total += file.size;
      if (file.size > LIMITS.file || total > LIMITS.total || ((path.endsWith('.json') || path.endsWith('.mcmeta')) && file.size > LIMITS.json)) fail('目录文件大小超限');
      return { path, file, size: file.size, compressed: file.size, method: 0 };
    });
  }
  const filePaths = new Set(entries.map(entry => entry.path.toLowerCase()));
  for (const entry of entries) {
    const parts = entry.path.toLowerCase().split('/');
    for (let i = 1; i < parts.length; i++) if (filePaths.has(parts.slice(0, i).join('/'))) fail('文件与目录路径冲突');
  }
  const map = new Map(entries.map(e => [e.path, e])); const meta = map.get('pack.mcmeta');
  if (!meta || !entries.some(e => e.path.startsWith('assets/'))) fail('缺少根级 pack.mcmeta 或 assets');
  packMeta(await read(meta, input, signal));
  let actualTotal = 0;
  for (const entry of entries) { check(signal); const data = await read(entry, input, signal); actualTotal += data.length;
    if (actualTotal > LIMITS.total) fail('实际读取总量超限'); if (entry.path.endsWith('.png')) validatePng(data);
  }
  check(signal); return new ResourceSession(input, map, layer);
}

/** Newest request wins; failed and cancelled imports preserve the previous session. */
export class ResourceSessionManager {
  private generation = 0; private active?: AbortController;
  current: ResourceSession | null = null;
  async replace(input: Input, layer: string, signal?: AbortSignal): Promise<ResourceSession> {
    this.active?.abort(); const controller = new AbortController(); this.active = controller; const generation = ++this.generation;
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) controller.abort();
    try { const next = await prepareSession(input, layer, controller.signal); check(controller.signal);
      if (generation !== this.generation) { next.close(); fail('读取已取消', 'cancelled'); }
      const old = this.current; this.current = next; old?.close(); return next;
    } finally { signal?.removeEventListener('abort', abort); if (this.active === controller) this.active = undefined; }
  }
  close() { this.active?.abort(); this.active = undefined; this.generation++; this.current?.close(); this.current = null; }
}

/** Adapter for an explicitly selected webkitdirectory FileList; no filesystem traversal. */
export function directoryFiles(files: readonly File[]): Input {
  if (!files.length) fail('未选择文件');
  const paths = files.map(file => file.webkitRelativePath); const first = paths[0]?.split('/')[0];
  if (!first || paths.some(path => !path.startsWith(first + '/'))) fail('请选择单一根目录');
  return { kind: 'directory', files: files.map((file, i) => ({ path: paths[i].slice(first.length + 1), file })) };
}
