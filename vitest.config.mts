import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      /**
       * `server-only` resolves to a module that throws on import unless the
       * `react-server` condition is set — that is exactly how it stops a client
       * component pulling in `node:fs`. Tests run in plain Node, so without
       * this every module under `lib/filesystem/` and `lib/vault/` would throw
       * before a single assertion ran. `empty.js` is the package's own
       * react-server build, so this is the same module Next.js resolves on the
       * server rather than a stub of our own.
       */
      'server-only': path.resolve(
        import.meta.dirname,
        'node_modules/server-only/empty.js',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
