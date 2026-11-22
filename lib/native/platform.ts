"use client";

import { Capacitor } from "@capacitor/core";

/** True inside the iOS / Android app (Capacitor shell), false on the website. */
export function isNative(): boolean {
  try {
    return typeof window !== "undefined" && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): "ios" | "android" | "web" {
  try {
    return Capacitor.getPlatform() as "ios" | "android" | "web";
  } catch {
    return "web";
  }
}

type Engine = typeof import("./engine");
let enginePromise: Promise<Engine> | null = null;

/** The on-device YouTube engine is code-split: the website never downloads it. */
export function nativeEngine(): Promise<Engine> {
  if (!enginePromise) enginePromise = import("./engine");
  return enginePromise;
}
