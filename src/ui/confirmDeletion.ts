import { planDeletion, type DeletionPlan } from '../domain/deletion';
import { editorStore } from '../editor/store';

export function deletionMessage(name: string, plan: DeletionPlan) {
  const details = plan.rules.map(rule => `${rule.screenId} / ${rule.ruleId}`).join('\n');
  return `确认删除${name}？\n${plan.rules.length ? `将按现有顺序解除引用并删除以下 ${plan.rules.length} 条完整行为规则（含共享来源、其他动作和条件分支）：\n${details}\n` : ''}${plan.mappingChanges.length ? `同步清理共享映射中的失效配对：${plan.mappingChanges.map(map => `${map.mapId}（${map.removedPairs} 项）`).join('、')}。\n` : ''}${plan.targetIds.length ? `同时移除 ${plan.targetIds.length} 个指向该 Screen 的导航目标。\n` : ''}${plan.tabIds.length ? `同时移除 ${plan.tabIds.length} 个导航标签及其画布实例。\n` : ''}${plan.entryReplacement ? `项目入口改为 ${plan.entryReplacement}。\n` : ''}尚未保存的行为草稿将清除。此操作可以一次撤销恢复。`;
}

export function confirmDeleteSelected(): boolean {
  const state = editorStore.getState(); if (state.blocked || state.gesture || !state.selected) return false;
  const plan = planDeletion(state.doc, { kind: 'node', screenId: state.currentScreenId, nodeId: state.selected });
  if (plan.rules.length && !window.confirm(deletionMessage(`组件 ${state.selected}`, plan))) return false;
  state.deleteSelected(true); return true;
}

export function confirmDeleteScreen(screenId: string): boolean {
  const state = editorStore.getState(); if (state.blocked || state.gesture) return false;
  const plan = planDeletion(state.doc, { kind: 'screen', screenId });
  if (!window.confirm(deletionMessage(`Screen ${screenId}`, plan))) return false;
  state.deleteScreen(screenId, true); return true;
}
