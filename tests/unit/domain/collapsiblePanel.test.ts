import { describe, expect, it } from 'vitest';
import { createNode, emptyProject } from '../../../src/domain/model';
import { COLLAPSIBLE_PANEL_RUNTIME_CONTRACT, containerChildScreenBounds, isContainerNode, nodeAbsoluteBounds, nodeVisibleBounds } from '../../../src/domain/collapsiblePanel';
import { parseProject } from '../../../src/domain/schema';
import { createEditorStore } from '../../../src/editor/store';

function combinedProject(order: 'scroll-then-collapse' | 'collapse-then-scroll' = 'scroll-then-collapse') {
  const doc = emptyProject(); doc.schemaVersion = '0.27.0'; doc.entryScreenId = 'screen_main'; doc.screenTabGroups = [];
  const scrollNode = createNode('minecraft:scrollable-panel', 'scroll_1', { x: 10, y: 10 });
  const collapseNode = createNode('minecraft:collapsible-panel', 'collapse_1', order === 'scroll-then-collapse' ? { x: 5, y: 5 } : { x: 10, y: 10 });
  if (scrollNode.type !== 'minecraft:scrollable-panel' || collapseNode.type !== 'minecraft:collapsible-panel') throw Error('factory returned wrong container type');
  const scroll = scrollNode, collapse = collapseNode;
  const button = createNode('minecraft:button', 'button_1', { x: 4, y: 3 });
  if (order === 'scroll-then-collapse') {
    collapse.bounds = { ...collapse.bounds, w: 130, h: 80 }; collapse.props.headerHeight = 20; collapse.props.initialExpanded = false; collapse.parentContainerId = scroll.id;
    button.bounds = { ...button.bounds, x: 4, y: 3, w: 120, h: 20 }; button.parentContainerId = collapse.id;
    scroll.props.contentHeight = 180; doc.screens[0].nodes = [scroll, collapse, button];
  } else {
    scroll.bounds = { x: 5, y: 5, w: 120, h: 60 }; scroll.props.contentHeight = 120; scroll.parentContainerId = collapse.id;
    button.bounds = { ...button.bounds, x: 4, y: 3, w: 100, h: 20 }; button.parentContainerId = scroll.id;
    doc.screens[0].nodes = [collapse, scroll, button];
  }
  return doc;
}

