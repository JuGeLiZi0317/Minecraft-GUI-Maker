import type { GuiNode, TextSpec } from './schema';

export type StatusNode = Extract<GuiNode, { type: 'minecraft:status-indicator' }>;
export type StatusEntry = StatusNode['props']['statuses'][number];
export const isStatusNode = (node: GuiNode): node is StatusNode => node.type === 'minecraft:status-indicator';
export function renameStatusId(props: Pick<StatusNode['props'], 'statuses' | 'initialStatusId'>, previousId: string, statusId: string): Pick<StatusNode['props'], 'statuses' | 'initialStatusId'> {
  return { ...props, statuses: props.statuses.map(entry => entry.statusId === previousId ? { ...entry, statusId } : entry),
    initialStatusId: props.initialStatusId === previousId ? statusId : props.initialStatusId };
}
export function statusError(value: { statuses: { statusId: string; color: string }[]; initialStatusId: string }) {
  if (value.statuses.length < 1 || value.statuses.length > 32) return '状态数量必须在 1 到 32 项之间';
  if (value.statuses.some(status => !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(status.statusId))) return 'statusId 格式无效';
  if (new Set(value.statuses.map(status => status.statusId)).size !== value.statuses.length) return 'statusId 必须在控件内唯一';
  if (value.statuses.some(status => !/^#[A-Fa-f0-9]{8}$/.test(status.color))) return '状态颜色必须是 #AARRGGBB';
  if (!value.statuses.some(status => status.statusId === value.initialStatusId)) return '初始状态必须引用现有 statusId；删除初始状态前请指定替代项';
  return null;
}
export const statusLabel = (status: { label: TextSpec; text?: { kind: 'literal'; value: string } | { kind: 'translate'; key: string; fallback?: string } }) => {
  const text = status.text ?? status.label;
  return text.kind === 'literal' ? text.value : text.fallback || `⟦${text.key}⟧`;
};
export type StatusChangeEvent = { type: 'status-change'; screenId: string; nodeId: string; statusId: string; phase: 'change'; source: 'preview-control' };
