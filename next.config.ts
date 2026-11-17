import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // El indicador flotante de Next en desarrollo tapaba la barra lateral.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
