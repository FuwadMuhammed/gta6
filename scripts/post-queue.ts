// Keeps Buffer filled: schedules the next finished videos until Buffer's scheduled-post limit is reached.
// A video half-scheduled when the limit hits is finished on a later run (post.ts never posts a channel twice).
//   npm run post-queue -- [most videos waiting, default 10]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pagesUrl, post } from './post'
import { postTime } from './slot.mjs'

const most = Number(process.argv[2] ?? 10)
const file = join(import.meta.dirname, '../data/history.json')
type Entry = { date: string, status: string }
const read = () => JSON.parse(readFileSync(file, 'utf8')) as Entry[]
const now = Date.now()
const waiting = read().filter(h => h.status === 'posted' && postTime(h.date) > now).length
const next = read().filter(h => h.status === 'rendered' && postTime(h.date) > now + 15 * 60e3)
  .sort((a, b) => postTime(a.date) - postTime(b.date)).slice(0, Math.max(0, most - waiting))
console.log(`${waiting} video(s) already waiting, trying ${next.length} more`)

let failed = false
for (const { date } of next) {
  console.log(date)
  const r = await post(date, { url: `${pagesUrl()}/${date}.mp4` })
  if (r.failures.length) {
    if (r.failures.every(f => /limit/i.test(f))) { console.log('Buffer limit reached, the rest wait for the next run'); break }
    failed = true
    break
  }
  const history = read()
  history.find(h => h.date === date)!.status = 'posted'
  writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`)
}
if (failed) process.exit(1)
