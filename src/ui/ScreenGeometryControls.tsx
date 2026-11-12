import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { panelBounds } from '../domain/panel';
import { MAX_EDITABLE_DESIGN_SIZE } from '../domain/guiScale';
import { prepareScreenGeometry } from '../domain/screenGeometry';
import { currentScreen, editorStore } from '../editor/store';
import { useExportDraft } from '../exports/useExportDraft';

export function ScreenGeometryControls({ notify, readOnly, showPanel }: { notify: (message: string, error?: boolean) => void; readOnly: boolean; showPanel: boolean }) {
  const screen = useStore(editorStore, currentScreen), runtimePolicy = useStore(editorStore, state => state.doc.runtimePolicy);
  const panel = panelBounds(screen);
  const original = { width: String(screen.designSize.width), height: String(screen.designSize.height), x: String(panel.x), y: String(panel.y), w: String(panel.w), h: String(panel.h) };
  const [draft, setDraft] = useState(original), [error, setError] = useState('');
  const signature = JSON.stringify(original);
  useEffect(() => { setDraft(JSON.parse(signature)); setError(''); }, [signature, screen.id]);
  const changed = JSON.stringify(draft) !== signature;
  const panelChanged = (['x', 'y', 'w', 'h'] as const).some(key => draft[key] !== original[key]);
  const bounds = () => Object.fromEntries((['x', 'y', 'w', 'h'] as const).map(key => [key, draft[key].trim() ? Number(draft[key]) : NaN])) as typeof panel;
  const validate = () => {
    if (!changed) return;
    const state = editorStore.getState();
    if (state.currentScreenId !== screen.id) throw new Error('Screen 已切换，请重新填写几何草稿');
    if (state.blocked) throw new Error(state.blocked);
    try { prepareScreenGeometry(state.doc, screen.id, Number(draft.width), Number(draft.height), panelChanged ? bounds() : undefined); }
    catch (cause) { setError((cause as Error).message); throw cause; }
  };
  const commit = () => { if (changed) editorStore.getState().setScreenGeometry(Number(draft.width), Number(draft.height), panelChanged ? bounds() : undefined); };
  useExportDraft({ validate, commit });
  const apply = () => { try { validate(); commit(); setError(''); notify('设计区与 Panel 几何已更新 · 可撤销'); } catch (cause) { notify((cause as Error).message, true); } };
  const cancel = () => { setDraft(original); setError(''); notify('已取消几何草稿，保留已保存的设计区与 Panel'); };
  const input = (key: keyof typeof draft, label: string, min: number) => <label className="field" key={key}><span>{label}<em className="field-unit">px</em></span><input aria-label={label} type="number" min={min} max={MAX_EDITABLE_DESIGN_SIZE} step={1} value={draft[key]} onChange={event => { setDraft(value => ({ ...value, [key]: event.target.value })); setError(''); }}/></label>;
  return <>
    <section className="screen-size-controls" aria-label="画布尺寸">
      <h3>画布尺寸 <span>GUI px</span></h3>
      <fieldset disabled={readOnly}>
        <label className="check"><input type="checkbox" checked={!!runtimePolicy} onChange={event => { try { editorStore.getState().setRuntimePolicy(event.target.checked); } catch (cause) { notify((cause as Error).message, true); } }}/>项目运行策略：Esc/系统返回关闭，原生默认整屏背景</label>
        <p className="field-note">未勾选时保留旧项目“由实现者明确选择”的语义；此配置不改变设计区 PNG。</p>
        <div className="geometry">{input('width', '设计区宽', 1)}{input('height', '设计区高', 1)}</div>
        <button disabled={!changed} onClick={apply}>应用设计区尺寸</button>
        <button disabled={!changed} onClick={cancel}>取消几何草稿</button>
      </fieldset>
      {error && <p className="field-error" role="alert">{error}</p>}
      <p className="field-note">设计区与 Panel 几何共同校验、一次应用；缩小时请同时调整超界的 Panel，组件不会自动裁切。</p>
    </section>
    {screen.background.kind === 'panel' && <section hidden={!showPanel} className="inspector-section panel-geometry" aria-label="Panel 几何"><h3 className="section-title">PANEL <span>GUI px</span></h3><fieldset disabled={readOnly}><div className="section-body"><div className="geometry">
      {(['x', 'y', 'w', 'h'] as const).map(key => input(key, `Panel ${key.toUpperCase()}`, key === 'w' || key === 'h' ? 8 : 0))}
    </div><button className="apply-button" disabled={!changed} onClick={apply}>应用 Panel 几何</button>
      <p className="field-note">坐标相对设计区左上角，最小 8×8，必须在设计区内。应用时同时保存上方设计区尺寸草稿。</p>
    </div></fieldset></section>}
  </>;
}
