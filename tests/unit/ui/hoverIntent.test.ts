import { describe, expect, it } from 'vitest';
import { inHoverCircle, inHoverKeepArea } from '../../../src/ui/hoverIntent';
describe('hover intent geometry', () => {
  it('uses the 36px circle around the actual anchor center', () => {
    const r = { left: 100, top: 200, width: 32, height: 32 };
    expect(inHoverCircle(152, 216, r)).toBe(true);
    expect(inHoverCircle(153, 216, r)).toBe(false);
    expect(inHoverCircle(141, 241, r)).toBe(true);
    expect(inHoverCircle(142, 242, r)).toBe(false);
  });
  it('keeps only the circle, the narrow bridge and the actual panel', () => {
    const anchor = { left: 20, top: 200, width: 28, height: 28 };
    const panel = { left: 76, top: 100, width: 264, height: 600 };
    expect(inHoverKeepArea(72, 240, anchor, panel)).toBe(true);
    expect(inHoverKeepArea(76, 600, anchor, panel)).toBe(true);
    expect(inHoverKeepArea(22, 120, anchor, panel)).toBe(false);
    expect(inHoverKeepArea(72, 260, anchor, panel)).toBe(false);
    expect(inHoverKeepArea(341, 214, anchor, panel)).toBe(false);
  });
});
