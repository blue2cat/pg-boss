#!/usr/bin/env node
// Copies the latest benchmark run to baseline.json so a later run can be compared against it.
// Run this on the base branch before checking out the PR branch and running `npm run bench`.
import { copyFileSync, existsSync } from 'node:fs'

const from = process.argv[2] ?? 'bench/results/latest.json'
const to = process.argv[3] ?? 'bench/results/baseline.json'

if (!existsSync(from)) {
  console.error(`No results at ${from}. Run \`npm run bench\` first.`)
  process.exit(1)
}

copyFileSync(from, to)
console.log(`Saved baseline: ${to}`)
