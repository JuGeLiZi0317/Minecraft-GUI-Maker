import type { GuiNode } from '../domain/schema';

type Cycle = Extract<GuiNode, { type: 'minecraft:cycle-button' }>;

/** Ephemeral preview state. Never writes to a document, store, or persistence. */
export class CyclePreview {
  private values = new Map<string, string>();
  current(node: Cycle): string {
    const value = this.values.get(node.id);
    return value && node.props.options.some(option => option.id === value) ? value : node.props.initialOptionId;
  }
  step(node: Cycle, direction: 1 | -1): string {
    const options = node.props.options;
    const index = options.findIndex(option => option.id === this.current(node));
    const value = options[(index + direction + options.length) % options.length].id;
    this.values.set(node.id, value);
    return value;
  }
  clear(): void { this.values.clear(); }
}
