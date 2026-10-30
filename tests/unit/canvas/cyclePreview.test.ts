import { expect, it } from 'vitest';
import { createNode } from '../../../src/domain/model';
import { CyclePreview } from '../../../src/canvas/cyclePreview';

it('cycles in isolated state and never mutates design initial value', () => {
  const node = createNode('minecraft:cycle-button', 'cycle_1');
  if (node.type !== 'minecraft:cycle-button') throw new Error('unexpected');
  const before = JSON.stringify(node), preview = new CyclePreview();
  expect(preview.current(node)).toBe('option_1');
  expect(preview.step(node, 1)).toBe('option_2');
  expect(preview.step(node, -1)).toBe('option_1');
  expect(preview.step(node, -1)).toBe('option_2');
  expect(JSON.stringify(node)).toBe(before);
  node.props.options = node.props.options.slice(0, 1);
  expect(preview.current(node)).toBe('option_1');
  preview.clear(); expect(preview.current(node)).toBe('option_1');
});
