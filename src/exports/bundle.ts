import { buildBehaviorDiagnostics } from '../domain/behaviorDiagnostics';
import { GENERIC_BEHAVIOR_CONTRACT, typedEventSpecification, conditionalLeafSpecification } from '../domain/genericBehavior';
import { renderDesignPng, renderPanelTexture, assertPngSize, referenceScale } from './designPng';
import { buildPrompt, buildSpecification } from './specification';
import { deepFreeze, referenceFor, sha256, type ExportReference, type ExportSnapshot } from './snapshot';
import { panelBounds, panelSource, panelTextureSide } from '../domain/panel';
import type { VisualSnapshot } from './visualSnapshot';
import { exportFilename, screenExportFilename } from './filenames';
import { displayText } from '../domain/model';
import { NAVIGATION_LIFECYCLE, RENDERING_CONTRACT } from '../domain/runtimeContract';
import { isSelectionNode } from '../domain/selection';
import { isNumericNode } from '../render/numericWidgets';
import { isProgressNode } from '../domain/progress';
import { isStatusNode } from '../domain/statusIndicator';
import { isImageNode } from '../domain/image';
import { contentSize, contentViewport, isScrollablePanelNode } from '../domain/scrollablePanel';
import { containerLocalViewport, isCollapsiblePanelNode } from '../domain/collapsiblePanel';
import { isTreeViewNode } from '../domain/treeView';
import { actionsOf, behaviorLeafActions, eventBindingsOf, sourcesOf, matchesBehaviorEvent, statusMappingsOf, statusAssignmentOf, F2_ACTION_TYPES, F2_EVENT_TYPES } from '../domain/schema';
import { SELECTION_STATUS_BINDING_CONTRACT } from '../domain/selectionStatusBinding';
import { CONDITIONAL_BEHAVIOR_CONTRACT } from '../domain/conditionalBehavior';
import { EXPORT_MANIFEST_VERSION } from './versions';

export type ExportFile = { name: string; label: string; mime: string; bytes: Uint8Array };
type Renderer = (snapshot: ExportSnapshot, reference: ExportReference, pixelRatio: number, screenId: string) => Promise<Uint8Array>;
type PanelRenderer = (snapshot: ExportSnapshot, reference: ExportReference, screenId: string) => Promise<Uint8Array>;
const textFile = (name: string, label: string, mime: string, content: string): ExportFile => ({ name, label, mime, bytes: new TextEncoder().encode(content) });
function selectionStatusBindingsForScreen(screen: ExportSnapshot['document']['screens'][number]) {
  return screen.behaviors.flatMap((rule, ruleIndex) => {
    const selections = eventBindingsOf(rule).filter(binding => binding.type === 'selection-change');
    return selections.length ? actionsOf(rule).flatMap((action, actionIndex) => {
    if (action.type !== 'set-status') return [];
    const optionMappings = statusMappingsOf(screen, action);
    const source = screen.nodes.find(node => node.id === selections[0].sourceId);
    const unmapped = !('statusId' in action) && source && isSelectionNode(source) ? source.props.options.filter(option => !optionMappings.some(mapping => mapping.optionId === option.id)).map(option => option.id) : [];
    return [{ ruleId: rule.id, ruleIndex, actionIndex, screenId: screen.id, sourceId: selections[0].sourceId, sourceIds: selections.map(binding => binding.sourceId), eventBindings: eventBindingsOf(rule), sharedActionChain: true, event: { type: 'selection-change', phase: 'confirm', payload: ['screenId', 'nodeId', 'optionId', 'phase', 'source'] }, targetId: action.targetId, ...statusAssignmentOf(action),
      unmapped,
      unmappedBySource: selections.map(binding => { const node = screen.nodes.find(node => node.id === binding.sourceId); return { nodeId: binding.sourceId, optionIds: !('statusId' in action) && node && isSelectionNode(node) ? node.props.options.filter(option => !optionMappings.some(mapping => mapping.optionId === option.id)).map(option => option.id) : [] }; }), unmappedPolicy: 'statusId' in action ? 'not-applicable: constant statusId assignment' : SELECTION_STATUS_BINDING_CONTRACT.unmapped }];
    }) : [];
  });
}
function conditionalBehaviorsForScreen(screen: ExportSnapshot['document']['screens'][number]) {
  return screen.behaviors.flatMap((rule, ruleIndex) => (rule.event.type === 'selection-change' || rule.event.type === 'slider-change') ? actionsOf(rule).flatMap((action, actionIndex) => action.type === 'if' ? [{
    ruleId: rule.id, ruleIndex, actionIndex, screenId: screen.id, sourceIds: sourcesOf(rule),
    event: typedEventSpecification(rule.event.type === 'slider-change' ? 'slider-change' : 'selection-change'), eventBindings: eventBindingsOf(rule), condition: action.condition,
    thenActions: action.thenActions.map(conditionalLeafSpecification),
    elseActions: action.elseActions.map(conditionalLeafSpecification),
  }] : []) : []);
}

