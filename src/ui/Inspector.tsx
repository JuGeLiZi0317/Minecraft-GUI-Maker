import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { CATALOG } from '../domain/catalog';
import { panelBounds } from '../domain/panel';
import { MAX_EDITABLE_DESIGN_SIZE } from '../domain/guiScale';
import { upgradeTextStyleEdit, displayText, editNode, literal } from '../domain/model';
import { parseProject, type GuiNode, type ScreenTabGroup, type TextSpec } from '../domain/schema';
import { currentScreen, screenById, editorStore } from '../editor/store';
import { useExportDraft } from '../exports/useExportDraft';
import { fontSession, previewCheckboxLayout } from '../render/previewFont';
import { confirmDeleteSelected } from './confirmDeletion';
import { multiLineLayout, type MultiLineTextNode } from '../render/multiLineText';
import { SelectionFields } from './SelectionFields';
import { isSelectionNode } from '../domain/selection';
import { numericError, type NumericConfig } from '../domain/numeric';
import { isNumericNode, type NumericNode } from '../render/numericWidgets';
import { isProgressNode, progressError, type ProgressNode } from '../domain/progress';
import { isStatusNode, type StatusNode } from '../domain/statusIndicator';
import { StatusFields } from './StatusFields';
import { allDescendants, isCollapsiblePanelNode, isContainerNode } from '../domain/collapsiblePanel';
import { isTreeViewNode, reconcileTreeViewProps, treeChildren, treeDescendantIds, treeViewError, type TreeItem, type TreeViewNode } from '../domain/treeView';

type TextureImageProps = Extract<Extract<GuiNode, { type: 'minecraft:image' }>['props'], { kind: 'texture' }>;
type SpriteImageProps = Extract<Extract<GuiNode, { type: 'minecraft:image' }>['props'], { kind: 'sprite' }>;
type ImageSourceProps = TextureImageProps | SpriteImageProps;
type ImageSourceCache = Map<string, Partial<Record<ImageSourceProps['kind'], ImageSourceProps>>>;

function NumericConstraints({ node, update }: { node: NumericNode; update: (change: (node: GuiNode) => GuiNode, dry?: boolean) => boolean }) {
  const [draft, setDraft] = useState({ min: String(node.props.min), max: String(node.props.max), step: String(node.props.step), initialValue: String(node.props.initialValue), numericType: node.props.numericType, decimals: String(node.props.format.decimals), unit: node.props.format.unit });
  const [error, setError] = useState(''), composing = useRef(false);
  const original = { min: String(node.props.min), max: String(node.props.max), step: String(node.props.step), initialValue: String(node.props.initialValue), numericType: node.props.numericType, decimals: String(node.props.format.decimals), unit: node.props.format.unit };
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const apply = (dry: boolean) => {
    if (!dirty) return;
    if (composing.current) throw new Error('请先完成输入法组合输入');
    if ([draft.min, draft.max, draft.step, draft.initialValue, draft.decimals].some(s => !s.trim())) throw new Error('数值配置不能为空');
    const config: NumericConfig = { min: Number(draft.min), max: Number(draft.max), step: Number(draft.step), initialValue: Number(draft.initialValue), numericType: draft.numericType, format: { decimals: Number(draft.decimals), unit: draft.unit } };
    const reason = numericError(config); if (reason) throw new Error(reason);
    if (!update(n => { if (isNumericNode(n)) Object.assign(n.props, config); return n; }, dry)) throw new Error('数值配置无效');
  };
  useExportDraft({ validate: () => apply(true), commit: () => apply(false) });
  return <section aria-label="数值约束" className="numeric-constraints" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}>
    <label className="field"><span>数值类型</span><select aria-label="数值类型" value={draft.numericType} onChange={e => setDraft({ ...draft, numericType: e.target.value as NumericConfig['numericType'] })}><option value="integer">整数</option><option value="decimal">小数</option></select></label>
    {([['min', '最小值'], ['max', '最大值'], ['step', '步进'], ['initialValue', '初始数值'], ['decimals', '显示小数位']] as const).map(([key, label]) => <label key={key} className="field"><span>{label}</span><input aria-label={label} inputMode="decimal" value={draft[key]} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setError(''); }}/></label>)}
    <label className="field"><span>数值单位</span><input aria-label="数值单位" maxLength={32} value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })}/></label>
    <button disabled={!dirty} onClick={() => { try { apply(true); apply(false); setError(''); } catch (e) { setError((e as Error).message); } }}>应用数值约束</button>
    {error && <p className="field-error" role="alert">{error}</p>}
    <p className="field-note">整组原子提交；最多6位小数。步进锚点为最小值，最大值额外作为可达端点；中点向较大值舍入。单位不进入可编辑数值串。</p>
  </section>;
}

function ProgressRangeConstraints({ node, update }: { node: ProgressNode; update: (change: (node: GuiNode) => GuiNode, dry?: boolean) => boolean }) {
  const original = { min: String(node.props.min), max: String(node.props.max), initialValue: String(node.props.initialValue) };
  const [draft, setDraft] = useState(original), [error, setError] = useState(''), composing = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const apply = (dry: boolean) => {
    if (!dirty) return;
    if (composing.current) throw new Error('请先完成输入法组合输入');
    if ([draft.min, draft.max, draft.initialValue].some(value => !value.trim())) throw new Error('数值配置不能为空');
    const config = { min: Number(draft.min), max: Number(draft.max), initialValue: Number(draft.initialValue) };
    const reason = progressError(config); if (reason) throw new Error(reason);
    if (!update(n => { if (isProgressNode(n)) Object.assign(n.props, config); return n; }, dry)) throw new Error('进度数值配置无效');
  };
  useExportDraft({ validate: () => apply(true), commit: () => apply(false) });
  return <section aria-label="进度数值范围" className="numeric-constraints" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}>
    {([['min', '最小值'], ['max', '最大值'], ['initialValue', '初始值']] as const).map(([key, label]) => <label key={key} className="field"><span>{label}</span><input aria-label={label} inputMode="decimal" value={draft[key]} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setError(''); }}/></label>)}
    <button disabled={!dirty} onClick={() => { try { apply(true); apply(false); setError(''); } catch (e) { setError((e as Error).message); } }}>应用数值范围</button>
    {error && <p className="field-error" role="alert">{error}</p>}
    <p className="field-note">最小值、最大值和初始值作为一组原子应用；不使用步进或量化。min=max 表示唯一值并显示为 100%。</p>
  </section>;
}

