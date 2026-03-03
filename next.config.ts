import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["voyageai", "@anthropic-ai/sdk"],
};

export default nextConfig;
