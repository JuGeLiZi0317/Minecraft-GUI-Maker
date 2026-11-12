import { describe, expect, it } from 'vitest';
import { createNode, emptyProject, literal, upgradeTooltipEdit } from '../../../src/domain/model';
import { parseProject } from '../../../src/domain/schema';
import { activeTooltip, supportsTooltip, tooltipError, tooltipHoverAtPoint, tooltipPreviewText } from '../../../src/domain/tooltip';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';
import type { GuiNode, GuiProject } from '../../../src/domain/schema';

const doc = (version = '0.49.0'): GuiProject => {
  const project = emptyProject(); project.schemaVersion = version as GuiProject['schemaVersion'];
  project.entryScreenId = project.screens[0].id; project.screenTabGroups = [];
  return project;
};

describe('Q4-D tooltip contract', () => {
  it('supports exactly the audited widget set and keeps non-interactive nodes out', () => {
    const supported = ['minecraft:button', 'minecraft:checkbox', 'minecraft:cycle-button', 'minecraft:slider', 'minecraft:edit-box', 'minecraft:numeric-input', 'minecraft:radio-group', 'minecraft:dropdown', 'minecraft:tree-view', 'minecraft:scrollable-panel', 'minecraft:collapsible-panel', 'minecraft:image'] as const;
    for (const type of supported) expect(supportsTooltip(createNode(type, `node_${type.replaceAll(':', '_')}`))).toBe(true);
    for (const type of ['minecraft:fill', 'minecraft:string-widget', 'minecraft:status-indicator', 'minecraft:progress-bar', 'native_region'] as const) expect(supportsTooltip(createNode(type, `node_${type.replaceAll(':', '_')}`))).toBe(false);
  });

  it('allows empty legacy literal but rejects oversized text and illegal translation keys', () => {
    expect(tooltipError(undefined)).toBeNull();
    expect(tooltipError(literal(''))).toBeNull();
    expect(tooltipError({ kind: 'translate', key: 'gui.customdim.time.tooltip', fallback: 'Tip' })).toBeNull();
    expect(tooltipError({ kind: 'translate', key: 'bad key', fallback: 'Tip' })).toContain('翻译键');
    expect(tooltipError(literal('x'.repeat(1025)))).toContain('1024');
    expect(tooltipError({ kind: 'translate', key: 'gui.ok', fallback: 'x'.repeat(1025) })).toContain('fallback');
    expect(activeTooltip({ ...createNode('minecraft:button', 'b'), props: { ...createNode('minecraft:button', 'b').props, tooltip: literal('   ') } } as GuiNode)).toBeNull();
  });

  it('requires Schema 0.57.0 for Image / Sprite tooltips', () => {
    const image = createNode('minecraft:image', 'image_tip') as Extract<GuiNode, { type: 'minecraft:image' }>;
    image.props = { kind: 'texture', resourceId: 'minecraft:textures/gui/container/dispenser.png', textureWidth: 256, textureHeight: 256, uv: { x: 0, y: 0, width: 256, height: 256 }, tooltip: literal('Image tip') };
    const old = doc('0.56.0'); old.screens[0].nodes.push(image);
    expect(() => parseProject(JSON.stringify(old))).toThrow('0.57.0');
    const current = doc('0.57.0'); current.screens[0].nodes.push(image);
    expect(parseProject(JSON.stringify(current)).screens[0].nodes[0]).toMatchObject({ props: { tooltip: { kind: 'literal', value: 'Image tip' } } });
  });

  it('requires Schema 0.49.0 for newly exposed widget tooltips but keeps legacy Button tooltip compatible', () => {
    const button = createNode('minecraft:button', 'legacy_button'); if (button.type === 'minecraft:button') button.props.tooltip = literal('Legacy tip');
    const oldButton = doc('0.48.0'); oldButton.screens[0].nodes.push(button);
    expect(parseProject(JSON.stringify(oldButton)).schemaVersion).toBe('0.48.0');

    const checkbox = createNode('minecraft:checkbox', 'tip_checkbox'); if (checkbox.type === 'minecraft:checkbox') checkbox.props.tooltip = literal('Tip');
    const oldCheckbox = doc('0.48.0'); oldCheckbox.screens[0].nodes.push(checkbox);
    expect(() => parseProject(JSON.stringify(oldCheckbox))).toThrow('0.49.0');

    const current = doc(); current.screens[0].nodes.push(checkbox);
    expect(parseProject(JSON.stringify(current)).screens[0].nodes[0]).toMatchObject({ props: { tooltip: { kind: 'literal', value: 'Tip' } } });
    const upgraded = createEditorStore(); upgraded.getState().add('minecraft:checkbox');
    upgraded.getState().updateNode(upgraded.getState().selected!, node => { if (node.type === 'minecraft:checkbox') node.props.tooltip = literal('Tip'); return node; });
    expect(upgraded.getState().doc.schemaVersion).toBe('0.49.0');
  });

  it('resolves topmost hit regions, container clipping, page visibility and Dropdown overlay priority', () => {
    const panel = createNode('minecraft:scrollable-panel', 'panel') as Extract<GuiNode, { type: 'minecraft:scrollable-panel' }>; panel.bounds = { x: 0, y: 0, w: 200, h: 100 }; panel.props.tooltip = literal('Panel tip');
    const button = createNode('minecraft:button', 'button') as Extract<GuiNode, { type: 'minecraft:button' }>; button.bounds = { x: 10, y: 10, w: 80, h: 20 }; button.parentContainerId = 'panel'; button.props.tooltip = literal('Button tip');
    const bare = createNode('minecraft:checkbox', 'bare') as Extract<GuiNode, { type: 'minecraft:checkbox' }>; bare.bounds = { x: 10, y: 40, w: 80, h: 20 }; bare.parentContainerId = 'panel';
    const nodes: GuiNode[] = [panel, button, bare];
    const options = { expanded: { panel: true }, isVisible: () => true };
    expect(tooltipHoverAtPoint(nodes, { x: 20, y: 15 }, options)?.nodeId).toBe('button');
    // A control without a tooltip blocks the container tooltip underneath it.
    expect(tooltipHoverAtPoint(nodes, { x: 20, y: 45 }, options)).toBeNull();
    expect(tooltipHoverAtPoint(nodes, { x: 150, y: 80 }, options)?.nodeId).toBe('panel');
    expect(tooltipHoverAtPoint(nodes, { x: 250, y: 80 }, options)).toBeNull();
    expect(tooltipHoverAtPoint(nodes, { x: 20, y: 15 }, { ...options, overlayOpen: true })).toBeNull();
    // Hiding the topmost control reveals the container tooltip underneath it.
    expect(tooltipHoverAtPoint(nodes, { x: 20, y: 15 }, { ...options, isVisible: node => node.id !== 'button' })?.nodeId).toBe('panel');
    expect(tooltipHoverAtPoint(nodes, { x: 20, y: 15 }, { ...options, isVisible: () => false })).toBeNull();
  });

  it('limits a Collapsible Panel tooltip to the header and never overrides Native Region', () => {
    const panel = createNode('minecraft:collapsible-panel', 'collapse') as Extract<GuiNode, { type: 'minecraft:collapsible-panel' }>; panel.bounds = { x: 0, y: 0, w: 180, h: 96 }; panel.props.tooltip = literal('Header tip');
    const child = createNode('minecraft:button', 'child'); child.bounds = { x: 8, y: 8, w: 80, h: 20 }; child.parentContainerId = 'collapse';
    const options = { expanded: { collapse: true }, isVisible: () => true };
    expect(tooltipHoverAtPoint([panel, child], { x: 20, y: 10 }, options)?.nodeId).toBe('collapse');
    expect(tooltipHoverAtPoint([panel, child], { x: 150, y: 70 }, options)).toBeNull();
    const region = createNode('native_region', 'region'); region.bounds = { x: 0, y: 0, w: 162, h: 76 }; region.state.visible = true;
    expect(tooltipHoverAtPoint([region], { x: 20, y: 20 }, { expanded: {}, isVisible: () => true })).toBeNull();
    expect(tooltipPreviewText({ kind: 'translate', key: 'gui.tip', fallback: '提示' })).toBe('提示');
    expect(tooltipPreviewText({ kind: 'translate', key: 'gui.tip', fallback: '' })).toBe('⟦gui.tip⟧');
  });

  it('exports the same tooltip definitions into manifest and implementation specification', async () => {
    const project = doc();
    const button = createNode('minecraft:button', 'tip_button'); if (button.type === 'minecraft:button') button.props.tooltip = { kind: 'translate', key: 'gui.customdim.tip', fallback: '提示' };
    const checkbox = createNode('minecraft:checkbox', 'tip_checkbox'); if (checkbox.type === 'minecraft:checkbox') checkbox.props.tooltip = literal('Plain tip');
    project.screens[0].nodes.push(button, checkbox);
    const renderer = async (_snapshot: unknown, _reference: unknown, scale: number) => new Uint8Array([scale]);
    const bundle = await buildBundle(beginExport(project), renderer as never);
    expect(bundle.manifest.tooltipContract.version).toBe('1.1.0');
    expect(bundle.manifest.screens[0].tooltips).toEqual([
      expect.objectContaining({ nodeId: 'tip_button', access: 'native-abstract-widget', hitRegion: 'whole-bounds' }),
      expect.objectContaining({ nodeId: 'tip_checkbox' }),
    ]);
    const spec = JSON.parse(new TextDecoder().decode(bundle.files.find(file => file.name.endsWith('.implementation.json'))!.bytes));
    expect(spec.tooltipContract.visibility).toContain('Dropdown overlay');
    expect(spec.designIntent.screens[0].tooltips.map((item: { nodeId: string }) => item.nodeId)).toEqual(['tip_button', 'tip_checkbox']);
    expect(spec.implementationRequirements.join(' ')).toContain('native AbstractWidget tooltip');
  });
});

