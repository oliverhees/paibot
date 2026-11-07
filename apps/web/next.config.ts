import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@paibot/shared", "@paibot/db"],
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
};

export default nextConfig;
