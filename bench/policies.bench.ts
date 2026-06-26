import { bench, describe } from 'vitest'
import { benchBoss, pinned, payload } from './helpers.ts'
import type { QueuePolicy } from '../src/types.ts'

// Send throughput under each queue policy. singleton/stately/short carry extra dedup or state logic on
// insert, so this surfaces the per-policy overhead relative to standard.
const policies: QueuePolicy[] = ['standard', 'short', 'singleton', 'stately']

describe('policies', () => {
  const ctx = benchBoss('policies', async boss => {
    for (const policy of policies) {
      await boss.createQueue(`policy_${policy}`, { policy })
    }
  })

  for (const policy of policies) {
    const queue = `policy_${policy}`
    bench(`send under ${policy}`, async () => {
      await ctx.boss().send(queue, payload)
    }, pinned({ setup: ctx.setup() }))
  }
})
