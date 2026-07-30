import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM binary loaded via a `new URL(..., import.meta.url)`
  // pattern that Turbopack's bundler mishandles (dual URL-constructor
  // identity issue) - excluding it from bundling lets Node load it natively.
  // Only used in dev/tests (no DATABASE_URL); production uses `pg` against
  // Railway instead. See DECISIONS.md.
  serverExternalPackages: ["@electric-sql/pglite"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
