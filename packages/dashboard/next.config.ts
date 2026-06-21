import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Dev-only: Next blocks /_next/* dev resources from non-localhost origins by
  // default, which leaves a phone on the LAN stuck on the SSR shell (no
  // hydration, no error · the "infinite Loading…" trap). Allow private-network
  // hosts so dev-on-a-phone bootstraps; production ignores this setting.
  allowedDevOrigins: ["192.168.1.*", "10.0.0.*"],
  // Vercel monorepo: point turbopack at the workspace root so it can resolve
  // the next package from the root node_modules.
  experimental: {
    turbopack: {
      root: process.env.VERCEL ? undefined : undefined,
    },
  },
};

export default nextConfig;
