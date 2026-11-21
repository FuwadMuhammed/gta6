"""Voice + timing for one reel. Local and free: Kokoro-82M speaks, faster-whisper times every word.

  python tools/voice.py reels/<id>.json        -> public/runs/<id>/scene-N.wav + timing.json
  python tools/voice.py --download             only fetch the Kokoro model files (~340 MB, once)

Each fact is one scene. The speech must fit inside the clip. Words in brand.json "pronounce" are respelled for the
voice only; captions keep the real spelling.
"""
import json, os, re, sys, time, urllib.request
from difflib import SequenceMatcher
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parent.parent
SR = 24000
LEAD, TAIL = 0.35, 0.45
KDIR = Path(os.environ.get('KOKORO_DIR', Path.home() / '.faceless-shorts/kokoro'))
FILES = {
    'kokoro-v1.0.onnx': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx',
    'voices-v1.0.bin': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin',
}


def ensure_models():
    KDIR.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        p = KDIR / name
        if p.exists() and p.stat().st_size > 1_000_000: continue
        print(f'downloading {name} (once)...', flush=True)
        tmp = p.with_suffix('.part')
        for attempt in range(1, 6):
            try:
                urllib.request.urlretrieve(url, tmp); tmp.rename(p); break
            except Exception as e:
                if attempt == 5: raise
                print(f'  download failed ({e}); retrying in {attempt * 10}s', flush=True); time.sleep(attempt * 10)


def trim(x, thr=0.006):
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx): return x
    return x[max(0, idx[0] - int(0.01 * SR)): min(len(x), idx[-1] + int(0.04 * SR))]


def norm_word(w): return re.sub(r"[^a-z0-9']", '', w.lower().replace('’', "'"))


NUM = {'0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten'}


def align(script, heard, speech):
    """Times for every word of the SCRIPT, from what Whisper heard; misheard words are interpolated."""
    said = [norm_word(w) for w in script.split() if norm_word(w)]
    h = [NUM.get(w, w) for w, _, _ in heard]
    times = [None] * len(said)
    for a, b, n in SequenceMatcher(None, said, h, autojunk=False).get_matching_blocks():
        for j in range(n): times[a + j] = heard[b + j][1:]
    known = [i for i, t in enumerate(times) if t]
    for i in range(len(said)):
        if times[i]: continue
        lo = max([k for k in known if k < i], default=None); hi = min([k for k in known if k > i], default=None)
        t0 = times[lo][1] if lo is not None else 0.0
        t1 = times[hi][0] if hi is not None else speech
        gaps = (hi if hi is not None else len(said)) - (lo if lo is not None else -1)
        pos = i - (lo if lo is not None else -1)
        st = t0 + (t1 - t0) * (pos - 1) / gaps
        times[i] = (st, st + (t1 - t0) / gaps)
    return [{'w': w, 'start': round(LEAD + t[0], 3), 'end': round(LEAD + t[1], 3)} for w, t in zip(said, times)]


def main():
    if '--download' in sys.argv: ensure_models(); return
    reel_file = Path(sys.argv[1]); rid = reel_file.stem
    reel = json.loads(reel_file.read_text()); brand = json.loads((ROOT / 'brand/brand.json').read_text())
    ensure_models()
    from kokoro_onnx import Kokoro
    from faster_whisper import WhisperModel
    k = Kokoro(str(KDIR / 'kokoro-v1.0.onnx'), str(KDIR / 'voices-v1.0.bin'))
    whisper = WhisperModel('small.en', device='cpu', compute_type='int8')
    voice, speed = brand['voice']['name'], brand['voice'].get('speed', 1.0)
    lang = 'en-gb' if voice.startswith('b') else 'en-us'
    out = ROOT / 'public/runs' / rid; out.mkdir(parents=True, exist_ok=True)
    scenes, start = [], 0.0
    for i, sc in enumerate(reel['scenes']):
        say = sc['voice']
        for word, spoken in brand.get('pronounce', {}).items(): say = re.sub(rf'\b{re.escape(word)}\b', spoken, say)
        x = trim(np.asarray(k.create(say, voice=voice, speed=speed, lang=lang)[0], dtype=np.float64))
        x = x / (np.abs(x).max() + 1e-9) * 0.89
        wavfile.write(out / f'scene-{i + 1}.wav', SR, (x * 32767).astype(np.int16))
        speech = len(x) / SR
        segs, _ = whisper.transcribe(resample_poly(x, 2, 3).astype(np.float32), word_timestamps=True, language='en', vad_filter=False)
        heard = [(norm_word(w.word), w.start, w.end) for s in segs for w in (s.words or []) if norm_word(w.word)]
        words = align(sc['voice'], heard, speech)
        dur = round(LEAD + speech + TAIL, 3)
        scenes.append({'type': sc['type'], 'start': round(start, 3), 'duration': dur, 'audio': f'runs/{rid}/scene-{i + 1}.wav',
                       'audioStart': LEAD, 'speech': round(speech, 3), 'words': words})
        print(f'{i + 1} {sc["type"]:9s} {start:6.2f}s +{dur:5.2f}s', flush=True)
        start += dur
    length = reel['clip']['length']
    if start > length: sys.exit(f'speech is {start:.1f}s but the clip is {length}s')
    (out / 'timing.json').write_text(json.dumps({'id': rid, 'duration': length, 'scenes': scenes}, indent=1))
    print(f'speech {start:.2f}s of {length}s -> public/runs/{rid}/timing.json')


if __name__ == '__main__':
    main()
