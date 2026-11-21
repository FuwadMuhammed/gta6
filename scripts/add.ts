// Adds source videos: downloads them here and stores them in this repo's "sources" release for the daily run.
//   npm run add -- <youtube url> [more urls]
//   npm run add -- ./my-video.mp4 --credit "Channel name"
//   add --no-upload to keep the video on this computer only
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { ROOT, python, type Source } from './pick'

const args = process.argv.slice(2)
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const inputs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--credit')
if (!inputs.length) { console.error('Usage: npm run add -- <youtube url | file> [--credit "name"] [--no-upload]'); process.exit(1) }
mkdirSync(join(ROOT, 'sources'), { recursive: true })
const listFile = join(ROOT, 'sources.json')
const list: Source[] = JSON.parse(readFileSync(listFile, 'utf8'))

function save(s: Source) {
  if (!args.includes('--no-upload')) {
    if (spawnSync('gh', ['release', 'view', 'sources'], { cwd: ROOT }).status !== 0)
      execFileSync('gh', ['release', 'create', 'sources', '--title', 'Source videos', '--notes', 'Inputs for the daily run.'], { cwd: ROOT })
    execFileSync('gh', ['release', 'upload', 'sources', join(ROOT, 'sources', s.file), '--clobber'], { cwd: ROOT, stdio: 'inherit' })
  }
  const at = list.findIndex(x => x.id === s.id)
  if (at >= 0) list[at] = s; else list.push(s)
  writeFileSync(listFile, `${JSON.stringify(list, null, 2)}\n`)
}

for (const input of inputs) {
  let s: Source
  if (existsSync(input)) {
    const id = basename(input).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    copyFileSync(input, join(ROOT, 'sources', `${id}.mp4`))
    s = { id, url: '', title: id, credit: opt('--credit') ?? 'Used with permission', license: 'provided by owner', file: `${id}.mp4` }
  }
  else {
    const info = JSON.parse(execFileSync(python(), ['-m', 'yt_dlp', '-J', '--no-playlist', input], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
    if (!/creative commons/i.test(info.license ?? ''))
      console.warn(`! ${info.title}: YouTube does not list a Creative Commons licence. Only keep it if the owner allows reuse.`)
    const whole = join(ROOT, 'sources', `${info.id}.full.mp4`)
    if (!existsSync(whole))
      execFileSync(python(), ['-m', 'yt_dlp', '--no-playlist', '-S', 'res:1080,vcodec:h264,acodec:m4a', '-f', 'bv*[height<=1080]+ba/b[height<=1080]', '--merge-output-format', 'mp4', '-o', whole, input], { stdio: 'inherit' })
    // Long videos become 10-minute parts, so a daily run only fetches and scans one part.
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', whole, '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-f', 'segment', '-segment_time', '600', '-reset_timestamps', '1', join(ROOT, 'sources', `${info.id}-p%03d.mp4`)])
    const parts = readdirSync(join(ROOT, 'sources')).filter(f => f.startsWith(`${info.id}-p`) && f.endsWith('.mp4')).sort()
    for (const file of parts) {
      const part: Source = { id: file.replace('.mp4', ''), url: info.webpage_url, title: info.title, credit: opt('--credit') ?? info.channel ?? info.uploader, creditUrl: info.channel_url ?? info.uploader_url ?? '', license: info.license ?? 'not listed', file }
      save(part)
    }
    rmSync(whole)
    console.log(`✓ ${info.title}: ${parts.length} part(s), credit ${info.channel}`)
    continue
  }
  save(s)
  console.log(`✓ ${s.title} (credit: ${s.credit})`)
}
