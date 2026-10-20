import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.trycloudflare.com"],
  // /nba/parlays reads saved pick files from disk; ship them with the page on Vercel.
  outputFileTracingIncludes: {
    "/nba/parlays": ["./data/picks/nba-*.json"],
  },
};

export default nextConfig;
