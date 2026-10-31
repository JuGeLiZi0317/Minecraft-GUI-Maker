import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { localSession } from '../io/localSession';
import { editorStore } from '../editor/store';
import { useDismissOutside } from './useDismissOutside';
import { exportFilename } from '../exports/filenames';

export function LocalSavePanel({ notify, onBackup }: { notify: (text: string, error?: boolean) => void; onBackup: () => void }) {
  const state = useStore(localSession.status);
  const blocked = useStore(editorStore, s => s.blocked);
  const [picked, setPicked] = useState('');
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismissOutside(root, open, () => setOpen(false));
  const exceptional = ['error', 'readonly', 'conflict', 'recovery'].includes(state.phase);
  useEffect(() => { if (exceptional) setOpen(true); }, [state.phase, exceptional]);
  const selected = state.copies.some(c => c.localId === picked) ? picked : state.localId ?? '';
  return <div ref={root} className={`local-save-panel ${exceptional ? 'save-warning' : ''}`}>
    <button className="save-toggle" aria-label="本地保存状态和副本" aria-expanded={open} aria-controls="local-save-menu" title={state.message} onClick={() => setOpen(!open)}><span className={`save-dot ${state.phase}`}/><span data-testid="save-status" aria-live="polite">{state.message}</span><span className="save-menu-label">本地副本与保存说明</span><span aria-hidden="true">{open ? '▴' : '▾'}</span></button>
    <div id="local-save-menu" className="save-popover" hidden={!open}>
    <strong className="save-popover-title">本地副本与保存</strong>
    {exceptional && <div className={`save-alert ${state.phase}`} aria-live="assertive">
      <strong>{state.phase === 'error' ? '保存失败' : state.phase === 'conflict' ? '保存冲突' : state.phase === 'readonly' ? '只读' : '需要恢复'}</strong>
      <p>{state.message}</p>
      <div className="save-alert-actions"><button onClick={onBackup}>下载 JSON 备份</button></div>
    </div>}
    {!exceptional && <p className="save-detail">{state.message}</p>}
    <div className="save-summary">
      <button disabled={!!blocked || state.phase === 'saving'} onClick={() => void localSession.flush()}>立即保存</button>
      {state.phase === 'error' && <button onClick={() => void localSession.retry()}>重试本地保存</button>}
      {['readonly', 'conflict'].includes(state.phase) && <button onClick={() => location.reload()}>重新连接（未保存时请先导出JSON）</button>}
      {state.phase === 'recovery' && <><button onClick={() => {
        const url = URL.createObjectURL(new Blob([state.rawRecovery ?? ''], { type: 'application/json' }));
        let name = ''; try { const record = JSON.parse(state.rawRecovery ?? ''); name = typeof record?.document?.project?.name === 'string' ? record.document.project.name : ''; } catch { /* corrupt record has no trustworthy name */ }
        const a = document.createElement('a'); a.href = url; a.download = exportFilename(name, 'recovery'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>导出原始恢复记录</button><button disabled={!state.canWrite} onClick={() => localSession.createNewCopy()}>创建新副本（保留原记录）</button></>}
    </div>
    <div className="local-copy-controls">
      <select aria-label="本地副本" value={selected} onChange={e => setPicked(e.target.value)} disabled={!!blocked || !state.copies.length}>
        {!state.copies.some(c => c.localId === selected) && <option value={selected}>当前副本（等待保存）</option>}
        {state.copies.map(c => <option key={c.localId} value={c.localId}>{c.name} · {new Date(c.updatedAt).toLocaleString()} · {c.localId.slice(0, 6)}</option>)}
      </select><button disabled={!!blocked || !selected || selected === state.localId} onClick={async () => {
        try { await localSession.openCopy(selected); notify('已打开本地副本，编辑历史已重置'); } catch (e) { notify((e as Error).message, true); }
      }}>打开本地副本</button>
    </div><p>仅保存本浏览器、当前网址的已提交设计。清理站点数据或私密模式可能丢失，请定期导出JSON。导入会保留旧本地副本；缩放、预览和未提交文字不自动保存。并发保护：{state.lockMode === 'web-lock' ? '标签页写入锁 + 事务版本校验' : '事务版本校验（无标签页写入锁）'}。</p></div>
  </div>;
}
