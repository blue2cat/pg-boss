# Benchmarks

Throughput benchmarks for the pg-boss hot path, built on vitest's `bench` (tinybench). The point of
these is to compare a branch against a baseline and post the result on a PR thread.

## Quick start

```sh
# 1. baseline: on the base branch (e.g. master)
git checkout master
npm run bench
npm run bench:baseline        # copies latest.json -> baseline.json

# 2. candidate: on the PR branch
git checkout my-branch
npm run bench

# 3. compare and post
npm run bench:report > report.md
gh pr comment <PR#> --body-file report.md
```

`bench:report` prints GitHub-flavoured Markdown comparing `baseline.json` to `latest.json`: an ops/s
table with a per-row Δ, a regression summary, and a foldable latency detail. Higher ops/s is better.

## What runs

| File | Covers |
|---|---|
| `core.bench.ts` | `send`, `insert` (batch), `fetch`, `complete` |
| `pipeline.bench.ts` | end-to-end round trips (single and batch) |
| `scheduling.bench.ts` | `schedule` upsert, `getSchedules`, `getQueueStats`, one `maintain` sweep |
| `policies.bench.ts` | `send` under each queue policy (standard / short / singleton / stately) |

## Database

Benchmarks run against a real database via the test harness, so start one first:

```sh
docker compose up -d db        # default Postgres
npm run bench
```

Any backend the test suite supports works through `DB_TYPE` (e.g. `DB_TYPE=pglite` for an in-process
WASM run with no container, useful for a fast smoke test — but pglite numbers are not representative
of production throughput).

## Tuning the workload

Sizing is set by env vars (defaults in parentheses):

| Var | Meaning |
|---|---|
| `BENCH_ITERATIONS` (200) | timed iterations per benchmark |
| `BENCH_WARMUP` (20) | warmup iterations |
| `BENCH_BATCH` (100) | batch size for `insert` / batch round trip |
| `BENCH_SCHEDULES` (50) | schedules seeded for `getSchedules` |
| `BENCH_MAINTENANCE` (5000) | completed jobs seeded for the `maintain` sweep |

`bench:report` flags a change 🟢/🔴 only when it exceeds a threshold (default 10%, set
`--threshold=0.15`) **and** the combined margin of error of both runs, so run-to-run noise is not
reported as a win or loss. Add `--fail-on-regression` to exit non-zero when a regression is found.

## How it is wired (read before editing)

vitest's benchmark mode does **not** run `beforeAll`/`afterAll`/`beforeEach`. Only tinybench's
per-cycle `setup(task, mode)` runs, and it runs once per cycle, not per iteration. So:

- The boss is started lazily inside `setup` and memoized (`benchBoss` in `helpers.ts`). Each bench
  file runs in its own worker fork, which exits at the end of the file and closes the pool.
- Draining ops (`fetch`, `complete`) pin the iteration count (`time: 0`, fixed `iterations`) and seed
  exactly that many jobs per cycle, so an iteration never runs against an empty queue.
- `maintain` is destructive, so it is a single iteration reporting one full sweep's duration. Treat
  its ops/s as `1 / duration`.
