import { useRef } from 'react';

/** Horizontal swipe handlers for touch devices. Vertical scrolling is left alone. */
export function useSwipe(onLeft: () => void, onRight: () => void, threshold = 60) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      const t = e.changedTouches[0];
      start.current = null;
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onLeft();
      else onRight();
    },
  };
}

/** Long press (500 ms) without moving. Returns props to spread on the element. */
export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const clear = () => window.clearTimeout(timer.current);
  return {
    onPointerDown: () => {
      fired.current = false;
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        onLongPress();
      }, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clear();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    /** True if the last press was a long press; use to suppress the click that follows. */
    wasLongPress: () => fired.current,
  };
}
