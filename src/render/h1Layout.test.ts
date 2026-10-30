import { describe, expect, it } from 'vitest';
import { createNode } from '../domain/model';
import { CHECKBOX_PREVIEW_LIMIT, checkboxLayout, cycleLabel } from './h1Layout';

describe('H1 approximate layout helpers', () => {
  it('keeps checkbox maximum width separate from reference bounds and reports overflow', () => {
    const node = createNode('minecraft:checkbox', 'check_1');
    if (node.type !== 'minecraft:checkbox') throw new Error('unexpected');
    node.props.message = { kind: 'literal', value: 'abcd' }; node.props.maxWidth = 22;
    node.bounds.w = 22; node.bounds.h = 17;
    const result = checkboxLayout(node, text => text.length * 6);
    expect(result.lines).toEqual(['abc', 'd']);
    expect(result.overflow).toBe(true);
    node.bounds.w = 100;
    expect(checkboxLayout(node, text => text.length * 6).naturalWidth).toBe(result.naturalWidth);
    expect(node.props.maxWidth).toBe(22);
  });
  it('uses option ID rather than display text and supports both display formats', () => {
    const node = createNode('minecraft:cycle-button', 'cycle_1');
    if (node.type !== 'minecraft:cycle-button') throw new Error('unexpected');
    expect(cycleLabel(node)).toBe('Option: One');
    expect(cycleLabel(node, 'option_2')).toBe('Option: Two');
    node.props.displayFormat = 'value-only'; expect(cycleLabel(node)).toBe('One');
    expect(node.props.initialOptionId).toBe('option_1');
    expect(() => cycleLabel(node, 'absent')).toThrow();
  });
  it('limits text measurement and indicates truncation for huge inputs', () => {
    const node = createNode('minecraft:checkbox', 'check_1');
    if (node.type !== 'minecraft:checkbox') throw new Error('unexpected');
    node.props.message = { kind: 'literal', value: 'a'.repeat(2_000_000) };
    let calls = 0, maxLength = 0;
    const result = checkboxLayout(node, text => { calls++; maxLength = Math.max(maxLength, text.length); return text.length * 6; });
    expect(result.truncated).toBe(true);
    expect(calls).toBeLessThan(CHECKBOX_PREVIEW_LIMIT * 3);
    expect(maxLength).toBeLessThanOrEqual(CHECKBOX_PREVIEW_LIMIT + 1);
    expect(result.lines.join('')).toHaveLength(CHECKBOX_PREVIEW_LIMIT + 1);
  });
  it('does not split a surrogate pair at the preview limit', () => {
    const node = createNode('minecraft:checkbox', 'check_1');
    if (node.type !== 'minecraft:checkbox') throw new Error('unexpected');
    const original = 'a'.repeat(1023) + '😀' + 'z'; node.props.message = { kind: 'literal', value: original };
    const result = checkboxLayout(node, text => text.length);
    expect(result.truncated).toBe(true);
    expect(result.lines.join('')).toBe('a'.repeat(1023) + '…');
    expect(node.props.message.value).toBe(original);
  });
});
