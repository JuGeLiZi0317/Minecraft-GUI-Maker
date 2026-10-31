import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { guiScalePreview, type GuiScalePreview } from '../domain/guiScale';
import { currentScreen, editorStore } from '../editor/store';
import { PANEL_STYLE, NATIVE_PANEL_16, NATIVE_PANEL_32, type PanelStyle } from '../domain/panel';
import { useDismissOutside } from './useDismissOutside';

export function ScreenSettings({ preview, setPreview, notify, open, setOpen }: {
  preview: GuiScalePreview | null; setPreview: (value: GuiScalePreview | null) => void; notify: (text: string, error?: boolean) => void;
  open: boolean; setOpen: (open: boolean) => void;
}) {
  const size = useStore(editorStore, s => currentScreen(s).designSize);
  const root = useRef<HTMLDetailsElement>(null);
  useDismissOutside(root, open, () => setOpen(false));
  const background = useStore(editorStore, s => currentScreen(s).background);
  const busy = useStore(editorStore, s => !!s.gesture || !!s.blocked);
  const [resolution, setResolution] = useState('1920x1080'), [level, setLevel] = useState(0), [unicode, setUnicode] = useState(false);
  const [fw, fh] = resolution.split('x').map(Number);
  const sample = guiScalePreview(fw, fh, level, unicode);
  const change = (res: string, requested: number, force: boolean) => {
    const [w, h] = res.split('x').map(Number);
    setResolution(res); setLevel(requested); setUnicode(force);
    if (preview) setPreview(guiScalePreview(w, h, requested, force));
  };
  return <details ref={root} className="screen-settings" open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary onClick={e => { e.preventDefault(); setOpen(!open); }}>设计区与游戏 GUI Scale <span>{size.width} × {size.height} GUI px{preview ? ' · 只读预览中' : ''}</span></summary>
    <fieldset disabled={busy}><div className="screen-settings-heading"><strong>设计区与游戏 GUI Scale</strong><button type="button" className="popover-close" aria-label="关闭设计区与游戏 GUI Scale 设置" onClick={() => setOpen(false)}>✕</button></div><p>设计区宽高可在右侧属性栏的「画布尺寸」中调整。</p>
    <div className="screen-settings-row"><label>设计区底板<select aria-label="设计区底板" disabled={!!preview} value={background.kind === 'none' ? 'none' : background.style} onChange={e => {
      try { editorStore.getState().setPanel(e.target.value !== 'none', e.target.value as PanelStyle); notify('设计区底板已更新 · 可撤销'); } catch (error) { notify((error as Error).message, true); }
    }}><option value="none">无底板</option><option value={NATIVE_PANEL_16}>Panel · 发射器纹理衍生 16×</option>{background.kind === 'panel' && background.style === NATIVE_PANEL_32 && <option disabled value={NATIVE_PANEL_32}>旧项目：32× Panel（只读兼容）</option>}{background.kind === 'panel' && background.style === PANEL_STYLE && <option disabled value={PANEL_STYLE}>旧项目：自绘 Panel（只读兼容）</option>}</select></label></div>
    <p>Panel 默认覆盖整个设计区；取消组件选择后可在 Inspector 调整其位置和尺寸，最小8×8；素材由原版发射器纹理裁切拼接，九宫格边框为4像素。导出纹理为512/768/1024方形，设计区位于左上；超过1024不能导出纹理。整屏游戏背景由实现者决定。</p>
    <div className="screen-settings-row">
      <label>游戏帧缓冲<select aria-label="游戏帧缓冲" value={resolution} onChange={e => change(e.target.value, 0, unicode)}>{['1280x720', '1920x1080', '2560x1440', '3840x2160'].map(r => <option key={r} value={r}>{r.replace('x', ' × ')}</option>)}</select></label>
      <label>GUI Scale<select aria-label="游戏 GUI Scale" value={Math.min(level, sample.maxLevel)} onChange={e => change(resolution, Number(e.target.value), unicode)}>
        <option value="0">自动</option>{Array.from({ length: sample.maxLevel }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
      </select></label>
      <label className="unicode-check"><input type="checkbox" aria-label="强制 Unicode 偶数倍率" checked={unicode} onChange={e => change(resolution, Math.min(level, guiScalePreview(fw, fh, 0, e.target.checked).maxLevel), e.target.checked)}/>强制 Unicode（偶数倍率）</label>
      <button onClick={() => setPreview(preview ? null : sample)}>{preview ? '返回设计模式' : '预览游戏缩放'}</button>
    </div>
    <output data-testid="gui-scale-info">实际倍率 {sample.effectiveScale}× · 可用 GUI {sample.logicalWidth} × {sample.logicalHeight} · 此分辨率可选自动及1～{sample.maxLevel}</output>
    <p>按源码规则计算，预览整幅游戏窗口会适配网页显示；GUI Scale不同于编辑器Zoom，也不取浏览器DPR代替游戏倍率。预览只读，不改变组件坐标。</p>
    {preview && (size.width > preview.logicalWidth || size.height > preview.logicalHeight) && <p className="scale-warning" role="status">设计区大于当前可用GUI范围，居中后超出窗口的部分会被裁切；请调整设计尺寸或预览倍率。</p>}
    </fieldset>
  </details>;
}