function TreeViewFields({ node, update }: { node: TreeViewNode; update: (change: (node: GuiNode) => GuiNode, dry?: boolean) => boolean }) {
  const editProps = (change: (props: TreeViewNode['props']) => TreeViewNode['props'], dry = false) => update(current => {
    if (!isTreeViewNode(current)) return current;
    const props = reconcileTreeViewProps(change(structuredClone(current.props)));
    const error = treeViewError(props); if (error) throw new Error(error);
    return { ...current, props };
  }, dry);
  const createId = () => {
    let index = 1, candidate = '';
    do { candidate = `tree_item_${index++}`; } while (node.props.items.some(item => item.id === candidate));
    return candidate;
  };
  const add = (parentId: string | null) => {
    const siblings = treeChildren(node.props.items, parentId), item: TreeItem = { id: createId(), label: literal('新树项'), parentId, order: siblings.length, selectable: true, disabled: false };
    editProps(props => ({ ...props, items: [...props.items, item], initialSelectedItemId: props.items.some(existing => existing.selectable && !existing.disabled) ? props.initialSelectedItemId : item.id }));
  };
  const remove = (itemId: string) => {
    const removeIds = new Set([itemId, ...treeDescendantIds(itemId, node.props.items)]);
    editProps(props => ({ ...props, items: props.items.filter(item => !removeIds.has(item.id)), initialExpandedIds: props.initialExpandedIds.filter(id => !removeIds.has(id)) }));
  };
  const reorder = (item: TreeItem, delta: -1 | 1) => {
    const siblings = treeChildren(node.props.items, item.parentId), index = siblings.findIndex(entry => entry.id === item.id), target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    const orders = new Map(siblings.map((entry, order) => [entry.id, order]));
    editProps(props => ({ ...props, items: props.items.map(entry => entry.parentId === item.parentId ? { ...entry, order: orders.get(entry.id)! } : entry) }));
  };
  const eligible = node.props.items.filter(item => item.selectable && !item.disabled);
  const parentsWithChildren = new Set(node.props.items.flatMap(item => item.parentId === null ? [] : [item.parentId]));
  return <section className="tree-view-fields" aria-label="树形视图配置">
    <TextFields label="控件名称" value={node.props.name} commit={(value, dry) => editProps(props => ({ ...props, name: value }), dry)}/>
    <label className="field"><span>初始选中</span><select aria-label="初始选中树项" value={node.props.initialSelectedItemId} onChange={event => editProps(props => ({ ...props, initialSelectedItemId: event.target.value }))}>{eligible.map(item => <option key={item.id} value={item.id}>{item.id} · {displayText(item.label)}</option>)}</select></label>
    <fieldset className="tree-item-list"><legend>树项（{node.props.items.length}/256）</legend>
      {node.props.items.map(item => {
        const siblings = treeChildren(node.props.items, item.parentId), index = siblings.findIndex(entry => entry.id === item.id);
        return <details key={item.id} className="tree-item-editor">
          <summary>{item.id} · {displayText(item.label)}</summary>
          <div className="section-body">
            <code>稳定 ID：{item.id}</code>
            <TextFields label="显示名称" value={item.label} commit={(value, dry) => editProps(props => ({ ...props, items: props.items.map(entry => entry.id === item.id ? { ...entry, label: value } : entry) }), dry)}/>
            <label className="field"><span>父项</span><select aria-label={`${item.id} 父项`} value={item.parentId ?? ''} onChange={event => {
              const parentId = event.target.value || null;
              if (parentId !== null && (parentId === item.id || treeDescendantIds(item.id, node.props.items).has(parentId))) return;
              const order = treeChildren(node.props.items, parentId).filter(entry => entry.id !== item.id).length;
              editProps(props => ({ ...props, items: props.items.map(entry => entry.id === item.id ? { ...entry, parentId, order } : entry) }));
            }}><option value="">根项</option>{node.props.items.filter(candidate => candidate.id !== item.id && !treeDescendantIds(item.id, node.props.items).has(candidate.id)).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.id} · {displayText(candidate.label)}</option>)}</select></label>
            <p className="field-note">同级顺序：{index + 1}/{siblings.length}</p>
            <div className="tree-row-actions"><button type="button" disabled={index === 0} onClick={() => reorder(item, -1)}>上移</button><button type="button" disabled={index === siblings.length - 1} onClick={() => reorder(item, 1)}>下移</button>
              <button type="button" disabled={node.props.items.length >= 256} onClick={() => add(item.id)}>添加子项</button><button type="button" disabled={node.props.items.length - treeDescendantIds(item.id, node.props.items).size < 1} onClick={() => remove(item.id)}>删除此项及子树</button></div>
            <label className="check"><input type="checkbox" aria-label={`${item.id} 允许选择`} checked={item.selectable} onChange={event => editProps(props => ({ ...props, items: props.items.map(entry => entry.id === item.id ? { ...entry, selectable: event.target.checked } : entry) }))}/>允许选择</label>
            <label className="check"><input type="checkbox" aria-label={`${item.id} 禁用`} checked={item.disabled} onChange={event => editProps(props => ({ ...props, items: props.items.map(entry => entry.id === item.id ? { ...entry, disabled: event.target.checked } : entry) }))}/>禁用</label>
          </div>
        </details>;
      })}
    </fieldset>
    <button type="button" disabled={node.props.items.length >= 256} onClick={() => add(null)}>添加根项</button>
    <div className="tree-initial-expanded"><span>初始展开</span>{[...parentsWithChildren].map(id => <label key={id} className="check"><input type="checkbox" aria-label={`${id} 初始展开`} checked={node.props.initialExpandedIds.includes(id)} onChange={event => editProps(props => ({ ...props, initialExpandedIds: event.target.checked ? [...props.initialExpandedIds, id] : props.initialExpandedIds.filter(value => value !== id) }))}/>{id}</label>)}</div>
    <p className="field-note">最多 256 项、16 层。展开只控制可见行，选择需单独确认；Tree View 事件是未绑定的实现意图。</p>
  </section>;
}

function MultiLineDiagnostics({ node }: { node: MultiLineTextNode }) {
  const font = useSyncExternalStore(fontSession.subscribe, fontSession.get);
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return <p>无法测量文字</p>;
  ctx.font = `9px ${font.family}`;
  const layout = multiLineLayout(node, text => ctx.measureText(text).width);
  return <p className="field-note" aria-label="多行文本布局诊断" aria-live="polite">浏览器近似：{layout.width} × {layout.height} px，{layout.lines.length} 行{layout.truncated ? '；已按最大行数截断（无省略号）' : ''}。预留区 {node.bounds.w} × {node.bounds.h} px；原生实际尺寸由游戏字体和内容决定。阴影及超宽单字可能超出预留区。</p>;
}

function MultiLineField({ label, value, onCommit }: { label: string; value: string | number; onCommit: (value: string, validateOnly?: boolean) => boolean | void }) {
  const [draft, setDraft] = useState(String(value)), [error, setError] = useState('');
  const field = useRef<HTMLTextAreaElement>(null), composing = useRef(false), applied = useRef(String(value));
  const apply = (dry: boolean) => {
    const text = field.current?.value ?? draft;
    if (text === applied.current) return;
    if (composing.current) throw new Error('请先完成输入法组合输入');
    if (onCommit(text, dry) === false) throw new Error('多行文字输入无效');
    if (!dry) applied.current = text;
  };
  useExportDraft({ validate: () => apply(true), commit: () => apply(false) });
  return <label className="field multiline-field"><span>{label}</span><textarea ref={field} aria-label={label} aria-invalid={!!error} rows={5} maxLength={4096} value={draft}
    onChange={e => { setDraft(e.target.value); setError(''); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
    onBlur={() => { try { apply(true); apply(false); setError(''); } catch (e) { setError((e as Error).message); } }}
    onKeyDown={e => { if (!e.nativeEvent.isComposing && e.key === 'Escape') { setDraft(String(value)); applied.current = String(value); setError(''); } }}/>
    {error && <small className="field-error" role="alert">{error}</small>}</label>;
}

function CheckboxDiagnostics({ node, screen }: { node: Extract<GuiNode, { type: 'minecraft:checkbox' }>; screen: { width: number; height: number } }) {
  const font = useSyncExternalStore(fontSession.subscribe, fontSession.get);
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return <p className="field-note" aria-live="polite">无法测量文字；溢出未检查。</p>;
  const layout = previewCheckboxLayout(ctx, node, font.family);
  const outside = node.bounds.x + layout.textX + layout.textWidth > screen.width || node.bounds.y + layout.textY < 0 || node.bounds.y + layout.textY + layout.textHeight > screen.height;
  return <div className="field-note" aria-live="polite" aria-label="复选框布局诊断">
    {layout.overflow && <p>文字超出参考边界（浏览器近似）。</p>}
    {outside && <p>文字超出设计区（浏览器近似）。</p>}
    {layout.truncated && <p>文字预览超过 1024 UTF-16 单元，已截断；设计数据保留原文。</p>}
    {!layout.overflow && !outside && !layout.truncated && <p>浏览器近似未检测到文字溢出；游戏内排版待验证。</p>}
  </div>;
}

function Field({ label, value, onCommit, type = 'text', min, max, unit }: { label: string; value: string | number; onCommit: (value: string, validateOnly?: boolean) => boolean | void; type?: string; min?: number; max?: number; unit?: string }) {
  const hintId = useId();
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null), applied = useRef(String(value)), composing = useRef(false);
  const apply = (validateOnly: boolean) => {
    const text = field.current?.value ?? draft;
    if (composing.current) throw new Error(`${label}：请先完成输入法组合输入`);
    if (text === applied.current) return;
    if (onCommit(text, validateOnly) === false) throw new Error(`${label}输入无效，请修正后再导出`);
    if (!validateOnly) { applied.current = text; setError(''); }
  };
  const validate = () => { try { apply(true); } catch (e) { setError((e as Error).message); throw e; } };
  const submit = () => { try { validate(); apply(false); } catch (e) { setError((e as Error).message); } };
  useExportDraft({ validate, commit: () => apply(false) });
  return <label className="field"><span>{label}{unit && <em className="field-unit">{unit}</em>}</span><input ref={field} aria-label={label} aria-invalid={!!error} aria-describedby={error ? `${hintId}-error` : unit ? `${hintId}-unit` : undefined} type={type} min={min} max={max} step={type === 'number' ? 1 : undefined} value={draft}
    onChange={e => { setDraft(e.target.value); setError(''); }} onBlur={submit}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
    onKeyDown={e => { if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); setDraft(String(value)); applied.current = String(value); setError(''); } }}/>
    {unit && <span id={`${hintId}-unit`} className="sr-only">单位：GUI 逻辑像素</span>}
    {error && <small id={`${hintId}-error`} className="field-error">{error}</small>}</label>;
}

