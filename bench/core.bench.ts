import { bench, describe } from 'vitest'
import { benchBoss, pinned, payload, jobs, seedQueued, cycleSize, BATCH } from './helpers.ts'

// The producer/consumer hot path: the four operations that dominate real throughput.
describe('core', () => {
  const queue = 'core'
  const ctx = benchBoss('core', boss => boss.createQueue(queue))

  bench('send single', async () => {
    await ctx.boss().send(queue, payload)
  }, pinned({ setup: ctx.setup() }))

  bench(`insert batch of ${BATCH}`, async () => {
    await ctx.boss().insert(queue, jobs(queue, BATCH))
  }, pinned({ setup: ctx.setup() }))

  // fetch drains the queue, so seed exactly one job per upcoming iteration before each cycle.
  bench('fetch single', async () => {
    await ctx.boss().fetch(queue, { batchSize: 1 })
  }, pinned({
    setup: ctx.setup(async (boss, mode) => {
      await seedQueued(boss, queue, cycleSize(mode))
    })
  }))

  // complete needs active jobs, so seed + fetch their ids once per cycle, then complete one per iteration.
  let ids: string[] = []
  let cursor = 0
  bench('complete single', async () => {
    await ctx.boss().complete(queue, ids[cursor++])
  }, pinned({
    setup: ctx.setup(async (boss, mode) => {
      const size = cycleSize(mode)
      await seedQueued(boss, queue, size)
      const fetched = await boss.fetch(queue, { batchSize: size })
      ids = fetched.map(job => job.id)
      cursor = 0
    })
  }))
})