describe('Collapsible Panel schema, geometry and transient state', () => {
  it('publishes stable resize, focus, header and nested wheel defaults for the game implementation', () => {
    expect(COLLAPSIBLE_PANEL_RUNTIME_CONTRACT).toMatchObject({
      version: '1.1.0', collapsedFocus: expect.stringContaining('header toggle'),
      resize: expect.stringContaining('rebuilds the Screen-instance subtree'),
      headerLayout: { textInsetLeftGuiPx: 6, indicatorCenterInsetRightGuiPx: 9, expandedIndicator: '⌄', collapsedIndicator: '›', textShadow: false },
      nestedScrollableWheel: { defaultStepGuiPxPerNotch: 9 },
    });
  });

  it('adds a 0.28 widget without rejecting existing Collapsible Panels on other Screens', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.27.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
    doc.screens[0].nodes = [createNode('minecraft:collapsible-panel', 'collapse_main')];
    const other = structuredClone(doc.screens[0]); other.id = 'screen_other'; other.nodes[0].id = 'collapse_other'; doc.screens.push(other);
    const store = createEditorStore(doc), before = structuredClone(store.getState().doc);
    store.getState().add('minecraft:tree-view');
    expect(store.getState().doc.schemaVersion).toBe('0.28.0');
    expect(store.getState().doc.screens[0].nodes[0]).toEqual(before.screens[0].nodes[0]);
    expect(store.getState().doc.screens[1]).toEqual(before.screens[1]);
    expect(parseProject(JSON.stringify(store.getState().doc))).toEqual(store.getState().doc);
    store.getState().undo(); expect(store.getState().doc).toEqual(before);
    store.getState().redo(); expect(store.getState().doc.schemaVersion).toBe('0.28.0');
  });

  it('preserves 0.28 when moving a child into and out of a Collapsible Panel', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.28.0'; doc.entryScreenId = doc.screens[0].id; doc.screenTabGroups = [];
    const panel = createNode('minecraft:collapsible-panel', 'collapse_main', { x: 10, y: 10 });
    const button = createNode('minecraft:button', 'button_main', { x: 20, y: 40 });
    button.bounds.w = 80;
    doc.screens[0].nodes = [panel, button, createNode('minecraft:tree-view', 'tree_main')];
    const store = createEditorStore(doc);
    store.getState().setNodeContainer(button.id, panel.id);
    expect(store.getState().doc.schemaVersion).toBe('0.28.0');
    store.getState().setNodeContainer(button.id, undefined);
    expect(store.getState().doc.schemaVersion).toBe('0.28.0');
    expect(store.getState().doc.screens[0].nodes.find(node => node.id === button.id)?.bounds).toEqual(button.bounds);
    for (const type of ['minecraft:button', 'minecraft:slider', 'minecraft:scrollable-panel', 'minecraft:collapsible-panel', 'minecraft:fitting-multi-line-text-widget'] as const) {
      store.getState().add(type); expect(store.getState().doc.schemaVersion).toBe('0.28.0');
    }
    const before = store.getState().doc;
    expect(() => store.getState().setNodeContainer(panel.id, panel.id)).toThrow('自身父级');
    expect(store.getState().doc).toEqual(before);
  });
  it.each(['scroll-then-collapse', 'collapse-then-scroll'] as const)('accepts the bounded cross-container order %s with composed coordinates', order => {
    const doc = parseProject(JSON.stringify(combinedProject(order))), nodes = doc.screens[0].nodes;
    const childContainer = nodes.find(node => node.id === (order === 'scroll-then-collapse' ? 'collapse_1' : 'scroll_1'))!;
    const leaf = nodes.find(node => node.id === 'button_1')!;
    if (order === 'scroll-then-collapse') {
      if (childContainer.type !== 'minecraft:collapsible-panel') throw Error('wrong child container');
      expect(nodeAbsoluteBounds(childContainer, nodes)).toEqual({ x: 19, y: 19, w: 130, h: 80 });
      expect(nodeAbsoluteBounds(leaf, nodes)).toEqual({ x: 23, y: 42, w: 120, h: 20 });
      expect(nodeVisibleBounds(leaf, nodes)).toBeNull();
      expect(nodeVisibleBounds(leaf, nodes, {}, { collapse_1: true })).toEqual({ x: 23, y: 42, w: 120, h: 20 });
    } else {
      if (childContainer.type !== 'minecraft:scrollable-panel') throw Error('wrong child container');
      expect(nodeAbsoluteBounds(childContainer, nodes)).toEqual({ x: 15, y: 35, w: 120, h: 60 });
      expect(nodeAbsoluteBounds(leaf, nodes)).toEqual({ x: 23, y: 42, w: 100, h: 20 });
      expect(nodeVisibleBounds(leaf, nodes)).toEqual({ x: 23, y: 42, w: 100, h: 20 });
    }
    expect(isContainerNode(childContainer) && containerChildScreenBounds(childContainer, leaf, nodes)).toBeDefined();
  });

  it('rejects same-type nesting, dangling parents, over-depth trees and invalid header geometry atomically', () => {
    const sameType = combinedProject(); const second = createNode('minecraft:scrollable-panel', 'scroll_2'); second.bounds = { x: 0, y: 0, w: 100, h: 60 }; second.parentContainerId = 'scroll_1'; sameType.screens[0].nodes.push(second);
    expect(() => parseProject(JSON.stringify(sameType))).toThrow('交叉嵌套');
    const badHeader = combinedProject(); const collapse = badHeader.screens[0].nodes.find(node => node.type === 'minecraft:collapsible-panel')!;
    if (collapse.type === 'minecraft:collapsible-panel') collapse.props.headerHeight = collapse.bounds.h;
    expect(() => parseProject(JSON.stringify(badHeader))).toThrow('展开高度');
    const store = createEditorStore(); store.getState().add('minecraft:collapsible-panel');
    const before = store.getState().doc; expect(before.schemaVersion).toBe('0.27.0');
    expect(() => store.getState().setNodeContainer('node_1', 'missing')).toThrow('目标容器不存在');
    expect(store.getState().doc).toEqual(before);
    store.getState().undo(); expect(store.getState().doc.schemaVersion).toBe('0.1.0');
    store.getState().redo(); expect(store.getState().doc.schemaVersion).toBe('0.27.0');
    expect(parseProject(JSON.stringify(store.getState().doc))).toEqual(store.getState().doc);
  });

  it('keeps the expanded height above the header and large enough for existing children during resize', () => {
    const doc = emptyProject(); doc.schemaVersion = '0.27.0'; doc.entryScreenId = 'screen_main'; doc.screenTabGroups = [];
    const panelNode = createNode('minecraft:collapsible-panel', 'collapse_1');
    if (panelNode.type !== 'minecraft:collapsible-panel') throw Error('factory returned wrong panel type');
    panelNode.bounds = { x: 20, y: 20, w: 140, h: 96 };
    const child = createNode('minecraft:button', 'button_1', { x: 0, y: 0 });
    child.bounds = { x: 12, y: 35, w: 90, h: 22 }; child.parentContainerId = panelNode.id;
    doc.screens[0].nodes = [panelNode, child];
    const store = createEditorStore(doc);
    store.getState().beginGesture(panelNode.id);
    store.getState().previewBounds({ x: 20, y: 20, w: 40, h: 24 });
    expect(store.getState().gesture?.draft).toEqual({ x: 20, y: 20, w: 102, h: 77 });
    store.getState().commitGesture();
    expect(parseProject(JSON.stringify(store.getState().doc)).screens[0].nodes[0].bounds).toEqual({ x: 20, y: 20, w: 102, h: 77 });
    store.getState().undo();
    expect(store.getState().doc.screens[0].nodes[0].bounds).toEqual({ x: 20, y: 20, w: 140, h: 96 });
    store.getState().redo();
    expect(store.getState().doc.screens[0].nodes[0].bounds).toEqual({ x: 20, y: 20, w: 102, h: 77 });
  });

  it('rejects an invalid header edit without changing the project or history', () => {
    const store = createEditorStore(); store.getState().add('minecraft:collapsible-panel');
    store.getState().add('minecraft:button'); expect(store.getState().doc.schemaVersion).toBe('0.27.0');
    const before = store.getState().doc, panel = store.getState().doc.screens[0].nodes[0];
    expect(() => store.getState().updateNode(panel.id, node => node.type === 'minecraft:collapsible-panel' ? { ...node, props: { ...node.props, headerHeight: node.bounds.h } } : node)).toThrow('展开高度');
    expect(store.getState().doc).toEqual(before);
    expect(store.getState().past).toHaveLength(2);
  });
});
