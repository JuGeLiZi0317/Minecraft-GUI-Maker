import { useEffect, useRef } from 'react';

export type ImportFailure = { fileName: string; size: number; message: string };

/** A validation failure is a document-level error: show it once, never as a toast. */
export function ImportErrorDialog({ failure, onClose, onChoose }: { failure: ImportFailure; onClose: () => void; onChoose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null), root = useRef<HTMLElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const pointer = (event: PointerEvent) => { if (root.current && event.target instanceof Node && !root.current.contains(event.target)) onClose(); };
    window.addEventListener('keydown', key); document.addEventListener('pointerdown', pointer);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('pointerdown', pointer); };
  }, [onClose]);
  return <div className="dialog-backdrop">
    <section ref={root} className="dialog" role="alertdialog" aria-modal="false" aria-labelledby="import-error-title" aria-describedby="import-error-desc">
      <h2 id="import-error-title">无法导入设计 JSON</h2>
      <p id="import-error-desc">文件未通过 Schema 校验，当前设计未被修改。</p>
      <p className="dialog-meta">{failure.fileName} · {(failure.size / 1024).toFixed(1)} KB · 支持至 Schema 0.13.0</p>
      <details>
        <summary>技术详情</summary>
        <pre>{failure.message}</pre>
      </details>
      <div className="dialog-actions">
        <button onClick={onChoose}>选择其他文件</button>
        <button ref={closeRef} className="primary" onClick={onClose}>关闭</button>
      </div>
    </section>
  </div>;
}
