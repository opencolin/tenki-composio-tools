import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // ESM-only: @composio/core (peer) ships no CJS build, so a CJS entry can
  // never load it on Node < 20.19 (ERR_REQUIRE_ESM) and is redundant on newer
  // Node, where CJS consumers can require() ESM natively.
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
});
