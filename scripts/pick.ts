// Chooses what goes into one video: the least-used source, a clip length, unused facts, and the best moment.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BRAND } from '../src/brand'
import type { Reel } from '../src/types'

export const ROOT = resolve(import.meta.dirname, '..')
export const python = () => [process.env.PYTHON, join(ROOT, '.venv/bin/python')].find(p => p && existsSync(p)) ?? 'python3'
export interface Source { id: string, url: string, title: string, credit: string, creditUrl?: string, license: string, file: string }
export interface Entry { date: string, status: string, source: string, start: number, length: number, facts: string[], mode: string, postAt?: string, clipId?: string }

const core = (f: string) => f.replace(/^(Fun fact:|Also,)\s*/i, '')
const json = <T>(f: string): T => JSON.parse(readFileSync(join(ROOT, f), 'utf8'))

/** The source video on disk, fetched from the repo's "sources" release when it is not here yet. */
export function sourcePath(s: Source) {
  const file = join(ROOT, 'sources', s.file)
  if (!existsSync(file)) {
    mkdirSync(join(ROOT, 'sources'), { recursive: true })
    // Downloads into a temp folder and moves the file only when complete, so a dropped connection never leaves a broken video.
    const tmp = mkdtempSync(join(ROOT, 'sources', '.dl-'))
    let error = ''
    for (let attempt = 1; attempt <= 4 && !existsSync(file); attempt++) {
      const r = spawnSync('gh', ['release', 'download', 'sources', '-p', s.file, '-D', tmp, '--clobber'], { cwd: ROOT, encoding: 'utf8' })
      if (r.status === 0) renameSync(join(tmp, s.file), file)
      else { error = r.stderr; spawnSync('sleep', [String(attempt * 5)]) }
    }
    rmSync(tmp, { recursive: true, force: true })
    if (!existsSync(file)) throw new Error(`could not fetch ${s.file}: ${error}`)
  }
  return file
}

/** A complete title within YouTube's 100 characters: never cuts a sentence. */
export function youtubeTitle(hook: string) {
  const fact = hook.replace(/[.!]+$/, '')
  return [`Did you know? ${fact}. #GTA6 #Shorts`, `${fact} #GTA6 #Shorts`, `${fact} #Shorts`]
    .find(t => t.length <= 100) ?? 'A fun fact you probably did not know #GTA6 #Shorts'
}

export interface Clip { id: string, source: string, start: number, length: number, zoom: number, hook: string, title: string, voice: string }

/** Scripts not yet made into a video. Each is written for what happens on screen in that exact clip. */
export function unusedClips() {
  const used = new Set(json<Entry[]>('data/history.json').map(h => h.clipId))
  return json<Clip[]>('brand/clips.json').filter(c => !used.has(c.id))
}

export function pick(date: string) {
  // Parallel workers each take their own share of the scripts (SHARD=<index>/<workers>).
  const [k, n] = (process.env.SHARD ?? '0/1').split('/').map(Number)
  const clip = unusedClips().filter((_, i) => i % n === k)[0]
  if (!clip) throw new Error('brand/clips.json has no unused scripts left')
  const source = json<Source[]>('sources.json').find(s => s.id === clip.source)
  if (!source) throw new Error(`source ${clip.source} is not in sources.json`)
  const seed = [...date].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  const reel: Reel = {
    title: clip.title,
    hook: clip.hook,
    clipId: clip.id,
    source: { id: source.id, url: source.url, credit: source.credit },
    clip: { start: clip.start, length: clip.length, mode: 'highlight', seed, zoom: clip.zoom },
    scenes: [{ type: 'fact', voice: clip.voice }],
    post: {
      caption: `${clip.title}\n\nGameplay Credit: ${source.credit}${source.creditUrl ? ` (${source.creditUrl})` : ''}\n${BRAND.disclaimer}\n\n${BRAND.hashtags.join(' ')}`,
      youtubeTitle: `${clip.title.replace(/[.!]+$/, '')} #GTA6 #Shorts`.slice(0, 100),
    },
  }
  mkdirSync(join(ROOT, 'reels'), { recursive: true })
  const file = `reels/${date}.json`
  writeFileSync(join(ROOT, file), `${JSON.stringify(reel, null, 2)}\n`)
  return file
}

export function record(date: string, reel: Reel, status: string) {
  const file = join(ROOT, 'data/history.json')
  const all = json<Entry[]>('data/history.json')
  const old = all.find(h => h.date === date)
  const history = all.filter(h => h.date !== date)
  // Re-rendering a video must not forget that it is already scheduled.
  const kept = old && ['posted', 'cleaned'].includes(old.status) ? old.status : status
  history.push({ date, status: kept, source: reel.source.id, start: reel.clip.start, length: reel.clip.length, facts: reel.clipId ? [] : reel.scenes.map(s => core(s.voice)), mode: reel.clip.mode, ...(reel.clipId ? { clipId: reel.clipId } : {}), ...(old?.postAt ? { postAt: old.postAt } : {}) })
  writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`)
}
