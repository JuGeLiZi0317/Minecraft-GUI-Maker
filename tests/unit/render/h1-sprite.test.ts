import { describe, expect, it } from 'vitest';
import { createNode } from '../../../src/domain/model';
import { CHECKBOX_SPRITES, GUI_SPRITES } from '../../../src/resources/layered';
import { spriteForNode } from '../../../src/render/spritePreview';

describe('H1 sprite state selection', () => {
  it('uses focus, not hover, for both checkbox selection states', () => {
    const node = createNode('minecraft:checkbox', 'checkbox_1');
    if (node.type !== 'minecraft:checkbox') throw new Error('unexpected type');
    expect(spriteForNode(node)).toBe(CHECKBOX_SPRITES[0]);
    expect(spriteForNode(node, true, false)).toBe(CHECKBOX_SPRITES[0]);
    expect(spriteForNode(node, false, true)).toBe(CHECKBOX_SPRITES[1]);
    node.props.selected = true;
    expect(spriteForNode(node, true, false)).toBe(CHECKBOX_SPRITES[2]);
    expect(spriteForNode(node, false, true)).toBe(CHECKBOX_SPRITES[3]);
    node.state.enabled = false;
    expect(spriteForNode(node, false, false)).toBe(CHECKBOX_SPRITES[2]);
  });
  it('uses the audited AbstractButton state mapping for cycle buttons', () => {
    const node = createNode('minecraft:cycle-button', 'cycle_1');
    if (node.type !== 'minecraft:cycle-button') throw new Error('unexpected type');
    expect(spriteForNode(node)).toBe(GUI_SPRITES[0]);
    expect(spriteForNode(node, true)).toBe(GUI_SPRITES[1]);
    expect(spriteForNode(node, false, true)).toBe(GUI_SPRITES[1]);
    node.state.enabled = false;
    expect(spriteForNode(node, true, true)).toBe(GUI_SPRITES[2]);
  });
});
