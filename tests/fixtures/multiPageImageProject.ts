import { createNode, emptyProject } from '../../src/domain/model';
import type { GuiProject } from '../../src/domain/schema';
import { EMBEDDED_IMAGE_DATA } from './embeddedImageProject';

export function multiPageImageProject(): GuiProject {
  const project = emptyProject();
  project.schemaVersion = '0.57.0'; project.entryScreenId = 'screen_main'; project.screenTabGroups = [];
  const tabA = createNode('minecraft:creative-tab', 'page_image_a', { x: 10, y: 10 });
  const tabB = createNode('minecraft:creative-tab', 'page_image_b', { x: 40, y: 10 });
  if (tabA.type !== 'minecraft:creative-tab' || tabB.type !== 'minecraft:creative-tab') throw new Error('tab');
  tabA.props.groupId = 'pages'; tabA.props.contentIds = ['page_a_img']; tabA.props.selected = true;
  tabB.props.groupId = 'pages'; tabB.props.contentIds = ['page_b_img']; tabB.props.selected = false;
  const imageA = createNode('minecraft:image', 'page_a_img', { x: 10, y: 30 });
  const imageB = createNode('minecraft:image', 'page_b_img', { x: 110, y: 30 });
  if (imageA.type !== 'minecraft:image' || imageB.type !== 'minecraft:image') throw new Error('image');
  for (const image of [imageA, imageB]) {
    image.bounds = { ...image.bounds, w: 64, h: 64 };
    image.props = { kind: 'embedded', assetId: 'asset_tex', textureWidth: 8, textureHeight: 8, uv: { x: 0, y: 0, width: 8, height: 8 } };
    image.source = { category: 'custom-draw', className: 'gui-maker:embedded-image', member: 'blit' };
  }
  project.assets = [{ id: 'asset_tex', name: 'pages.png', mime: 'image/png', width: 8, height: 8, data: EMBEDDED_IMAGE_DATA }];
  project.screens[0].nodes = [tabA, tabB, imageA, imageB];
  return project;
}
