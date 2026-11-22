// The cut clip, word-by-word captions, a small credit, and the finished audio mix.
import React, { useMemo } from 'react'
import { AbsoluteFill, Audio, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { CAPTION_Y, look } from './look'
import type { Reel as ReelData, Timing } from './types'

export const FPS = 30
const clean = (w: string) => /[a-z0-9]/i.test(w)
const stroke = '-4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000, 4px 4px 0 #000, 0 8px 18px rgba(0,0,0,.65)'

type W = { text: string, start: number }

const Captions: React.FC<{ reel: ReelData, timing: Timing }> = ({ reel, timing }) => {
  const frame = useCurrentFrame(), t = frame / FPS
  const phrases = useMemo(() => {
    const out: Array<{ start: number, end: number, words: W[] }> = []
    reel.scenes.forEach((s, i) => {
      const st = timing.scenes[i]
      const tokens = s.voice.split(/\s+/).filter(clean)
      let cur: W[] = []
      tokens.forEach((text, k) => {
        const tw = st.words[k] ?? st.words[st.words.length - 1]
        cur.push({ text, start: st.start + tw.start })
        if (cur.length >= 3 || /[.,?!:]$/.test(text) || k === tokens.length - 1) {
          out.push({ start: cur[0].start, end: st.start + tw.end + 0.25, words: cur })
          cur = []
        }
      })
    })
    out.forEach((p, i) => { if (out[i + 1]) p.end = Math.min(p.end, out[i + 1].start) })
    return out
  }, [reel, timing])
  const p = phrases.find(x => t >= x.start - 0.03 && t < x.end)
  if (!p) return null
  const pop = interpolate(frame, [p.start * FPS - 1, p.start * FPS + 3], [0.9, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const active = p.words.reduce((a, w, i) => (t >= w.start ? i : a), 0)
  return (
    <div style={{ position: 'absolute', top: CAPTION_Y, left: 70, width: 860, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 22px',
      transform: `scale(${pop})`, fontFamily: look.font, fontSize: 92, lineHeight: 1.16, textTransform: 'uppercase', textShadow: stroke }}>
      {p.words.map((w, i) => <span key={i} style={{ color: i === active ? look.accent : look.ink }}>{w.text}</span>)}
    </div>
  )
}

export const Reel: React.FC<{ id: string, reel: ReelData, timing: Timing | null }> = ({ id, reel, timing }) => {
  if (!timing) throw new Error('no timing for this reel')
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <OffthreadVideo src={staticFile(`runs/${id}/clip.mp4`)} muted />
      <div style={{ position: 'absolute', top: 250, width: '100%', textAlign: 'center', fontFamily: look.font, fontSize: 58, letterSpacing: 2, color: look.accent, textShadow: stroke }}>{reel.hook ?? 'DID YOU KNOW?'}</div>
      <Captions reel={reel} timing={timing} />
      <div style={{ position: 'absolute', top: 1500, left: 70, width: 800, fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 25, color: 'rgba(255,255,255,.75)', textShadow: '0 2px 5px #000' }}>Video: {reel.source.credit}</div>
      <Audio src={staticFile(`runs/${id}/mix.wav`)} />
    </AbsoluteFill>
  )
}
