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

// Content-Security-Policy without a nonce: inline scripts are allowed through
// 'unsafe-inline' (no nonce is issued, so the browser honours it). The only
// external origins the app loads are Google Fonts (see src/app/layout.tsx);
// everything else is locked to 'self'. 'unsafe-eval' (hot reload) and ws:
// (the HMR socket) are added only for the dev server, never in production.
function contentSecurityPolicy() {
  const isDev = process.env.NODE_ENV !== "production";
  const directives = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(isDev ? ["ws:"] : [])],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(" ")}`)
    .join("; ");
}

// Security headers applied to every response. nginx is intentionally left
// untouched — these are set by the app itself.
function securityHeaders() {
  return [
    // Force HTTPS for two years, including the app's own subdomains. No
    // "preload": that is a near-irreversible commitment we deliberately skip.
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    },
    { key: "Content-Security-Policy", value: contentSecurityPolicy() },
    // Block framing (clickjacking); frame-ancestors above is the modern twin.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Turn off sensitive capabilities the app never uses.
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
    },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Separate build output per invocation. Default ".next" for dev and the
  // production build; the e2e run sets NEXT_DIST_DIR=.next-e2e so its
  // `next build` never overwrites the ".next" a running `pnpm dev` is using.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Do not advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
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
