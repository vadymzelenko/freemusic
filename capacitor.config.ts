import type { CapacitorConfig } from "@capacitor/cli";

/**
 * vzMusic native shell (iOS / Android).
 * The UI is loaded from the website (instant updates, no re-install), while YouTube requests and
 * audio run on the phone itself (lib/native/engine.ts) — no server, no cookie.
 * When the website can't be reached (no internet), native-shell/offline.html plays downloads.
 */
const config: CapacitorConfig = {
  appId: "com.vzmusic.app",
  appName: "vzMusic",
  webDir: "native-shell",
  server: {
    // Change if your Vercel domain differs (or set VZ_SERVER_URL before `npx cap sync`).
    url: process.env.VZ_SERVER_URL || "https://vzmusic.vercel.app",
    errorPath: "offline.html",
  },
  backgroundColor: "#09090b",
  ios: {
    contentInset: "never",
    backgroundColor: "#09090b",
  },
  android: {
    backgroundColor: "#09090b",
  },
  plugins: {
    // Edge-to-edge: the page draws under the status / navigation bars and receives the real insets
    // as CSS variables (--safe-area-inset-*), so there are no blank stripes.
    SystemBars: {
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
      style: "DARK",
    },
  },
};

export default config;
