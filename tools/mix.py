"""Mixes voice + an original generated music bed (nothing licensed, so no music claims) + optional game audio.

  mix.py <run dir> <seconds> <music level> <source audio level> <seed>   -> <run dir>/mix.wav (48 kHz stereo)
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.ndimage import uniform_filter1d
from scipy.signal import butter, resample_poly, sosfilt

SR = 48000


def music(n, seed):
    rng = np.random.default_rng(seed)
    root = 110 * 2 ** (int(rng.integers(-3, 4)) / 12)
    prog = [[0, 3, 7, 10], [-4, 0, 3, 7], [-9, -5, 0, 3], [-2, 2, 5, 10]]
    bar = 60 / 76 * 4
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for b in range(int(n / SR / bar) + 1):
        lo, hi = int(b * bar * SR), min(n, int((b + 1.25) * bar * SR))
        if lo >= n: break
        tt = t[lo:hi]
        env = np.minimum(1, (tt - tt[0]) / 1.0) * np.minimum(1, (tt[-1] - tt + 1e-3) / 1.2)
        for k, semi in enumerate(prog[b % 4]):
            f = root * 2 * 2 ** (semi / 12)
            out[lo:hi, 0] += env * (np.sin(2 * np.pi * f * tt) + .4 * np.sin(2 * np.pi * f * 1.004 * tt)) / 4
            out[lo:hi, 1] += env * (np.sin(2 * np.pi * f * tt + k) + .4 * np.sin(2 * np.pi * f * .996 * tt)) / 4
        bass = root * 2 ** (prog[b % 4][0] / 12)
        pulse = np.exp(-((tt - tt[0]) % (bar / 4)) * 5)
        out[lo:hi] += (env * pulse * np.sin(2 * np.pi * bass * tt) * .55)[:, None]
    out = sosfilt(butter(2, 1400, 'low', fs=SR, output='sos'), out, axis=0)
    fade = int(SR * 1.2)
    out[:fade] *= np.linspace(0, 1, fade)[:, None]
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out / (np.abs(out).max() + 1e-9)


def main():
    run, seconds, level, game, seed = Path(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), int(sys.argv[5])
    n = int(seconds * SR)
    voice = np.zeros(n)
    for s in json.loads((run / 'timing.json').read_text())['scenes']:
        rate, x = wavfile.read(run / Path(s['audio']).name)
        x = resample_poly(x / 32768, SR, rate)
        at = int((s['start'] + s['audioStart']) * SR)
        x = x[:max(0, n - at)]
        voice[at:at + len(x)] += x
    # the music dips under the voice
    active = uniform_filter1d((np.abs(voice) > 0.01).astype(float), int(SR * 0.25)) > 0.02
    duck = uniform_filter1d(np.where(active, 0.55, 1.0), int(SR * 0.3))
    mix = music(n, seed) * level * duck[:, None] + voice[:, None]
    if game > 0:
        r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(run / 'clip.mp4'), '-vn', '-ac', '2', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True)
        a = np.frombuffer(r.stdout, dtype=np.int16).reshape(-1, 2) / 32768
        a = a[:n]
        mix[:len(a)] += a * game * duck[:len(a), None]
    mix = mix / max(1, np.abs(mix).max() / 0.95)
    wavfile.write(run / 'mix.wav', SR, (mix * 32767).astype(np.int16))


if __name__ == '__main__':
    main()
