import { defineConfig } from 'vitest/config'

// Benchmarks run against a real database (default Postgres via test/config.json, or any backend the
// test suite supports through DB_TYPE). They are deliberately kept out of the normal test config:
// no per-test schema churn (test/hooks.ts), each bench file owns its boss lifecycle, and files run
// serially so concurrent benches never contend on the same connection pool.
export default defineConfig({
  test: {
    include: [],
    benchmark: {
      include: ['bench/**/*.bench.ts'],
      outputJson: 'bench/results/latest.json'
    },
    hookTimeout: 120000,
    teardownTimeout: 120000,
    fileParallelism: false,
    pool: 'forks'
  }
})
