import { loadFont } from '@remotion/google-fonts/Anton'

const { fontFamily } = loadFont('normal', { weights: ['400'], subsets: ['latin'] })

export const look = { ink: '#FFFFFF', accent: '#FFD23F', font: fontFamily }

// Reels and Shorts UI covers the top ~220 px, the bottom ~420 px and the right ~140 px.
export const CAPTION_Y = 1240
