import { CATALOG } from './catalog';
import { displayText } from './model';
import type { GuiNode, GuiProject, TextSpec } from './schema';

/** Labels are presentation only. Every selector's stored value remains a stable node ID. */
export function behaviorNodeLabel(node: GuiNode, screen?: Pick<GuiProject['screens'][number], 'title'>) {
  const props = node.props;
  const text = node.alias ?? ('name' in props ? props.name : 'message' in props ? props.message : 'text' in props ? props.text : 'narration' in props ? props.narration : 'title' in props ? props.title : undefined) as TextSpec | string | undefined;
  return [node.alias ?? (typeof text === 'string' ? text.slice(0, 48) : text ? displayText(text).slice(0, 48) : ''), CATALOG[node.type].label, screen ? displayText(screen.title) : '', node.id].filter(Boolean).join(' · ');
}