function ImageSourceFields({ node, update, cache }: { node: Extract<GuiNode, { type: 'minecraft:image' }>; update: (change: (node: GuiNode) => GuiNode, validateOnly?: boolean) => boolean; cache: ImageSourceCache }) {
  const saved = cache.get(node.id) ?? {};
  saved[node.props.kind] = structuredClone(node.props);
  cache.set(node.id, saved);
  const commitTexture = (change: (props: TextureImageProps) => TextureImageProps, dry = false) => update(current => {
    if (current.type !== 'minecraft:image' || current.props.kind !== 'texture') return current;
    const props = change(current.props);
    if (!dry) cache.set(node.id, { ...cache.get(node.id), texture: structuredClone(props) });
    return { ...current, props };
  }, dry);
  const commitSprite = (change: (props: SpriteImageProps) => SpriteImageProps, dry = false) => update(current => {
    if (current.type !== 'minecraft:image' || current.props.kind !== 'sprite') return current;
    const props = change(current.props);
    if (!dry) cache.set(node.id, { ...cache.get(node.id), sprite: structuredClone(props) });
    return { ...current, props };
  }, dry);
  const sourceSelector = <label className="field"><span>图像来源</span><select aria-label="图像来源" value={node.props.kind} onChange={e => {
      const kind = e.target.value as ImageSourceProps['kind'];
      if (kind === node.props.kind) return;
      const texture: TextureImageProps = { kind: 'texture', resourceId: 'minecraft:textures/gui/container/dispenser.png', textureWidth: 256, textureHeight: 256, uv: { x: 0, y: 0, width: 256, height: 256 } };
      const sprite: SpriteImageProps = { kind: 'sprite', spriteId: 'minecraft:container/slot' };
      const current = cache.get(node.id) ?? {};
      const next = kind === 'texture' ? current.texture ?? texture : current.sprite ?? sprite;
      cache.set(node.id, { ...current, [node.props.kind]: structuredClone(node.props) });
      update(n => n.type === 'minecraft:image' ? { ...n, source: { ...n.source, member: kind === 'sprite' ? 'blitSprite' : 'blit' }, props: structuredClone(next) } : n);
    }}><option value="texture">Texture PNG</option><option value="sprite">GUI Sprite</option></select></label>;
  if (node.props.kind === 'texture') {
    const props = node.props;
    return <>{sourceSelector}
      <Field label="Texture ResourceLocation" value={props.resourceId} onCommit={(v, dry) => commitTexture(current => ({ ...current, resourceId: v.trim() }), dry)}/>
      <div className="geometry">{(['textureWidth', 'textureHeight'] as const).map(key => <Field key={`${key}-${props[key]}`} label={`逻辑贴图 ${key.endsWith('Width') ? '宽' : '高'}`} unit="px" type="number" min={1} value={props[key]} onCommit={(v, dry) => commitTexture(current => ({ ...current, [key]: v.trim() ? Number(v) : NaN }), dry)}/>)}</div>
      <div className="geometry">{(['x', 'y', 'width', 'height'] as const).map(key => <Field key={`${key}-${props.uv[key]}`} label={`UV ${key}`} unit="px" type="number" min={key === 'width' || key === 'height' ? 1 : 0} value={props.uv[key]} onCommit={(v, dry) => commitTexture(current => ({ ...current, uv: { ...current.uv, [key]: v.trim() ? Number(v) : NaN } }), dry)}/>)}</div>
      <p className="field-note">Texture 的 UV 按逻辑贴图尺寸定义，并映射到资源 PNG 实际像素；整个 UV 区域缩放至节点 W×H。预览需在资源检查中加载客户端 JAR 或覆盖包。</p>
    </>;
  }
  const props = node.props;
  return <>{sourceSelector}<Field label="GUI Sprite ID" value={props.spriteId} onCommit={(v, dry) => commitSprite(current => ({ ...current, spriteId: v.trim() }), dry)}/><p className="field-note">Sprite 首版仅支持 Minecraft GUI atlas ResourceLocation；按 atlas metadata 的 stretch/tile/nine-slice 规则映射至 W×H，不支持自定义 atlas。</p></>;
}
function ColorPicker({ value, commit }: { value: string; commit: (color: string) => boolean }) {
  const [draft, setDraft] = useState(value); const applied = useRef(value);
  useEffect(() => { setDraft(value); applied.current = value; }, [value]);
  const apply = () => { if (draft !== applied.current && commit(draft)) applied.current = draft; };
  useExportDraft({ validate: () => {}, commit: apply });
  return <label className="field"><span>可视取色</span><input aria-label="可视取色" type="color" value={'#' + draft.slice(3)} onChange={e => setDraft(draft.slice(0, 3) + e.target.value.slice(1).toUpperCase())} onBlur={apply}/><button type="button" onClick={apply}>应用颜色</button></label>;
}
function TextFields({ label, value, commit, multiline = false }: { label: string; value: TextSpec; commit: (value: TextSpec, validateOnly?: boolean) => boolean | void; multiline?: boolean }) {
  const Editor = multiline ? MultiLineField : Field;
  return <>
    <label className="field"><span>{label}类型</span><select aria-label={`${label}类型`} value={value.kind}
      onChange={e => commit(e.target.value === 'literal' ? literal(displayText(value)) : { kind: 'translate', key: 'gui.example', fallback: displayText(value) })}>
      <option value="literal">直接输入文字</option><option value="translate">使用翻译键</option>
    </select></label>
    {value.kind === 'literal' ? <Editor key={value.value} label={label} value={value.value} onCommit={(v, dry) => commit(literal(v), dry)}/>
      : <><Field key={value.key} label={`${label}翻译键`} value={value.key} onCommit={(v, dry) => commit({ ...value, key: v }, dry)}/>
        <Editor key={value.fallback} label={`${label}预览文字`} value={value.fallback} onCommit={(v, dry) => commit({ ...value, fallback: v }, dry)}/>
        <p className="field-note">设计器用这段文字预览；游戏中的实际文字由翻译键对应的语言文件决定。</p></>}
  </>;
}
export function ProjectName({ notify, disabled }: { notify: (message: string, error?: boolean) => void; disabled: boolean }) {
  const name = useStore(editorStore, s => s.doc.project.name);
  return <fieldset disabled={disabled}><Field key={name} label="项目名称" value={name} onCommit={(value, dry) => {
    const next = value.trim(); if (!next) throw new Error('项目名称不能为空');
    if (dry) { const doc = structuredClone(editorStore.getState().doc); doc.project.name = next; parseProject(JSON.stringify(doc)); }
    else { editorStore.getState().renameProject(next); notify('项目名称已更新'); }
  }}/></fieldset>;
}
function ScreenSizeControls({ notify, readOnly }: { notify: (message: string, error?: boolean) => void; readOnly: boolean }) {
  const screenId = useStore(editorStore, s => s.currentScreenId);
  const runtimePolicy = useStore(editorStore, s => s.doc.runtimePolicy);
  const size = useStore(editorStore, s => currentScreen(s).designSize);
  const [width, setWidth] = useState(String(size.width)), [height, setHeight] = useState(String(size.height));
  useEffect(() => { setWidth(String(size.width)); setHeight(String(size.height)); }, [size.width, size.height]);
  const changed = () => width !== String(size.width) || height !== String(size.height);
  const validate = () => {
    if (!changed()) return;
    const state = editorStore.getState(), w = Number(width), h = Number(height);
    if (state.currentScreenId !== screenId) throw new Error('Screen 已切换，无法提交旧草稿');
    if (state.blocked) throw new Error(state.blocked);
    if (![w, h].every(n => Number.isInteger(n) && n >= 1 && n <= MAX_EDITABLE_DESIGN_SIZE)) throw new Error('设计区宽高必须为1～8192的整数');
    const copy = structuredClone(state.doc); screenById(copy, state.currentScreenId).designSize = { width: w, height: h, unit: 'gui-px' };
    parseProject(JSON.stringify(copy));
  };
  const commit = () => { if (changed()) editorStore.getState().resizeScreen(Number(width), Number(height)); };
  useExportDraft({ validate, commit });
  return <section className="screen-size-controls" aria-label="画布尺寸">
    <h3>画布尺寸 <span>GUI px</span></h3>
    <fieldset disabled={readOnly}>
      <label className="check"><input type="checkbox" checked={!!runtimePolicy} onChange={e => { try { editorStore.getState().setRuntimePolicy(e.target.checked); } catch (err) { notify((err as Error).message, true); } }}/>项目运行策略：Esc/系统返回关闭，原生默认整屏背景</label>
      <p className="field-note">未勾选时保留旧项目“由实现者明确选择”的语义；此配置不改变设计区 PNG。</p>
      <div className="geometry">
        <label className="field"><span>宽<em className="field-unit">px</em></span><input aria-label="设计区宽" type="number" min={1} max={MAX_EDITABLE_DESIGN_SIZE} step={1} value={width} onChange={e => setWidth(e.target.value)} /></label>
        <label className="field"><span>高<em className="field-unit">px</em></span><input aria-label="设计区高" type="number" min={1} max={MAX_EDITABLE_DESIGN_SIZE} step={1} value={height} onChange={e => setHeight(e.target.value)} /></label>
      </div>
      <button disabled={!changed()} onClick={() => { try { validate(); commit(); notify('设计区尺寸已更新 · 可撤销'); } catch (e) { notify((e as Error).message, true); } }}>应用设计区尺寸</button>
    </fieldset>
    <p className="field-note">输入 1～8192 的整数；缩小时不能裁掉组件或 Panel。</p>
  </section>;
}

