import { useEffect, useState } from 'react';
import type { GuiScreen } from '../domain/schema';
import { diagnoseBakeCandidates, diagnoseBakeGroup } from '../domain/bake';
import { editorStore } from '../editor/store';
import { bakeGroupCanvas } from '../render/bake';
import { CATALOG } from '../domain/catalog';
import { useStore } from 'zustand';
import { decodeBase64 } from '../domain/embeddedImage';
import { decodePreviewRaster } from '../render/previewRaster';
import type { RenderedImageAsset } from '../render/imageWidget';

function nodeName(node: GuiScreen['nodes'][number]) {
  return node.alias
    ? <><strong>{node.alias}</strong><small>{CATALOG[node.type].label} · {node.id}</small></>
    : <><strong>{node.id}</strong><small>{CATALOG[node.type].label}</small></>;
}

export function BakePanel({ screen, disabled, notify, workspace = false }: { screen: GuiScreen; disabled: boolean; notify: (message: string, error?: boolean) => void; workspace?: boolean }) {
  const [members, setMembers] = useState<string[]>([]), [preview, setPreview] = useState<string | null>(null), [imageAssets, setImageAssets] = useState<Record<string, RenderedImageAsset>>({});
  const assets = useStore(editorStore, s => s.doc.assets ?? []);
  useEffect(() => { setMembers([]); setPreview(null); }, [screen.id]);
  useEffect(() => {
    let active = true;
    const embedded = screen.nodes.filter(node => node.type === 'minecraft:image' && node.props.kind === 'embedded');
    void Promise.all(embedded.map(async node => {
      if (node.type !== 'minecraft:image') return null;
      const props = node.props; if (props.kind !== 'embedded') return null;
      const asset = assets.find(item => item.id === props.assetId); if (!asset) return null;
      try { const image = await decodePreviewRaster(decodeBase64(asset.data), asset.width, asset.height); return [node.id, { kind: 'texture' as const, image, width: asset.width, height: asset.height }] as const; }
      catch { return null; }
    })).then(entries => { if (active) setImageAssets(Object.fromEntries(entries.filter(Boolean) as [string, RenderedImageAsset][])); });
    return () => { active = false; };
  }, [screen.nodes, assets]);
  const candidates = diagnoseBakeCandidates(screen), groups = screen.bakeGroups ?? [];
  const create = () => { try { const id = editorStore.getState().createBakeGroup(members); setMembers([]); notify(`已创建 ${id}`); } catch (error) { notify((error as Error).message, true); } };
  const rejected = candidates.filter(item => item.reasons.some(reason => reason !== '已属于 Bake Group'));
  return <details className={`inspector-section bake-panel ${workspace ? 'bake-panel-workspace' : ''}`} role="region" aria-label="Static Bake Groups" open={workspace}>
    <summary><span>Static Bake Groups</span><span>{groups.length} 组 · {candidates.length} 节点</span></summary>
    <div className="section-body">
      <p className="field-note">接受根级、可见且无 F2 引用的 Rectangle / Fill 与嵌入式 Image。Group 是派生绘制资产，原始节点继续编辑。</p>
      <details className="bake-disclosure">
        <summary>新建 / 选择成员 <small>{members.length} 已选 · {candidates.filter(item => item.eligible).length} 可用</small></summary>
        <div className="bake-list-scroll" aria-label="Bake 候选节点">
          {candidates.map(item => {
            const node = screen.nodes.find(candidate => candidate.id === item.nodeId)!;
            return <label className="bake-node-option" key={item.nodeId} title={item.reasons.join('；') || node.type}>
              <input type="checkbox" aria-label={`Bake成员 ${item.nodeId}`} disabled={disabled || !item.eligible} checked={members.includes(item.nodeId)} onChange={event => setMembers(current => event.target.checked ? [...current, item.nodeId] : current.filter(id => id !== item.nodeId))}/>
              <span className="bake-node-name">{nodeName(node)}{item.reasons.length > 0 && <small className="field-error">{item.reasons.join('；')}</small>}</span>
            </label>;
          })}
        </div>
        <button type="button" disabled={disabled || !members.length} onClick={create}>创建 Bake Group ({members.length})</button>
      </details>
      {groups.map(group => {
        const diagnostic = diagnoseBakeGroup(screen, group), shown = preview === group.id;
        const membersInfo = diagnostic.members.map(member => ({ ...member, node: screen.nodes.find(node => node.id === member.nodeId) }));
        return <details className="bake-group-card" key={group.id}>
          <summary><span>{group.name} <small>· {group.id}</small></span><small>{diagnostic.scope.kind === 'persistent' ? 'Persistent' : `Page ${diagnostic.scope.pageId}`} · {group.memberIds.length} 成员 · {diagnostic.eligible ? '资格有效' : '需修复'}</small></summary>
          <div className="bake-group-content">
            {diagnostic.bounds && <small>范围：({diagnostic.bounds.x},{diagnostic.bounds.y}) {diagnostic.bounds.w}×{diagnostic.bounds.h} GUI px</small>}
            <details className="bake-disclosure"><summary>已加入成员（{membersInfo.length}）</summary><div className="bake-list-scroll">
              {membersInfo.map(member => <div className="bake-node-option" key={member.nodeId}><span className="bake-node-name">{member.node ? nodeName(member.node) : <><strong>{member.nodeId}</strong><small>节点缺失</small></>}{member.reasons.map(reason => <small className="field-error" key={reason}>{reason}</small>)}</span></div>)}
            </div></details>
            {!diagnostic.eligible && <p role="alert" className="field-error">Group 诊断：{[...diagnostic.reasons, ...diagnostic.members.flatMap(member => member.reasons)].join('；')}</p>}
            <div className="bake-group-actions">
              <button type="button" disabled={disabled || (!group.enabled && !diagnostic.eligible)} onClick={() => { try { editorStore.getState().setBakeGroupEnabled(group.id, !group.enabled); } catch (error) { notify((error as Error).message, true); } }}>{group.enabled ? '禁用 Bake' : '启用 Bake'}</button>
              <button type="button" disabled={disabled} onClick={() => setPreview(shown ? null : group.id)}>导出预览</button>
              <button type="button" disabled={disabled} onClick={() => { try { editorStore.getState().deleteBakeGroup(group.id); setPreview(null); notify('Bake Group 已解除'); } catch (error) { notify((error as Error).message, true); } }}>解除 Group</button>
            </div>
            {shown && diagnostic.eligible && diagnostic.bounds && <canvas aria-label={`Bake 导出预览 ${group.id}`} width={diagnostic.bounds.w} height={diagnostic.bounds.h} ref={canvas => {
              if (!canvas) return;
              try { const baked = bakeGroupCanvas(screen, group, imageAssets), ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height); ctx?.drawImage(baked, 0, 0); }
              catch (error) { notify((error as Error).message, true); }
            }}/>}
          </div>
        </details>;
      })}
      <details className="bake-disclosure"><summary>不支持的节点诊断（{rejected.length}）</summary><div className="bake-list-scroll" aria-label="Bake 拒绝原因">
        {rejected.map(item => { const node = screen.nodes.find(candidate => candidate.id === item.nodeId)!; return <div className="bake-node-option" key={item.nodeId}><span className="bake-node-name">{nodeName(node)}{item.reasons.map(reason => <small className="field-error" key={reason}>{reason}</small>)}</span></div>; })}
      </div></details>
    </div>
  </details>;
}
