import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next 16 blocks dev resources (including the HMR client) from origins other
   * than localhost. Without this, loading the dev server from a phone over the
   * LAN IP or through a tunnel (e.g. cloudflared) leaves the page unhydrated, so
   * client interactivity (catalog filters, chat) silently does nothing.
   */
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.1.132",
    "192.168.1.*",
    "*.trycloudflare.com",
  ],
};

export default nextConfig;