const nodeLabel = (node: GuiNode) => {
  const text = node.type === 'minecraft:creative-tab' ? node.props.name : node.type === 'minecraft:button' || node.type === 'minecraft:checkbox' ? displayText(node.props.message) : node.type === 'minecraft:string-widget' ? displayText(node.props.text) : node.type === 'minecraft:edit-box' ? displayText(node.props.narration) : node.type === 'minecraft:cycle-button' ? displayText(node.props.name) : '';
  return `${CATALOG[node.type].label}${text ? ` · ${text.slice(0, 48)}` : ''} (${node.id})`;
};
function TabEditingViews({ nodes, selections, setSelections, disabled }: { nodes: GuiNode[]; selections: Record<string, string>; setSelections: (value: Record<string, string>) => void; disabled: boolean }) {
  const tabs = nodes.filter((n): n is Extract<GuiNode, {type: 'minecraft:creative-tab'}> => n.type === 'minecraft:creative-tab' && !!n.props.groupId);
  const groups = [...new Set(tabs.map(n => n.props.groupId!))];
  if (!groups.length) return null;
  return <section className="tab-views" aria-label="标签编辑视图"><h3 className="section-title">标签编辑视图 <span>仅本次会话</span></h3>
    {groups.map(group => { const members = tabs.filter(n => n.props.groupId === group), current = members.find(n => n.id === selections[group]) ?? members.find(n => n.props.selected)!;
      return <div className="tab-group" key={group}><p className="field-note">组 {group} · 正在编辑：{current ? nodeLabel(current) : '无'}</p>
        {members.map(tab => <button key={tab.id} type="button" disabled={disabled} aria-pressed={tab.id === current?.id} onClick={() => setSelections({ ...selections, [group]: tab.id })}>编辑 {tab.props.name} · {tab.id}{tab.props.selected ? '（设计初始）' : ''}</button>)}
      </div>; })}
    <p className="field-note">仅切换画布编辑内容；测试从设计初态开始，导出始终使用设计初态。</p>
  </section>;
}

function TabGroupEditor({ node, nodes, notify }: { node: Extract<GuiNode, { type: 'minecraft:creative-tab' }>; nodes: GuiNode[]; notify: (message: string, error?: boolean) => void }) {
  const [group, setGroup] = useState(node.props.groupId ?? ''), [contents, setContents] = useState<string[]>(node.props.contentIds ?? []);
  return <div><label className="field"><span>标签组 ID（留空为独立标签）</span><input aria-label="标签组 ID" value={group} onChange={e => setGroup(e.target.value)} /></label>
    <p className="field-note">同组只选中一个标签；同组可共享组件。关联后显示由标签控制，原始可见性保留；先选择内容，再保存关联。</p>
    {nodes.filter(n => n.type !== 'minecraft:creative-tab').map(n => <label className="check" key={n.id}><input type="checkbox" aria-label={`标签内容 ${n.id}`} checked={contents.includes(n.id)} onChange={e => setContents(e.target.checked ? [...contents, n.id] : contents.filter(id => id !== n.id))}/>{nodeLabel(n)}</label>)}
    <button onClick={() => { try { editorStore.getState().configureTab(node.id, group.trim() || undefined, group.trim() ? contents : [], node.props.selected); notify('标签组已保存 · 可撤销'); } catch (e) { notify((e as Error).message, true); } }}>保存标签组</button>
  </div>;
}

function ScreenNavigationGroupEditor({ group, doc, currentNodeId, notify }: { group: ScreenTabGroup; doc: ReturnType<typeof editorStore.getState>['doc']; currentNodeId: string; notify: (message: string, error?: boolean) => void }) {
  const [draft, setDraft] = useState<ScreenTabGroup>(() => structuredClone(group));
  useEffect(() => setDraft(structuredClone(group)), [group]);
  const referenced = (tabId: string) => doc.screens.some(item => item.nodes.some(n => n.type === 'minecraft:creative-tab' && n.props.navigationGroupId === group.id && n.props.navigationTabId === tabId));
  const changeTab = (index: number, patch: Partial<ScreenTabGroup['tabs'][number]>) => setDraft(value => ({ ...value, tabs: value.tabs.map((tab, i) => i === index ? { ...tab, ...patch } : tab) }));
  return <div className="screen-navigation-group">
    <label className="field"><span>项目级导航组名称</span><input aria-label="Screen 导航组名称" maxLength={128} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
    <p className="field-note">标签定义在项目级维护；本 Screen 上的 CreativeTab 只保存组和标签 ID。数组顺序就是显示顺序。</p>
    {draft.tabs.map((tab, index) => <div className="screen-navigation-tab" key={tab.id}>
      <strong>{index + 1}. {tab.id}</strong>
      <label className="field"><span>标签名称</span><input aria-label={`导航标签名称 ${tab.id}`} maxLength={128} value={tab.name} onChange={e => changeTab(index, { name: e.target.value })}/></label>
      <label className="field"><span>目标 Screen</span><select aria-label={`导航目标 Screen ${tab.id}`} value={tab.targetScreenId} onChange={e => changeTab(index, { targetScreenId: e.target.value })}>{doc.screens.map(item => <option key={item.id} value={item.id}>{displayText(item.title)} · {item.id}</option>)}</select></label>
      <div className="screen-navigation-row-actions"><button type="button" disabled={index === 0} onClick={() => setDraft(value => { const tabs = [...value.tabs]; [tabs[index - 1], tabs[index]] = [tabs[index], tabs[index - 1]]; return { ...value, tabs }; })}>上移</button><button type="button" disabled={index === draft.tabs.length - 1} onClick={() => setDraft(value => { const tabs = [...value.tabs]; [tabs[index + 1], tabs[index]] = [tabs[index], tabs[index + 1]]; return { ...value, tabs }; })}>下移</button><button type="button" disabled={draft.tabs.length <= 1 || referenced(tab.id)} title={referenced(tab.id) ? '仍有 Screen 实例引用此标签' : '删除标签'} onClick={() => setDraft(value => ({ ...value, tabs: value.tabs.filter((_, i) => i !== index) }))}>删除</button></div>
    </div>)}
    <button type="button" disabled={draft.tabs.length >= 100 || !doc.screens.some(item => !draft.tabs.some(tab => tab.targetScreenId === item.id))} onClick={() => {
      const used = new Set([doc.project.id, ...doc.screens.flatMap(item => [item.id, ...item.nodes.map(n => n.id), ...item.behaviors.map(r => r.id), ...(item.screenTargets ?? []).map(t => t.id)]), ...(doc.screenTabGroups ?? []).flatMap(item => [item.id, ...item.tabs.map(tab => tab.id)]), ...draft.tabs.map(tab => tab.id)]);
      let n = 1; while (used.has(`navtab_${n}`)) n++;
      const targetScreenId = doc.screens.find(item => !draft.tabs.some(tab => tab.targetScreenId === item.id))!.id;
      setDraft(value => ({ ...value, tabs: [...value.tabs, { id: `navtab_${n}`, name: `标签 ${n}`, targetScreenId }] }));
    }}>添加导航标签</button>
    <button type="button" onClick={() => { try { editorStore.getState().saveScreenTabGroup(draft); notify('项目级标签组已保存 · 可撤销'); } catch (error) { notify((error as Error).message, true); } }}>保存项目级标签组</button>
    <p className="field-note">选中此组件代表的标签：{draft.tabs.find(tab => tab.id === (doc.screens.flatMap(item => item.nodes).find(n => n.id === currentNodeId && n.type === 'minecraft:creative-tab') as Extract<GuiNode, {type:'minecraft:creative-tab'}> | undefined)?.props.navigationTabId)?.name ?? '未选择'}</p>
  </div>;
}

