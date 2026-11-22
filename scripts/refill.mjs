// How many new videos fit on GitHub Pages. Reads the media branch's file sizes (a JSON array) from stdin.
// Keeps the site under 900 MB (the limit is 1 GB), and waits until at least 5 videos fit.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const TARGET = 900e6
export function refillCount(sizes, most = 20) {
  const total = sizes.reduce((a, b) => a + b, 0)
  const videos = sizes.filter(s => s > 1e6)
  const average = videos.length ? videos.reduce((a, b) => a + b, 0) / videos.length : 18e6
  const fit = Math.floor((TARGET - total) / Math.max(average, 18e6))
  return fit < 5 ? 0 : Math.min(fit, most)
}

/** Scripts in brand/clips.json that have not become a video yet. */
export function scriptsLeft() {
  const root = new URL('..', import.meta.url)
  const used = new Set(JSON.parse(readFileSync(new URL('data/history.json', root), 'utf8')).map(h => h.clipId))
  return JSON.parse(readFileSync(new URL('brand/clips.json', root), 'utf8')).filter(c => !used.has(c.id)).length
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--left')) console.log(scriptsLeft())
  else console.log(refillCount(JSON.parse(readFileSync(0, 'utf8')), Math.min(20, scriptsLeft())))
}
