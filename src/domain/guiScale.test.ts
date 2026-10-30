import { expect, it } from 'vitest';
import { guiScalePreview } from './guiScale';
import { createEditorStore } from '../editor/store';

it.each([
  [1920, 1080, 0, false, 4, 480, 270, 4],
  [1920, 1080, 1, false, 1, 1920, 1080, 4],
  [1920, 1080, 3, false, 3, 640, 360, 4],
  [1280, 720, 0, false, 3, 427, 240, 3],
  [1280, 720, 0, true, 4, 320, 180, 4],
  [1920, 1080, 1, true, 2, 960, 540, 4],
  [3840, 2160, 0, false, 9, 427, 240, 9],
  [3840, 2160, 0, true, 10, 384, 216, 10],
  [100, 100, 0, false, 1, 100, 100, 1],
  [1919, 1079, 99, false, 4, 480, 270, 4],
] as const)('GUI Scale %i×%i request %i unicode=%s', (w, h, request, unicode, scale, lw, lh, max) => {
  expect(guiScalePreview(w, h, request, unicode)).toMatchObject({ effectiveScale: scale, logicalWidth: lw, logicalHeight: lh, maxLevel: max });
});
it('rejects invalid framebuffers or GUI scale settings', () => {
  for (const args of [[0, 1080, 0], [1920.5, 1080, 0], [1920, 1080, -1], [1920, 1080, 1.5], [Infinity, 1080, 0]]) {
    expect(() => guiScalePreview(args[0], args[1], args[2])).toThrow();
  }
});
it('screen resize is one integer, undoable transaction; invalid shrink leaves all state intact', () => {
  const store = createEditorStore(); store.getState().add('minecraft:button');
  const before = store.getState(); store.getState().resizeScreen(640, 360);
  expect(store.getState().doc.screens[0].designSize).toEqual({ width: 640, height: 360, unit: 'gui-px' });
  expect(store.getState().past).toHaveLength(before.past.length + 1);
  const resized = store.getState();
  for (const [w, h] of [[1, 1], [640.5, 360], [0, 360], [8193, 360]]) {
    expect(() => store.getState().resizeScreen(w, h)).toThrow(); expect(store.getState()).toBe(resized);
  }
  store.getState().undo(); expect(store.getState().doc).toEqual(before.doc);
  store.getState().redo(); expect(store.getState().doc.screens[0].designSize.width).toBe(640);
});