function CreativeTabModeEditor({ node, doc, screenNodes, notify }: { node: Extract<GuiNode, { type: 'minecraft:creative-tab' }>; doc: ReturnType<typeof editorStore.getState>['doc']; screenNodes: GuiNode[]; notify: (message: string, error?: boolean) => void }) {
  const navigation = node.props.tabMode === 'screen-navigation';
  const group = doc.screenTabGroups?.find(item => item.id === node.props.navigationGroupId);
  const target = group?.tabs.find(tab => tab.id === node.props.navigationTabId);
  const firstAvailableTab = (groupId: string) => {
    const group = doc.screenTabGroups?.find(item => item.id === groupId);
    const used = new Set(screenNodes.filter(item => item.type === 'minecraft:creative-tab' && item.id !== node.id && item.props.tabMode === 'screen-navigation' && item.props.navigationGroupId === groupId).map(item => item.type === 'minecraft:creative-tab' ? item.props.navigationTabId : undefined));
    return group?.tabs.find(tab => !used.has(tab.id)) ?? group?.tabs[0];
  };
  return <div className="creative-tab-mode-editor">
    <label className="field"><span>标签模式</span><select aria-label="CreativeTab 模式" value={navigation ? 'screen-navigation' : 'content'} onChange={e => {
      try {
        if (e.target.value === 'content') { editorStore.getState().configureTab(node.id, undefined, [], node.props.selected); notify('已切换为 H2-B 内容切换模式'); }
        else if (!doc.entryScreenId) notify('请先在项目结构中明确选择项目入口 Screen，再启用导航标签', true);
        else if (doc.screenTabGroups?.length) { const firstGroup = doc.screenTabGroups[0], firstTab = firstAvailableTab(firstGroup.id); if (!firstTab) throw new Error('当前标签组没有可用标签，请先编辑组定义'); editorStore.getState().configureCreativeTabNavigation(node.id, firstGroup.id, firstTab.id); notify(`已关联项目级导航组 ${firstGroup.id}；请为此 Screen 选择对应标签`); }
        else { const id = editorStore.getState().createScreenTabGroup(node.id); notify(`已创建项目级导航组 ${id}；请补齐标签并为各 Screen 放置标签实例`); }
      } catch (error) { notify((error as Error).message, true); }
    }}><option value="content">内容切换（H2-B）</option><option value="screen-navigation">Screen 导航</option></select></label>
    {!navigation && <><TabGroupEditor node={node} nodes={screenNodes} notify={notify}/><p className="field-note">内容模式沿用 H2-B：同一 Screen 内切换关联组件的显示状态。</p></>}
    {navigation && <>
      {doc.screenTabGroups?.length ? <label className="field"><span>项目级标签组</span><select aria-label="Screen 导航组" value={node.props.navigationGroupId ?? ''} onChange={e => {
        const nextGroup = doc.screenTabGroups?.find(item => item.id === e.target.value), tab = nextGroup && firstAvailableTab(nextGroup.id); if (!nextGroup || !tab) return;
        try { editorStore.getState().configureCreativeTabNavigation(node.id, nextGroup.id, tab.id); } catch (error) { notify((error as Error).message, true); }
      }}>{doc.screenTabGroups.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label> : <p className="field-note">尚无项目级导航组。可从入口 Screen 上的 CreativeTab 创建。</p>}
      {group && <><label className="field"><span>此组件代表的导航标签</span><select aria-label="CreativeTab 导航标签" value={node.props.navigationTabId ?? ''} onChange={e => { try { editorStore.getState().configureCreativeTabNavigation(node.id, group.id, e.target.value); } catch (error) { notify((error as Error).message, true); } }}>{group.tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.name} → {tab.targetScreenId}</option>)}</select></label>
        <p className="field-note">目标：{target?.name ?? '无'} → {target?.targetScreenId ?? '无'}。当前页选中纹理由当前真实 Screen ID 推导。每页各放置一组对应的视觉标签实例。</p>
        <ScreenNavigationGroupEditor key={group.id} group={group} doc={doc} currentNodeId={node.id} notify={notify}/></>}
    </>}
  </div>;
}

function PanelGeometry({ notify, readOnly }: { notify: (message: string, error?: boolean) => void; readOnly: boolean }) {
  const screenId = useStore(editorStore, s => s.currentScreenId);
  const screen = useStore(editorStore, s => currentScreen(s));
  const current = panelBounds(screen);
  const [draft, setDraft] = useState(() => ({ x: String(current.x), y: String(current.y), w: String(current.w), h: String(current.h) }));
  const changed = () => (['x', 'y', 'w', 'h'] as const).some(k => draft[k] !== String(current[k]));
  const validate = () => {
    if (!changed()) return;
    const state = editorStore.getState(); if (state.currentScreenId !== screenId) throw new Error('Screen 已切换，无法提交旧草稿'); if (state.blocked) throw new Error(state.blocked);
    const values = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim() ? Number(v) : NaN])) as typeof current;
    const copy = structuredClone(state.doc), bg = screenById(copy, state.currentScreenId).background;
    if (bg.kind !== 'panel') throw new Error('请先启用 Panel');
    bg.bounds = values; if (!['0.10.0', '0.11.0', '0.12.0', '0.13.0', '0.14.0', '0.15.0', '0.16.0', '0.17.0', '0.18.0', '0.19.0', '0.20.0', '0.21.0', '0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0'].includes(copy.schemaVersion)) copy.schemaVersion = '0.9.0'; parseProject(JSON.stringify(copy));
  };
  const commit = () => { if (changed()) editorStore.getState().setPanelBounds(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v)])) as typeof current); };
  useExportDraft({ validate, commit });
  return <section className="inspector-section panel-geometry" aria-label="Panel 几何"><h3 className="section-title">PANEL <span>GUI px</span></h3><fieldset disabled={readOnly}><div className="section-body"><div className="geometry">
    {(['x', 'y', 'w', 'h'] as const).map(k => <label className="field" key={k}><span>Panel {k.toUpperCase()}<em className="field-unit">px</em></span><input aria-label={`Panel ${k.toUpperCase()}`} type="number" min={k === 'w' || k === 'h' ? 8 : 0} step={1} value={draft[k]} onChange={e => setDraft({ ...draft, [k]: e.target.value })}/></label>)}
    </div><button className="apply-button" onClick={() => { try { validate(); commit(); notify('Panel 几何已更新 · 可撤销'); } catch (e) { notify((e as Error).message, true); } }}>应用 Panel 几何</button>
    <p className="field-note">坐标相对设计区左上角，最小 8×8，必须在设计区内。将 Y 设为 28 并缩小高度，可预留顶部空间；不会自动布置标签。</p></div></fieldset></section>;
}

