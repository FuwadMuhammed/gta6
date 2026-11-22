// Keeps Buffer filled: gives each finished video the next empty daily slot, until Buffer's limit is reached.
// A video whose own date was missed simply takes the next open day, and open days are always filled first.
//   npm run post-queue -- [most videos waiting, default 10]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pagesUrl, post } from './post'
import { postTime, slotTimes } from './slot.mjs'

type Entry = { date: string, status: string, postAt?: string }
const ROOT = join(import.meta.dirname, '..')
const file = join(ROOT, 'data/history.json')
const read = () => JSON.parse(readFileSync(file, 'utf8')) as Entry[]
const when = (h: Entry) => (h.postAt ? Date.parse(h.postAt) : postTime(h.date))

/** The next open slots, given the times already taken. */
export function openSlots(slots: number[], taken: Set<number>, after: number) {
  return slots.filter(t => t > after && !taken.has(t))
}

/** A half-scheduled video keeps the time its first channels already got. */
function partialTime(date: string, now: number) {
  const f = join(ROOT, 'data/posts', `${date}.json`)
  if (!existsSync(f)) return undefined
  const at = Object.values(JSON.parse(readFileSync(f, 'utf8')) as Record<string, { dueAt?: string }>)[0]?.dueAt
  return at && Date.parse(at) > now ? Date.parse(at) : undefined
}

const most = Number(process.argv[2] ?? 10)
const now = Date.now()
const all = read()
const scheduled = all.filter(h => h.status === 'posted' || h.status === 'cleaned')
const taken = new Set(scheduled.map(when))
const waiting = scheduled.filter(h => when(h) > now).length
const next = all.filter(h => h.status === 'rendered').sort((a, b) => a.date.localeCompare(b.date)).slice(0, Math.max(0, most - waiting))
console.log(`${waiting} video(s) already waiting, trying ${next.length} more`)

let failed = false
for (const { date } of next) {
  const t = partialTime(date, now) ?? openSlots(slotTimes(120, now), taken, now + 15 * 60e3)[0]
  if (!t) break
  taken.add(t)
  const at = new Date(t).toISOString()
  console.log(`${date} -> ${at}`)
  const r = await post(date, { at, url: `${pagesUrl()}/${date}.mp4` })
  const limited = r.failures.length > 0 && r.failures.every(f => /limit/i.test(f))
  if (r.failures.length && !limited) { failed = true; break }
  if (limited) { console.log('Buffer limit reached, the rest wait for the next run'); break }
  const history = read()
  const h = history.find(x => x.date === date)!
  h.status = 'posted'
  h.postAt = at
  writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`)
}
if (failed) process.exit(1)
