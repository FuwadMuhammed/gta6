import React from 'react'
import { Composition, staticFile } from 'remotion'
import { FPS, Reel } from './Reel'
import type { Reel as ReelData, Timing } from './types'

type Props = { id: string, reel: ReelData | null, timing: Timing | null }

export const Root: React.FC = () => (
  <Composition id="Reel" component={Reel as unknown as React.FC<Props>} width={1080} height={1920} fps={FPS} durationInFrames={FPS * 15}
    defaultProps={{ id: '', reel: null, timing: null } as Props}
    calculateMetadata={async ({ props }) => {
      const res = await fetch(staticFile(`runs/${props.id}/timing.json`))
      if (!res.ok) throw new Error(`public/runs/${props.id}/timing.json is missing`)
      const timing: Timing = await res.json()
      return { durationInFrames: Math.round(timing.duration * FPS), props: { ...props, timing } }
    }} />
)
