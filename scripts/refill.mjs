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

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(refillCount(JSON.parse(readFileSync(0, 'utf8'))))
