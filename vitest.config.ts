import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // A few tests spin up a real embedded PGlite (WASM) Postgres instance
    // each - fine individually, but several running concurrently in this
    // sandbox's limited CPU can blow past Vitest's default 10s hook timeout
    // under contention alone, not because anything is actually hung.
    hookTimeout: 30000,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
