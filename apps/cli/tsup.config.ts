import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node18',
  outDir: 'dist',
  bundle: true,
  // Inline all @jetic/* workspace packages and MCP SDK into the bundle
  noExternal: [/^@jetic\/.*/, /^@modelcontextprotocol\/.*/],
  // Keep third-party deps external (they'll be installed from npm).
  // NOTE: @modelcontextprotocol/* must stay bundled (noExternal above wins):
  // it is not in dependencies and @jetic/* is unpublished, so externalizing
  // either would break `npm install -g jetic-cli`.
  external: [
    'commander',
    'express',
    '@faker-js/faker',
    'zod',
    'readline/promises',
    /^node:.*/,
  ],
  shims: true,
  clean: false,
});
