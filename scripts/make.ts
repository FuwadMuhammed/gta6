// Renders a reel: cut clip → voice and word timing → music mix → captions → loudness → contact sheet.
//   npm run make -- reels/2026-11-22-2030.json   -> out/2026-11-22-2030.mp4 + -sheet.jpg
import { pathToFileURL } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { BRAND } from '../src/brand'
import type { Reel } from '../src/types'
import { ROOT, python, sourcePath, type Source } from './pick'

const seconds = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} failed:\n${`${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-1800)}`)
}

export async function make(file: string): Promise<{ ok: true, mp4: string, duration: number } | { ok: false, errors: string[] }> {
  const id = basename(file, '.json')
  const reel: Reel = JSON.parse(readFileSync(file, 'utf8'))
  try {
    const dir = join(ROOT, 'public/runs', id)
    mkdirSync(dir, { recursive: true })
    mkdirSync(join(ROOT, 'out'), { recursive: true })
    // A part retired from sources.json stays in the release, so its existing videos can still be re-rendered.
    const source = (JSON.parse(readFileSync(join(ROOT, 'sources.json'), 'utf8')) as Source[]).find(s => s.id === reel.source.id)
      ?? { ...reel.source, title: reel.title, license: '', file: `${reel.source.id}.mp4` }
    console.log(`  clip ${reel.clip.length}s at ${reel.clip.start}s (${reel.clip.mode})`)
    run(python(), ['tools/clip.py', 'cut', sourcePath(source), String(reel.clip.start), String(reel.clip.length), join(dir, 'clip.mp4')])
    console.log('  voice')
    run(python(), ['tools/voice.py', file])
    console.log('  music')
    run(python(), ['tools/mix.py', dir, String(reel.clip.length), String(BRAND.clip.music), String(BRAND.clip.sourceAudio), String(reel.clip.seed)])
    console.log('  render')
    const props = join(ROOT, 'out', `${id}.props.json`)
    writeFileSync(props, JSON.stringify({ id, reel, timing: null }))
    const raw = join(ROOT, 'out', `${id}.raw.mp4`)
    run('npx', ['remotion', 'render', 'src/index.ts', 'Reel', raw, `--props=${props}`, `--concurrency=${process.env.RENDER_CONCURRENCY ?? '50%'}`])
    run('bash', ['tools/master.sh', raw])
    const mp4 = join(ROOT, 'out', `${id}.mp4`)
    renameSync(join(ROOT, 'out', `${id}.raw.final.mp4`), mp4)
    const duration = seconds(mp4)
    run('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', `fps=${(12 / duration).toFixed(4)},scale=270:-1,tile=6x2`, '-frames:v', '1', join(ROOT, 'out', `${id}-sheet.jpg`)])
    const audio = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', mp4]).toString().trim()
    const errors: string[] = []
    if (Math.abs(duration - reel.clip.length) > 0.5) errors.push(`video is ${duration.toFixed(1)}s; expected ${reel.clip.length}s`)
    if (!audio) errors.push('video has no audio track')
    return errors.length ? { ok: false, errors } : { ok: true, mp4, duration }
  }
  catch (e) {
    return { ok: false, errors: [(e as Error).message] }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv.slice(2).find(a => !a.startsWith('--'))
  if (!file) { console.error('Usage: npm run make -- reels/<id>.json'); process.exit(1) }
  const r = await make(file)
  if (!r.ok) { console.error(`✗ ${r.errors.join('\n  ')}`); process.exit(1) }
  console.log(`✓ ${r.mp4} (${r.duration.toFixed(1)}s)`)
}
