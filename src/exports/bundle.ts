import { renderDesignPng, renderPanelTexture, assertPngSize, referenceScale } from './designPng';
import { buildPrompt, buildSpecification } from './specification';
import { deepFreeze, referenceFor, sha256, type ExportReference, type ExportSnapshot } from './snapshot';
import { panelBounds, panelSource, panelTextureSide } from '../domain/panel';
import type { VisualSnapshot } from './visualSnapshot';
import { exportFilename } from './filenames';

export type ExportFile = { name: string; label: string; mime: string; bytes: Uint8Array };
const textFile = (name: string, label: string, mime: string, content: string): ExportFile => ({ name, label, mime, bytes: new TextEncoder().encode(content) });
export async function buildBundle(snapshot: ExportSnapshot, renderer: (snapshot: ExportSnapshot, reference: ExportReference, pixelRatio?: number) => Promise<Uint8Array> = renderDesignPng, panelRenderer = renderPanelTexture, visual?: VisualSnapshot['manifest']) {
  const screen = snapshot.document.screens[0]; assertPngSize(screen.designSize.width, screen.designSize.height);
  const panelSide = screen.background.kind === 'panel' ? panelTextureSide(screen.designSize.width, screen.designSize.height) : null;
  const reference = await referenceFor(snapshot), name = snapshot.document.project.name;
  const filename = (kind: Parameters<typeof exportFilename>[1]) => exportFilename(name, kind);
  const projectFile = filename('project'), panelFile = screen.background.kind === 'panel' ? filename('background') : undefined;
  const spec = buildSpecification(snapshot, reference, projectFile, panelFile);
  const png = await renderer(snapshot, reference);
  const scale = referenceScale(screen.designSize.width, screen.designSize.height);
  const enlarged = scale === 1 ? png : await renderer(snapshot, reference, scale);
  const files: ExportFile[] = [
    textFile(projectFile, '权威设计 JSON', 'application/json', snapshot.projectJson),
    { name: filename('design'), label: `设计区 PNG · ${screen.designSize.width}×${screen.designSize.height} GUI px`, mime: 'image/png', bytes: png },
    textFile(filename('implementation'), '结构化实现规格（派生）', 'application/json', JSON.stringify(spec, null, 2) + '\n'),
    textFile(filename('prompt'), 'Markdown 实现 Prompt（派生）', 'text/markdown', buildPrompt(spec)),
    { name: filename('reference'), label: `放大参考 PNG · ${scale}×${scale === 1 ? '（尺寸限制，无法放大）' : ''}`, mime: 'image/png', bytes: enlarged },
  ];
  if (panelFile) files.push({ name: panelFile, label: `Panel 背景纹理 PNG · ${panelSide}×${panelSide}`, mime: 'image/png', bytes: await panelRenderer(snapshot, reference) });
  const entries = await Promise.all(files.map(async f => ({ name: f.name, mime: f.mime, bytes: f.bytes.byteLength, sha256: await sha256(f.bytes) })));
  const panelStyle = screen.background.kind === 'panel' ? screen.background.style : null;
  const panelOrigin = panelStyle ? panelSource(panelStyle) : null;
  const manifest = deepFreeze({ format: 'minecraft-gui-maker-export-manifest', version: '0.6.0', reference,
    authority: { file: projectFile, sha256: reference.documentSha256 },
    designImage: { file: filename('design'), kind: 'design-area-reference', width: screen.designSize.width, height: screen.designSize.height,
      unit: 'gui-px', origin: [0, 0], xDirection: 'right', yDirection: 'down', pixelRatio: 1, background: panelOrigin ?? 'transparent', approximate: true },
    enlargedReferenceImage: { file: filename('reference'), kind: scale === 1 ? 'design-area-reference' : 'enlarged-design-area-reference', width: screen.designSize.width * scale, height: screen.designSize.height * scale,
      unit: 'gui-px', origin: [0, 0], xDirection: 'right', yDirection: 'down', pixelRatio: scale, background: panelOrigin ?? (scale === 1 ? 'transparent' : 'preview-matte-#1c2634'), approximate: true },
    panelTexture: panelFile ? { file: panelFile, source: panelOrigin, style: panelStyle, width: panelSide, height: panelSide, contentWidth: screen.designSize.width, contentHeight: screen.designSize.height, panelBounds: panelBounds(screen), pixelRatio: 1, origin: [0, 0], xDirection: 'right', yDirection: 'down', padding: 'transparent', layers: 'panel-only' } : null,
    tabGroups: screen.nodes.filter(node => node.type === 'minecraft:creative-tab' && node.props.groupId).map(node => ({ nodeId: node.id, ...node.props })),
    behavior: { version: snapshot.document.schemaVersion, rules: screen.behaviors, screenTargets: screen.screenTargets ?? [], semantics: 'design-intent-only; no executable game behavior or screen navigation' },
    gameWindowImage: 'not-exported', ...(visual ? { visualResources: visual } : {}), files: entries });
  files.push(textFile(filename('manifest'), '导出批次与坐标说明', 'application/json', JSON.stringify(manifest, null, 2) + '\n'));
  return { reference, manifest, files };
}
