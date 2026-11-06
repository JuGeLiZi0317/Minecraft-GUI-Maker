import { useEffect, useRef, type ReactNode } from 'react';

/** Presentation only. Keep fields mounted so closing never commits or loses drafts. */
export function WorkspaceSettingsPopover({ children, blockly }: { children: ReactNode; blockly: boolean }) {
  const root = useRef<HTMLDetailsElement>(null);
  const close = () => { if (root.current) root.current.open = false; };
  useEffect(() => {
    const pointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    };
    // A child menu may hide its focused button. Escape still returns to the
    // visible entry even when the browser has already moved focus to body.
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && root.current?.open) {
        close(); root.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', pointer, true); document.removeEventListener('keydown', key); };
  }, []);
  return <details ref={root} className="workspace-settings">
    <summary title={blockly ? '选择系统字体、本机字体或已缓存字体' : '精确平移、网格间距和预览字体'} aria-label="工作区设置">{blockly ? '字体设置' : '画布设置'} <span aria-hidden="true">▾</span></summary>
    <div className="workspace-settings-popover" role="region" aria-label="工作区次级设置">
      <div className="workspace-settings-heading"><strong>{blockly ? '全局预览设置' : '画布与预览设置'}</strong><button type="button" aria-label="关闭工作区设置" onClick={() => { close(); root.current?.querySelector('summary')?.focus(); }}>×</button></div>
      {children}
    </div>
  </details>;
}
