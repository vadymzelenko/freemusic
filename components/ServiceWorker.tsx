"use client";

import { useEffect } from "react";
import { isNative } from "@/lib/native/platform";

/** Registers /sw.js (offline downloads + app shell). */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || isNative()) return; // the app stores audio in files instead
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
