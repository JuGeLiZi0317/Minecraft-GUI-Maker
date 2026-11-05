import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { imageError, resourceLocationError, textureSourceRect } from '../../../src/domain/image';
import { parseProject, exportProject } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { beginExport, referenceFor } from '../../../src/exports/snapshot';
import { buildBundle } from '../../../src/exports/bundle';
import { buildSpecification } from '../../../src/exports/specification';

describe('Image / Sprite node', () => {
  it('validates texture and atlas identifiers and maps logical UV to decoded pixel size', () => {
    const node = createNode('minecraft:image', 'image_1');
    expect(node.type).toBe('minecraft:image');
    if (node.type !== 'minecraft:image' || node.props.kind !== 'texture') throw new Error('unexpected image shape');
    expect(imageError(node)).toBeNull();
    expect(resourceLocationError('minecraft:../secret.png', 'texture')).toContain('非法');
    expect(resourceLocationError('minecraft:textures/gui/a.png', 'texture')).toBeNull();
    expect(resourceLocationError('minecraft:container/slot', 'sprite')).toBeNull();
    expect(resourceLocationError('example:container/slot', 'sprite')).toContain('GUI atlas');
    expect(textureSourceRect({ ...node, props: { ...node.props, uv: { x: 16, y: 32, width: 64, height: 128 }, textureWidth: 256, textureHeight: 256 } }, 512, 128))
      .toEqual({ x: 32, y: 16, width: 128, height: 64 });
    expect(imageError({ ...node, props: { ...node.props, uv: { x: 250, y: 0, width: 16, height: 16 } } })).toContain('逻辑贴图尺寸');
  });

  it('preserves stable node identity through Schema JSON, undo, redo, and multi-Screen export', async () => {
    const store = createEditorStore(emptyProject()); store.getState().add('minecraft:image');
    const nodeId = store.getState().selected!;
    expect(store.getState().doc.schemaVersion).toBe('0.22.0');
    const initial = structuredClone(store.getState().doc);
    store.getState().updateNode(nodeId, node => node.type === 'minecraft:image' ? { ...node, bounds: { ...node.bounds, w: 92 } } : node);
    const edited = structuredClone(store.getState().doc); store.getState().undo(); expect(store.getState().doc).toEqual(initial); store.getState().redo(); expect(store.getState().doc).toEqual(edited);
    expect(parseProject(exportProject(edited))).toEqual(edited);
    const second = structuredClone(edited.screens[0]); second.id = 'screen_other'; second.title = { kind: 'literal', value: 'Other' }; second.nodes = [createNode('minecraft:image', 'image_other')]; edited.screens.push(second);
    const snap = beginExport(edited), spec = buildSpecification(snap, await referenceFor(snap), 'project.json');
    expect(spec.version).toBe('0.18.0'); expect(spec.imageRuntimeContract.interaction).toContain('draw-only');
    const renderer = (async (_snapshot: unknown, _ref: unknown, scale: number) => new Uint8Array([scale])) as never;
    const bundle = await buildBundle(snap, renderer);
    expect(bundle.manifest.version).toBe('0.22.0'); expect(bundle.manifest.screens.map(screen => screen.images.map(image => image.nodeId))).toEqual([['node_1'], ['image_other']]);
    expect(bundle.files.some(file => file.name.endsWith('.json') && !file.name.endsWith('.implementation.json'))).toBe(true);
  });
});

