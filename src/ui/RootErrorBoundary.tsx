import React from 'react';

type State = { error: Error | null };

/** Last-resort boundary: a render failure must show a recoverable diagnostic, never a blank page. */
export class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: unknown): State { return { error: error instanceof Error ? error : new Error(String(error)) }; }
  componentDidCatch(error: unknown, info: React.ErrorInfo) { console.error('GUI Maker render failure', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    const error = this.state.error;
    return <main className="app-crash" role="alert">
      <div className="app-crash-card">
        <small>GUI Maker · 恢复界面</small>
        <h1>页面渲染失败</h1>
        <p>设计数据仍在本地；这不是空白页。请先复制错误信息，再尝试重新载入。</p>
        <pre>{error.name}: {error.message}</pre>
        <div className="app-crash-actions">
          <button type="button" className="primary" onClick={() => location.reload()}>重新载入</button>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(`${error.stack ?? error.message}`)}>复制错误</button>
        </div>
      </div>
    </main>;
  }
}