export async function buildBundle(snapshot: ExportSnapshot,
  renderer: Renderer = (doc, ref, scale, screenId) => renderDesignPng(doc, ref, scale, undefined, undefined, screenId),
  panelRenderer: PanelRenderer = renderPanelTexture, visual?: VisualSnapshot['manifest'], font?: { generation: number; name: string }) {
  const reference = await referenceFor(snapshot), projectName = snapshot.document.project.name;
  const projectFile = exportFilename(projectName, 'project'), single = snapshot.document.screens.length === 1;
  const screenFiles = new Map<string, { design: string; reference: string; background?: string }>();
  const rendered = new Map<string, { png: Uint8Array; enlarged: Uint8Array; scale: number; panel?: Uint8Array }>();
  for (const screen of snapshot.document.screens) {
    assertPngSize(screen.designSize.width, screen.designSize.height);
    const title = displayText(screen.title);
    const names = single ? { design: exportFilename(projectName, 'design'), reference: exportFilename(projectName, 'reference'), ...(screen.background.kind === 'panel' ? { background: exportFilename(projectName, 'background') } : {}) }
      : { design: screenExportFilename(projectName, title, screen.id, 'design'), reference: screenExportFilename(projectName, title, screen.id, 'reference'), ...(screen.background.kind === 'panel' ? { background: screenExportFilename(projectName, title, screen.id, 'background') } : {}) };
    screenFiles.set(screen.id, names);
    const png = await renderer(snapshot, reference, 1, screen.id), scale = referenceScale(screen.designSize.width, screen.designSize.height);
    const enlarged = scale === 1 ? png : await renderer(snapshot, reference, scale, screen.id);
    const panel = names.background ? await panelRenderer(snapshot, reference, screen.id) : undefined;
    rendered.set(screen.id, { png, enlarged, scale, panel });
  }
  const panelFiles = Object.fromEntries([...screenFiles].flatMap(([id, names]) => names.background ? [[id, names.background]] : []));
  const diagnosticsFile = exportFilename(projectName, 'behavior-diagnostics');
  const diagnostics = buildBehaviorDiagnostics(snapshot.document, reference);
  const diagnosticsArtifact = textFile(diagnosticsFile, '行为诊断摘要（派生）', 'application/json', JSON.stringify(diagnostics, null, 2) + '\n');
  const diagnosticsEntry = { name: diagnosticsFile, bytes: diagnosticsArtifact.bytes.byteLength, sha256: await sha256(diagnosticsArtifact.bytes) };
  const spec = buildSpecification(snapshot, reference, projectFile, panelFiles, diagnosticsEntry);
  const implementationFile = exportFilename(projectName, 'implementation'), promptFile = exportFilename(projectName, 'prompt');
  const files: ExportFile[] = [textFile(projectFile, '权威设计 JSON', 'application/json', snapshot.projectJson)];
  if (single) {
    const screen = snapshot.document.screens[0], names = screenFiles.get(screen.id)!, output = rendered.get(screen.id)!;
    files.push({ name: names.design, label: `设计区 PNG · ${screen.designSize.width}×${screen.designSize.height} GUI px`, mime: 'image/png', bytes: output.png },
      textFile(implementationFile, '结构化实现规格（派生）', 'application/json', JSON.stringify(spec, null, 2) + '\n'),
      textFile(promptFile, 'Markdown 实现 Prompt（派生）', 'text/markdown', buildPrompt(spec)),
      { name: names.reference, label: `放大参考 PNG · ${output.scale}×${output.scale === 1 ? '（尺寸限制，无法放大）' : ''}`, mime: 'image/png', bytes: output.enlarged });
    if (names.background && output.panel) files.push({ name: names.background, label: `Panel 背景纹理 PNG · ${panelTextureSide(screen.designSize.width, screen.designSize.height)}×${panelTextureSide(screen.designSize.width, screen.designSize.height)}`, mime: 'image/png', bytes: output.panel });
  } else {
    for (const screen of snapshot.document.screens) { const names = screenFiles.get(screen.id)!, output = rendered.get(screen.id)!; files.push({ name: names.design, label: `${displayText(screen.title)} · 设计区 PNG · ${screen.designSize.width}×${screen.designSize.height}`, mime: 'image/png', bytes: output.png }); }
    files.push(textFile(implementationFile, '项目级结构化实现规格（派生）', 'application/json', JSON.stringify(spec, null, 2) + '\n'), textFile(promptFile, '项目级 Markdown 实现 Prompt（派生）', 'text/markdown', buildPrompt(spec)));
    for (const screen of snapshot.document.screens) { const names = screenFiles.get(screen.id)!, output = rendered.get(screen.id)!; files.push({ name: names.reference, label: `${displayText(screen.title)} · 放大参考 PNG · ${output.scale}×`, mime: 'image/png', bytes: output.enlarged }); if (names.background && output.panel) files.push({ name: names.background, label: `${displayText(screen.title)} · Panel 背景纹理 PNG`, mime: 'image/png', bytes: output.panel }); }
  }
  files.push(diagnosticsArtifact);
  const entries = await Promise.all(files.map(async file => ({ name: file.name, mime: file.mime, bytes: file.bytes.byteLength, sha256: await sha256(file.bytes) })));
  const entry = (name: string) => entries.find(item => item.name === name)!;
  const screens = snapshot.document.screens.map(screen => {
    const names = screenFiles.get(screen.id)!, output = rendered.get(screen.id)!;
    const style = screen.background.kind === 'panel' ? screen.background.style : null, origin = style ? panelSource(style) : null;
    return { screenId: screen.id, title: screen.title, designSize: screen.designSize,
      designImage: { ...entry(names.design), kind: 'design-area-reference', width: screen.designSize.width, height: screen.designSize.height, pixelRatio: 1, background: origin ?? 'transparent' },
      enlargedReferenceImage: { ...entry(names.reference), kind: output.scale === 1 ? 'design-area-reference' : 'enlarged-design-area-reference', width: screen.designSize.width * output.scale, height: screen.designSize.height * output.scale, pixelRatio: output.scale, background: origin ?? (output.scale === 1 ? 'transparent' : 'preview-matte-#1c2634') },
      panelTexture: names.background ? { ...entry(names.background), file: names.background, source: origin, style, width: panelTextureSide(screen.designSize.width, screen.designSize.height), height: panelTextureSide(screen.designSize.width, screen.designSize.height), contentWidth: screen.designSize.width, contentHeight: screen.designSize.height, panelBounds: panelBounds(screen), pixelRatio: 1, origin: [0, 0], padding: 'transparent', layers: 'panel-only' } : null,
      tabGroups: screen.nodes.filter(node => node.type === 'minecraft:creative-tab' && (node.props.groupId || node.props.tabMode === 'screen-navigation')).map(node => node.type === 'minecraft:creative-tab' && node.props.tabMode === 'screen-navigation' ? { nodeId: node.id, mode: 'screen-navigation', navigationGroupId: node.props.navigationGroupId, navigationTabId: node.props.navigationTabId, targetScreenId: snapshot.document.screenTabGroups?.find(group => group.id === node.props.navigationGroupId)?.tabs.find(tab => tab.id === node.props.navigationTabId)?.targetScreenId ?? null, selectedOnThisScreen: snapshot.document.screenTabGroups?.find(group => group.id === node.props.navigationGroupId)?.tabs.find(tab => tab.id === node.props.navigationTabId)?.targetScreenId === screen.id } : { nodeId: node.id, mode: 'content', ...node.props }),
      selectionControls: screen.nodes.filter(isSelectionNode).map(node => ({ nodeId: node.id, type: node.type, options: node.props.options, initialSelectedOptionId: node.props.initialSelectedOptionId, events: node.events, binding: screen.behaviors.some(rule => matchesBehaviorEvent(rule, 'selection-change', node.id)) ? 'consumed-by-explicit-selection-change-rules; confirm only; game callbacks remain implementer responsibility' : 'unbound-implementation-intent', popupInDesignPng: false })),
      numericControls: screen.nodes.filter(isNumericNode).map(node => ({ nodeId: node.id, type: node.type, initialValue: node.props.initialValue, constraints: { min: node.props.min, max: node.props.max, step: node.props.step, numericType: node.props.numericType, format: node.props.format }, events: node.events, binding: 'unbound-implementation-intent' })),
      progressControls: screen.nodes.filter(isProgressNode).map(node => ({ nodeId: node.id, type: node.type, initialValue: node.props.initialValue, min: node.props.min, max: node.props.max, direction: node.props.direction, display: node.props.display, input: false, binding: 'session-local currentValue may be updated only by explicit set-progress-value actions; otherwise game implementation supplies live business data' })),
      sliderProgressBindings: screen.behaviors.flatMap((rule, ruleIndex) => eventBindingsOf(rule).filter(binding => binding.type === 'slider-change').flatMap(binding => actionsOf(rule).flatMap((action, actionIndex) => action.type === 'set-progress-value' ? [{ ruleId: rule.id, ruleIndex, actionIndex, sourceId: binding.sourceId, event: { type: 'slider-change', phase: 'change', payload: ['screenId', 'nodeId', 'value', 'phase'] }, targetId: action.targetId, mapping: action.mapping }] : []))),
      behaviorMaps: screen.behaviorMaps ?? [], selectionStatusBindings: selectionStatusBindingsForScreen(screen), conditionalBehaviors: conditionalBehaviorsForScreen(screen), conditionalBehaviorContract: CONDITIONAL_BEHAVIOR_CONTRACT,
      statusIndicators: screen.nodes.filter(isStatusNode).map(node => ({ nodeId: node.id, initialStatusId: node.props.initialStatusId, statuses: node.props.statuses, shape: node.props.shape, showLabel: node.props.showLabel, event: node.events.change, binding: screen.behaviors.some(rule => (rule.event.type === 'selection-change' || rule.event.type === 'slider-change') && actionsOf(rule).some(action => behaviorLeafActions(action).some(leaf => leaf.type === 'set-status' && leaf.targetId === node.id))) ? 'updated by explicit constant statusId or optionId-to-statusId maps in the behavior rules; initialStatusId remains the Screen default' : 'unbound; caller supplies a declared statusId' })),
      images: screen.nodes.filter(isImageNode).map(node => ({ nodeId: node.id, bounds: node.bounds, sourceKind: node.props.kind, resourceId: node.props.kind === 'texture' ? node.props.resourceId : node.props.spriteId, geometry: node.props.kind === 'texture' ? { logicalTextureSize: [node.props.textureWidth, node.props.textureHeight], uv: node.props.uv, drawRule: 'map UV from logical texture dimensions to decoded PNG dimensions, then scale to bounds' } : { atlas: 'minecraft GUI atlas', scaling: 'GuiGraphics.blitSprite metadata stretch/tile/nine-slice behavior', customAtlas: false }, interaction: 'draw-only; no focus, mouse or keyboard routing; not registered as ImageWidget' })),
      readOnlyScrollTexts: screen.nodes.filter(node => node.type === 'minecraft:fitting-multi-line-text-widget').map(node => ({ nodeId: node.id, viewport: node.bounds, text: node.props.text, color: node.props.color, initialScroll: node.props.initialScroll, runtimeState: 'scroll/focus are Screen instance state; JSON stores content and resets to top on every Screen init' })),
      scrollablePanels: screen.nodes.filter(isScrollablePanelNode).map(node => ({ nodeId: node.id, bounds: node.bounds, parentContainerId: node.parentContainerId ?? null, padding: node.props.padding, contentHeight: node.props.contentHeight, viewport: contentViewport(node), maxScroll: contentSize(node).maxScroll, initialScroll: 'top', children: screen.nodes.filter(child => child.parentContainerId === node.id).map(child => ({ nodeId: child.id, type: child.type, localBounds: child.bounds, coordinateSpace: 'container-content-local' })), runtimeOffset: 'session-only; not serialized', nestedContainers: 'cross-type-only; maximum two containers per branch' })),
      collapsiblePanels: screen.nodes.filter(isCollapsiblePanelNode).map(node => ({ nodeId: node.id, parentContainerId: node.parentContainerId ?? null, bounds: node.bounds, expandedHeight: node.bounds.h, collapsedHeight: node.props.headerHeight, headerHeight: node.props.headerHeight, title: node.props.title, initialExpanded: node.props.initialExpanded, viewport: containerLocalViewport(node, true), children: screen.nodes.filter(child => child.parentContainerId === node.id).map(child => ({ nodeId: child.id, type: child.type, localBounds: child.bounds, coordinateSpace: 'immediate-parent-content-local' })), currentExpanded: 'Screen-instance transient state; never written to project JSON', activation: ['pointer-primary', 'Enter', 'Space'], descendantIsolation: ['draw', 'hit', 'scroll', 'focus'] })),
      treeViews: screen.nodes.filter(isTreeViewNode).map(node => ({ nodeId: node.id, bounds: node.bounds, name: node.props.name, items: node.props.items, initialExpandedIds: node.props.initialExpandedIds, initialSelectedItemId: node.props.initialSelectedItemId, event: node.events.change, runtime: { expansionSelectionFocusScroll: 'PreviewSession/Screen-instance only; reset from initial fields on every Screen open', designPng: 'initial expansion and initial selection; all items remain in authority JSON', eventBinding: 'unbound implementation intent' } })),
      behavior: { rules: screen.behaviors, conditionalActions: conditionalBehaviorsForScreen(screen), conditionalActionContract: CONDITIONAL_BEHAVIOR_CONTRACT, capabilities: { events: F2_EVENT_TYPES, actions: F2_ACTION_TYPES, executableByGuiMaker: false, preview: 'browser-only simulation; game callbacks are developer responsibility', ruleAndActionOrder: 'preserve JSON array order; if executes only the selected branch in branch array order', unboundWidgetEvents: 'implementation intent only; no F2 consumer' }, screenTargets: (screen.screenTargets ?? []).map(target => ({ ...target, bindingStatus: target.boundScreenId ? 'bound' : 'unbound' })) } };
  });
  const first = screens[0];
  const manifest = deepFreeze({ genericBehaviorContract: GENERIC_BEHAVIOR_CONTRACT, format: 'minecraft-gui-maker-export-manifest', version: EXPORT_MANIFEST_VERSION, reference,
    versions: { projectSchema: snapshot.document.schemaVersion, manifest: EXPORT_MANIFEST_VERSION, exportReference: snapshot.contract, implementationSpecification: spec.version, responsibilities: { projectSchema: 'authoritative document structure; ONLY import compatibility gate', manifest: 'derived file inventory and metadata', exportReference: 'snapshot identity/hash and shared interpretation', implementationSpecification: 'derived implementation intent structure' } },
    entryScreenId: snapshot.document.entryScreenId ?? null, entryStatus: snapshot.document.entryScreenId ? 'explicit' : 'legacy-unspecified', navigationLifecycle: NAVIGATION_LIFECYCLE, screenTabGroups: snapshot.document.screenTabGroups ?? [], rendering: RENDERING_CONTRACT,
    legacyCompatibility: { sourceScreenId: first.screenId, purpose: 'top-level image/behavior aliases only; NOT another Screen or authority' },
    behaviorDiagnostics: { ...entry(diagnosticsFile), authoritative: false },
    authority: { file: projectFile, sha256: reference.documentSha256, scope: 'entire-project' }, currentScreenIdAtCapture: snapshot.selectedScreenId, screens,
    designImage: first.designImage, enlargedReferenceImage: first.enlargedReferenceImage, panelTexture: first.panelTexture, tabGroups: first.tabGroups,
    behavior: single ? { version: snapshot.document.schemaVersion, rules: snapshot.document.screens[0].behaviors, capabilities: screens[0].behavior.capabilities, screenTargets: snapshot.document.screens[0].screenTargets ?? [], semantics: 'design-intent-only; browser preview is not generated Java behavior' } : { version: snapshot.document.schemaVersion, screens: screens.map(item => ({ screenId: item.screenId, ...item.behavior })), semantics: 'design-intent-only; bound open_screen identifies a real project Screen but game callbacks remain developer work' },
    sessions: { resources: visual ? { generation: visual.generation, base: visual.base, overlay: visual.overlay } : null, font: font ?? null },
    gameWindowImage: 'not-exported', ...(visual ? { visualResources: visual } : {}), files: entries });
  files.push(textFile(exportFilename(projectName, 'manifest'), '导出批次与坐标说明', 'application/json', JSON.stringify(manifest, null, 2) + '\n'));
  return { reference, manifest, files };
}
