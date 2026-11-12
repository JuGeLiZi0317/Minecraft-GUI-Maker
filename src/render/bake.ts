import type { BakeGroup, GuiScreen } from '../domain/schema';
import { diagnoseBakeGroup } from '../domain/bake';
import { drawFillStyle } from '../domain/fillStyle';
import { drawImageNode, type RenderedImageAsset } from './imageWidget';
import type { SpriteRasterCache } from './spritePreview';

export function bakeGroupCanvas(screen: GuiScreen, group: BakeGroup, images: Readonly<Record<string, RenderedImageAsset>> = {}, cache?: SpriteRasterCache): HTMLCanvasElement {
  const diagnostic = diagnoseBakeGroup(screen, group);
  if (!diagnostic.eligible || !diagnostic.bounds) throw new Error([...diagnostic.reasons, ...diagnostic.members.flatMap(member => member.reasons)].join('；') || 'Bake Group 无有效包围盒');
  const canvas = document.createElement('canvas');
  canvas.width = diagnostic.bounds.w; canvas.height = diagnostic.bounds.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 Bake Canvas');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ordered = group.memberIds.map(id => screen.nodes.find(node => node.id === id)!).sort((a, b) => screen.nodes.indexOf(a) - screen.nodes.indexOf(b));
  for (const node of ordered) {
    ctx.save(); ctx.translate(node.bounds.x - diagnostic.bounds.x, node.bounds.y - diagnostic.bounds.y);
    if (node.type === 'minecraft:fill') drawFillStyle(ctx, node);
    else if (node.type === 'minecraft:image' && node.props.kind === 'embedded') { const image = images[node.id]; if (!image) throw new Error(`嵌入式贴图 ${node.id} 尚未解码`); drawImageNode(ctx, node, node.bounds.w, node.bounds.h, image, cache); }
    else throw new Error('Bake资格在渲染期间发生变化');
    ctx.restore();
  }
  return canvas;
}
