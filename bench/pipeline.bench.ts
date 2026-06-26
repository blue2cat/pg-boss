import { bench, describe } from 'vitest'
import { benchBoss, pinned, payload, jobs, BATCH } from './helpers.ts'

// End-to-end round trips: each iteration creates and consumes its own work, so there is no draining
// and no per-cycle seeding. This is the closest analogue to the existing speedTest, but expressed as
// throughput (round trips per second) rather than a single wall-clock budget.
describe('pipeline', () => {
  const queue = 'pipeline'
  const ctx = benchBoss('pipeline', boss => boss.createQueue(queue))

  bench('round trip single (send, fetch, complete)', async () => {
    const boss = ctx.boss()
    await boss.send(queue, payload)
    const [job] = await boss.fetch(queue, { batchSize: 1 })
    if (job) await boss.complete(queue, job.id)
  }, pinned({ setup: ctx.setup() }))

  bench(`round trip batch of ${BATCH} (insert, fetch, complete)`, async () => {
    const boss = ctx.boss()
    await boss.insert(queue, jobs(queue, BATCH))
    const fetched = await boss.fetch(queue, { batchSize: BATCH })
    if (fetched.length) await boss.complete(queue, fetched.map(job => job.id))
  }, pinned({ setup: ctx.setup() }))
})
