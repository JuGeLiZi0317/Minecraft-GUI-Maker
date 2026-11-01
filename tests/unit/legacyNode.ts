import { createNode } from '../../src/domain/model';
export const legacyNode: typeof createNode = (...args) => {
 const n = createNode(...args);
 if (n.type !== 'minecraft:creative-tab' && n.type !== 'minecraft:fill' && n.type !== 'minecraft:string-widget' && n.type !== 'minecraft:multi-line-text-widget') delete n.props.color;
 if (n.type === 'minecraft:multi-line-text-widget' || n.type === 'minecraft:slider') n.props.textShadow = true;
 return n;
};
