# GTA 6 Daily

Turns GTA 6 YouTube videos you are allowed to reuse into 15 or 30 second vertical clips, each with a spoken fun fact,
word-by-word captions and subtle original music. Buffer posts them to Instagram, LinkedIn and YouTube Shorts.

## Setup

```bash
npm ci
```
```bash
python3 -m venv .venv && .venv/bin/pip install numpy scipy kokoro-onnx faster-whisper yt-dlp
```

1. Add videos. Run this on your computer, because YouTube often blocks downloads from GitHub's servers.

```bash
npm run add -- "https://www.youtube.com/watch?v=VIDEO_ID"
```

2. Commit `sources.json` and push.
3. Connect Instagram, LinkedIn and YouTube in Buffer, create an API key, and save it:

```bash
gh secret set BUFFER_API_KEY_1
```

4. Put the key in `.env` as `BUFFER_API_KEY_1=...`, list your channels, and paste the output into `brand/channels.json`:

```bash
npm run post -- --channels
```

5. Turn on the daily video and posting:

```bash
gh variable set DAILY --body on
```
```bash
gh variable set POSTING --body on
```

GitHub Pages must be enabled with the source set to GitHub Actions, because Buffer fetches each MP4 from a public URL.

## Make one locally

```bash
npm run daily -- --test
```

## Settings

`brand/brand.json` holds post times, voice, hashtags, clip lengths and music level. `brand/facts.json` holds the facts.
Game audio is off by default (`clip.sourceAudio: 0`) because trailers often contain licensed music that triggers
copyright claims. Set it to about `0.2` only for videos whose audio you may reuse.

Remotion is free for individuals and companies of up to 3 people; larger teams need a
[company licence](https://remotion.dev/license).