export function Inspector({ notify, readOnly = false, emptyControls, editTabs, setEditTabs, containerScroll, onMouseEnter, onMouseLeave, onPin }: { onMouseEnter?: () => void; onMouseLeave?: () => void; onPin?: () => void; notify: (message: string, error?: boolean) => void; readOnly?: boolean; emptyControls: ReactNode; editTabs: Record<string, string>; setEditTabs: (value: Record<string, string>) => void; containerScroll: Readonly<Record<string, number>> }) {
  const imageSourceCache = useRef<ImageSourceCache>(new Map()).current;
  const doc = useStore(editorStore, s => s.doc);
  const selected = useStore(editorStore, s => s.selected);
  const gesture = useStore(editorStore, s => s.gesture);
  const screen = useStore(editorStore, currentScreen);
  const screenId = useStore(editorStore, s => s.currentScreenId);
  const node = screen.nodes.find(n => n.id === selected);
  const update = (change: (node: GuiNode) => GuiNode, validateOnly = false) => {
    if (!node) return false;
    try {
      const current = editorStore.getState();
      if (current.currentScreenId !== screenId) throw new Error('Screen 已切换，无法提交旧草稿');
      if (current.blocked) throw new Error(current.blocked);
      if (validateOnly) {
        const copy = structuredClone(current.doc);
        screenById(copy, screenId).nodes = screenById(copy, screenId).nodes.map(n => n.id === node.id ? editNode(n, change) : n);
        if (screenById(copy, screenId).nodes.some(n => n.type === 'minecraft:status-indicator' && n.props.statuses.some(status => status.text?.kind === 'translate'))) { if (!['0.22.0', '0.23.0', '0.24.0', '0.25.0', '0.26.0'].includes(copy.schemaVersion)) copy.schemaVersion = '0.22.0'; copy.screenTabGroups ??= []; copy.entryScreenId ??= copy.screens[0].id; }
        upgradeTextStyleEdit(copy); parseProject(JSON.stringify(copy));
      } else { current.updateNode(node.id, change); notify('属性已更新'); }
      return true;
    } catch (e) { notify((e as Error).message, true); if (validateOnly) throw e; return false; }
  };
  const checkbox = (label: string, checked: boolean, change: (checked: boolean) => GuiNode): ReactNode => <label className="check"><input type="checkbox" aria-label={label} checked={checked} onChange={e => update(() => change(e.target.checked))}/>{label}</label>;
  return <aside className="inspector" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    <div className="panel-heading"><span>INSPECTOR</span><span className="tiny-dot"/></div>{onPin && <button className="sidebar-pin" onClick={onPin}>固定属性栏</button>}
    <ScreenSizeControls notify={notify} readOnly={readOnly || !!gesture}/>
    <TabEditingViews nodes={screen.nodes} selections={editTabs} setSelections={setEditTabs} disabled={readOnly || !!gesture}/>
    <div className="inspector-controls" hidden={!!node}>
      {emptyControls}
      {!node && <div className="document-summary"><span className="file-icon" aria-hidden="true">▤</span><div><strong>{doc.project.name}</strong><small>{screen.id} · {screen.designSize.width} × {screen.designSize.height} GUI px</small></div></div>}
      {!node && <div className="inspector-empty"><h3>未选择组件</h3><p>在画布或项目结构中选择组件，编辑位置、尺寸与属性。画布尺寸仍可在上方调整。</p></div>}
      {screen.background.kind === 'panel' && <PanelGeometry key={JSON.stringify([screen.background, screen.designSize])} notify={notify} readOnly={readOnly || !!gesture}/>}
    </div>
    {node && <fieldset disabled={!!gesture || readOnly} key={node.id}>
        <div className="selected-heading"><span className="node-glyph">{CATALOG[node.type].glyph}</span><div><h2>{CATALOG[node.type].label}</h2><code>{node.id}</code></div></div>
        {node.type !== 'minecraft:creative-tab' && (() => { const refs = screen.nodes.filter((n): n is Extract<GuiNode, { type: 'minecraft:creative-tab' }> => n.type === 'minecraft:creative-tab' && !!n.props.groupId && !!n.props.contentIds?.includes(node.id)); return refs.length ? <section className="inspector-section tab-reference" aria-label="标签内容归属"><h3 className="section-title">标签内容归属</h3><div className="section-body"><p className="field-note">{refs.length > 1 ? '同组共享内容：' : '关联标签：'}{refs.map(n => nodeLabel(n)).join('、')}</p><p className="field-note">选择相应标签，在其内容列表中勾选或取消关联并保存。</p></div></section> : null; })()}
        <details className="inspector-section" open>
          <summary><span>变换</span><span>GUI px</span></summary>
          <div className="section-body"><div className="geometry">
            {(node.type === 'minecraft:creative-tab' ? (['x', 'y'] as const) : (['x', 'y', 'w', 'h'] as const)).map(key => <Field key={`${key}-${node.bounds[key]}`} label={key.toUpperCase()} unit="px" type="number" min={key === 'w' || key === 'h' ? CATALOG[node.type].min[key] : 0} value={node.bounds[key]}
              onCommit={(raw, dry) => { const value = raw.trim() === '' ? NaN : Number(raw); return update(n => ({ ...n, bounds: { ...n.bounds, [key]: value } }), dry); }}/>)}</div>
            <p className="field-note">{node.parentContainerId ? '子节点 X/Y/W/H 使用父容器内容局部 GUI px；X/Y 从内容区左上角计算。' : node.type === 'minecraft:creative-tab' ? '固定 26×32 GUI px，位置为贴图左上角。' : node.type === 'minecraft:checkbox' ? 'W、H 仅为设计参考边界；原版尺寸由游戏字体、文字与构造最大宽度决定，不能强制按参考高度构造。' : '拖动边缘中点只调整宽或高；拖动右下或左上角手柄可同时调整宽高。拖左边或上边时，对侧位置保持不变。'} 超出所在坐标区域的精确输入会被拒绝。</p>
          </div>
        </details>
        {node.type !== 'minecraft:tree-view' && <section className="inspector-section"><h3 className="section-title">父容器</h3><div className="section-body">
          <label className="field"><span>容器</span><select aria-label="父容器" value={node.parentContainerId ?? ''} onChange={e => { try { editorStore.getState().setNodeContainer(node.id, e.target.value || undefined, containerScroll); notify('父容器已更新'); } catch (error) { notify((error as Error).message, true); } }}><option value="">Screen 根节点</option>{screen.nodes.filter(candidate => isContainerNode(candidate) && candidate.id !== node.id && !allDescendants(node.id, screen.nodes).some(child => child.id === candidate.id) && (!isContainerNode(node) || (node.type !== candidate.type && candidate.parentContainerId === undefined))).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.id}</option>)}</select></label>
          <p className="field-note">跨级转移保持屏幕位置；仅允许 Scrollable Panel 与 Collapsible Panel 交叉嵌套，最多两层。</p>
        </div></section>}
        <details className="inspector-section" open>
          <summary><span>外观与文案</span></summary>
          <div className="section-body">
          {node.type === 'minecraft:scrollable-panel' && <>
            <Field key={node.props.padding} label="内边距" type="number" min={0} max={16} value={node.props.padding} onCommit={(raw, dry) => { const value = raw.trim() ? Number(raw) : NaN; return update(n => n.type === 'minecraft:scrollable-panel' ? { ...n, props: { ...n.props, padding: value } } : n, dry); }}/>
            <Field key={node.props.contentHeight} label="内容高度" unit="px" type="number" min={1} max={8192} value={node.props.contentHeight} onCommit={(raw, dry) => { const value = raw.trim() ? Number(raw) : NaN; return update(n => n.type === 'minecraft:scrollable-panel' ? { ...n, props: { ...n.props, contentHeight: value } } : n, dry); }}/>
            <Field key={node.props.backgroundColor} label="背景色 ARGB" value={node.props.backgroundColor} onCommit={(value, dry) => update(n => n.type === 'minecraft:scrollable-panel' ? { ...n, props: { ...n.props, backgroundColor: value } } : n, dry)}/>
            <Field key={node.props.borderColor} label="边框色 ARGB" value={node.props.borderColor} onCommit={(value, dry) => update(n => n.type === 'minecraft:scrollable-panel' ? { ...n, props: { ...n.props, borderColor: value } } : n, dry)}/>
            <p className="field-note">子节点以内容局部坐标保存；滚动条占用右侧 8px。可与 Collapsible Panel 交叉嵌套一层。</p>
          </>}
          {isCollapsiblePanelNode(node) && <>
            <TextFields label="标题" value={node.props.title} commit={(value, dry) => update(n => isCollapsiblePanelNode(n) ? { ...n, props: { ...n.props, title: value } } : n, dry)}/>
            <Field key={node.props.headerHeight} label="标题栏高度" unit="px" type="number" min={16} max={40} value={node.props.headerHeight} onCommit={(raw, dry) => { const value = raw.trim() ? Number(raw) : NaN; return update(n => isCollapsiblePanelNode(n) ? { ...n, props: { ...n.props, headerHeight: value } } : n, dry); }}/>
            {checkbox('初始展开', node.props.initialExpanded, value => ({ ...node, props: { ...node.props, initialExpanded: value } }))}
            <p className="field-note">H 是固定的展开高度；收起时只显示标题栏。子项局部坐标和展开布局始终保留。</p>
            <Field key={node.props.headerColor} label="标题栏色 ARGB" value={node.props.headerColor} onCommit={(value, dry) => update(n => isCollapsiblePanelNode(n) ? { ...n, props: { ...n.props, headerColor: value } } : n, dry)}/>
            <Field key={node.props.backgroundColor} label="内容背景色 ARGB" value={node.props.backgroundColor} onCommit={(value, dry) => update(n => isCollapsiblePanelNode(n) ? { ...n, props: { ...n.props, backgroundColor: value } } : n, dry)}/>
            <Field key={node.props.textColor} label="标题文字色 ARGB" value={node.props.textColor} onCommit={(value, dry) => update(n => isCollapsiblePanelNode(n) ? { ...n, props: { ...n.props, textColor: value } } : n, dry)}/>
            {checkbox('边框', node.props.border, value => ({ ...node, props: { ...node.props, border: value } }))}
            {node.props.border && <Field key={node.props.borderColor} label="边框色 ARGB" value={node.props.borderColor} onCommit={(value, dry) => update(n => isCollapsiblePanelNode(n) ? { ...n, props: { ...n.props, borderColor: value } } : n, dry)}/>}
          </>}
          {node.type === 'minecraft:image' && <ImageSourceFields node={node} update={update} cache={imageSourceCache}/>}
          {node.type !== 'minecraft:fill' && node.type !== 'minecraft:image' && node.type !== 'minecraft:creative-tab' && node.type !== 'minecraft:fitting-multi-line-text-widget' && node.type !== 'minecraft:scrollable-panel' && ('textShadow' in node.props || node.type === 'minecraft:checkbox' || node.type === 'minecraft:string-widget') && checkbox('文字阴影', 'textShadow' in node.props ? node.props.textShadow ?? false : false, (v): GuiNode => {
            if (node.type === 'minecraft:checkbox' || node.type === 'minecraft:string-widget') return { ...node, props: { ...node.props, textShadow: v } } as GuiNode;
            const next = structuredClone(node); if ('textShadow' in next.props) next.props.textShadow = v; return next;
          })}
          {isSelectionNode(node) && <SelectionFields key={JSON.stringify([node.id, node.props.name, node.props.options, node.props.initialSelectedOptionId, node.type === 'minecraft:radio-group' ? node.props.orientation : node.props.visibleRows])} node={node} update={update}/>}
          {isTreeViewNode(node) && <TreeViewFields node={node} update={update}/>}
          {isNumericNode(node) && <>
            <TextFields label="控件名称" value={node.props.name} commit={(v, dry) => update(n => { if (isNumericNode(n)) n.props.name = v; return n; }, dry)}/>
            <NumericConstraints key={JSON.stringify([node.id, node.props.min, node.props.max, node.props.step, node.props.initialValue, node.props.numericType, node.props.format])} node={node} update={update}/>
            {node.type === 'minecraft:numeric-input' && <>
              {checkbox('显示边框', node.props.bordered, v => ({ ...node, props: { ...node.props, bordered: v } }))}
              {checkbox('可编辑初态', node.props.editable, v => ({ ...node, props: { ...node.props, editable: v } }))}
              <Field key={node.props.errorMessage} label="数值错误说明" value={node.props.errorMessage} onCommit={(v, dry) => update(n => n.type === 'minecraft:numeric-input' ? { ...n, props: { ...n.props, errorMessage: v } } : n, dry)}/>
              <p className="field-note">交互预览中 Enter 或失焦提交。非法提交保留草稿和上次有效值；原生 EditBox 需要实现数值适配器。事件 numeric-commit 仅为未绑定业务的强类型意图。</p>
            </>}
            {node.type === 'minecraft:slider' && <>
              {checkbox('显示当前值', node.props.showValue, v => ({ ...node, props: { ...node.props, showValue: v } }))}
              <p className="field-note">水平单值滑块；原生8px手柄，最小宽9px。左右键每次一个合法值，按键消费；鼠标就近量化，释放不重复发事件。阴影关闭时游戏端须自定义文字绘制；不能假设原生有 setter。事件 slider-change 只报告有效变化。</p>
            </>}
          </>}
          {node.type === 'minecraft:multi-line-text-widget' && <>
            <TextFields multiline label="多行文字" value={node.props.text} commit={(v, dry) => update(n => n.type === 'minecraft:multi-line-text-widget' ? { ...n, props: { ...n.props, text: v } } : n, dry)}/>
            <Field key={`mw-${node.props.maxWidth}`} label="最大宽度" type="number" min={1} value={node.props.maxWidth} onCommit={(v, dry) => update(n => n.type === 'minecraft:multi-line-text-widget' ? { ...n, props: { ...n.props, maxWidth: v.trim() ? Number(v) : NaN } } : n, dry)}/>
            <Field key={`mr-${node.props.maxRows}`} label="最大行数" type="number" min={1} value={node.props.maxRows} onCommit={(v, dry) => update(n => n.type === 'minecraft:multi-line-text-widget' ? { ...n, props: { ...n.props, maxRows: v.trim() ? Number(v) : NaN } } : n, dry)}/>
            <label className="field"><span>对齐</span><select aria-label="对齐" value={node.props.align} onChange={e => update(n => n.type === 'minecraft:multi-line-text-widget' ? { ...n, props: { ...n.props, align: e.target.value as 'left' | 'center' } } : n)}><option value="left">左对齐</option><option value="center">居中</option></select></label>
            <p className="field-note">W 是换行最大宽度，H = 最大行数 × 9；高度 Resize 按 9 px 步进。精确 H 须为 9 的倍数。居中相对实际文本宽度；阴影关闭时游戏端须自定义文字绘制；不能假设原生有 setter。显示文本不接受输入、不滚动、不自动旁白。</p>
            <MultiLineDiagnostics node={node}/>
          </>}
          {node.type === 'minecraft:fitting-multi-line-text-widget' && <>
            <TextFields multiline label="只读文本" value={node.props.text} commit={(v, dry) => update(n => n.type === 'minecraft:fitting-multi-line-text-widget' ? { ...n, props: { ...n.props, text: v } } : n, dry)}/>
            {checkbox('文字阴影', node.props.textShadow ?? true, value => ({ ...node, props: { ...node.props, textShadow: value } }))}
            <p className="field-note">视窗 W×H 是固定 viewport，不是文本最大宽度/最大行数。原生固定 9px 行高，内容总行数不截断；overflow 时滚动，设计态不接收滚动输入。</p>
            <p className="field-note">原生滚动条位于 Widget 右侧并可能向 bounds.w 外延 8px；仅有溢出时显示。游戏用原生焦点框与滚动条 Sprite，网页和 PNG 使用中性近似。滚动初始位置固定为顶部。</p>
          </>}
          {node.type === 'minecraft:progress-bar' && <>
            <ProgressRangeConstraints key={JSON.stringify([node.id, node.props.min, node.props.max, node.props.initialValue])} node={node} update={update}/>
            <label className="field"><span>填充方向</span><select aria-label="填充方向" value={node.props.direction} onChange={e => update(n => n.type === 'minecraft:progress-bar' ? { ...n, props: { ...n.props, direction: e.target.value as typeof n.props.direction } } : n)}><option value="left-to-right">从左到右</option><option value="right-to-left">从右到左</option><option value="bottom-to-top">从下到上</option><option value="top-to-bottom">从上到下</option></select></label>
            {(['backgroundColor', 'foregroundColor', 'borderColor'] as const).map((key, index) => <Field key={`${key}-${node.props[key]}`} label={['背景色', '前景色', '边框色'][index]} value={node.props[key]} onCommit={(v, dry) => update(n => n.type === 'minecraft:progress-bar' ? { ...n, props: { ...n.props, [key]: v } } : n, dry)}/>)}
            {checkbox('显示边框', node.props.border, v => ({ ...node, props: { ...node.props, border: v } }))}
            <Field key={`pt-${node.props.borderThickness}`} label="边框厚度" type="number" min={0} max={16} value={node.props.borderThickness} onCommit={(v, dry) => update(n => n.type === 'minecraft:progress-bar' ? { ...n, props: { ...n.props, borderThickness: v.trim() ? Number(v) : NaN } } : n, dry)}/>
            <label className="field"><span>显示文字</span><select aria-label="显示文字" value={node.props.display} onChange={e => update(n => n.type === 'minecraft:progress-bar' ? { ...n, props: { ...n.props, display: e.target.value as typeof n.props.display } } : n)}><option value="none">不显示</option><option value="percentage">百分比</option><option value="value">初始数值</option></select></label>
            {checkbox('文字阴影', node.props.textShadow, v => ({ ...node, props: { ...node.props, textShadow: v } }))}
            <p className="field-note">只读绘制节点，不响应运行时输入。min=max 时按 100% 显示；运行数据来源由游戏实现者接入，设计初值不代表业务绑定。百分比按四舍五入取整。Minecraft 原生没有通用 ProgressBar Widget，使用 GuiGraphics.fill 绘制。</p>
          </>}
          {isStatusNode(node) && <>
            <TextFields label="控件名称" value={node.props.name} commit={(v, dry) => update(n => { if (isStatusNode(n)) n.props.name = v; return n; }, dry)}/>
            <StatusFields key={JSON.stringify([node.id, node.props.statuses, node.props.initialStatusId])} node={node as StatusNode} update={update}/>
            <label className="field"><span>指示符形状</span><select aria-label="指示符形状" value={node.props.shape} onChange={e => update(n => isStatusNode(n) ? { ...n, props: { ...n.props, shape: e.target.value as typeof n.props.shape } } : n)}><option value="circle">圆形</option><option value="square">方形</option></select></label>
            {checkbox('显示状态文字', node.props.showLabel, value => ({ ...node, props: { ...node.props, showLabel: value } }))}
            <p className="field-note">状态指示器仅绘制初始状态，不接受游戏输入。状态颜色使用 #AARRGGBB；至少应显示文字或在 Screen 旁白中提供状态说明。运行时状态由实现者设置并触发重绘，无变量绑定或服务端同步。</p>
          </>}
          {node.type === 'minecraft:creative-tab' && <><Field key={node.props.name} label="标签名称" value={node.props.name} onCommit={(v, dry) => update(n => n.type === 'minecraft:creative-tab' ? { ...n, props: { ...n.props, name: v } } : n, dry)}/><label className="field"><span>顶部列</span><select aria-label="顶部列" value={node.props.column} onChange={e => update(n => n.type === 'minecraft:creative-tab' ? { ...n, props: { ...n.props, column: Number(e.target.value) } } : n)}>{[1,2,3,4,5,6,7].map(i => <option key={i} value={i}>{i}</option>)}</select></label>{node.props.tabMode !== 'screen-navigation' && <label className="check"><input type="checkbox" aria-label="初始选中" checked={node.props.selected} onChange={e => { if (!e.target.checked && node.props.groupId) { notify('同组必须有一个初始选中标签，请选择其他标签', true); return; } try { if (node.props.groupId && e.target.checked) editorStore.getState().configureTab(node.id, node.props.groupId, node.props.contentIds ?? [], true); else update(n => n.type === 'minecraft:creative-tab' ? { ...n, props: { ...n.props, selected: e.target.checked } } : n); } catch (error) { notify((error as Error).message, true); } }}/>初始选中</label>}{node.props.tabMode === 'screen-navigation' && <><p className="field-note">{doc.screens.flatMap(s => s.nodes).some(n => n.type === 'minecraft:creative-tab' && n.id !== node.id && n.props.navigationGroupId === node.props.navigationGroupId && n.props.navigationTabId === node.props.navigationTabId && (n.props.column !== node.props.column || n.bounds.x !== node.bounds.x || n.bounds.y !== node.bounds.y)) ? '⚠ 同一导航标签在其他页面的位置或列号有覆盖差异。' : '此导航标签各页布局一致。'}</p><button onClick={() => { try { editorStore.getState().syncNavigationTabLayout(node.id); notify('同一导航标签布局已同步至各页 · 可撤销'); } catch (e) { notify((e as Error).message, true); } }}>将此标签布局同步至各页</button><p className="field-note">显式同步位置与列号，可撤销；后续单页修改仍独立，不建立隐式继承。</p></>}<CreativeTabModeEditor node={node} doc={doc} screenNodes={screen.nodes} notify={notify}/><p className="field-note">名称不绘制在 Sprite 上；Screen 导航只在交互预览开启时生效。</p></>}
          {node.type === 'minecraft:button' && <><TextFields label="按钮文字" value={node.props.message} commit={(v, dry) => update(n => n.type === 'minecraft:button' ? { ...n, props: { ...n.props, message: v } } : n, dry)}/>
            <TextFields label="提示文字" value={node.props.tooltip ?? literal('')} commit={(v, dry) => update(n => n.type === 'minecraft:button' ? { ...n, props: { ...n.props, tooltip: v } } : n, dry)}/></>}
          {node.type === 'minecraft:checkbox' && <>
            <TextFields label="复选框文字" value={node.props.message} commit={(v, dry) => update(n => n.type === 'minecraft:checkbox' ? { ...n, props: { ...n.props, message: v } } : n, dry)}/>
            <Field key={node.props.maxWidth} label="构造最大宽度" unit="px" type="number" min={1} value={node.props.maxWidth} onCommit={(v, dry) => update(n => n.type === 'minecraft:checkbox' ? { ...n, props: { ...n.props, maxWidth: v.trim() ? Number(v) : NaN } } : n, dry)}/>
            {checkbox('初始勾选', node.props.selected, v => ({ ...node, props: { ...node.props, selected: v } }))}
            <p className="field-note">W、H 是设计参考边界；构造最大宽度独立设置，H 不是原版构造参数。文字排版与溢出以浏览器字体近似，游戏内尺寸待验证。</p>
            <p className="field-note">浅色底板上的深灰文字仅是可读性设计预览。原版 Checkbox 固定浅色文字，游戏中需要开发者自定义绘制才能实现深灰效果。</p>
            <CheckboxDiagnostics node={node} screen={screen.designSize}/>
          </>}
          {node.type === 'minecraft:cycle-button' && <>
            <TextFields label="选项名称" value={node.props.name} commit={(v, dry) => update(n => n.type === 'minecraft:cycle-button' ? { ...n, props: { ...n.props, name: v } } : n, dry)}/>
            <Field key={JSON.stringify(node.props.options)} label="选项 JSON" value={JSON.stringify(node.props.options)} onCommit={(v, dry) => { let options: typeof node.props.options; try { options = JSON.parse(v); } catch { throw new Error('选项 JSON 语法错误'); } return update(n => n.type === 'minecraft:cycle-button' ? { ...n, props: { ...n.props, options } } : n, dry); }}/>
            <label className="field"><span>初始选项</span><select aria-label="初始选项" value={node.props.initialOptionId} onChange={e => update(n => n.type === 'minecraft:cycle-button' ? { ...n, props: { ...n.props, initialOptionId: e.target.value } } : n)}>{node.props.options.map(o => <option key={o.id} value={o.id}>{o.id} · {displayText(o.text)}</option>)}</select></label>
            <label className="field"><span>显示格式</span><select aria-label="显示格式" value={node.props.displayFormat} onChange={e => update(n => n.type === 'minecraft:cycle-button' ? { ...n, props: { ...n.props, displayFormat: e.target.value as 'value-only' | 'name-and-value' } } : n)}><option value="value-only">仅显示值</option><option value="name-and-value">名称和值</option></select></label>
          </>}
          {node.type === 'minecraft:edit-box' && <>
            <TextFields label="叙述标签" value={node.props.narration} commit={(v, dry) => update(n => n.type === 'minecraft:edit-box' ? { ...n, props: { ...n.props, narration: v } } : n, dry)}/>
            <Field key={`value-${node.props.value}`} label="输入初值" value={node.props.value} onCommit={(v, dry) => update(n => n.type === 'minecraft:edit-box' ? { ...n, props: { ...n.props, value: v } } : n, dry)}/>
            <Field key={node.props.maxLength} label="最大长度" type="number" min={0} value={node.props.maxLength} onCommit={(v, dry) => update(n => n.type === 'minecraft:edit-box' ? { ...n, props: { ...n.props, maxLength: v.trim() ? Number(v) : NaN } } : n, dry)}/>
            <TextFields label="占位文字" value={node.props.hint ?? literal('')} commit={(v, dry) => update(n => n.type === 'minecraft:edit-box' ? { ...n, props: { ...n.props, hint: v } } : n, dry)}/>
            {checkbox('显示边框', node.props.bordered, v => ({ ...node, props: { ...node.props, bordered: v } }))}
            {checkbox('可编辑初态', node.props.editable, v => ({ ...node, props: { ...node.props, editable: v } }))}
          </>}
          {node.type === 'minecraft:string-widget' && <>
            <TextFields label="标签文字" value={node.props.text} commit={(v, dry) => update(n => n.type === 'minecraft:string-widget' ? { ...n, props: { ...n.props, text: v } } : n, dry)}/>
            <label className="field"><span>对齐</span><select aria-label="对齐" value={node.props.align} onChange={e => update(n => n.type === 'minecraft:string-widget' ? { ...n, props: { ...n.props, align: e.target.value as 'left' | 'center' | 'right' } } : n)}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
          </>}
          {(node.type !== 'minecraft:creative-tab' && node.type !== 'minecraft:image' && node.type !== 'minecraft:scrollable-panel' && 'color' in node.props) && <><Field key={node.props.color} label={node.type === 'minecraft:progress-bar' ? '文字色 ARGB' : '颜色 ARGB'} value={node.props.color ?? (node.type === 'minecraft:checkbox' ? '#FFE0E0E0' : '#FFE0E8F1')} onCommit={(v, dry) => update(n => { if ('color' in n.props && n.type !== 'minecraft:fill') n.props.color = v; return n; }, dry)}/>
            {node.type === 'minecraft:checkbox' && <button onClick={() => update(n => { if (n.type === 'minecraft:checkbox') delete n.props.color; return n; })}>使用原生浅灰文字</button>}<ColorPicker key={node.id} value={node.props.color ?? '#FFE0E0E0'} commit={color => update(n => { if ('color' in n.props && n.type !== 'minecraft:fill') n.props.color = color; return n; })}/>
            <p className="field-note">系统取色器支持可视选择；透明度保留，使用 ARGB 前两位修改。</p><div className="color-preview"><span style={{ background: `#${(node.props.color ?? '#FFE0E0E0').slice(3)}${(node.props.color ?? '#FFE0E0E0').slice(1, 3)}` }}/><small>格式 #AARRGGBB · 前两位为透明度。按 Enter 或离开输入框应用。</small></div></>}
          </div>
        </details>
        <details className="inspector-section" open>
          <summary><span>初始状态</span></summary>
          <div className="section-body">{checkbox('可见初态', node.state.visible, visible => { const next = structuredClone(node); next.state.visible = visible; return next; })}
            {'enabled' in node.state && checkbox('启用初态', node.state.enabled, enabled => { const next = structuredClone(node); if ('enabled' in next.state) next.state.enabled = enabled; return next; })}
            <p className="field-note">编辑模式保留隐藏组件的淡色轮廓，便于选择；不执行游戏交互。</p>
          </div>
        </details>
        <details className="inspector-section source-info">
          <summary><span>来源与限制</span></summary>
          <div className="section-body"><span className="source-tag">{node.source.category}</span><code>{node.source.className}</code><p>{CATALOG[node.type].evidence}</p><p>浏览器近似预览，不执行 Java Widget；来源表示设计规格对应的已审计 API。</p></div>
        </details>
        <button className="delete-button" onClick={() => { try { confirmDeleteSelected(); } catch (error) { notify((error as Error).message, true); } }}>删除组件</button>
      </fieldset>}
  </aside>;
}
