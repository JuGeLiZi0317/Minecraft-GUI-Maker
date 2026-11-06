import { useEffect, useRef, useState, type RefObject } from 'react';
import type { SidebarMode } from './workspacePreferences';

export const HOVER_RADIUS = 36;
export const HOVER_LEAVE_GRACE = 40;
type Rect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
export const inHoverCircle = (x: number, y: number, rect: Rect) =>
  Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2)) <= HOVER_RADIUS;

/** Only the narrow circle-to-panel bridge is included, never the whole rail. */
export function inHoverKeepArea(x: number, y: number, anchor: Rect, panel: Rect) {
  const cx = anchor.left + anchor.width / 2, cy = anchor.top + anchor.height / 2;
  return inHoverCircle(x, y, anchor)
    || (x >= panel.left && x <= panel.left + panel.width && y >= panel.top && y <= panel.top + panel.height)
    || (panel.left >= cx && x >= cx && x <= panel.left && Math.abs(y - cy) <= HOVER_RADIUS);
}

/** Transient mouse state; neither business state nor persistent preferences. */
export function useHoverIntent(anchor: RefObject<HTMLButtonElement | null>, panel: RefObject<HTMLElement | null>, mode: SidebarMode, hasPanels: boolean, blocked: boolean) {
  const [peek, setPeek] = useState(false);
  const state = useRef({ inside: false, overPanel: false, needsExit: false, down: false, dragging: false, timer: 0 });
  const config = useRef({ mode, hasPanels, blocked, peek });
  config.current = { mode, hasPanels, blocked, peek };
  const cancel = () => { window.clearTimeout(state.current.timer); state.current.timer = 0; };
  const visible = (value: boolean) => { config.current.peek = value; setPeek(value); };
  const reset = () => { cancel(); state.current.needsExit = true; visible(false); };
  useEffect(() => { reset(); }, [mode]);
  useEffect(() => { if (!hasPanels) reset(); }, [hasPanels]);
  useEffect(() => {
    const s = state.current;
    const editing = () => {
      const el = document.activeElement;
      return (el instanceof HTMLElement && !!el.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], [role="menu"], [role="dialog"]:not(.behavior-panel)'))
        || [...document.querySelectorAll<HTMLElement>('.editor-menu details[open], .workspace-settings[open], .screen-settings[open], #resource-test-menu:not([hidden]), #context-font-menu:not([hidden]), #local-save-menu:not([hidden]), [role="menu"]:not([hidden]), [role="listbox"]:not([hidden])')]
          .some(menu => menu.getClientRects().length > 0 && getComputedStyle(menu).visibility !== 'hidden');
    };
    const closeOutside = () => {
      if (s.timer || !config.current.peek || s.inside || s.overPanel || s.down || s.dragging || editing()) return;
      // Do not restart this deadline on every outside pointermove.
      s.timer = window.setTimeout(() => {
        s.timer = 0;
        if (!s.inside && !s.overPanel && !s.down && !s.dragging && !editing()) visible(false);
      }, HOVER_LEAVE_GRACE);
    };
    const syncPoint = (x: number, y: number) => {
      const rect = anchor.current?.getBoundingClientRect(), body = panel.current?.getBoundingClientRect();
      const inside = !!rect && inHoverCircle(x, y, rect), entered = inside && !s.inside;
      s.inside = inside;
      s.overPanel = !!(config.current.peek && rect && body && inHoverKeepArea(x, y, rect, body));
      if (!inside) s.needsExit = false;
      return entered;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !anchor.current) return;
      const entered = syncPoint(e.clientX, e.clientY), c = config.current;
      if (e.buttons || s.down || s.dragging || c.blocked) { s.needsExit = true; cancel(); return; }
      if (c.mode !== 'auto' || !c.hasPanels) return;
      if (s.inside || s.overPanel) {
        cancel();
        if (entered && !s.needsExit && !c.peek && !editing()) visible(true);
      } else closeOutside();
    };
    const down = () => { s.down = true; s.needsExit = true; cancel(); };
    const up = () => { s.down = false; s.needsExit = true; cancel(); closeOutside(); };
    const drag = () => { s.dragging = true; s.needsExit = true; cancel(); };
    const dragEnd = (e: DragEvent) => {
      s.dragging = false; s.down = false; cancel(); syncPoint(e.clientX, e.clientY);
      s.needsExit = s.inside; closeOutside();
    };
    const blur = () => { s.dragging = false; s.down = false; s.needsExit = true; cancel(); visible(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') blur(); };
    const focusout = () => { queueMicrotask(closeOutside); };
    const exitWindow = (e: PointerEvent) => { if (!e.relatedTarget) { s.inside = false; s.overPanel = false; closeOutside(); } };
    window.addEventListener('focusout', focusout); window.addEventListener('pointermove', move); window.addEventListener('pointerdown', down, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true); window.addEventListener('dragstart', drag, true); window.addEventListener('dragend', dragEnd, true); window.addEventListener('blur', blur); window.addEventListener('keydown', key); window.addEventListener('pointerout', exitWindow);
    return () => { cancel(); window.removeEventListener('focusout', focusout); window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); window.removeEventListener('dragstart', drag, true); window.removeEventListener('dragend', dragEnd, true); window.removeEventListener('blur', blur); window.removeEventListener('keydown', key); window.removeEventListener('pointerout', exitWindow); };
  }, [anchor, panel]);
  useEffect(() => { if (blocked) cancel(); }, [blocked]);
  return { peek: mode === 'auto' && hasPanels && peek, reset, show: () => { cancel(); visible(true); } };
}
