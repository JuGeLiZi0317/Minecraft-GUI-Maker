import { MAX_EDITABLE_DESIGN_SIZE } from './guiScale';
import { PANEL_MIN_SIZE } from './panel';
import { parseProject, PROJECT_SCHEMA_VERSIONS, type Bounds, type GuiProject } from './schema';

/** Build and validate both geometries together; never mutate live state on failure. */
export function prepareScreenGeometry(document: GuiProject, screenId: string, width: number, height: number, bounds?: Bounds): GuiProject {
  if (![width, height].every(value => Number.isInteger(value) && value >= 1 && value <= MAX_EDITABLE_DESIGN_SIZE)) throw new Error(`设计区宽高必须为1～${MAX_EDITABLE_DESIGN_SIZE}的整数`);
  const next = structuredClone(document), screen = next.screens.find(item => item.id === screenId);
  if (!screen) throw new Error('Screen 不存在');
  screen.designSize = { width, height, unit: 'gui-px' };
  if (bounds) {
    if (screen.background.kind !== 'panel') throw new Error('请先启用 Panel');
    screen.background.bounds = { ...bounds };
    if (PROJECT_SCHEMA_VERSIONS.indexOf(next.schemaVersion) < PROJECT_SCHEMA_VERSIONS.indexOf('0.9.0')) next.schemaVersion = '0.9.0';
  }
  if (screen.background.kind === 'panel') {
    const panel = screen.background.bounds;
    if (width < PANEL_MIN_SIZE || height < PANEL_MIN_SIZE) throw new Error('启用 Panel 时，设计区宽高不能小于 8；本次未修改');
    if (panel && (![panel.x, panel.y, panel.w, panel.h].every(Number.isInteger) || panel.x < 0 || panel.y < 0 || panel.w < PANEL_MIN_SIZE || panel.h < PANEL_MIN_SIZE || panel.x + panel.w > width || panel.y + panel.h > height)) throw new Error('Panel 最小 8×8 且必须位于设计区内；请配套调整 Panel 几何，或取消几何草稿；本次未修改');
  }
  if (screen.nodes.some(node => !node.parentContainerId && (node.bounds.x + node.bounds.w > width || node.bounds.y + node.bounds.h > height))) throw new Error('缩小后有组件超出设计区，请先移动或调整组件；本次未修改画布');
  return parseProject(JSON.stringify(next));
}
