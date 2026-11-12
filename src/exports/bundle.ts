import { buildBehaviorDiagnostics } from '../domain/behaviorDiagnostics';
import { GENERIC_BEHAVIOR_CONTRACT, typedEventSpecification, branchActionSpecification } from '../domain/genericBehavior';
import { renderDesignPng, renderPanelTexture, assertPngSize, referenceScale, type BakedImageLayer } from './designPng';
import { buildPrompt, buildSpecification, collectExclusiveVisibilityMappings, collectTextMappings } from './specification';
import { deepFreeze, referenceFor, sha256, type ExportReference, type ExportSnapshot } from './snapshot';
import { panelBounds, panelSource, panelTextureSide } from '../domain/panel';
import type { VisualSnapshot } from './visualSnapshot';
import { exportFilename, pageExportFilename, screenExportFilename } from './filenames';
import { displayText } from '../domain/model';
import { NAVIGATION_LIFECYCLE, RENDERING_CONTRACT } from '../domain/runtimeContract';
import { SAME_SCREEN_PAGE_RUNTIME_CONTRACT, persistentWidgetIds, sameScreenPages } from '../domain/sameScreenPages';
import { NATIVE_REGION_CONTRACT, nativeRegions } from '../domain/nativeRegion';
import { SINGLE_SLOT_CONTRACT, singleSlots } from '../domain/singleSlot';
import { isSelectionNode } from '../domain/selection';
import { isNumericNode } from '../render/numericWidgets';
import { isProgressNode } from '../domain/progress';
import { isStatusNode } from '../domain/statusIndicator';
import { isImageNode } from '../domain/image';
import { contentSize, contentViewport, isScrollablePanelNode } from '../domain/scrollablePanel';
import { containerLocalViewport, isCollapsiblePanelNode } from '../domain/collapsiblePanel';
import { isTreeViewNode } from '../domain/treeView';
import { REPEATABLE_LIST_DESIGN_PREVIEW_ROWS, REPEATABLE_LIST_RUNTIME_CONTRACT, isRepeatableListNode, repeatableContentSize, repeatableTemplateChildren, repeatableViewport } from '../domain/repeatableList';
import { actionsOf, isBranchAction, behaviorLeafActions, eventBindingsOf, sourcesOf, matchesBehaviorEvent, statusMappingsOf, statusAssignmentOf, F2_ACTION_TYPES, F2_EVENT_TYPES } from '../domain/schema';
import { SELECTION_STATUS_BINDING_CONTRACT } from '../domain/selectionStatusBinding';
import { CONDITIONAL_BEHAVIOR_CONTRACT } from '../domain/conditionalBehavior';
import { EXPORT_MANIFEST_VERSION } from './versions';
import { diagnoseBakeGroup } from '../domain/bake';
import { bakeGroupCanvas } from '../render/bake';
import { RECTANGLE_EDGE_BORDER_CONTRACT, fillEdgeStyle, fillPaintRects, fillStylePreset, hasCustomFillEdges } from '../domain/fillStyle';
import { normalizeNamespaceCandidate, translationKeyUses } from '../domain/localization';
import { EXCLUSIVE_VISIBILITY_CONTRACT } from '../domain/exclusiveVisibility';
import { TEXT_MAPPING_CONTRACT } from '../domain/textMapping';
import { TOOLTIP_CONTRACT, TOOLTIP_SUPPORT, supportsTooltip, tooltipDelivery } from '../domain/tooltip';
import { LOCALIZATION_RESOURCE_CONTRACT, buildLanguageFiles, collectLocalizationReport } from '../domain/localizationResources';
import { BUTTON_COLOR_MODE_CONTRACT, NATIVE_TEXT_CAPABILITY_VERSION, nativeTextDiagnostics } from '../domain/nativeTextCapability';
import { IMPLEMENTATION_NOTES_CONTRACT, implementationNotesForScreen } from '../domain/implementationNotes';
import { PAGE_EXPORT_CONTRACT, planPageExports, type PageExportImage, type PageExportMode, type PageExportVariant, type PageSelectionState } from './pageExport';
import { EMBEDDED_IMAGE_CONTRACT } from '../domain/embeddedImage';

