import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { editorStore, currentScreen } from '../editor/store';
import { capturePersonalTemplate, parsePersonalTemplate, type PersonalTemplate } from '../domain/template';
import { TemplateRepository } from '../io/templateRepository';
import { isContainerNode } from '../domain/collapsiblePanel';

type Props = { open: boolean; onClose: () => void; notify: (message: string, error?: boolean) => void; templateEditingId: string | null; pageIds?: string[] };

function absoluteTemplateBounds(template: PersonalTemplate) {
  const byId = new Map(template.nodes.map(node => [node.id, node]));
  return template.nodes.map(node => {
    let x = node.bounds.x, y = node.bounds.y, parentId = node.parentContainerId;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId); const parent = byId.get(parentId); if (!parent) break;
      x += parent.bounds.x; y += parent.bounds.y; parentId = parent.parentContainerId;
    }
    return { node, x, y };
  });
}

function TemplatePreview({ template }: { template: PersonalTemplate }) {
  const items = absoluteTemplateBounds(template), minX = Math.min(...items.map(item => item.x)), minY = Math.min(...items.map(item => item.y));
  const maxX = Math.max(...items.map(item => item.x + item.node.bounds.w)), maxY = Math.max(...items.map(item => item.y + item.node.bounds.h));
  const colors: Record<string, string> = { 'minecraft:fill': '#5d6b85', 'minecraft:button': '#a87b3b', 'minecraft:image': '#4f7f74', 'minecraft:single_slot': '#8b8b8b' };
  return <svg className="template-preview" viewBox={`${minX - 2} ${minY - 2} ${Math.max(1, maxX - minX + 4)} ${Math.max(1, maxY - minY + 4)}`} role="img" aria-label={`模板预览 ${template.name}`}>
    {items.map(({ node, x, y }) => <rect key={node.id} x={x} y={y} width={Math.max(1, node.bounds.w)} height={Math.max(1, node.bounds.h)} fill={colors[node.type] ?? '#7b8494'} fillOpacity={node.type === 'minecraft:fill' ? 0.5 : 0.72} stroke="#d8c79b" strokeWidth={0.6}/>)}
  </svg>;
}

