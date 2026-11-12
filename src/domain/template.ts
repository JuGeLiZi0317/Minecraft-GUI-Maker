import { z } from 'zod';
import { nodeSchema, type GuiNode, type GuiScreen } from './schema';
import { allDescendants } from './collapsiblePanel';

export const TEMPLATE_FORMAT = 'minecraft-gui-maker-template' as const;
export const TEMPLATE_VERSION = '1.0.0' as const;
export const TEMPLATE_MAX_NODES = 256;
export const TEMPLATE_MAX_RESOURCES = 256;

const id = z.string().min(1).max(128);
const templateNodeSchema = nodeSchema as z.ZodType<GuiNode>;
export const personalTemplateSchema = z.strictObject({
  format: z.literal(TEMPLATE_FORMAT),
  templateVersion: z.literal(TEMPLATE_VERSION),
  id,
  name: z.string().min(1).max(128),
  description: z.string().max(1024).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  rootNodeIds: z.array(id).min(1).max(1),
  nodes: z.array(templateNodeSchema).min(1).max(TEMPLATE_MAX_NODES),
  resourceDependencies: z.array(z.string().min(1).max(512)).max(TEMPLATE_MAX_RESOURCES),
}).superRefine((value, ctx) => {
  const ids = new Set(value.nodes.map(node => node.id));
  if (ids.size !== value.nodes.length) ctx.addIssue({ code: 'custom', path: ['nodes'], message: '模板节点 ID 必须唯一' });
  if (!value.rootNodeIds.every(root => ids.has(root))) ctx.addIssue({ code: 'custom', path: ['rootNodeIds'], message: '模板根节点必须存在于 nodes' });
  for (const node of value.nodes) if (node.parentContainerId && !ids.has(node.parentContainerId)) ctx.addIssue({ code: 'custom', path: ['nodes'], message: `${node.id} 的父节点不在模板内` });
});
export type PersonalTemplate = z.infer<typeof personalTemplateSchema>;

export function parsePersonalTemplate(value: unknown): PersonalTemplate {
  return personalTemplateSchema.parse(typeof value === 'string' ? JSON.parse(value) : value);
}

const nodeEvents = (node: GuiNode) => Object.values(node.events).filter(Boolean);
const resourcesOf = (node: GuiNode): string[] => {
  if (node.type === 'minecraft:image') return [node.props.kind === 'texture' ? node.props.resourceId : node.props.kind === 'embedded' ? `embedded:${node.props.assetId}` : `sprite:${node.props.spriteId}`];
  return [];
};

/** Capture only the selected root plus its descendants; never a Screen-absolute layout. */
export function capturePersonalTemplate(screen: GuiScreen, rootId: string, name: string, description?: string): PersonalTemplate {
  const root = screen.nodes.find(node => node.id === rootId);
  if (!root) throw new Error('请先选择一个控件或容器');
  const title = name.trim();
  if (!title || title.length > 128) throw new Error('模板名称须为 1～128 个字符');
  if (description !== undefined && description.length > 1024) throw new Error('模板说明不能超过 1024 个字符');
  if (root.type === 'minecraft:creative-tab') throw new Error('CreativeTab/Page Group 不能保存为个人模板');
  if (root.type === 'native_region') throw new Error('36 格 Native Region 需要稳定的真实 Menu Slot 身份，不能保存为个人模板');
  const descendants = allDescendants(root.id, screen.nodes);
  const nodes = [root, ...screen.nodes.filter(node => node.id !== root.id && descendants.some(child => child.id === node.id))];
  if (nodes.length > TEMPLATE_MAX_NODES) throw new Error(`单个模板最多 ${TEMPLATE_MAX_NODES} 个节点`);
  for (const node of nodes) {
    if (node.type === 'minecraft:creative-tab') throw new Error('模板不能包含 CreativeTab/Page Group');
    if (node.type === 'native_region') throw new Error('模板不能包含 36 格 Native Region');
    if (node.type === 'minecraft:single_slot' && node.props.usage !== 'visual_only') throw new Error('只有 visual_only Single Slot 可以保存为模板；真实/ Ghost Slot 需要项目级 Slot 身份与外部合同');
    if (nodeEvents(node).length) throw new Error(`${node.id} 含有 F2 事件或外部行为引用；首版模板拒绝复杂行为依赖`);
  }
  const clone = structuredClone(nodes);
  clone[0].bounds.x = 0; clone[0].bounds.y = 0; delete clone[0].parentContainerId;
  const now = Date.now();
  return {
    format: TEMPLATE_FORMAT, templateVersion: TEMPLATE_VERSION, id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: title, ...(description?.trim() ? { description: description.trim() } : {}), createdAt: now, updatedAt: now,
    rootNodeIds: [clone[0].id], nodes: clone, resourceDependencies: [...new Set(nodes.flatMap(resourcesOf))],
  };
}

export const TEMPLATE_CONTRACT = {
  version: TEMPLATE_VERSION,
  format: TEMPLATE_FORMAT,
  storage: 'separate IndexedDB database minecraft-gui-maker-templates; never written into the authoritative project JSON',
  capture: 'selected root plus descendants only; root x/y normalized to 0, children keep container-local coordinates; draw order preserved',
  insert: 'new node IDs, remapped parentContainerId/templateId, one atomic document commit, normal Schema revalidation',
  page: 'inserting at Screen root joins the active Page through CreativeTab.contentIds; inserting into a container keeps its existing Page ownership',
  behavior: 'template nodes with non-empty F2 events are rejected; no silent cross-project behavior remapping',
  resources: 'image texture/sprite IDs are listed as dependencies; missing resources are reported and never assumed to exist',
  singleSlot: 'only visual_only Single Slot can be captured; inventory/ghost_selection need project-level Menu identity and external integration',
  bake: 'Bake Group membership is Screen-level and is not captured; inserting a template never joins a Bake Group',
} as const;
