/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    agentUpgrade: "security",
  },
  // Dev only: allow the dev server to serve its resources when the app is opened
  // from the LAN IP or a VS Code port-forward tunnel, not just localhost.
  // Ignored in production builds.
  allowedDevOrigins: [
    "192.168.1.4",
    "*.devtunnels.ms",
    "*.github.dev",
    "*.app.github.dev",
  ],
};

export default nextConfig;
