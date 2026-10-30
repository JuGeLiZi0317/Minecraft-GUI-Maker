import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from './model';
import { parseProject, projectSchema } from './schema';

describe('H1 draft schema', () => {
  it('keeps checkbox maxWidth independent from the reference bounds', () => {
    const node = createNode('minecraft:checkbox', 'checkbox_1');
    if (node.type !== 'minecraft:checkbox') throw new Error('unexpected type');
    const original = node.props.maxWidth;
    node.bounds.w = 50;
    node.bounds.h = 40;
    expect(node.props.maxWidth).toBe(original);
    const doc = emptyProject(); doc.schemaVersion = '0.4.0'; doc.screens[0].nodes.push(node);
    expect(projectSchema.safeParse(doc).success).toBe(true);
    doc.schemaVersion = '0.3.0';
    expect(projectSchema.safeParse(doc).success).toBe(false);
  });
  it('rejects duplicate or missing cycle option IDs and old version claims', () => {
    const node = createNode('minecraft:cycle-button', 'cycle_1');
    if (node.type !== 'minecraft:cycle-button') throw new Error('unexpected type');
    const doc = emptyProject(); doc.schemaVersion = '0.4.0'; doc.screens[0].nodes.push(node);
    expect(projectSchema.safeParse(doc).success).toBe(true);
    node.props.initialOptionId = 'missing'; expect(projectSchema.safeParse(doc).success).toBe(false);
    node.props.initialOptionId = 'option_1'; node.props.options[1].id = 'option_1'; expect(projectSchema.safeParse(doc).success).toBe(false);
  });
  it('round trips H1 with 0.4.0 and rejects older version claims', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.4.0'; doc.screens[0].nodes.push(createNode('minecraft:checkbox', 'checkbox_1'));
    expect(parseProject(JSON.stringify(doc))).toEqual(doc);
    doc.schemaVersion = '0.3.0'; expect(() => parseProject(JSON.stringify(doc))).toThrow('0.4.0');
  });
});
