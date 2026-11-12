import { createNode, emptyProject } from '../../src/domain/model';
import type { GuiProject } from '../../src/domain/schema';

export const EMBEDDED_IMAGE_DATA = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJ0lEQVR4nGNk+M/wnwEJ/GdE5jEwMKFyMQHlChj/M6C6gfpWEFQAAAnyBQtstGB+AAAAAElFTkSuQmCC';

export function embeddedImageProject(): GuiProject {
  const project = emptyProject();
  project.schemaVersion = '0.57.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  const image = createNode('minecraft:image', 'embedded_img', { x: 30, y: 30 });
  image.bounds = { ...image.bounds, w: 64, h: 64 };
  if (image.type !== 'minecraft:image') throw new Error('image');
  image.props = { kind: 'embedded', assetId: 'asset_tex', textureWidth: 8, textureHeight: 8, uv: { x: 0, y: 0, width: 8, height: 8 } };
  image.source = { category: 'custom-draw', className: 'gui-maker:embedded-image', member: 'blit' };
  project.assets = [{ id: 'asset_tex', name: 'upload.png', mime: 'image/png', width: 8, height: 8, data: EMBEDDED_IMAGE_DATA }];
  const texture = createNode('minecraft:image', 'texture_img', { x: 110, y: 30 });
  if (texture.type !== 'minecraft:image') throw new Error('texture');
  texture.props = { kind: 'texture', resourceId: 'minecraft:textures/gui/container/dispenser.png', textureWidth: 256, textureHeight: 256, uv: { x: 0, y: 0, width: 256, height: 256 }, tooltip: { kind: 'literal', value: '纹理提示' } };
  texture.source = { category: 'vanilla-draw', className: 'net.minecraft.client.gui.GuiGraphics', member: 'blit' };
  const sprite = createNode('minecraft:image', 'sprite_img', { x: 190, y: 30 });
  if (sprite.type !== 'minecraft:image') throw new Error('sprite');
  sprite.props = { kind: 'sprite', spriteId: 'minecraft:container/slot', tooltip: { kind: 'literal', value: 'Sprite 提示' } };
  sprite.source = { category: 'vanilla-draw', className: 'net.minecraft.client.gui.GuiGraphics', member: 'blitSprite' };
  project.screens[0].nodes = [image, texture, sprite];
  project.screens[0].bakeGroups = [{ id: 'bakegroup_1', name: 'Embedded', memberIds: ['embedded_img'], enabled: true }];
  return project;
}
