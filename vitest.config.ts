import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@renderer': '/src/renderer',
      '@common': '/src/common',
      '@main': '/src/main',
    },
  },
})
