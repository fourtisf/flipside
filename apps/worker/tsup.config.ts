import { defineConfig } from 'tsup';

// Bundle workspace packages (they ship TypeScript source); keep npm dependencies external.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  noExternal: [/^@coinside\//],
});