export type ExportFile = { name: string; label: string; mime: string; bytes: Uint8Array };
type Renderer = (snapshot: ExportSnapshot, reference: ExportReference, pixelRatio: number, screenId: string, bakedLayers?: BakedImageLayer[], pageSelections?: PageSelectionState) => Promise<Uint8Array>;
type BundleOptions = { pageMode?: PageExportMode; pageSelections?: Record<string, Record<string, string>>; pagePlan?: ReadonlyMap<string, PageExportVariant[]>; imageAssets?: Record<string, import('../render/imageWidget').RenderedImageAsset>; imageCache?: import('../render/spritePreview').SpriteRasterCache };
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
  return screen.behaviors.flatMap((rule, ruleIndex) => (rule.event.type === 'selection-change' || rule.event.type === 'slider-change') ? actionsOf(rule).flatMap((action, actionIndex) => isBranchAction(action) ? [{
    ruleId: rule.id, ruleIndex, actionIndex, screenId: screen.id, sourceIds: sourcesOf(rule),
    event: typedEventSpecification(rule.event.type === 'slider-change' ? 'slider-change' : 'selection-change'), eventBindings: eventBindingsOf(rule), ...branchActionSpecification(action),
  }] : []) : []);
}

export async function buildBundle(snapshot: ExportSnapshot,
  renderer: Renderer = (doc, ref, scale, screenId, layers, selections) => renderDesignPng(doc, ref, scale, undefined, undefined, screenId, layers, selections),
  panelRenderer: PanelRenderer = renderPanelTexture, visual?: VisualSnapshot['manifest'], font?: { generation: number; name: string }, options: BundleOptions = {}) {
  const pagePlan = options.pagePlan ?? planPageExports(snapshot.document, options.pageMode, options.pageSelections);
  const reference = await referenceFor(snapshot), projectName = snapshot.document.project.name;
  const projectFile = exportFilename(projectName, 'project'), single = snapshot.document.screens.length === 1;
  const screenFiles = new Map<string, { design: string; reference: string; background?: string; pages: Map<string, { design: string; reference: string }> }>();
  const rendered = new Map<string, { png: Uint8Array; enlarged: Uint8Array; scale: number; panel?: Uint8Array; pages: Map<string, { png: Uint8Array; enlarged: Uint8Array; scale: number }> }>();
  const pageSpecFiles = new Map<string, PageExportImage[]>();
  const bakedFiles: ExportFile[] = [];
  const bakeAssets = new Map<string, { groupId: string; path: string; bounds: { x: number; y: number; w: number; h: number }; sha256: string; bytes: number; coordinateSpace: 'screen-gui'; clip: 'design-area'; drawOrder: 'first-member-position'; sourceNodesSuppressed: string[] }[]>();
  for (const screen of snapshot.document.screens) {
    assertPngSize(screen.designSize.width, screen.designSize.height);
    const title = displayText(screen.title);
    const names = single ? { design: exportFilename(projectName, 'design'), reference: exportFilename(projectName, 'reference'), ...(screen.background.kind === 'panel' ? { background: exportFilename(projectName, 'background') } : {}) }
      : { design: screenExportFilename(projectName, title, screen.id, 'design'), reference: screenExportFilename(projectName, title, screen.id, 'reference'), ...(screen.background.kind === 'panel' ? { background: screenExportFilename(projectName, title, screen.id, 'background') } : {}) };
    const layers: BakedImageLayer[] = [], assets: NonNullable<ReturnType<typeof bakeAssets.get>> = [];
    for (const group of screen.bakeGroups ?? []) {
      const diagnostic = diagnoseBakeGroup(screen, group);
      if (group.enabled && !diagnostic.eligible) throw new Error(`Bake Group ${group.id} 无法导出：${[...diagnostic.reasons, ...diagnostic.members.flatMap(member => member.reasons)].join('；')}`);
      if (!group.enabled || !diagnostic.eligible || !diagnostic.bounds) continue;
      const canvas = bakeGroupCanvas(screen, group, options.imageAssets, options.imageCache);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(`Bake Group ${group.id} PNG编码失败，本次ZIP未生成`)), 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer()), path = `assets/minecraft_gui_maker/bakes/${screen.id}/${group.id}.png`, digest = await sha256(bytes);
      layers.push({ group, bounds: diagnostic.bounds, canvas });
      bakedFiles.push({ name: path, label: `Static Bake · ${screen.id} · ${group.id} · ${diagnostic.bounds.w}×${diagnostic.bounds.h} GUI px`, mime: 'image/png', bytes });
      assets.push({ groupId: group.id, path, bounds: diagnostic.bounds, sha256: digest, bytes: bytes.byteLength, coordinateSpace: 'screen-gui', clip: 'design-area', drawOrder: 'first-member-position', sourceNodesSuppressed: [...group.memberIds] });
    }
    bakeAssets.set(screen.id, assets);
    const variants = pagePlan.get(screen.id)!;
    const pages = new Map<string, { design: string; reference: string }>();
    const pageOutputs = new Map<string, { png: Uint8Array; enlarged: Uint8Array; scale: number }>();
    let canonical: { png: Uint8Array; enlarged: Uint8Array; scale: number } | undefined;
    if (!variants.length) {
      const png = await renderer(snapshot, reference, 1, screen.id, layers), scale = referenceScale(screen.designSize.width, screen.designSize.height);
      const enlarged = scale === 1 ? png : await renderer(snapshot, reference, scale, screen.id, layers);
      canonical = { png, enlarged, scale };
    } else {
      for (const variant of variants) {
        const png = await renderer(snapshot, reference, 1, screen.id, layers, variant.selections), scale = referenceScale(screen.designSize.width, screen.designSize.height);
        const enlarged = scale === 1 ? png : await renderer(snapshot, reference, scale, screen.id, layers, variant.selections);
        const output = { png, enlarged, scale };
        pageOutputs.set(variant.id, output);
        if (variant.initial) canonical = output;
        const pageNames = variant.initial ? { design: names.design, reference: names.reference } : {
          design: pageExportFilename(projectName, title, screen.id, variant.title || variant.id, variant.id, 'design', single),
          reference: pageExportFilename(projectName, title, screen.id, variant.title || variant.id, variant.id, 'reference', single),
        };
        pages.set(variant.id, pageNames);
      }
      if (!canonical) throw new Error(`${screen.id} 的 Page 变体缺少初始 Page canonical 图像`);
      pageSpecFiles.set(screen.id, variants.map(variant => {
        const output = pageOutputs.get(variant.id)!, pageNames = pages.get(variant.id)!;
        return { pageId: variant.id, groupIds: variant.groupIds, title: variant.title || variant.id, initial: variant.initial, selections: variant.selections, designFile: pageNames.design, referenceFile: pageNames.reference, width: screen.designSize.width, height: screen.designSize.height, scale: output.scale };
      }));
    }
    const panel = names.background ? await panelRenderer(snapshot, reference, screen.id) : undefined;
    screenFiles.set(screen.id, { ...names, pages });
    rendered.set(screen.id, { ...canonical!, panel, pages: pageOutputs });
  }
  const panelFiles = Object.fromEntries([...screenFiles].flatMap(([id, names]) => names.background ? [[id, names.background]] : []));
  const diagnosticsFile = exportFilename(projectName, 'behavior-diagnostics');
  const diagnostics = buildBehaviorDiagnostics(snapshot.document, reference);
  const diagnosticsArtifact = textFile(diagnosticsFile, '行为诊断摘要（派生）', 'application/json', JSON.stringify(diagnostics, null, 2) + '\n');
  const diagnosticsEntry = { name: diagnosticsFile, bytes: diagnosticsArtifact.bytes.byteLength, sha256: await sha256(diagnosticsArtifact.bytes) };
  const spec = buildSpecification(snapshot, reference, projectFile, panelFiles, diagnosticsEntry, bakeAssets, pageSpecFiles);
  const implementationFile = exportFilename(projectName, 'implementation'), promptFile = exportFilename(projectName, 'prompt');
  const files: ExportFile[] = [textFile(projectFile, '权威设计 JSON', 'application/json', snapshot.projectJson), ...bakedFiles];
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
  for (const screen of snapshot.document.screens) {
    const output = rendered.get(screen.id)!;
    for (const page of pageSpecFiles.get(screen.id) ?? []) {
      if (page.initial) continue;
      const pageOutput = output.pages.get(page.pageId)!;
      files.push(
        { name: page.designFile, label: `${displayText(screen.title)} · Page ${page.title} · 设计区 PNG · ${page.width}×${page.height}`, mime: 'image/png', bytes: pageOutput.png },
        { name: page.referenceFile, label: `${displayText(screen.title)} · Page ${page.title} · 放大参考 PNG · ${pageOutput.scale}×`, mime: 'image/png', bytes: pageOutput.enlarged },
      );
    }
  }
  files.push(diagnosticsArtifact);
  const localizationReport = collectLocalizationReport(snapshot.document);
  const languageFiles = buildLanguageFiles(snapshot.document, localizationReport);
  const languageEntries = await Promise.all(languageFiles.map(async file => ({ ...file, sha256: await sha256(file.bytes) })));
  const includeLanguageInZip = snapshot.document.localization?.includeInZip === true;
  if (includeLanguageInZip) for (const file of languageFiles) files.push({ name: file.path, label: `语言资源 · ${file.locale} · ${file.keyCount} 键`, mime: 'application/json', bytes: file.bytes });
  const entries = await Promise.all(files.map(async file => ({ name: file.name, mime: file.mime, bytes: file.bytes.byteLength, sha256: await sha256(file.bytes) })));
  const entry = (name: string) => entries.find(item => item.name === name)!;
  const screens = snapshot.document.screens.map(screen => {
    const names = screenFiles.get(screen.id)!, output = rendered.get(screen.id)!;
    const style = screen.background.kind === 'panel' ? screen.background.style : null, origin = style ? panelSource(style) : null;
    return { screenId: screen.id, title: screen.title, designSize: screen.designSize,
      sameScreenPages: sameScreenPages(screen), persistentWidgetIds: persistentWidgetIds(screen), nativeRegions: nativeRegions(screen), singleSlots: singleSlots(screen),
      staticRectangles: screen.nodes.filter((node): node is Extract<typeof node, { type: 'minecraft:fill' }> => node.type === 'minecraft:fill').map(node => ({ nodeId: node.id, bounds: node.bounds, stylePreset: fillStylePreset(node), fillColor: node.props.color, borderColor: node.props.borderColor ?? '#FF202020', highlightColor: node.props.highlightColor ?? '#FFFFFFFF', shadowColor: node.props.shadowColor ?? '#FF555555', edgeBorder: hasCustomFillEdges(node) ? fillEdgeStyle(node) : null, paintRects: fillPaintRects(node), geometrySource: 'rectangleStyleContract' })),
      bakeGroups: (screen.bakeGroups ?? []).map(group => ({ ...group, diagnostic: diagnoseBakeGroup(screen, group), asset: bakeAssets.get(screen.id)?.find(asset => asset.groupId === group.id) ?? null, disabledFallback: !group.enabled ? 'draw original source nodes in document order; no PNG asset is emitted' : null })),
      implementationNotes: implementationNotesForScreen(screen),
      pages: (pageSpecFiles.get(screen.id) ?? []).map(page => ({ ...page, designImage: { ...entry(page.designFile), kind: 'design-area-reference', width: page.width, height: page.height, pixelRatio: 1, background: origin ?? 'transparent' }, enlargedReferenceImage: { ...entry(page.referenceFile), kind: page.scale === 1 ? 'design-area-reference' : 'enlarged-design-area-reference', width: page.width * page.scale, height: page.height * page.scale, pixelRatio: page.scale, background: origin ?? (page.scale === 1 ? 'transparent' : 'preview-matte-#1c2634') } })),
      designImage: { ...entry(names.design), kind: 'design-area-reference', width: screen.designSize.width, height: screen.designSize.height, pixelRatio: 1, background: origin ?? 'transparent' },
      enlargedReferenceImage: { ...entry(names.reference), kind: output.scale === 1 ? 'design-area-reference' : 'enlarged-design-area-reference', width: screen.designSize.width * output.scale, height: screen.designSize.height * output.scale, pixelRatio: output.scale, background: origin ?? (output.scale === 1 ? 'transparent' : 'preview-matte-#1c2634') },
      panelTexture: names.background ? { ...entry(names.background), file: names.background, source: origin, style, width: panelTextureSide(screen.designSize.width, screen.designSize.height), height: panelTextureSide(screen.designSize.width, screen.designSize.height), contentWidth: screen.designSize.width, contentHeight: screen.designSize.height, panelBounds: panelBounds(screen), pixelRatio: 1, origin: [0, 0], padding: 'transparent', layers: 'panel-only' } : null,
      tabGroups: screen.nodes.filter(node => node.type === 'minecraft:creative-tab' && (node.props.groupId || node.props.tabMode === 'screen-navigation')).map(node => node.type === 'minecraft:creative-tab' && node.props.tabMode === 'screen-navigation' ? { nodeId: node.id, mode: 'screen-navigation', navigationGroupId: node.props.navigationGroupId, navigationTabId: node.props.navigationTabId, targetScreenId: snapshot.document.screenTabGroups?.find(group => group.id === node.props.navigationGroupId)?.tabs.find(tab => tab.id === node.props.navigationTabId)?.targetScreenId ?? null, selectedOnThisScreen: snapshot.document.screenTabGroups?.find(group => group.id === node.props.navigationGroupId)?.tabs.find(tab => tab.id === node.props.navigationTabId)?.targetScreenId === screen.id } : { nodeId: node.id, mode: 'content', ...node.props }),
      selectionControls: screen.nodes.filter(isSelectionNode).map(node => ({ nodeId: node.id, type: node.type, options: node.props.options, initialSelectedOptionId: node.props.initialSelectedOptionId, events: node.events, binding: screen.behaviors.some(rule => matchesBehaviorEvent(rule, 'selection-change', node.id)) ? 'consumed-by-explicit-selection-change-rules; confirm only; game callbacks remain implementer responsibility' : 'unbound-implementation-intent', popupInDesignPng: false })),
      numericControls: screen.nodes.filter(isNumericNode).map(node => ({ nodeId: node.id, type: node.type, initialValue: node.props.initialValue, constraints: { min: node.props.min, max: node.props.max, step: node.props.step, numericType: node.props.numericType, format: node.props.format }, events: node.events, binding: 'unbound-implementation-intent' })),
      progressControls: screen.nodes.filter(isProgressNode).map(node => ({ nodeId: node.id, type: node.type, initialValue: node.props.initialValue, min: node.props.min, max: node.props.max, direction: node.props.direction, display: node.props.display, input: false, binding: 'session-local currentValue may be updated only by explicit set-progress-value actions; otherwise game implementation supplies live business data' })),
      sliderProgressBindings: screen.behaviors.flatMap((rule, ruleIndex) => eventBindingsOf(rule).filter(binding => binding.type === 'slider-change').flatMap(binding => actionsOf(rule).flatMap((action, actionIndex) => action.type === 'set-progress-value' ? [{ ruleId: rule.id, ruleIndex, actionIndex, sourceId: binding.sourceId, event: { type: 'slider-change', phase: 'change', payload: ['screenId', 'nodeId', 'value', 'phase'] }, targetId: action.targetId, mapping: action.mapping }] : []))),
      behaviorMaps: screen.behaviorMaps ?? [], selectionStatusBindings: selectionStatusBindingsForScreen(screen), exclusiveVisibilityMappings: collectExclusiveVisibilityMappings([screen]), textMappings: collectTextMappings([screen]), conditionalBehaviors: conditionalBehaviorsForScreen(screen), conditionalBehaviorContract: CONDITIONAL_BEHAVIOR_CONTRACT,
      statusIndicators: screen.nodes.filter(isStatusNode).map(node => ({ nodeId: node.id, initialStatusId: node.props.initialStatusId, statuses: node.props.statuses, shape: node.props.shape, showLabel: node.props.showLabel, event: node.events.change, binding: screen.behaviors.some(rule => (rule.event.type === 'selection-change' || rule.event.type === 'slider-change') && actionsOf(rule).some(action => behaviorLeafActions(action).some(leaf => leaf.type === 'set-status' && leaf.targetId === node.id))) ? 'updated by explicit constant statusId or optionId-to-statusId maps in the behavior rules; initialStatusId remains the Screen default' : 'unbound; caller supplies a declared statusId' })),
      images: screen.nodes.filter(isImageNode).map(node => ({ nodeId: node.id, bounds: node.bounds, sourceKind: node.props.kind, resourceId: node.props.kind === 'texture' ? node.props.resourceId : node.props.kind === 'embedded' ? `embedded:${node.props.assetId}` : node.props.spriteId, tooltip: node.props.tooltip ?? null, tooltipDelivery: tooltipDelivery(node), geometry: node.props.kind === 'sprite' ? { atlas: 'minecraft GUI atlas', scaling: 'GuiGraphics.blitSprite metadata stretch/tile/nine-slice behavior', customAtlas: false } : { logicalTextureSize: [node.props.textureWidth, node.props.textureHeight], uv: node.props.uv, drawRule: node.props.kind === 'embedded' ? 'embedded project PNG; map UV from logical dimensions to decoded PNG dimensions, then scale to bounds' : 'map UV from logical texture dimensions to decoded PNG dimensions, then scale to bounds' }, interaction: 'draw-only for focus/keyboard; tooltip is hover-only and does not make the image a general interactive widget; embedded custom draw must register its own hover hit' })),
      readOnlyScrollTexts: screen.nodes.filter(node => node.type === 'minecraft:fitting-multi-line-text-widget').map(node => ({ nodeId: node.id, viewport: node.bounds, text: node.props.text, color: node.props.color, initialScroll: node.props.initialScroll, runtimeState: 'scroll/focus are Screen instance state; JSON stores content and resets to top on every Screen init' })),
      scrollablePanels: screen.nodes.filter(isScrollablePanelNode).map(node => ({ nodeId: node.id, bounds: node.bounds, parentContainerId: node.parentContainerId ?? null, padding: node.props.padding, contentHeight: node.props.contentHeight, viewport: contentViewport(node), maxScroll: contentSize(node).maxScroll, initialScroll: 'top', children: screen.nodes.filter(child => child.parentContainerId === node.id).map(child => ({ nodeId: child.id, type: child.type, localBounds: child.bounds, coordinateSpace: 'container-content-local' })), runtimeOffset: 'session-only; not serialized', nestedContainers: 'cross-type-only; maximum two containers per branch' })),
      collapsiblePanels: screen.nodes.filter(isCollapsiblePanelNode).map(node => ({ nodeId: node.id, parentContainerId: node.parentContainerId ?? null, bounds: node.bounds, expandedHeight: node.bounds.h, collapsedHeight: node.props.headerHeight, headerHeight: node.props.headerHeight, title: node.props.title, initialExpanded: node.props.initialExpanded, viewport: containerLocalViewport(node, true), children: screen.nodes.filter(child => child.parentContainerId === node.id).map(child => ({ nodeId: child.id, type: child.type, localBounds: child.bounds, coordinateSpace: 'immediate-parent-content-local' })), currentExpanded: 'Screen-instance transient state; never written to project JSON', activation: ['pointer-primary', 'Enter', 'Space'], descendantIsolation: ['draw', 'hit', 'scroll', 'focus'] })),
      repeatableLists: screen.nodes.filter(isRepeatableListNode).map(node => ({ nodeId: node.id, bounds: node.bounds, viewport: repeatableViewport(node), rowHeight: node.props.rowHeight, rowGap: node.props.rowGap, padding: node.props.padding, templateId: node.props.templateId, dataSource: node.props.dataSource, initialScroll: node.props.initialScroll, designPreviewRows: REPEATABLE_LIST_DESIGN_PREVIEW_ROWS, designPreviewHeight: repeatableContentSize(node, REPEATABLE_LIST_DESIGN_PREVIEW_ROWS).height, templateOnly: true, expandedInstances: false, children: repeatableTemplateChildren(node, screen.nodes).map(child => ({ nodeId: child.id, type: child.type, localBounds: child.bounds, coordinateSpace: 'row-template-local' })), runtimeContract: REPEATABLE_LIST_RUNTIME_CONTRACT })),
      treeViews: screen.nodes.filter(isTreeViewNode).map(node => ({ nodeId: node.id, bounds: node.bounds, name: node.props.name, items: node.props.items, initialExpandedIds: node.props.initialExpandedIds, initialSelectedItemId: node.props.initialSelectedItemId, event: node.events.change, runtime: { expansionSelectionFocusScroll: 'PreviewSession/Screen-instance only; reset from initial fields on every Screen open', designPng: 'initial expansion and initial selection; all items remain in authority JSON', eventBinding: 'unbound implementation intent' } })),
      tooltips: screen.nodes.flatMap(node => supportsTooltip(node) && node.props.tooltip ? [{
        nodeId: node.id, type: node.type, tooltip: node.props.tooltip, bounds: node.bounds, parentContainerId: node.parentContainerId ?? null,
        access: TOOLTIP_SUPPORT[node.type].access, hitRegion: TOOLTIP_SUPPORT[node.type].hit, delivery: tooltipDelivery(node),
        ...(node.type === 'minecraft:image' ? { imageKind: node.props.kind, imageAssetId: node.props.kind === 'embedded' ? node.props.assetId : null } : {}),
        visibility: TOOLTIP_CONTRACT.visibility, itemStackBoundary: TOOLTIP_CONTRACT.itemStack,
      }] : []),
      behavior: { rules: screen.behaviors, conditionalActions: conditionalBehaviorsForScreen(screen), conditionalActionContract: CONDITIONAL_BEHAVIOR_CONTRACT, capabilities: { events: F2_EVENT_TYPES, actions: F2_ACTION_TYPES, executableByGuiMaker: false, preview: 'browser-only simulation; game callbacks are developer responsibility', ruleAndActionOrder: 'preserve JSON array order; if executes only the selected branch in branch array order', unboundWidgetEvents: 'implementation intent only; no F2 consumer' }, screenTargets: (screen.screenTargets ?? []).map(target => ({ ...target, bindingStatus: target.boundScreenId ? 'bound' : 'unbound' })) } };
  });
  const first = screens[0];
  const hasRepeatable = snapshot.document.screens.some(screen => screen.nodes.some(isRepeatableListNode));
  const textCapabilityDiagnostics = nativeTextDiagnostics(snapshot.document.screens.flatMap(screen => screen.nodes));
  const hasButtonColorMode = snapshot.document.screens.some(screen => screen.nodes.some(node => node.type === 'minecraft:button' || node.type === 'minecraft:cycle-button'));
  const manifest = deepFreeze({ nativeRegionContract: NATIVE_REGION_CONTRACT, tooltipContract: TOOLTIP_CONTRACT, localizationResourceContract: LOCALIZATION_RESOURCE_CONTRACT,
    ...(hasRepeatable ? { repeatableListContract: REPEATABLE_LIST_RUNTIME_CONTRACT } : {}),
    implementationNotesContract: IMPLEMENTATION_NOTES_CONTRACT,
    pageExportContract: PAGE_EXPORT_CONTRACT,
    embeddedAssets: snapshot.document.assets.map(asset => ({ id: asset.id, name: asset.name, mime: asset.mime, width: asset.width, height: asset.height, bytes: Math.floor(asset.data.length * 3 / 4) })),
    embeddedImageContract: EMBEDDED_IMAGE_CONTRACT,
    rectangleEdgeBorderContract: RECTANGLE_EDGE_BORDER_CONTRACT,
    singleSlotContract: SINGLE_SLOT_CONTRACT,
    nativeTextCapability: { version: NATIVE_TEXT_CAPABILITY_VERSION, target: 'Minecraft 1.21.1 / NeoForge 21.1.244', diagnostics: textCapabilityDiagnostics },
    ...(hasButtonColorMode ? { buttonColorModeContract: BUTTON_COLOR_MODE_CONTRACT } : {}),
    ...(snapshot.document.localization ? { localization: { modId: localizationReport.modId, modIdSource: localizationReport.modIdSource, sourceLocale: snapshot.document.localization.sourceLocale, includeInZip: includeLanguageInZip, locales: localizationReport.locales, missing: localizationReport.missing, fallbackConflicts: localizationReport.fallbackConflicts, unusedEntries: localizationReport.unusedEntries, languageFiles: languageEntries.map(file => ({ locale: file.locale, path: file.path, keyCount: file.keyCount, missingCount: file.missingCount, packaged: includeLanguageInZip, bytes: file.bytes.byteLength, sha256: file.sha256 })) } } : {}),
    rectangleStyleContract: { version: '1.0.0', coordinateUnit: 'integer GUI px', bounds: 'node-local half-open rectangle; all paint remains inside original node bounds', legacyDefault: 'missing stylePreset means plain and preserves props.color full-bounds fill', presets: { plain: 'fillColor over full bounds', framed: 'fillColor then 1 px inward borderColor; minimum 3x3', bevel_raised: '1 px borderColor then 1 px top/left highlightColor and bottom/right shadowColor; minimum 5x5', bevel_inset: 'same integer geometry with highlight and shadow sides reversed; minimum 5x5' }, alpha: 'each #AARRGGBB paint is source-over composited in the listed paint order', rendering: 'design canvas, preview reference PNG and Bake PNG share the same ordered integer fill rectangles; no stroke, antialias, shadow, or DPR-dependent geometry', hitTesting: 'original node bounds only; style edges do not create controls' }, localizationContract: { namespace: snapshot.document.project.localizationNamespace ?? normalizeNamespaceCandidate(snapshot.document.project.name).value, namespaceSource: snapshot.document.project.localizationNamespace ? 'explicit-project-field' : 'normalized-project-name-suggestion; not persisted until explicitly set', namespaceDiagnostic: snapshot.document.project.localizationNamespace ? null : normalizeNamespaceCandidate(snapshot.document.project.name).reason, storedKeys: translationKeyUses(snapshot.document), rule: 'Saved project text keys are authoritative; exporter never guesses or rewrites them from project name, alias or namespace. disabledKey only restores a translation mode in the editor; no language file is generated.' }, genericBehaviorContract: GENERIC_BEHAVIOR_CONTRACT, exclusiveVisibilityContract: EXCLUSIVE_VISIBILITY_CONTRACT, textMappingContract: TEXT_MAPPING_CONTRACT, format: 'minecraft-gui-maker-export-manifest', version: EXPORT_MANIFEST_VERSION, reference,
    versions: { projectSchema: snapshot.document.schemaVersion, manifest: EXPORT_MANIFEST_VERSION, exportReference: snapshot.contract, implementationSpecification: spec.version, responsibilities: { projectSchema: 'authoritative document structure; ONLY import compatibility gate', manifest: 'derived file inventory and metadata', exportReference: 'snapshot identity/hash and shared interpretation', implementationSpecification: 'derived implementation intent structure' } },
    entryScreenId: snapshot.document.entryScreenId ?? null, entryStatus: snapshot.document.entryScreenId ? 'explicit' : 'legacy-unspecified', navigationLifecycle: NAVIGATION_LIFECYCLE, screenTabGroups: snapshot.document.screenTabGroups ?? [], sameScreenPageContract: SAME_SCREEN_PAGE_RUNTIME_CONTRACT, rendering: RENDERING_CONTRACT,
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
