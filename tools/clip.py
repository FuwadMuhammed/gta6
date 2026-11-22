"""Finds a clip in a source video and cuts it to 1080x1920.

  clip.py find <video> <seconds> [--avoid 10-40,90-120] [--seed N]   prints {"start", "mode", "score"}
  clip.py cut <video> <start> <seconds> <out.mp4>

A "highlight" is the window with the most sound energy and on-screen motion. When nothing stands out, it takes a
random window instead, so a video can always be made.
"""
import json, random, re, subprocess, sys
import numpy as np

STEP = 0.5
HIGHLIGHT_SCORE = 0.25


def pcm(video):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.int16).astype(np.float64) if r.returncode == 0 else np.zeros(0)


def frames(video):
    w, h = 32, 18
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vf', f'fps={1 / STEP},scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.uint8).reshape(-1, h, w).astype(np.float64)


def z(x):
    s = x.std()
    return (x - x.mean()) / s if s > 1e-9 else np.zeros_like(x)


def find(video, length, avoid, seed):
    f = frames(video)
    n = len(f)
    win = int(length / STEP)
    if n <= win:
        raise SystemExit(f'{video} is shorter than {length}s')
    motion = np.r_[0, np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))]
    a = pcm(video)
    hop = int(8000 * STEP)
    loud = np.array([np.sqrt(np.mean(a[i * hop:(i + 1) * hop] ** 2)) if len(a[i * hop:(i + 1) * hop]) else 0 for i in range(n)])
    score = np.convolve(z(loud) + 1.2 * z(motion), np.ones(win) / win, 'valid')
    dark = np.convolve((f.mean(axis=(1, 2)) < 20).astype(float), np.ones(win) / win, 'valid')
    margin = min(int(max(5, n * STEP * 0.03) / STEP), max(0, (n - win) // 3))   # skip logos and end cards
    ok = np.zeros(len(score), bool)
    ok[margin:len(score) - margin] = True
    ok &= dark < 0.25
    for lo, hi in avoid:
        ok[max(0, int((lo - length) / STEP) + 1):max(0, int(hi / STEP))] = False
    if not ok.any():
        ok[:] = dark < 0.25   # every part has been used: allow repeats
    if not ok.any():
        ok[:] = True
    idx = np.flatnonzero(ok)
    best = idx[np.argmax(score[idx])]
    if score[best] >= HIGHLIGHT_SCORE:
        return {'start': round(best * STEP, 2), 'mode': 'highlight', 'score': round(float(score[best]), 3)}
    pick = random.Random(seed).choice(idx.tolist())
    return {'start': round(pick * STEP, 2), 'mode': 'random', 'score': round(float(score[pick]), 3)}


def bars(video, start, length):
    """A crop that removes black bars baked into the footage, or '' when there are none."""
    ih = int(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0', video]).decode().split()[0])
    r = subprocess.run(['ffmpeg', '-hide_banner', '-ss', str(start), '-t', str(length), '-i', video, '-an', '-vf', 'fps=2,cropdetect=limit=24:round=2:reset=1', '-f', 'null', '-'], capture_output=True, text=True)
    hs = sorted(int(m) for m in re.findall(r'crop=\d+:(\d+):', r.stderr))
    if not hs: return ''
    h = hs[int(len(hs) * 0.8)]   # dark shots read as smaller, so trust the taller readings
    if h >= ih * 0.97 or h < ih * 0.6: return ''
    return f'crop=iw:{h}:0:{(ih - h) // 2},'


def cut(video, start, length, out, zoom=1.0):
    g = (f'[0:v]{bars(video, start, length)}fps=30,split[a][b];'
         '[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:2,eq=brightness=-0.22[bg];'
         f'[b]scale=-2:{int(844 * zoom / 2) * 2},crop=1080:844[fg];'
         '[bg][fg]overlay=0:(H-h)/2-90,format=yuv420p[v]')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-t', str(length), '-i', video, '-filter_complex', g, '-map', '[v]', '-map', '0:a?',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-c:a', 'aac', '-ar', '48000', out], check=True)


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'find':
        spans = a[a.index('--avoid') + 1] if '--avoid' in a else ''
        avoid = [tuple(map(float, s.split('-'))) for s in spans.split(',') if s]
        print(json.dumps(find(a[1], float(a[2]), avoid, int(a[a.index('--seed') + 1]) if '--seed' in a else 0)))
    elif a[0] == 'cut':
        cut(a[1], float(a[2]), float(a[3]), a[4], float(a[5]) if len(a) > 5 else 1.0)
