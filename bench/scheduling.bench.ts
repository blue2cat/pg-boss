import { bench, describe } from 'vitest'
import { benchBoss, pinned, seedQueued, SCHED_COUNT, MAINT_COUNT } from './helpers.ts'

// Scheduling, monitoring reads, and a maintenance pass. These are lower-frequency than the hot path
// but still worth tracking for regressions.
describe('scheduling', () => {
  const queue = 'sched'
  const maintQueue = 'sched_maint'

  const ctx = benchBoss('scheduling', async boss => {
    await boss.createQueue(queue)

    // A fixed set of schedules so getSchedules has a realistic amount to return.
    for (let i = 0; i < SCHED_COUNT; i++) {
      await boss.schedule(queue, '0 1 * * *', null, { key: `k${i}` })
    }

    // A backlog of completed jobs eligible for immediate deletion, for the maintenance pass.
    // deleteAfterSeconds:0 means a supervise() pass can remove them right away.
    await boss.createQueue(maintQueue, { deleteAfterSeconds: 0 })
    await seedQueued(boss, maintQueue, MAINT_COUNT)
    const active = await boss.fetch(maintQueue, { batchSize: MAINT_COUNT })
    await boss.complete(maintQueue, active.map(job => job.id))
  })

  // Upsert against a fixed name+key, so this measures the ON CONFLICT update path without growing the
  // schedule table unbounded.
  bench('schedule upsert', async () => {
    await ctx.boss().schedule(queue, '0 2 * * *', null, { key: 'bench' })
  }, pinned({ setup: ctx.setup() }))

  bench(`getSchedules (${SCHED_COUNT} rows)`, async () => {
    await ctx.boss().getSchedules()
  }, pinned({ setup: ctx.setup() }))

  bench('getQueueStats', async () => {
    await ctx.boss().getQueueStats(maintQueue)
  }, pinned({ setup: ctx.setup() }))

  // Single-shot: one maintenance pass over the whole backlog. Pinned to a single iteration because the
  // pass is destructive (the backlog is gone afterwards), so it reports the duration of one full sweep
  // rather than an ops/sec figure. Seed lives in init, above.
  bench(`maintain (sweep ${MAINT_COUNT} completed)`, async () => {
    await ctx.boss().supervise(maintQueue)
  }, { time: 0, iterations: 1, warmupTime: 0, warmupIterations: 0, setup: ctx.setup() })
})
