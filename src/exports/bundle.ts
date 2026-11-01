import { renderDesignPng, renderPanelTexture, assertPngSize, referenceScale } from './designPng';
import { buildPrompt, buildSpecification } from './specification';
import { deepFreeze, referenceFor, sha256, type ExportReference, type ExportSnapshot } from './snapshot';
import { panelBounds, panelSource, panelTextureSide } from '../domain/panel';
import type { VisualSnapshot } from './visualSnapshot';
import { exportFilename, screenExportFilename } from './filenames';
import { displayText } from '../domain/model';
import { NAVIGATION_LIFECYCLE, RENDERING_CONTRACT } from '../domain/runtimeContract';
import { isNumericNode } from '../render/numericWidgets';

export type ExportFile = { name: string; label: string; mime: string; bytes: Uint8Array };
type Renderer = (snapshot: ExportSnapshot, reference: ExportReference, pixelRatio: number, screenId: string) => Promise<Uint8Array>;
type PanelRenderer = (snapshot: ExportSnapshot, reference: ExportReference, screenId: string) => Promise<Uint8Array>;
const textFile = (name: string, label: string, mime: string, content: string): ExportFile => ({ name, label, mime, bytes: new TextEncoder().encode(content) });

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
  const spec = buildSpecification(snapshot, reference, projectFile, panelFiles);
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
      numericControls: screen.nodes.filter(isNumericNode).map(node => ({ nodeId: node.id, type: node.type, initialValue: node.props.initialValue, constraints: { min: node.props.min, max: node.props.max, step: node.props.step, numericType: node.props.numericType, format: node.props.format }, events: node.events, binding: 'unbound-implementation-intent' })),
      behavior: { rules: screen.behaviors, screenTargets: (screen.screenTargets ?? []).map(target => ({ ...target, bindingStatus: target.boundScreenId ? 'bound' : 'unbound' })) } };
  });
  const first = screens[0];
  const manifest = deepFreeze({ format: 'minecraft-gui-maker-export-manifest', version: '0.11.0', reference,
    versions: { projectSchema: snapshot.document.schemaVersion, manifest: '0.11.0', exportReference: snapshot.contract, implementationSpecification: spec.version, responsibilities: { projectSchema: 'authoritative document structure; ONLY import compatibility gate', manifest: 'derived file inventory and metadata', exportReference: 'snapshot identity/hash and shared interpretation', implementationSpecification: 'derived implementation intent structure' } },
    entryScreenId: snapshot.document.entryScreenId ?? null, entryStatus: snapshot.document.entryScreenId ? 'explicit' : 'legacy-unspecified', navigationLifecycle: NAVIGATION_LIFECYCLE, screenTabGroups: snapshot.document.screenTabGroups ?? [], rendering: RENDERING_CONTRACT,
    legacyCompatibility: { sourceScreenId: first.screenId, purpose: 'top-level image/behavior aliases only; NOT another Screen or authority' },
    authority: { file: projectFile, sha256: reference.documentSha256, scope: 'entire-project' }, currentScreenIdAtCapture: snapshot.selectedScreenId, screens,
    designImage: first.designImage, enlargedReferenceImage: first.enlargedReferenceImage, panelTexture: first.panelTexture, tabGroups: first.tabGroups,
    behavior: single ? { version: snapshot.document.schemaVersion, rules: snapshot.document.screens[0].behaviors, screenTargets: snapshot.document.screens[0].screenTargets ?? [], semantics: 'design-intent-only; no executable game behavior' } : { version: snapshot.document.schemaVersion, screens: screens.map(item => ({ screenId: item.screenId, ...item.behavior })), semantics: 'design-intent-only; bound open_screen identifies a real project Screen but game callbacks remain developer work' },
    sessions: { resources: visual ? { generation: visual.generation, base: visual.base, overlay: visual.overlay } : null, font: font ?? null },
    gameWindowImage: 'not-exported', ...(visual ? { visualResources: visual } : {}), files: entries });
  files.push(textFile(exportFilename(projectName, 'manifest'), '导出批次与坐标说明', 'application/json', JSON.stringify(manifest, null, 2) + '\n'));
  return { reference, manifest, files };
}
