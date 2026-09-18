"use client";

import { useEffect, useRef } from "react";

/** Attaches click-and-drag horizontal scrolling to a scrollable container (scrollbar hidden via CSS). */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let moved = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      isDown = true;
      moved = false;
      startX = e.clientX;
      startScrollLeft = el.scrollLeft;
      el.setPointerCapture(e.pointerId);
      el.classList.add("dragScrolling");
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 3) moved = true;
      el.scrollLeft = startScrollLeft - dx;
    };

    const endDrag = (e: PointerEvent) => {
      if (!isDown) return;
      isDown = false;
      el.classList.remove("dragScrolling");
      if (moved) {
        // Swallow the click that follows a drag so buttons/links inside don't fire.
        const suppressClick = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        el.addEventListener("click", suppressClick, { capture: true, once: true });
        setTimeout(() => el.removeEventListener("click", suppressClick, { capture: true }), 0);
      }
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // no-op: pointer capture may already be released
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
    };
  }, []);

  return ref;
}