import { embeddedImageProject } from '../../fixtures/embeddedImageProject';

describe('Q5-M Image tooltip delivery export', () => {
  it('distinguishes native Texture/Sprite from embedded custom-draw delivery per node', async () => {
    const project = embeddedImageProject();
    project.screens[0].bakeGroups = [];
    const image = project.screens[0].nodes.find(node => node.id === 'embedded_img');
    if (image?.type === 'minecraft:image') image.props.tooltip = literal('Embedded tip');
    const snapshot = beginExport(project);
    const bundle = await buildBundle(snapshot, async () => new Uint8Array([1]), async () => new Uint8Array([1]));
    const tooltips = bundle.manifest.screens[0].tooltips as { nodeId: string; delivery: string; imageKind?: string; imageAssetId?: string | null }[];
    expect(tooltips.find(item => item.nodeId === 'embedded_img')).toMatchObject({ delivery: 'custom-draw', imageKind: 'embedded', imageAssetId: 'asset_tex' });
    expect(tooltips.find(item => item.nodeId === 'texture_img')).toMatchObject({ delivery: 'native-image-widget', imageKind: 'texture' });
    expect(tooltips.find(item => item.nodeId === 'sprite_img')).toMatchObject({ delivery: 'native-image-widget', imageKind: 'sprite' });
    const images = bundle.manifest.screens[0].images as { nodeId: string; tooltipDelivery: string }[];
    expect(images.find(item => item.nodeId === 'embedded_img')?.tooltipDelivery).toBe('custom-draw');
    const spec = JSON.parse(new TextDecoder().decode(bundle.files.find(file => file.name.endsWith('.implementation.json'))!.bytes));
    expect(spec.designIntent.screens[0].tooltips.find((item: { nodeId: string }) => item.nodeId === 'embedded_img')).toMatchObject({ delivery: 'custom-draw', imageKind: 'embedded', imageAssetId: 'asset_tex' });
    expect(spec.tooltipContract.imageDelivery.embedded).toMatchObject({ native: false, delivery: 'custom-draw' });
    expect(spec.designIntent.screens[0].images).toBeUndefined();
  });
});

describe('Legacy Image tooltip import migration', () => {
  it('accepts a 0.56 project that already contains image tooltip data and upgrades only the version', () => {
    const project = embeddedImageProject(); project.schemaVersion = '0.56.0';
    const json = JSON.stringify(project);
    expect(() => parseProject(json)).toThrow('0.57.0');
    const migrated = parseProject(json, { allowImageTooltipUpgrade: true });
    expect(migrated.schemaVersion).toBe('0.57.0');
    const texture = migrated.screens[0].nodes.find(node => node.id === 'texture_img');
    expect(texture?.type === 'minecraft:image' ? texture.props.tooltip : undefined).toEqual({ kind: 'literal', value: '纹理提示' });
    const editable = embeddedImageProject(); editable.schemaVersion = '0.56.0';
    upgradeTooltipEdit(editable);
    expect(editable.schemaVersion).toBe('0.57.0');
  });
});
