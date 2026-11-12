import { describe, expect, it, vi } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { parseProject } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';
import { drawPreviewText } from '../../../src/render/previewFont';
import { effectiveButtonColorMode } from '../../../src/domain/nativeTextCapability';

const capture = () => {
  const calls: string[] = [];
  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    fillText: vi.fn(() => calls.push(String(ctx.fillStyle))),
    fillStyle: '', font: '', textBaseline: '', textAlign: '',
  } as unknown as CanvasRenderingContext2D & { fillStyle: string };
  return { ctx, calls };
};

describe('Q5-A optional button color mode', () => {
  it('new Button/CycleButton default to native style; legacy nodes with color remain NeoForge', () => {
    const button = createNode('minecraft:button', 'button_1');
    if (button.type !== 'minecraft:button') throw new Error('type');
    expect(button.props.color).toBeUndefined();
    expect(effectiveButtonColorMode(button)).toBe('native');
    button.props.color = '#FF112233';
    expect(effectiveButtonColorMode(button)).toBe('neoforge');
    button.props.colorMode = 'native';
    expect(effectiveButtonColorMode(button)).toBe('native');
  });

  it('renders native white text without a color field, and NeoForge ARGB when selected', () => {
    const button = createNode('minecraft:button', 'button_1');
    const native = capture();
    drawPreviewText(native.ctx, button, button.bounds.w, button.bounds.h, 'monospace');
    expect(native.calls[0]).toBe('#FFFFFFFF');

    if (button.type !== 'minecraft:button') throw new Error('type');
    button.props.colorMode = 'neoforge';
    button.props.color = '#FF112233';
    const custom = capture();
    drawPreviewText(custom.ctx, button, button.bounds.w, button.bounds.h, 'monospace');
    expect(custom.calls[0]).toBe('rgba(17,34,51,1)');
  });

  it('requires Schema 0.52.0 only when colorMode is explicitly saved', () => {
    const project = emptyProject();
    project.schemaVersion = '0.51.0';
    project.entryScreenId = project.screens[0].id;
    const button = createNode('minecraft:button', 'button_1');
    if (button.type !== 'minecraft:button') throw new Error('type');
    button.props.colorMode = 'native';
    project.screens[0].nodes.push(button);
    expect(() => parseProject(JSON.stringify(project))).toThrow(/0\.52\.0/);

    const store = createEditorStore(emptyProject());
    store.getState().add('minecraft:button');
    expect(store.getState().doc.schemaVersion).not.toBe('0.52.0');
    store.getState().updateNode(store.getState().selected!, node => node.type === 'minecraft:button'
      ? { ...node, props: { ...node.props, colorMode: 'neoforge', color: '#FF112233' } }
      : node);
    expect(store.getState().doc.schemaVersion).toBe('0.52.0');
  });
});
