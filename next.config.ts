import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "voyageai",
    "@anthropic-ai/sdk",
    "@langchain/core",
    "@langchain/anthropic",
    "@langchain/community",
    "langchain",
  ],
};

export default nextConfig;
