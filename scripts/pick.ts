// Chooses what goes into one video: the least-used source, a clip length, unused facts, and the best moment.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BRAND } from '../src/brand'
import type { Reel } from '../src/types'

export const ROOT = resolve(import.meta.dirname, '..')
export const python = () => [process.env.PYTHON, join(ROOT, '.venv/bin/python')].find(p => p && existsSync(p)) ?? 'python3'
export interface Source { id: string, url: string, title: string, credit: string, creditUrl?: string, license: string, file: string }
export interface Entry { date: string, status: string, source: string, start: number, length: number, facts: string[], mode: string }

const core = (f: string) => f.replace(/^(Fun fact:|Also,)\s*/i, '')
const json = <T>(f: string): T => JSON.parse(readFileSync(join(ROOT, f), 'utf8'))

/** The source video on disk, fetched from the repo's "sources" release when it is not here yet. */
export function sourcePath(s: Source) {
  const file = join(ROOT, 'sources', s.file)
  if (!existsSync(file)) {
    mkdirSync(join(ROOT, 'sources'), { recursive: true })
    const r = spawnSync('gh', ['release', 'download', 'sources', '-p', s.file, '-D', join(ROOT, 'sources')], { cwd: ROOT, encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`could not fetch ${s.file}: ${r.stderr}`)
  }
  return file
}

export function pick(date: string) {
  // Parallel workers each take their own share of the footage (SHARD=<index>/<workers>).
  const [k, n] = (process.env.SHARD ?? '0/1').split('/').map(Number)
  const all = json<Source[]>('sources.json')
  const sources = all.filter((_, i) => i % n === k)
  if (!sources.length) throw new Error('sources.json is empty: add a video with npm run add -- <youtube url>')
  const history = json<Entry[]>('data/history.json').filter(h => h.status !== 'test')
  const seed = [...date].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  const uses = (id: string) => history.filter(h => h.source === id).length
  const video = (s: Source) => s.url || s.id
  const videoUses = (s: Source) => history.filter(h => sources.find(x => x.id === h.source && video(x) === video(s))).length
  const mixed = (s: Source) => [...s.id].reduce((a, c) => (a * 33 + c.charCodeAt(0) + seed) >>> 0, 5381)
  // Rotate between videos first, then between the parts of that video.
  const source = [...sources].sort((a, b) => videoUses(a) - videoUses(b) || uses(a.id) - uses(b.id) || mixed(a) - mixed(b))[0]
  const length = BRAND.clip.lengths[seed % BRAND.clip.lengths.length]

  const facts = json<string[]>('brand/facts.json')
  const last = (f: string) => history.map(h => h.facts.includes(core(f))).lastIndexOf(true)
  const order = facts.map((f, i) => ({ f, k: (seed * (i + 17)) % 1009 })).sort((a, b) => last(a.f) - last(b.f) || a.k - b.k).map(x => x.f)
  // As many facts as comfortably fit the clip (the voice runs at about 2.4 words a second, with a pause between facts).
  const budget = (length - 2) * 2.4
  const chosen: string[] = []
  let words = 0
  for (const f of order) {
    const w = f.split(/\s+/).length + 2
    if (chosen.length && words + w > budget) continue
    chosen.push(f)
    words += w
  }

  const avoid = history.filter(h => h.source === source.id).map(h => `${h.start}-${h.start + h.length}`).join(',')
  const found = JSON.parse(execFileSync(python(), ['tools/clip.py', 'find', sourcePath(source), String(length), '--avoid', avoid, '--seed', String(seed)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 }))

  const line = core(chosen[0])
  const hook = line[0].toUpperCase() + line.slice(1)
  const reel: Reel = {
    title: hook,
    source: { id: source.id, url: source.url, credit: source.credit },
    clip: { start: found.start, length, mode: found.mode, seed },
    scenes: chosen.map((f, i) => ({ type: 'fact', voice: i ? `Also, ${core(f)}` : f })),
    post: {
      caption: `${hook}\n\nGameplay Credit: ${source.credit}${source.creditUrl ? ` (${source.creditUrl})` : ''}\n${BRAND.disclaimer}\n\n${BRAND.hashtags.join(' ')}`,
      youtubeTitle: `GTA 6 clip + did you know? ${hook}`.slice(0, 91) + ' #Shorts',
    },
  }
  mkdirSync(join(ROOT, 'reels'), { recursive: true })
  const file = `reels/${date}.json`
  writeFileSync(join(ROOT, file), `${JSON.stringify(reel, null, 2)}\n`)
  return file
}

export function record(date: string, reel: Reel, status: string) {
  const file = join(ROOT, 'data/history.json')
  const history = json<Entry[]>('data/history.json').filter(h => h.date !== date)
  history.push({ date, status, source: reel.source.id, start: reel.clip.start, length: reel.clip.length, facts: reel.scenes.map(s => core(s.voice)), mode: reel.clip.mode })
  writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`)
}
