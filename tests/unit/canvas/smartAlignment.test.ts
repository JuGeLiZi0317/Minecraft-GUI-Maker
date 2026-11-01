import { describe, expect, it } from 'vitest';
import { alignBounds, alignResizeBounds, equalSpacingCandidates, resolveEqualSpacing } from '../../../src/canvas/smartAlignment';

describe('smart canvas alignment', () => {
  it('independently snaps the closest x and y anchors to canvas and peer anchors', () => {
    const result = alignBounds({ x: 24, y: 38, w: 40, h: 20 }, { width: 320, height: 180 }, [
      { id: 'far', bounds: { x: 180, y: 120, w: 60, h: 48 } },
    ], 2, { snap: true, guides: true });
    expect(result.bounds).toEqual({ x: 24, y: 38, w: 40, h: 20 }); // outside the 6 CSS px capture distance
    const near = alignBounds({ x: 27, y: 39, w: 40, h: 20 }, { width: 320, height: 180 }, [
      { id: 'peer', bounds: { x: 64, y: 10, w: 60, h: 48 } },
    ], 2, { snap: true, guides: true });
    expect(near.bounds.x).toBe(24); expect(near.guides.x).toBe(64); // moving right edge to peer left
    expect(near.bounds.y).toBe(38); expect(near.guides.y).toBe(58); // moving bottom to peer bottom
  });

  it('shows a guide without changing coordinates when snapping is disabled', () => {
    const result = alignBounds({ x: 117, y: 82, w: 40, h: 20 }, { width: 320, height: 180 }, [], 2, { snap: false, guides: true });
    expect(result.bounds.x).toBe(117); expect(result.guides.x).toBe(160);
    expect(result.bounds.y).toBe(82); expect(result.guides.y).toBe(90);
  });

  it('uses a screen-pixel threshold, deterministic tie order and a wider release window', () => {
    const atZoom1 = alignBounds({ x: 34, y: 20, w: 10, h: 10 }, { width: 100, height: 100 }, [], 1, { snap: true, guides: true });
    const atZoom4 = alignBounds({ x: 34, y: 20, w: 10, h: 10 }, { width: 100, height: 100 }, [], 4, { snap: true, guides: true });
    expect(atZoom1.bounds.x).toBe(40); expect(atZoom4.bounds.x).toBe(34);
    const tied1 = alignBounds({ x: 45, y: 30, w: 10, h: 10 }, { width: 100, height: 100 }, [], 2, { snap: true, guides: true });
    const tied2 = alignBounds({ x: 45, y: 30, w: 10, h: 10 }, { width: 100, height: 100 }, [], 2, { snap: true, guides: true });
    expect(tied1).toEqual(tied2);
    const locked = alignBounds({ x: 47, y: 30, w: 10, h: 10 }, { width: 100, height: 100 }, [{ id: 'nearer', bounds: { x: 49, y: 70, w: 10, h: 10 } }], 2, { snap: true, guides: true, previous: { xKey: 'start|canvas:center' } });
    expect(locked.guides.x).toBe(50);
  });

  it('resize snaps only the bottom-right handle edges and respects minimum and Screen bounds', () => {
    const peers = [{ id: 'peer', bounds: { x: 30, y: 80, w: 60, h: 40 } }];
    const near = alignResizeBounds({ x: 20, y: 20, w: 68, h: 98 }, { width: 320, height: 180 }, peers, 2, { snap: true, guides: true, min: { w: 20, h: 8 } });
    expect(near.bounds).toEqual({ x: 20, y: 20, w: 70, h: 100 });
    expect(near.guides.x).toBe(90); expect(near.guides.y).toBe(120);
    const tooSmall = alignResizeBounds({ x: 40, y: 40, w: 20, h: 20 }, { width: 320, height: 180 }, [{ id: 'tiny', bounds: { x: 39, y: 39, w: 20, h: 20 } }], 2,
      { snap: true, guides: true, min: { w: 20, h: 20 } });
    expect(tooSmall.bounds).toEqual({ x: 40, y: 40, w: 20, h: 20 }); expect(tooSmall.guides.x).toBeUndefined(); expect(tooSmall.guides.y).toBeUndefined();
    const capped = alignResizeBounds({ x: 80, y: 80, w: 19.8, h: 19.8 }, { width: 100, height: 100 }, [], 4, { snap: true, guides: false, min: { w: 20, h: 20 } });
    expect(capped.bounds).toEqual({ x: 80, y: 80, w: 20, h: 20 });
  });

  it('precomputes horizontal and vertical equal gaps, rejects ambiguous overlap and prefers G1 anchors', () => {
    const peers = [
      { id: 'left', bounds: { x: 20, y: 20, w: 30, h: 20 } },
      { id: 'right', bounds: { x: 110, y: 80, w: 30, h: 20 } },
    ];
    const candidates = equalSpacingCandidates({ x: 60, y: 48, w: 30, h: 20 }, peers, { width: 320, height: 180 });
    expect(candidates.some(c => c.axis === 'x' && c.slot === 'between' && c.position === 65 && c.gap === 15)).toBe(true);
    const vertical = equalSpacingCandidates({ x: 220, y: 48, w: 20, h: 20 }, [
      { id: 'top', bounds: { x: 200, y: 20, w: 20, h: 20 } }, { id: 'bottom', bounds: { x: 240, y: 80, w: 20, h: 20 } },
    ], { width: 320, height: 180 });
    expect(vertical.some(c => c.axis === 'y' && c.slot === 'between' && c.position === 50 && c.gap === 10)).toBe(true);
    const horizontal = candidates.find(c => c.axis === 'x' && c.slot === 'between' && c.position === 65)!;
    const aligned = resolveEqualSpacing({ x: 64, y: 45, w: 30, h: 20 }, [horizontal], 2, { snap: true, guides: true });
    expect(aligned.bounds.x).toBe(65); expect(aligned.mark?.intervals).toEqual([[50, 65], [95, 110]]); expect(aligned.mark?.gap).toBe(15);
    const verticalCandidate = vertical.find(c => c.axis === 'y' && c.slot === 'between' && c.position === 50)!;
    const tied = resolveEqualSpacing({ x: 64, y: 49, w: 30, h: 20 }, [horizontal, verticalCandidate], 1, { snap: true, guides: true });
    expect(tied.key).toBe(horizontal.key); // x candidates win an equal-distance tie because they're enumerated first
    const far = resolveEqualSpacing({ x: 40, y: 45, w: 30, h: 20 }, [horizontal], 2, { snap: true, guides: true }); expect(far.key).toBeUndefined();
    const anchorWins = resolveEqualSpacing({ x: 64, y: 45, w: 30, h: 20 }, [horizontal], 2, { snap: true, guides: true, blockedAxes: ['x'] }); expect(anchorWins.key).toBeUndefined();
    expect(equalSpacingCandidates({ x: 50, y: 20, w: 20, h: 20 }, [
      { id: 'overlap-a', bounds: { x: 10, y: 10, w: 40, h: 20 } }, { id: 'overlap-b', bounds: { x: 40, y: 10, w: 40, h: 20 } },
    ], { width: 120, height: 100 })).toEqual([]);
    const fractional = equalSpacingCandidates({ x: 0, y: 0, w: 30, h: 10 }, [
      { id: 'odd-a', bounds: { x: 10, y: 60, w: 30, h: 10 } }, { id: 'odd-b', bounds: { x: 71, y: 60, w: 30, h: 10 } },
    ], { width: 200, height: 180 });
    expect(fractional.some(c => c.axis === 'x' && c.slot === 'between')).toBe(false); // 40.5 GUI px has no exact integer placement
  });
});
