"use client";

import { useRef } from "react";
import type { Track } from "@/lib/types";
import { useUI } from "@/store/ui";
import { tx } from "@/lib/i18n";

type PressHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onClickCapture: (e: React.MouseEvent) => void;
};

/**
 * Long-press detection that cooperates with a normal click on the same element:
 * after a long press the following click is swallowed.
 */
export function useLongPress(onLong: () => void, ms = 480): PressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (e) => {
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(12);
        onLong();
      }, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear, // scrolling cancels the pointer on touch devices
    onContextMenu: (e) => e.preventDefault(),
    onClickCapture: (e) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
  };
}

export function copyTrackName(t: Track) {
  const text = `${t.artist} — ${t.title}`;
  const done = () => useUI.getState().showToast(tx("Название скопировано"));
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text) && done());
  } else if (fallbackCopy(text)) done();
}

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Tap = action, hold = repeat `onHold` every 400ms (used for ±5s seeking on prev/next). */
export function useHoldRepeat(onTap: () => void, onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const held = useRef(false);
  const active = useRef(false);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    if (interval.current) clearInterval(interval.current);
    timer.current = null;
    interval.current = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      active.current = true;
      held.current = false;
      stop();
      timer.current = setTimeout(() => {
        held.current = true;
        navigator.vibrate?.(8);
        onHold();
        interval.current = setInterval(onHold, 400);
      }, 380);
    },
    onPointerUp: () => {
      const wasActive = active.current;
      active.current = false;
      stop();
      if (wasActive && !held.current) onTap();
    },
    onPointerLeave: () => {
      active.current = false;
      stop();
    },
    onPointerCancel: () => {
      active.current = false;
      stop();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    // keyboard activation (Enter / Space) still works
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) onTap();
    },
  };
}
