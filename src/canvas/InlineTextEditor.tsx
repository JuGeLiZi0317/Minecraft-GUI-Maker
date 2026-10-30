import { useEffect, useRef, useState } from 'react';
import { displayText } from '../domain/model';
import { parseProject, type GuiNode, type TextSpec } from '../domain/schema';
import { useExportDraft } from '../exports/useExportDraft';
import { editorStore } from '../editor/store';

export const editableText = (node: GuiNode): string | null => {
  if (node.type === 'minecraft:button') return displayText(node.props.message);
  if (node.type === 'minecraft:string-widget') return displayText(node.props.text);
  if (node.type === 'minecraft:edit-box') return node.props.value;
  if (node.type === 'minecraft:checkbox') return displayText(node.props.message);
  if (node.type === 'minecraft:cycle-button') return displayText(node.props.options.find(option => option.id === node.props.initialOptionId)!.text);
  return null;
};
const replaceDisplay = (text: TextSpec, value: string): TextSpec => text.kind === 'literal'
  ? { ...text, value } : { ...text, fallback: value };

export function InlineTextEditor({ node, left, top, width, height, zoom, close }: {
  node: GuiNode; left: number; top: number; width: number; height: number; zoom: number; close: () => void;
}) {
  const [draft, setDraft] = useState(editableText(node) ?? '');
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const latestSave = useRef<() => boolean>(() => true);
  const done = useRef(false), composing = useRef(false);
  useEffect(() => { field.current?.focus(); field.current?.select(); }, []);
  const change = (current: GuiNode): GuiNode => {
    const value = field.current?.value ?? draft;
    if (current.type === 'minecraft:button') current.props.message = replaceDisplay(current.props.message, value);
    else if (current.type === 'minecraft:string-widget') current.props.text = replaceDisplay(current.props.text, value);
    else if (current.type === 'minecraft:edit-box') current.props.value = value;
    else if (current.type === 'minecraft:checkbox') current.props.message = replaceDisplay(current.props.message, value);
    else if (current.type === 'minecraft:cycle-button') { const option = current.props.options.find(o => o.id === current.props.initialOptionId); if (option) option.text = replaceDisplay(option.text, value); }
    return current;
  };
  const validate = () => {
    if (done.current) return;
    if (composing.current) throw new Error('请先完成输入法组合输入再保存文字');
    const copy = structuredClone(editorStore.getState().doc);
    copy.screens[0].nodes = copy.screens[0].nodes.map(n => n.id === node.id ? change(n) : n);
    parseProject(JSON.stringify(copy));
  };
  const save = () => {
    if (done.current) return true;
    try {
      validate();
      if (editorStore.getState().blocked) throw new Error(editorStore.getState().blocked!);
      if (editorStore.getState().gesture) throw new Error('请先完成当前拖动，再保存文字');
      editorStore.getState().updateNode(node.id, change);
      done.current = true; close(); return true;
    } catch (e) { setError((e as Error).message); field.current?.focus(); return false; }
  };
  useExportDraft({ validate, commit: () => { if (!save()) throw new Error('文字保存失败，请修正后重试'); } });
  latestSave.current = save;
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target) && !latestSave.current()) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
    };
    // Commit before Konva pointerdown can start a gesture or unmount this editor.
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, []);
  const translated = node.type === 'minecraft:button' ? node.props.message.kind === 'translate'
    : node.type === 'minecraft:string-widget' ? node.props.text.kind === 'translate'
    : node.type === 'minecraft:checkbox' ? node.props.message.kind === 'translate'
    : node.type === 'minecraft:cycle-button' && node.props.options.find(o => o.id === node.props.initialOptionId)?.text.kind === 'translate';
  return <div ref={root} className="inline-editor" style={{ left, top, width: Math.max(width, 100), minHeight: Math.max(height, 28) }}>
    <input ref={field} aria-label="画布文字编辑" value={draft} style={{ fontSize: Math.max(12, 9 * zoom), minHeight: Math.max(height, 28) }}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onChange={e => { setDraft(e.target.value); setError(''); }} onBlur={save}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        else if (e.key === 'Escape') { e.preventDefault(); done.current = true; close(); }
      }}/>
    <span className="inline-editor-help">{node.type === 'minecraft:edit-box' ? '编辑输入初值' : node.type === 'minecraft:cycle-button' ? '编辑初始选项的显示文字' : translated ? '编辑预览文字 · 保留翻译键' : '编辑文字'}{node.type === 'minecraft:cycle-button' && translated ? ' · 保留翻译键' : ''} · Enter 或点击别处保存 / Esc 取消</span>
    {error && <span className="inline-editor-error" role="alert">{error}</span>}
  </div>;
}
