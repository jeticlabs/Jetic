import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node18',
  outDir: 'dist',
  bundle: true,
  // Inline all @jetic/* workspace packages into the bundle
  noExternal: [/^@jetic\/.*/],
  // Keep third-party deps external (they'll be installed from npm)
  // Also externalize Node.js built-in subpath exports that esbuild can't resolve
  external: [
    'commander',
    'express',
    '@faker-js/faker',
    'zod',
    'ai',
    '@ai-sdk/openai',
    '@openrouter/ai-sdk-provider',
    'readline/promises',
    /^node:.*/,
  ],
  shims: true,
  clean: true,
});
