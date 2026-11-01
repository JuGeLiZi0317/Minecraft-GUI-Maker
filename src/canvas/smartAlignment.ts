import type { Bounds } from '../domain/schema';

export type AlignmentGuides = { x?: number; y?: number; xKey?: string; yKey?: string };
export type SpacingCandidate = { axis: 'x' | 'y'; position: number; gap: number; key: string; first: Bounds; second: Bounds; slot: 'before' | 'between' | 'after'; movingSize: number };
export type SpacingMark = { axis: 'x' | 'y'; intervals: [number, number][]; cross: number; gap: number; key: string };
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

function targetsFor(screen: { width: number; height: number }, peers: { id: string; bounds: Bounds }[]) {
  const x: { id: string; value: number }[] = [
    { id: 'canvas:left', value: 0 }, { id: 'canvas:center', value: screen.width / 2 }, { id: 'canvas:right', value: screen.width },
  ];
  const y: { id: string; value: number }[] = [
    { id: 'canvas:top', value: 0 }, { id: 'canvas:center', value: screen.height / 2 }, { id: 'canvas:bottom', value: screen.height },
  ];
  for (const peer of peers) {
    for (const anchor of anchors(peer.bounds, 'x')) x.push({ id: `${peer.id}:${anchor.key}`, value: anchor.value });
    for (const anchor of anchors(peer.bounds, 'y')) y.push({ id: `${peer.id}:${anchor.key}`, value: anchor.value });
  }
  return { x, y };
}

function resolveResizeAxis(start: number, size: number, edge: 'start' | 'end', targets: { id: string; value: number }[], zoom: number, snap: boolean, min: number, max: number, lockedKey?: string): { position: number; size: number; guide?: number; key?: string } {
  const limit = (lockedKey ? 8 : 6) / zoom;
  const fixed = edge === 'start' ? start + size : start;
  const current = edge === 'start' ? start : start + size;
  const candidates = targets.map(to => ({ size: Math.round(edge === 'start' ? fixed - to.value : to.value - fixed), correction: to.value - current, target: to.value, key: `${edge}|${to.id}`, integralTarget: Number.isInteger(to.value) }))
    .filter(item => item.integralTarget && item.size >= min && item.size <= max && Math.abs(item.correction) <= limit);
  const locked = lockedKey ? candidates.find(item => item.key === lockedKey) : undefined;
  const best = locked ?? candidates.reduce<typeof candidates[number] | undefined>((current, candidate) => !current || Math.abs(candidate.correction) < Math.abs(current.correction) - 1e-9 ? candidate : current, undefined);
  const nextEdge = best && snap ? best.target : Math.round(current);
  const nextSize = best && snap ? best.size : Math.round(size);
  return { position: edge === 'start' ? nextEdge : Math.round(start), size: nextSize, guide: best?.target, key: best?.key };
}

/** Aligns logical component bounds; threshold is measured in rendered CSS pixels. */
export function alignBounds(bounds: Bounds, screen: { width: number; height: number }, peers: { id: string; bounds: Bounds }[], zoom: number, options: { snap: boolean; guides: boolean; previous?: AlignmentGuides }): { bounds: Bounds; guides: AlignmentGuides } {
  const targets = targetsFor(screen, peers);
  const x = resolveAxis(bounds.x, bounds.w, targets.x, zoom, options.snap, options.previous?.xKey);
  const y = resolveAxis(bounds.y, bounds.h, targets.y, zoom, options.snap, options.previous?.yKey);
  return { bounds: { ...bounds, x: x.position, y: y.position }, guides: { ...(options.guides ? { x: x.guide, y: y.guide } : {}), xKey: x.key, yKey: y.key } };
}

/** Resizes from one edge while keeping the opposite edge fixed. */
export function alignResizeBounds(bounds: Bounds, screen: { width: number; height: number }, peers: { id: string; bounds: Bounds }[], zoom: number,
  options: { snap: boolean; guides: boolean; min: { w: number; h: number }; edge?: 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'bottom-right'; previous?: AlignmentGuides }): { bounds: Bounds; guides: AlignmentGuides } {
  const targets = targetsFor(screen, peers);
  const edge = options.edge ?? 'bottom-right';
  const x = edge === 'left' || edge === 'top-left' ? resolveResizeAxis(bounds.x, bounds.w, 'start', targets.x, zoom, options.snap, options.min.w, bounds.x + bounds.w, options.previous?.xKey)
    : edge === 'right' || edge === 'bottom-right' ? resolveResizeAxis(bounds.x, bounds.w, 'end', targets.x, zoom, options.snap, options.min.w, screen.width - bounds.x, options.previous?.xKey) : undefined;
  const y = edge === 'top' || edge === 'top-left' ? resolveResizeAxis(bounds.y, bounds.h, 'start', targets.y, zoom, options.snap, options.min.h, bounds.y + bounds.h, options.previous?.yKey)
    : edge === 'bottom' || edge === 'bottom-right' ? resolveResizeAxis(bounds.y, bounds.h, 'end', targets.y, zoom, options.snap, options.min.h, screen.height - bounds.y, options.previous?.yKey) : undefined;
  return { bounds: { ...bounds, ...(x ? { x: x.position, w: x.size } : {}), ...(y ? { y: y.position, h: y.size } : {}) }, guides: { ...(options.guides ? { x: x?.guide, y: y?.guide } : {}), xKey: x?.key, yKey: y?.key } };
}

