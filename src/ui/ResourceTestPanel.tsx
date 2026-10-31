import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { directoryFiles, ResourceError, type Query } from '../resources/core';
import { GUI_SPRITES, LayeredResources, type SpriteResult } from '../resources/layered';
import { useDismissOutside } from './useDismissOutside';

/** Experimental, session-only resource validation; unrelated to the project document. */
export function ResourceTestPanel({ manager: shared, onChange, openRequest = 0, hideTrigger = false }: { manager: LayeredResources; onChange: () => void; openRequest?: number; hideTrigger?: boolean }) {
  const root = useRef<HTMLDivElement>(null), directory = useRef<HTMLInputElement>(null);
  const manager = useRef<LayeredResources | null>(shared);
  const controller = useRef<AbortController | null>(null), sequence = useRef(0), querySequence = useRef(0);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [layer, setLayer] = useState<string | null>(null), [message, setMessage] = useState('尚未选择资源包');
  const [base, setBase] = useState<string | null>(null), [spriteId, setSpriteId] = useState<string>(GUI_SPRITES[0]), [spriteResult, setSpriteResult] = useState<SpriteResult | null>(null);
  const [error, setError] = useState(false), [path, setPath] = useState(''), [result, setResult] = useState<Query | null>(null);
  const [directorySupported, setDirectorySupported] = useState(false);
  useEffect(() => { if (openRequest) { setBase(manager.current!.baseName); setLayer(manager.current!.overlayName); setOpen(true); } }, [openRequest]);
  useDismissOutside(root, open, () => setOpen(false));
  useEffect(() => {
    const input = directory.current;
    if (input) { setDirectorySupported('webkitdirectory' in input); input.setAttribute('webkitdirectory', ''); }
    return () => { sequence.current++; controller.current?.abort(); manager.current?.close(); };
  }, []);
  const load = async (event: ChangeEvent<HTMLInputElement>, kind: 'zip' | 'directory' | 'client') => {
    const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = '';
    if (!files.length) return;
    const id = ++sequence.current, abort = new AbortController(); querySequence.current++; setSpriteResult(null); controller.current?.abort(); controller.current = abort;
    setBusy(true); setError(false); setMessage('正在读取并检查资源包…');
    try {
      const name = kind === 'directory' ? files[0].webkitRelativePath.split('/')[0] : files[0].name;
      if (kind === 'client') await manager.current!.setBase(files[0], name.slice(0, 128), abort.signal);
      else await manager.current!.setOverlay(kind === 'zip' ? { kind: 'zip', blob: files[0] } : directoryFiles(files), name.slice(0, 128), abort.signal);
      if (id !== sequence.current) return;
      setBase(manager.current!.baseName); setLayer(manager.current!.overlayName); setResult(null); setSpriteResult(null); onChange();
      setMessage(kind === 'client' ? '客户端自报版本符合 1.21.1 / 资源格式 34，来源未认证' : '资源包已检查并载入本次会话');
    } catch (err) {
      if (id !== sequence.current) return;
      const cancelled = err instanceof ResourceError && err.code === 'cancelled';
      setError(!cancelled); setMessage(cancelled ? '已取消读取，原有会话保留' : `读取失败：${err instanceof Error ? err.message : '未知错误'}；原有会话保留`);
    } finally { if (id === sequence.current) { controller.current = null; setBusy(false); } }
  };
  const clear = () => { sequence.current++; querySequence.current++; controller.current?.abort(); controller.current = null; manager.current!.close(); onChange(); setBusy(false); setBase(null); setLayer(null); setResult(null); setSpriteResult(null); setError(false); setMessage('资源会话已清除'); };
  return <div className="resource-test" ref={root}>
    {!hideTrigger && <button aria-expanded={open} aria-controls="resource-test-menu" onClick={() => setOpen(!open)}>资源包检查</button>}
    <section id="resource-test-menu" className="resource-test-popover resource-test-popover-menu" hidden={!open} aria-label="资源包检查">
      <div className="resource-test-heading"><strong>资源包检查 · 实验功能</strong><button aria-label="关闭资源包检查" onClick={() => setOpen(false)}>✕</button></div>
      <p>选择客户端 JAR 和可选资源包；仅在本页读取，不上传或保存。Button 与有边框的 EditBox 使用纹理预览，字体仍为网页近似。</p>
      <div className="resource-test-actions">
        <label className="resource-file">选择客户端 JAR<input type="file" aria-label="选择客户端 JAR" accept=".jar,application/java-archive" disabled={busy} onChange={e => void load(e, 'client')}/></label>
        <label className="resource-file">选择 ZIP<input type="file" aria-label="选择资源包 ZIP" accept=".zip,application/zip" disabled={busy} onChange={e => void load(e, 'zip')}/></label>
        <label className={`resource-file ${directorySupported ? '' : 'unavailable'}`}>选择文件夹<input ref={directory} type="file" aria-label="选择资源包文件夹" multiple disabled={busy || !directorySupported} onChange={e => void load(e, 'directory')}/></label>
        {busy && <button onClick={() => controller.current?.abort()}>取消读取</button>}
        {(manager.current!.baseChoices.length > 0 || manager.current!.overlayChoices.length > 0) && <button onClick={clear}>清除会话</button>}
      </div>
      {!directorySupported && <p>当前浏览器不支持文件夹选择，请使用 ZIP。</p>}
      <p role={error ? 'alert' : 'status'} className={error ? 'field-error' : ''}>{message}</p>
      <p>基础资源：<strong>{base ?? '无'}</strong>；当前资源层：<strong>{layer ?? '无'}</strong>（覆盖包，须兼容 format 34）</p>
      {manager.current!.baseChoices.length > 0 && <label>已载入的客户端<select aria-label="已载入的客户端" value={manager.current!.baseIndex} onChange={e => { querySequence.current++; manager.current!.selectResource('base', Number(e.target.value)); setBase(manager.current!.baseName); setResult(null); setSpriteResult(null); onChange(); }}><option value={-1} disabled>未使用</option>{manager.current!.baseChoices.map((name, i) => <option key={i} value={i}>{name}</option>)}</select></label>}
      {manager.current!.overlayChoices.length > 0 && <label>已载入的资源包<select aria-label="已载入的资源包" value={manager.current!.overlayIndex} onChange={e => { querySequence.current++; manager.current!.selectResource('overlay', Number(e.target.value)); setLayer(manager.current!.overlayName); setResult(null); setSpriteResult(null); onChange(); }}><option value={-1} disabled>未使用</option>{manager.current!.overlayChoices.map((name, i) => <option key={i} value={i}>{name}</option>)}</select></label>}
      <label className="resource-query">资源路径<input aria-label="资源路径" placeholder="assets/minecraft/textures/…" value={path} onChange={e => { setPath(e.target.value); setResult(null); }}/></label>
      <button disabled={(!layer && !base) || busy || !path} onClick={() => setResult(manager.current!.query(path))}>查询资源</button>
      {result && <p data-testid="resource-query-result" role="status">{result.status === 'valid' ? `找到：${result.path} · 来源 ${result.layer} · ${result.size} 字节` : `${result.status}：${result.diagnostic}`}</p>}
      <label className="resource-query">GUI Sprite<select aria-label="GUI Sprite" value={spriteId} onChange={e => { querySequence.current++; setSpriteId(e.target.value); setSpriteResult(null); }}>{GUI_SPRITES.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
      <button disabled={!base || busy} onClick={() => { const id = ++querySequence.current; void manager.current!.sprite(spriteId).then(value => { if (querySequence.current === id) setSpriteResult(value); }); }}>查询 Sprite</button>
      {spriteResult && <p data-testid="sprite-result" role="status">{spriteResult.status === 'valid' ? `${spriteResult.id} · 图片 ${spriteResult.imageLayer} · 元数据 ${spriteResult.metadataLayer ?? '无，默认 stretch'} · ${spriteResult.width} × ${spriteResult.height} · ${JSON.stringify(spriteResult.scaling)} · ${spriteResult.diagnostic}` : `${spriteResult.status}：${spriteResult.diagnostic}`}</p>}
      <p>客户端版本仅来自文件自报，来源未认证；覆盖包 atlas、filter 和 overlay 暂不支持。PNG 未完整解码；安全性和浏览器兼容仍在验证中。</p>
    </section>
  </div>;
}
