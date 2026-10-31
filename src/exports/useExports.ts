import { useEffect, useRef, useState } from 'react';
import { editorStore } from '../editor/store';
import { commitExportDrafts } from './draftBarrier';
import { beginExport } from './snapshot';
import { buildBundle } from './bundle';
import { captureVisual } from './visualSnapshot';
import { renderDesignPng } from './designPng';
import type { LayeredResources } from '../resources/layered';
import { fontSession } from '../render/previewFont';
import { exportFilename } from './filenames';
import { buildZip } from './zip';

export function captureExport() {
  if (editorStore.getState().gesture) throw new Error('请先完成或取消当前拖动');
  commitExportDrafts();
  const state = editorStore.getState();
  return beginExport(state.doc, undefined, state.currentScreenId);
}
type Published = Awaited<ReturnType<typeof buildBundle>> & { urls: string[]; projectJson: string; name: string; resourceGeneration: number; fontGeneration: number };
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
export function useExports(notify: (text: string, error?: boolean) => void, resources: LayeredResources) {
  const [batch, setBatch] = useState<Published | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const active = useRef(false), alive = useRef(true), urls = useRef<string[]>([]);
  const release = () => { urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = []; };
  useEffect(() => { alive.current = true; return () => { alive.current = false; release(); }; }, []);
  const generate = async (onCaptured?: () => void, zipNow = false) => {
    if (active.current) return;
    active.current = true; setBusy(true); setError(null); release(); setBatch(null);
    let visual: Awaited<ReturnType<typeof captureVisual>> | undefined;
    try {
      // Capture before the first await. Async work never reads the live document.
      const snapshot = captureExport();
      const resourceGeneration = resources.revision;
      const fontPromise = fontSession.capture();
      onCaptured?.();
      const font = await fontPromise;
      if (resources.revision !== resourceGeneration) throw new Error('资源会话已改变，请重新导出');
      visual = await captureVisual(resources, snapshot);
      const result = await buildBundle(snapshot, (doc, ref, scale, screenId) => renderDesignPng(doc, ref, scale, visual, font, screenId), undefined, visual.manifest, { generation: font.generation, name: font.family });
      const verify = () => {
        if (!alive.current) throw new Error('导出页面已关闭');
        if (resources.revision !== visual!.generation) throw new Error('资源会话已改变，请重新导出');
        if (fontSession.get().generation !== font.generation) throw new Error('字体选择已改变，请重新导出');
      };
      verify();
      const zip = zipNow ? await buildZip(result.files, verify) : null;
      verify();
      if (!alive.current) return;
      for (const file of result.files) urls.current.push(URL.createObjectURL(new Blob([Uint8Array.from(file.bytes).buffer], { type: file.mime })));
      if (zip) downloadBlob(zip, exportFilename(snapshot.document.project.name, 'zip'));
      setBatch({ ...result, urls: [...urls.current], projectJson: snapshot.projectJson, name: snapshot.document.project.name, resourceGeneration: visual.generation, fontGeneration: font.generation }); notify(zip ? `ZIP 已下载 · revision ${result.reference.revision}` : `导出批次已生成 · revision ${result.reference.revision}`);
    } catch (e) { release(); if (alive.current) { setBatch(null); setError((e as Error).message); notify(`本批未生成：${(e as Error).message}`, true); } }
    finally { visual?.dispose(); active.current = false; if (alive.current) setBusy(false); }
  };
  const downloadZip = async () => {
    if (!batch || active.current) return;
    active.current = true; setBusy(true);
    const verify = () => {
      if (!alive.current) throw new Error('导出页面已关闭');
      if (resources.revision !== batch.resourceGeneration) throw new Error('资源会话已改变，请重新导出');
      if (fontSession.get().generation !== batch.fontGeneration) throw new Error('字体选择已改变，请重新导出');
    };
    setError(null);
    try {
      verify(); const blob = await buildZip(batch.files, verify); verify();
      downloadBlob(blob, exportFilename(batch.name, 'zip'));
      notify('ZIP 已生成并下载');
    } catch (error) { if (alive.current) { setError((error as Error).message); notify(`ZIP 未生成：${(error as Error).message}`, true); } }
    finally { active.current = false; if (alive.current) setBusy(false); }
  };
  return { batch, busy, error, generate, downloadZip };
}
