import { CATALOG } from '../domain/catalog';
import { literal } from '../domain/model';
import type { GuiNode, TextSpec } from '../domain/schema';
import { activeTooltip, supportsTooltip, tooltipPreviewText } from '../domain/tooltip';
import { TextFields } from './TextSpecField';

function withTooltip(node: GuiNode, tooltip: TextSpec | undefined): GuiNode {
  if (!supportsTooltip(node)) return node;
  const next = structuredClone(node);
  if (tooltip) next.props.tooltip = tooltip; else delete next.props.tooltip;
  return next;
}

/** Optional control-level tooltip. Collapsed by default to keep the Inspector dense. */
export function TooltipFields({ node, update }: { node: GuiNode; update: (change: (node: GuiNode) => GuiNode, dry?: boolean) => boolean }) {
  if (!supportsTooltip(node)) return null;
  const enabled = node.props.tooltip !== undefined;
  const active = activeTooltip(node);
  const summary = !enabled ? '未启用' : active ? tooltipPreviewText(active).replace(/\s+/g, ' ').slice(0, 36) : '已启用但为空';
  return <details className="tooltip-fields" data-testid="tooltip-fields">
    <summary><span>Tooltip</span><span>{summary}</span></summary>
    <div className="tooltip-fields-body">
      <label className="check"><input type="checkbox" aria-label="启用 Tooltip" checked={enabled} onChange={event => {
        update(n => withTooltip(n, event.target.checked ? literal(CATALOG[n.type].label) : undefined));
      }}/>启用 Tooltip</label>
      {enabled && <>
        <TextFields label="Tooltip" owner={node} keySuffix="tooltip" value={node.props.tooltip!} commit={(value, dry) => update(n => withTooltip(n, value), dry)}/>
        <p className="tooltip-preview" data-testid="tooltip-preview">{active ? `${tooltipPreviewText(active)}${active.kind === 'translate' ? ` ⟦${active.key}⟧` : ''}` : '空 Tooltip 在游戏与预览中都不显示。'}</p>
        <p className="field-note">可完全缺省；Literal 空值不显示，翻译键由语言文件解析，浏览器仅显示 fallback。最多 1024 字符，允许换行；不会生成语言文件。</p>
      </>}
    </div>
  </details>;
}
