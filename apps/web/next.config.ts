import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@paibot/shared"],
  poweredByHeader: false,
};

export default nextConfig;
