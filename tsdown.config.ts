import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node22',
  platform: 'node',
  shims: true,
  outExtensions: () => ({ js: '.js' }),
  deps: {
    neverBundle: ['clipboardy', 'node-notifier'],
  },
})
