import type { Bounds } from '../domain/schema';

export type AlignmentGuides = { x?: number; y?: number; xKey?: string; yKey?: string };
type Anchor = { value: number; key: string };
type AxisResult = { position: number; guide?: number; key?: string };

function anchors(bounds: Bounds, axis: 'x' | 'y'): Anchor[] {
  const start = bounds[axis], size = bounds[axis === 'x' ? 'w' : 'h'];
  return [
    { value: start, key: 'start' },
    { value: start + size / 2, key: 'center' },
    { value: start + size, key: 'end' },
  ];
}

function resolveAxis(position: number, movingSize: number, targets: { id: string; value: number }[], zoom: number, snap: boolean, lockedKey?: string): AxisResult {
  const source = [0, movingSize / 2, movingSize].map((offset, index) => ({ offset, key: ['start', 'center', 'end'][index] }));
  const candidates: { correction: number; target: number; key: string }[] = [];
  for (const from of source) for (const to of targets) candidates.push({ correction: to.value - (position + from.offset), target: to.value, key: `${from.key}|${to.id}` });
  const limit = (lockedKey ? 8 : 6) / zoom;
  const valid = candidates.filter(item => Math.abs(item.correction) <= limit);
  const locked = lockedKey && valid.find(item => item.key === lockedKey);
  const best = locked ?? valid.reduce<typeof valid[number] | undefined>((current, candidate) => !current || Math.abs(candidate.correction) < Math.abs(current.correction) - 1e-9 ? candidate : current, undefined);
  if (!best) return { position: Math.round(position) };
  return { position: Math.round(snap ? position + best.correction : position), guide: best.target, key: best.key };
}

/** Aligns logical component bounds; threshold is measured in rendered CSS pixels. */
export function alignBounds(bounds: Bounds, screen: { width: number; height: number }, peers: { id: string; bounds: Bounds }[], zoom: number, options: { snap: boolean; guides: boolean; previous?: AlignmentGuides }): { bounds: Bounds; guides: AlignmentGuides } {
  const xTargets: { id: string; value: number }[] = [
    { id: 'canvas:left', value: 0 }, { id: 'canvas:center', value: screen.width / 2 }, { id: 'canvas:right', value: screen.width },
  ];
  const yTargets: { id: string; value: number }[] = [
    { id: 'canvas:top', value: 0 }, { id: 'canvas:center', value: screen.height / 2 }, { id: 'canvas:bottom', value: screen.height },
  ];
  for (const peer of peers) {
    for (const anchor of anchors(peer.bounds, 'x')) xTargets.push({ id: `${peer.id}:${anchor.key}`, value: anchor.value });
    for (const anchor of anchors(peer.bounds, 'y')) yTargets.push({ id: `${peer.id}:${anchor.key}`, value: anchor.value });
  }
  const x = resolveAxis(bounds.x, bounds.w, xTargets, zoom, options.snap, options.previous?.xKey);
  const y = resolveAxis(bounds.y, bounds.h, yTargets, zoom, options.snap, options.previous?.yKey);
  return { bounds: { ...bounds, x: x.position, y: y.position }, guides: { ...(options.guides ? { x: x.guide, y: y.guide } : {}), xKey: x.key, yKey: y.key } };
}
