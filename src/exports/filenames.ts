/** Display filenames only: never change the authoritative project name. */
export function safeExportStem(name: string): string {
  let stem = name.normalize('NFC').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '_').replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, '_').trim().replace(/[. ]+$/g, '');
  // Limit UTF-8 bytes so suffixes also fit common 255-byte filename limits.
  const encoder = new TextEncoder(); let bounded = '';
  for (const char of stem) { if (encoder.encode(bounded + char).length > 120) break; bounded += char; }
  stem = bounded.trim().replace(/[. ]+$/g, '');
  if (!stem || /^\.+$/.test(stem)) stem = 'minecraft-gui';
  if (/^(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])[ .]*(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  return stem;
}
export type ExportKind = 'project' | 'design' | 'implementation' | 'prompt' | 'reference' | 'background' | 'manifest' | 'behavior-diagnostics' | 'zip' | 'recovery';
const suffix: Record<ExportKind, string> = { project: '.json', design: '.png', implementation: '.implementation.json', prompt: '.prompt.md', reference: '.reference.png', background: '.background.png', manifest: '.manifest.json', 'behavior-diagnostics': '.behavior-diagnostics.json', zip: '.zip', recovery: '.recovery-record.json' };
export function exportFilename(name: string, kind: ExportKind): string {
  return `${safeExportStem(name)}${suffix[kind]}`;
}

/** Screen derivatives are display files only. The stable ID prevents collisions after name sanitizing. */
/** Page variants are visual references only; the stable Page ID set prevents collisions. */
export function pageExportFilename(name: string, screenName: string, screenId: string, pageTitle: string, variantId: string, kind: 'design' | 'reference', singleScreen: boolean): string {
  const trimBytes = (value: string, limit: number) => { const encoder = new TextEncoder(); let result = ''; for (const char of value) { if (encoder.encode(result + char).length > limit) break; result += char; } return result || 'page'; };
  const base = trimBytes(safeExportStem(name), 72), screen = trimBytes(safeExportStem(screenName), 40), stable = trimBytes(safeExportStem(screenId), 40), page = trimBytes(safeExportStem(pageTitle), 40), variant = trimBytes(safeExportStem(variantId.replaceAll('+', '_')), 64);
  const prefix = singleScreen ? `${base}.${page}--${variant}` : `${base}.${screen}--${stable}.${page}--${variant}`;
  return `${prefix}${suffix[kind]}`;
}

export function screenExportFilename(name: string, screenName: string, screenId: string, kind: 'design' | 'reference' | 'background'): string {
  const trimBytes = (value: string, limit: number) => { const encoder = new TextEncoder(); let result = ''; for (const char of value) { if (encoder.encode(result + char).length > limit) break; result += char; } return result || 'screen'; };
  const base = trimBytes(safeExportStem(name), 72), title = trimBytes(safeExportStem(screenName), 48), stable = safeExportStem(screenId);
  return `${base}.${title}--${stable}${suffix[kind]}`;
}
