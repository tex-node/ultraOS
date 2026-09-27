import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default withSerwist(nextConfig);