function orderedAxis(peers: { id: string; bounds: Bounds }[], axis: 'x' | 'y') {
  return peers.map((peer, index) => ({ ...peer, index })).sort((a, b) => a.bounds[axis] - b.bounds[axis] || a.index - b.index);
}

/** Precomputes equal-gap placements from adjacent, non-overlapping peers once per drag. */
export function equalSpacingCandidates(moving: Bounds, peers: { id: string; bounds: Bounds }[], screen: { width: number; height: number }): SpacingCandidate[] {
  const result: SpacingCandidate[] = [];
  for (const axis of ['x', 'y'] as const) {
    const limit = axis === 'x' ? screen.width : screen.height;
    const movingSize = axis === 'x' ? moving.w : moving.h;
    const sorted = orderedAxis(peers, axis);
    const start = (bounds: Bounds) => bounds[axis], size = (bounds: Bounds) => bounds[axis === 'x' ? 'w' : 'h'];
    for (let i = 0; i + 1 < sorted.length; i++) {
      const first = sorted[i], second = sorted[i + 1], firstStart = start(first.bounds), firstEnd = firstStart + size(first.bounds), secondStart = start(second.bounds), secondEnd = secondStart + size(second.bounds);
      const previousEnd = i > 0 ? start(sorted[i - 1].bounds) + size(sorted[i - 1].bounds) : -Infinity;
      const nextStart = i + 2 < sorted.length ? start(sorted[i + 2].bounds) : Infinity;
      // Overlapping peer layouts are ambiguous; do not infer a spacing rhythm through them.
      if (firstEnd > secondStart || previousEnd > firstStart || secondEnd > nextStart) continue;
      const gap = secondStart - firstEnd;
      const add = (slot: SpacingCandidate['slot'], position: number, equalGap: number) => {
        if (!Number.isInteger(position) || position < 0 || position + movingSize > limit) return;
        if (slot === 'before' && i > 0 && position + movingSize > previousEnd) return;
        if (slot === 'after' && i + 2 < sorted.length && position + movingSize > nextStart) return;
        result.push({ axis, position, gap: equalGap, key: `${axis}:${first.id}:${second.id}:${slot}:${position}`, first: first.bounds, second: second.bounds, slot, movingSize });
      };
      add('before', firstStart - movingSize - gap, gap);
      if (gap >= movingSize) add('between', firstEnd + (gap - movingSize) / 2, (gap - movingSize) / 2);
      add('after', secondEnd + gap, gap);
    }
  }
  return result;
}

/** Resolves at most one spacing group for a pointer sample; explicit G1 anchors can block either axis. */
export function resolveEqualSpacing(bounds: Bounds, candidates: SpacingCandidate[], zoom: number, options: { snap: boolean; guides: boolean; blockedAxes?: ('x' | 'y')[]; previousKey?: string }): { bounds: Bounds; mark?: SpacingMark; key?: string } {
  const blocked = new Set(options.blockedAxes ?? []), available = candidates.filter(candidate => !blocked.has(candidate.axis));
  const distance = (candidate: SpacingCandidate) => Math.abs(candidate.position - bounds[candidate.axis]) * zoom;
  const locked = options.previousKey && available.find(candidate => candidate.key === options.previousKey && distance(candidate) <= 8);
  const best = locked ?? available.reduce<SpacingCandidate | undefined>((current, candidate) => distance(candidate) <= 6 && (!current || distance(candidate) < distance(current) - 1e-9) ? candidate : current, undefined);
  if (!best) return { bounds: { ...bounds, x: Math.round(bounds.x), y: Math.round(bounds.y) } };
  const next = { ...bounds, x: Math.round(options.snap && best.axis === 'x' ? best.position : bounds.x), y: Math.round(options.snap && best.axis === 'y' ? best.position : bounds.y) };
  const firstStart = best.axis === 'x' ? best.first.x : best.first.y, firstEnd = firstStart + (best.axis === 'x' ? best.first.w : best.first.h);
  const secondStart = best.axis === 'x' ? best.second.x : best.second.y, secondEnd = secondStart + (best.axis === 'x' ? best.second.w : best.second.h);
  const movingStart = best.position, movingEnd = movingStart + best.movingSize;
  const intervals: [number, number][] = best.slot === 'before' ? [[movingEnd, firstStart], [firstEnd, secondStart]]
    : best.slot === 'between' ? [[firstEnd, movingStart], [movingEnd, secondStart]]
      : [[firstEnd, secondStart], [secondEnd, movingStart]];
  const movingCross = best.axis === 'x' ? bounds.y : bounds.x;
  const firstCross = best.axis === 'x' ? best.first.y : best.first.x, secondCross = best.axis === 'x' ? best.second.y : best.second.x;
  const cross = Math.max(0, Math.min(movingCross, firstCross, secondCross) - 5);
  return { bounds: next, key: best.key, ...(options.guides ? { mark: { axis: best.axis, intervals, cross, gap: best.gap, key: best.key } } : {}) };
}
