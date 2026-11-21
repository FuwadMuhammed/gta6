// One video: pick a clip and facts, render, record it in data/history.json.
//   npm run daily                            the next free slot
//   npm run daily -- --id 2026-11-10-2030    a given slot
//   npm run daily -- --test                  mark the history entry as a test
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { make } from './make'
import { pick, record } from './pick'
import { nextSlot } from './slot.mjs'

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const date = arg('--id') || nextSlot({ any: true })
if (!date) { console.error('✗ no free slot'); process.exit(1) }
const existing = `reels/${date}.json`
const file = existsSync(existing) ? existing : pick(date)
const m = await make(file)
if (!m.ok) { console.error(`✗ ${date}:\n  ${m.errors.join('\n  ')}`); process.exit(1) }
record(date, JSON.parse(readFileSync(file, 'utf8')), process.argv.includes('--test') ? 'test' : 'rendered')
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `date=${date}\nmp4=${m.mp4}\n`)
console.log(`✓ ${date}: ${m.mp4} (${m.duration.toFixed(1)}s)`)
