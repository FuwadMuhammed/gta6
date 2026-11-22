// Schedules finished videos in Buffer a few days ahead (Buffer plans limit how many posts can wait in the queue).
//   npm run post-queue -- [days ahead, default 3]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { post, pagesUrl } from './post'
import { postTime } from './slot.mjs'

const days = Number(process.argv[2] ?? 3)
const file = join(import.meta.dirname, '../data/history.json')
const now = Date.now()
const due = (JSON.parse(readFileSync(file, 'utf8')) as Array<{ date: string, status: string }>)
  .filter(h => h.status === 'rendered' && postTime(h.date) > now + 15 * 60e3 && postTime(h.date) < now + days * 864e5)
let failed = 0
for (const { date } of due) {
  console.log(date)
  const r = await post(date, { url: `${pagesUrl()}/${date}.mp4` })
  if (r.failures.length) { failed++; continue }
  const history = JSON.parse(readFileSync(file, 'utf8'))
  history.find((h: { date: string }) => h.date === date).status = 'posted'
  const { writeFileSync } = await import('node:fs')
  writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`)
}
if (failed) process.exit(1)
