import { useEffect, useState } from 'react';
import { displayText } from '../domain/model';
import type { StatusChangeEvent, StatusNode } from '../domain/statusIndicator';

export function StatusPreview({ nodes, screenId, values, onChange }: { nodes: StatusNode[]; screenId: string; values: Record<string, string>; onChange: (nodeId: string, statusId: string) => void }) {
  const [events, setEvents] = useState<StatusChangeEvent[]>([]);
  useEffect(() => setEvents([]), [screenId]);
  return <details className="status-preview-tools">
    <summary className="screen-tool-button" aria-label="打开状态预览控制">状态预览 · {nodes.length}</summary>
    <div className="status-preview-popover">
      {nodes.map(node => {
        const current = node.props.statuses.some(item => item.statusId === values[node.id]) ? values[node.id] : node.props.initialStatusId;
        return <label key={node.id} className="status-preview-row"><span>{displayText(node.props.name) || node.id}</span><select aria-label={`${displayText(node.props.name)}预览状态 ${node.id}`} value={current} onChange={e => {
          const statusId = e.target.value; if (statusId === current) return;
          onChange(node.id, statusId);
          setEvents(old => [...old.slice(-49), { type: 'status-change', screenId, nodeId: node.id, statusId, phase: 'change', source: 'preview-control' }]);
        }}>{node.props.statuses.map(status => <option key={status.statusId} value={status.statusId}>{displayText(status.label)} · {status.statusId}</option>)}</select></label>;
      })}
      <output aria-label="状态变更预览事件" data-testid="status-preview-events" data-events={JSON.stringify(events)} aria-live="polite">{events.length ? `${events.at(-1)!.nodeId}: ${events.at(-1)!.statusId}` : '状态事件：暂无预览变更'}</output>
    </div>
  </details>;
}
