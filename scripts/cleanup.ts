// Finds videos safe to delete from hosting: every channel must report "sent", at least 2 days ago.
//   npm run cleanup            print the ids (and write ids= to GITHUB_OUTPUT)
//   npm run cleanup -- --mark <ids...>   record them as cleaned, after they are gone
// Reels and history stay, so a clip is never reused.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
export const HOLD_MS = 2 * 864e5
type State = { status: string, sentAt?: string, error?: string }

/** True only when all expected channels were sent and the newest send is older than the hold. */
export function safeToDelete(services: string[], states: Record<string, State>, now: number) {
  if (!services.length) return false
  return services.every((s) => {
    const x = states[s]
    const at = x?.sentAt ? Date.parse(x.sentAt) : Number.NaN
    return x?.status === 'sent' && Number.isFinite(at) && now - at >= HOLD_MS
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = join(ROOT, 'data/history.json')
  const history = JSON.parse(readFileSync(file, 'utf8')) as Array<{ date: string, status: string }>
  const at = process.argv.indexOf('--mark')
  if (at > 0) {
    const ids = new Set(process.argv.slice(at + 1))
    for (const h of history) if (ids.has(h.date) && h.status === 'posted') h.status = 'cleaned'
    writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`)
    process.exit(0)
  }
  const { status } = await import('./post')
  const channels = JSON.parse(readFileSync(join(ROOT, 'brand/channels.json'), 'utf8')).channels as Array<{ service: string }>
  const services = channels.map(c => c.service)
  const ids: string[] = []
  const problems: string[] = []
  for (const h of history.filter(x => x.status === 'posted' && Date.parse(x.date.slice(0, 10)) < Date.now())) {
    if (!existsSync(join(ROOT, 'data/posts', `${h.date}.json`))) continue
    const states = await status(h.date)
    for (const [k, v] of Object.entries(states))
      if (v.status === 'error' || v.status === 'missing') problems.push(`${h.date} ${k}: ${v.status}${v.error ? ` (${v.error})` : ''}`)
    if (safeToDelete(services, states, Date.now())) ids.push(h.date)
  }
  console.log(`safe to delete: ${ids.join(' ') || 'none'}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ids=${ids.join(' ')}\nproblems=${problems.length}\n`)
  if (problems.length) console.error(`::warning::${problems.join('; ')}`)
}
