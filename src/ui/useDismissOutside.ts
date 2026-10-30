import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Hide without unmounting the settings form, preserving pending export drafts. */
export function useDismissOutside(root: RefObject<HTMLElement | null>, open: boolean, dismiss: () => void) {
  const latest = useRef(dismiss); latest.current = dismiss;
  useLayoutEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) latest.current();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') latest.current(); };
    document.addEventListener('pointerdown', pointer, true); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', pointer, true); document.removeEventListener('keydown', key); };
  }, [open, root]);
}
