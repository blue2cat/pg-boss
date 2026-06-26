import * as helper from '../test/testHelper.ts'
import type { PgBoss } from '../src/index.ts'
import type { ConstructorOptions, JobInsert } from '../src/types.ts'

// vitest's benchmark mode does not run beforeAll/afterAll/beforeEach hooks (verified against vitest
// 4.x: they are silently skipped). tinybench's per-cycle `setup(task, mode)` IS invoked, so we hang
// all initialization off that and memoize it. Each bench file runs in its own worker fork, so the
// memoized boss is effectively one-per-file. The fork exits at the end of the file, which closes the
// pool, so there is no afterAll to miss.

const SCHEMA_PREFIX = 'pgboss_bench'

export type BenchMode = 'warmup' | 'run'
export type Seeder = (boss: PgBoss, mode: BenchMode) => Promise<void>

export interface BenchBoss {
  // Returns the live boss. Only valid inside a bench fn, which always runs after `setup()` has
  // initialized it for the cycle.
  boss: () => PgBoss
  // Builds a tinybench `setup` hook: it lazily starts the boss (once) and then runs the optional
  // per-cycle seeder. Pass it as the `setup` option of every bench.
  setup: (seed?: Seeder) => (task: unknown, mode: BenchMode) => Promise<void>
}

export function benchBoss (name: string, init?: (boss: PgBoss) => Promise<void>, options: Partial<ConstructorOptions> = {}): BenchBoss {
  let boss: PgBoss | undefined
  let starting: Promise<void> | undefined

  const ensure = async (): Promise<void> => {
    starting ??= (async () => {
      const schema = `${SCHEMA_PREFIX}_${name}`
      await helper.init()
      await helper.dropSchema(schema)
      boss = await helper.start({ schema, noDefault: true, max: 10, ...options })
      if (init) await init(boss)
    })()
    await starting
  }

  return {
    boss: () => boss as PgBoss,
    setup: (seed?: Seeder) => async (_task: unknown, mode: BenchMode) => {
      await ensure()
      if (seed) await seed(boss as PgBoss, mode)
    }
  }
}

// Workload sizing. Defaults are tuned for a real Postgres run; override with env vars for quick local
// validation (e.g. BENCH_ITERATIONS=20 BENCH_BATCH=10 against pglite).
export const ITER = num(process.env.BENCH_ITERATIONS, 200)
export const WARMUP = num(process.env.BENCH_WARMUP, 20)
export const BATCH = num(process.env.BENCH_BATCH, 100)
export const SCHED_COUNT = num(process.env.BENCH_SCHEDULES, 50)
export const MAINT_COUNT = num(process.env.BENCH_MAINTENANCE, 5000)

// A representative job payload. Small but not empty, so serialization cost is exercised.
export const payload = { type: 'email', to: 'user@example.com', attempts: 1, meta: { source: 'bench' } }

// Pin every benchmark to an exact iteration count. tinybench's setup runs once per cycle (not per
// iteration), so the only way to keep draining ops (fetch/complete) fed is to seed exactly as many
// jobs as there will be iterations. time:0 makes the loop run exactly `iterations` times.
export function pinned (overrides: Record<string, unknown> = {}) {
  return { time: 0, iterations: ITER, warmupTime: 0, warmupIterations: WARMUP, ...overrides }
}

export function cycleSize (mode: BenchMode): number {
  return mode === 'warmup' ? WARMUP : ITER
}

export function jobs (queue: string, count: number, overrides: Partial<JobInsert> = {}): JobInsert[] {
  return Array.from({ length: count }, () => ({ name: queue, data: payload, ...overrides }))
}

// Insert `count` queued jobs in one round trip.
export async function seedQueued (boss: PgBoss, queue: string, count: number, overrides: Partial<JobInsert> = {}): Promise<void> {
  await boss.insert(queue, jobs(queue, count, overrides))
}

function num (value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
