export interface Reel {
  title: string
  source: { id: string, url: string, credit: string }
  clip: { start: number, length: number, mode: 'highlight' | 'random', seed: number }
  scenes: Array<{ type: 'fact', voice: string }>
  post: { caption: string, youtubeTitle: string }
}

/** public/runs/<id>/timing.json, written by tools/voice.py */
export interface Word { w: string, start: number, end: number }
export interface SceneTiming { type: string, start: number, duration: number, audio: string, audioStart: number, speech: number, words: Word[] }
export interface Timing { id: string, duration: number, scenes: SceneTiming[] }
