import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // youtubei.js relies on import.meta.url, dynamic code evaluation and Node APIs —
  // keep it out of the server bundle.
  serverExternalPackages: ["youtubei.js"],
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/manifest.json",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
    ];
  },
};

export default nextConfig;
