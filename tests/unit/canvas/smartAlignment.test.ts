import { describe, expect, it } from 'vitest';
import { alignBounds } from '../../../src/canvas/smartAlignment';

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
});
