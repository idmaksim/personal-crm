import os from "node:os";

// Every non-internal IPv4 address this machine currently has. When the dev
// server is opened from a phone or another device, the browser's Origin is the
// host typed in the URL bar — i.e. one of these addresses — so allowing them
// keeps the dev server working on any Wi-Fi or hotspot without editing this
// file when the IP changes. Empty/irrelevant in production, where
// allowedDevOrigins is ignored.
function localIPv4s() {
  const ips = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) ips.push(addr.address);
    }
  }
  return ips;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Separate build output per invocation. Default ".next" for dev and the
  // production build; the e2e run sets NEXT_DIST_DIR=.next-e2e so its
  // `next build` never overwrites the ".next" a running `pnpm dev` is using.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    agentUpgrade: "security",
  },
  // Dev only: allow the dev server to serve its resources when the app is
  // opened from this machine's LAN IP (auto-detected, so it survives network
  // changes) or a VS Code port-forward / Codespaces tunnel, not just
  // localhost. Ignored in production builds.
  allowedDevOrigins: [
    ...localIPv4s(),
    "*.devtunnels.ms",
    "*.github.dev",
    "*.app.github.dev",
  ],
};

export default nextConfig;