export function TemplatesPanel({ open, onClose, notify, templateEditingId, pageIds = [] }: Props) {
  const doc = useStore(editorStore, state => state.doc), selectedId = useStore(editorStore, state => state.selected), currentScreenId = useStore(editorStore, state => state.currentScreenId);
  const [records, setRecords] = useState<PersonalTemplate[]>([]), [selected, setSelected] = useState<PersonalTemplate | null>(null);
  const [name, setName] = useState(''), [description, setDescription] = useState(''), [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const repo = useRef<TemplateRepository | null>(null), importRef = useRef<HTMLInputElement | null>(null);
  const screen = currentScreen({ doc, currentScreenId });
  const selectedNode = screen.nodes.find(node => node.id === selectedId);
  const targetParentId = selectedNode && isContainerNode(selectedNode) ? selectedNode.id : selectedNode?.parentContainerId ?? templateEditingId ?? undefined;
  const targetLabel = targetParentId ? `容器 ${targetParentId}` : '当前 Screen 根级';

  const refresh = async () => {
    const r = repo.current; if (!r) return;
    const next = await r.list(); setRecords(next); setDrafts(Object.fromEntries(next.map(item => [item.id, item.name])));
  };
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const r = repo.current ?? (repo.current = new TemplateRepository());
    void r.open().then(() => r.list()).then(next => { if (!cancelled) { setRecords(next); setDrafts(Object.fromEntries(next.map(item => [item.id, item.name]))); } })
      .catch(error => notify((error as Error).message, true)).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, notify]);

  if (!open) return null;
  const save = async () => {
    if (!selectedId) { notify('先选中一个控件或容器，再保存为模板', true); return; }
    try {
      const record = capturePersonalTemplate(screen, selectedId, name.trim() || `个人模板 ${records.length + 1}`, description);
      await repo.current!.put(record); await refresh(); setName(''); setDescription('');
      notify(`已保存模板「${record.name}」；未绑定当前 Screen`);
    } catch (error) { notify((error as Error).message, true); }
  };
  const insert = (record: PersonalTemplate) => {
    try { const id = editorStore.getState().insertTemplate(record, targetParentId, undefined, pageIds); notify(`已插入模板「${record.name}」为 ${id}；可撤销`); }
    catch (error) { notify((error as Error).message, true); }
  };
  const rename = async (record: PersonalTemplate) => {
    const next = (drafts[record.id] ?? '').trim();
    if (!next || next.length > 128) { notify('模板名称须为 1～128 个字符', true); return; }
    try { await repo.current!.put({ ...record, name: next, updatedAt: Date.now() }); await refresh(); notify('模板已重命名'); }
    catch (error) { notify((error as Error).message, true); }
  };
  const remove = async (record: PersonalTemplate) => {
    if (!window.confirm(`删除模板「${record.name}」？不会删除已插入的节点。`)) return;
    try { await repo.current!.remove(record.id); await refresh(); setSelected(current => current?.id === record.id ? null : current); notify('模板已删除'); }
    catch (error) { notify((error as Error).message, true); }
  };
  const exportTemplate = (record: PersonalTemplate) => {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `${record.name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.template.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0); notify('模板 JSON 已导出');
  };
  const importTemplate = async (file: File) => {
    try {
      const record = parsePersonalTemplate(await file.text());
      const imported = { ...record, id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now(), updatedAt: Date.now() };
      await repo.current!.put(imported); await refresh(); notify(`已导入模板「${imported.name}」`);
    } catch (error) { notify(`模板导入失败：${(error as Error).message}`, true); }
  };

  return <aside className="templates-panel" data-testid="templates-panel" aria-label="个人模板库">
    <header><div><h2>个人模板库</h2><p>Detached Copy · 模板独立于项目 JSON · 只保存相对布局</p></div><button type="button" aria-label="关闭模板库" onClick={onClose}>×</button></header>
    <section className="template-save" aria-label="保存当前选择">
      <h3>保存当前选择</h3>
      <p className="field-note">{selectedNode ? `当前：${selectedNode.id} · ${selectedNode.type}` : '先在画布或结构树中选中一个控件/容器'}；插入目标：{targetLabel}</p>
      <label className="field"><span>模板名称</span><input aria-label="模板名称" maxLength={128} value={name} placeholder={selectedNode ? `${selectedNode.type} 模板` : '选择控件后填写'} onChange={event => setName(event.target.value)}/></label>
      <label className="field"><span>说明（可选）</span><textarea aria-label="模板说明" maxLength={1024} value={description} onChange={event => setDescription(event.target.value)}/></label>
      <div className="template-actions"><button type="button" className="primary" onClick={() => void save()}>保存当前选择为模板</button><button type="button" onClick={() => importRef.current?.click()}>导入模板</button><input ref={importRef} type="file" aria-label="导入模板文件" accept=".json,application/json" hidden onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importTemplate(file); }}/></div>
      <p className="field-note">保存根节点及其子树；ID 在插入时重新生成。带 F2 事件、CreativeTab、36 格 Native Region 或真实/Ghost Single Slot 的模板会被拒绝。资源依赖只列出，不假设目标项目拥有。</p>
    </section>
    <section className="template-list" aria-label="模板列表">
      <h3>模板 {records.length}</h3>
      {loading && <p className="field-note">正在读取模板库…</p>}
      {!loading && records.length === 0 && <p className="field-note">还没有个人模板。选中一个控件/容器后保存。</p>}
      {records.map(record => <article key={record.id} data-testid={`template-row-${record.id}`} className={selected?.id === record.id ? 'selected' : ''}>
        <div className="template-row-head"><button type="button" className="template-name" onClick={() => setSelected(record)}>{record.name}</button><small>{record.nodes.length} 节点 · {record.resourceDependencies.length} 资源</small></div>
        {record.description && <p className="template-description">{record.description}</p>}
        {selected?.id === record.id && <TemplatePreview template={record}/>} 
        {selected?.id === record.id && <div className="template-resources"><strong>资源依赖</strong>{record.resourceDependencies.length ? <ul>{record.resourceDependencies.map(dep => <li key={dep}>{dep}</li>)}</ul> : <span>无外部资源；目标项目仍需提供字体/贴图等运行环境。</span>}{record.resourceDependencies.length > 0 && <p className="field-note">外部依赖需目标 Mod/资源包提供；插入不会伪造资源。</p>}</div>}
        <div className="template-row-edit"><input aria-label={`模板名称 ${record.id}`} maxLength={128} value={drafts[record.id] ?? record.name} onChange={event => setDrafts(current => ({ ...current, [record.id]: event.target.value }))}/><button type="button" aria-label={`重命名模板 ${record.id}`} onClick={() => void rename(record)}>重命名</button></div>
        <div className="template-actions"><button type="button" className="primary" aria-label={`插入模板 ${record.id}`} onClick={() => insert(record)}>插入到{targetLabel}</button><button type="button" aria-label={`导出模板 ${record.id}`} onClick={() => exportTemplate(record)}>导出</button><button type="button" className="danger" aria-label={`删除模板 ${record.id}`} onClick={() => void remove(record)}>删除</button></div>
      </article>)}
    </section>
  </aside>;
}
