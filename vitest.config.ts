import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The elections submodule and the prototype both contain their
    // own test files / scripts. Exclude them from this app's vitest
    // discovery — we test the visualizer's own code only.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/submodules/**",
      "**/prototype/**",
    ],
  },
});
