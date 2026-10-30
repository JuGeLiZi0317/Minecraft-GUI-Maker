import type { useExports } from '../exports/useExports';
import { useRef } from 'react';
import { useDismissOutside } from './useDismissOutside';
import { isTextureStyle } from '../render/panelTexture';

export function ExportPanel({ batch, busy, downloadZip, currentJson, resourceRevision, onClose }: ReturnType<typeof useExports> & { currentJson: string; resourceRevision: number; onClose: () => void }) {
  const root = useRef<HTMLElement>(null);
  useDismissOutside(root, true, onClose);
  if (!batch && !busy) return null;
  const nodes = batch ? JSON.parse(batch.projectJson).screens[0].nodes as { type: string }[] : [];
  return <section ref={root} className="export-panel" data-testid="export-panel" aria-live="polite">
    <div className="export-panel-heading"><strong>设计区导出 · {busy ? '正在从固定快照生成…' : `revision ${batch!.reference.revision}`}</strong><button aria-label="关闭导出结果" onClick={onClose}>✕</button></div>
    <p>设计区 PNG：1 图像像素 = 1 GUI 逻辑单位。Panel 背景纹理为方形，设计区在左上，空余部分透明；绘制时按设计尺寸裁取。放大参考图的阅读衬底不代表游戏背景，坐标以设计 JSON 为准。</p>
    <p>PNG 使用导出时的资源会话和组件初态；不包含悬停、选中或编辑焦点。字体仍为网页近似，游戏内视觉尚未验证。</p>
    {nodes.some(node => node.type !== 'minecraft:fill') && <p>文字阴影按各组件的设计设置输出；浏览器效果为近似预览，游戏实现方式见规格。旧文档未指定时按关闭处理。</p>}
    {nodes.some(node => node.type === 'minecraft:string-widget') && <p>StringWidget 的游戏字体宽度可能与网页不同，文字可能在游戏中被截断；请按目标字体和语言实测。</p>}
    {nodes.some(node => node.type === 'minecraft:checkbox') && batch?.manifest.panelTexture && <p>Panel 上的复选框深灰文字为浏览器可读性预览；原版固定浅色文字，需要开发者自定义绘制才能复现该颜色。</p>}
    {batch?.manifest.panelTexture?.style && isTextureStyle(batch.manifest.panelTexture.style) && <p>本批底板纹理含用户从 Minecraft 发射器纹理裁切拼接的派生成分；携带或分发前请核实适用的资源使用条件。</p>}
    {batch?.manifest.visualResources && <p data-testid="export-visual-diagnostics">资源代次 {batch.manifest.visualResources.generation} · {batch.manifest.visualResources.base ? `基础：${batch.manifest.visualResources.base}` : '中性近似预览'}{batch.manifest.visualResources.diagnostics.length ? ` · 预览限制：${batch.manifest.visualResources.diagnostics.join('；')}` : ''}</p>}
    {batch && <><p data-testid="export-reference">批次 {batch.reference.exportId} · SHA-256 {batch.reference.documentSha256}</p>
      {currentJson !== batch.projectJson && <p>当前设计已改变；以下下载仍属于上述快照。需要新内容时请重新导出。</p>}
      {batch.manifest.visualResources && resourceRevision !== batch.manifest.visualResources.generation && <p>当前资源会话已改变；以下下载仍使用原导出快照，需要当前资源时请重新导出。</p>}
      <div className="export-links">{batch.files.map((file, i) => <a key={file.name} href={batch.urls[i]} download={file.name}>{file.label}</a>)}</div>
      <button disabled={busy} onClick={() => void downloadZip()}>导出 ZIP</button>
      <p>权威数据为设计 JSON；实现规格和 Prompt 是只读派生参考。可逐项下载，也可打包同一批文件（ZIP 内容上限 64 MiB）。</p></>}
  </section>;
}
