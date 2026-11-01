import type { useExports } from '../exports/useExports';
import { useRef } from 'react';
import { useDismissOutside } from './useDismissOutside';
import { isTextureStyle } from '../render/panelTexture';

type PromptComponent = { nodeId: string; type: string; source?: { category?: string } };
type PromptSpec = {
  facts?: { components?: PromptComponent[] };
  unverified?: { id: string; description: string }[];
};
const CATEGORY_LABEL: Record<string, string> = {
  'vanilla-widget': '原版 Widget',
  'vanilla-draw': '原版绘制',
  'screen-internal': 'Screen 内部',
  neoforge: 'NeoForge',
  custom: '自定义',
};
const kindOf = (label: string) => label.includes('权威') ? 'JSON'
  : label.includes('PNG') ? 'PNG'
  : label.includes('Prompt') ? 'MD'
  : label.includes('结构化') ? 'SPEC'
  : label.includes('批次') ? 'MANIFEST'
  : 'TEX';
const sizeOf = (bytes: Uint8Array | number) => {
  const value = typeof bytes === 'number' ? bytes : bytes.byteLength;
  return value >= 1024 ? `${Math.round(value / 1024)} KB` : `${value} B`;
};

export function ExportPanel({ batch, busy, error, downloadZip, generate, currentJson, resourceRevision, onClose }: ReturnType<typeof useExports> & { currentJson: string; resourceRevision: number; onClose: () => void }) {
  const root = useRef<HTMLElement>(null);
  useDismissOutside(root, true, onClose);
  if (!batch && !busy && !error) return null;
  const nodes = batch ? (JSON.parse(batch.projectJson).screens as { nodes: { type: string }[] }[]).flatMap(screen => screen.nodes) : [];
  const implementation = batch?.files.find(file => file.label.includes('结构化实现规格'));
  let spec: PromptSpec | null = null;
  if (implementation) { try { spec = JSON.parse(new TextDecoder().decode(implementation.bytes)) as PromptSpec; } catch { spec = null; } }
  const components = spec?.facts?.components ?? [];
  const categories = [...new Set(components.map(component => component.source?.category).filter((value): value is string => !!value))];
  const counts = categories.map(category => `${category} ×${components.filter(component => component.source?.category === category).length}`);
  const visual = batch?.manifest.visualResources;
  const unresolved = visual?.diagnostics?.length ?? 0;
  const behavior = batch?.manifest.behavior;
  const behaviorScreens = behavior && 'screens' in behavior ? behavior.screens : undefined;
  const hasBehavior = !!behavior && (behaviorScreens ? behaviorScreens.some(screen => screen.rules.length > 0 || screen.screenTargets.length > 0) : (behavior.rules?.length ?? 0) > 0 || (behavior.screenTargets?.length ?? 0) > 0);

  return <section ref={root} className="export-panel" data-testid="export-panel" aria-live="polite" aria-labelledby="export-title">
    <div className="export-panel-heading">
      <strong id="export-title">{busy ? '导出 · 正在生成同一快照' : batch ? `导出 · REV ${batch.reference.revision}` : '导出 · 未生成'}</strong>
      <button aria-label="关闭导出结果" onClick={onClose}>✕</button>
    </div>
    <div className="export-body">
      {busy && <div className="export-busy" aria-label="正在生成导出文件"><span/><span/><span/></div>}
      {error && <div className="export-error">本批未生成：{error}</div>}
      {batch && <>
        {nodes.some(node => node.type === 'minecraft:numeric-input' || node.type === 'minecraft:slider') && <p className="field-note">数值事件为未绑定意图：相同配置不等于已绑定。不会自动联动控件或执行业务；需游戏实现者提供消费者。</p>}
        <div className="export-snapshot">
          <span className="export-chip snapshot">同一快照</span>
          <span className="export-chip">REV {batch.reference.revision}</span>
          <span className="export-chip">{batch.files.length} 个文件</span>
        </div>
        <p className="export-reference" data-testid="export-reference">批次 {batch.reference.exportId} · SHA-256 {batch.reference.documentSha256}</p>
        <p>设计区 PNG：1 图像像素 = 1 GUI 逻辑单位。Panel 背景纹理为方形，设计区在左上，空余部分透明；绘制时按设计尺寸裁取。放大参考图的阅读衬底不代表游戏背景，坐标以设计 JSON 为准。</p>
        <p>PNG 使用导出时的资源会话和组件初态；不包含悬停、选中或编辑焦点。字体仍为网页近似，游戏内视觉尚未验证。</p>
        {nodes.some(node => node.type !== 'minecraft:fill') && <p>文字阴影按各组件的设计设置输出；浏览器效果为近似预览，游戏实现方式见规格。旧文档未指定时按关闭处理。</p>}
        {nodes.some(node => node.type === 'minecraft:string-widget') && <p>StringWidget 的游戏字体宽度可能与网页不同，文字可能在游戏中被截断；请按目标字体和语言实测。</p>}
        {nodes.some(node => node.type === 'minecraft:checkbox') && batch.manifest.panelTexture && <p>Panel 上的复选框深灰文字为浏览器可读性预览；原版固定浅色文字，需要开发者自定义绘制才能复现该颜色。</p>}
        {batch.manifest.panelTexture?.style && isTextureStyle(batch.manifest.panelTexture.style) && <p>本批底板纹理含用户从 Minecraft 发射器纹理裁切拼接的派生成分；携带或分发前请核实适用的资源使用条件。</p>}
        {currentJson !== batch.projectJson && <p className="export-warning">当前设计已改变。以下下载仍属于本批快照；需要新内容时请重新生成。</p>}
        {visual && resourceRevision !== visual.generation && <p className="export-warning">当前资源会话已改变。以下下载仍使用原导出快照，需要当前资源时请重新导出。</p>}
        {visual && <p data-testid="export-visual-diagnostics">资源代次 {visual.generation} · {visual.base ? `基础：${visual.base}` : '中性近似预览'}{unresolved ? ` · 预览限制：${visual.diagnostics.join('；')}` : ''}</p>}

        <section className="export-section" aria-label="同一快照的派生物">
          <h3>同一快照的派生物</h3>
          <div className="export-links">{batch.files.map((file, index) => <a key={file.name} href={batch.urls[index]} download={file.name}>
            <span className="export-file-kind">{kindOf(file.label)}</span>
            <span className="export-file-label">{file.label}</span>
            <span className="export-file-size">{sizeOf(file.bytes)}</span>
          </a>)}</div>
        </section>

        <section className="prompt-summary" aria-label="Prompt 摘要">
          <h3>Prompt 摘要（只读派生）</h3>
          <div className="prompt-grid">
            <div className="prompt-block">
              <strong>原生类别</strong>
              {components.length ? <>
                <div className="prompt-categories">{categories.map(category => <span key={category}>{category} · {CATEGORY_LABEL[category] ?? category} ×{components.filter(component => component.source?.category === category).length}</span>)}</div>
                <p>{components.map(component => `${component.nodeId} ${component.type.replace('minecraft:', '')}`).join(' · ')}</p>
              </> : <p>{spec ? '没有组件记录。' : '摘要读取失败，请直接下载 prompt.md。'}</p>}
            </div>
            <div className="prompt-block">
              <strong>已知限制</strong>
              {spec?.unverified?.length ? <details>
                <summary>{spec.unverified.length} 项未验证 · 展开</summary>
                <ul>{spec.unverified.map(item => <li key={item.id}>{item.description}</li>)}</ul>
              </details> : <p>{spec ? '没有额外限制条目。' : '摘要读取失败，请直接下载 prompt.md。'}</p>}
            </div>
            <div className="prompt-block">
              <strong>未解析资源</strong>
              <p>{unresolved ? `${unresolved} 项资源未解析；参考图使用中性占位。${visual?.diagnostics?.join('；')}` : visual?.base ? '资源已解析；纹理与字体仍为浏览器近似。' : '未使用外部资源；组件以中性样式绘制。'}</p>
            </div>
            <div className="prompt-block">
              <strong>服务端实现责任</strong>
              <p>{hasBehavior ? '行为规则仅描述设计意图；游戏回调、网络同步与服务端权限需由实现者完成。' : '本次设计未声明行为；不生成网络或服务端逻辑。'}</p>
            </div>
          </div>
          <p>权威数据是项目 JSON；实现规格和 Prompt 是只读派生参考。导出不包含可运行 Java 代码。</p>
        </section>

        <p>{counts.length ? `类别汇总：${counts.join(' · ')}。` : ''}可逐项下载，也可打包同一批文件（ZIP 内容上限 64 MiB）。</p>
        <div className="export-actions">
          <button disabled={busy} onClick={() => void downloadZip()}>导出 ZIP</button>
          <button aria-label="重新生成导出" disabled={busy} onClick={() => void generate()}>重新生成</button>
        </div>
      </>}
    </div>
  </section>;
}
