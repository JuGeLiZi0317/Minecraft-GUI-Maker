import type { GuiNode } from './schema';

export type ImageNode = Extract<GuiNode, { type: 'minecraft:image' }>;
export type TextureImageNode = Omit<ImageNode, 'props'> & { props: Extract<ImageNode['props'], { kind: 'texture' }> };
export const isImageNode = (node: GuiNode): node is ImageNode => node.type === 'minecraft:image';
const namespace = /^[a-z0-9_.-]+$/;
const path = /^[a-z0-9/._-]+$/;
export function resourceLocationError(value: string, kind: 'texture' | 'sprite') {
  const split = value.indexOf(':');
  if (split < 1 || split !== value.lastIndexOf(':')) return '资源标识必须采用 namespace:path 格式';
  const ns = value.slice(0, split), name = value.slice(split + 1);
  if (!namespace.test(ns) || !path.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) return '资源标识包含非法命名空间或路径段';
  if (kind === 'texture' && (!name.startsWith('textures/') || !name.endsWith('.png'))) return '贴图 ID 必须是 textures/ 下的完整 PNG ResourceLocation';
  if (kind === 'sprite' && (ns !== 'minecraft' || name.startsWith('textures/') || name.endsWith('.png'))) return '首版只支持 Minecraft GUI atlas 中不带扩展名的 Sprite ID';
  return null;
}
export function imageError(node: ImageNode) {
  if (node.props.kind === 'texture') {
    const idError = resourceLocationError(node.props.resourceId, 'texture'); if (idError) return idError;
    const { uv } = node.props;
    if (uv.x + uv.width > node.props.textureWidth || uv.y + uv.height > node.props.textureHeight) return 'UV 采样区域必须位于逻辑贴图尺寸内';
  } else {
    const idError = resourceLocationError(node.props.spriteId, 'sprite'); if (idError) return idError;
  }
  return null;
}
export function textureSourceRect(node: TextureImageNode, actualWidth: number, actualHeight: number) {
  return { x: node.props.uv.x * actualWidth / node.props.textureWidth, y: node.props.uv.y * actualHeight / node.props.textureHeight,
    width: node.props.uv.width * actualWidth / node.props.textureWidth, height: node.props.uv.height * actualHeight / node.props.textureHeight };
}
