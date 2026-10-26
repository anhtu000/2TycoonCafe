# Generates the cafe's background music: a soft, original loop (electric piano, bass, brushes, music box).
# No samples, no third-party material: every sound is synthesized here.
# Usage: python3 tools/make_music.py public/audio
#   writes music.ogg (Chrome, Firefox, Android) and music.mp3 (Safari), both a seamless loop.
# Needs numpy, scipy and ffmpeg.
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter

SR = 44100
BPM = 84
BEAT = 60 / BPM
BARS = 16
LENGTH = BARS * 4 * BEAT  # seconds
N = int(round(LENGTH * SR))
TAIL = int(4 * SR)  # rendered past the end, then wrapped to the start so the loop is seamless
rng = np.random.default_rng(23)

NOTE = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}


def hz(name: str) -> float:
    """'A4' -> 440.0, 'Bb2' -> 116.5."""
    pitch, octave = name[:-1], int(name[-1])
    midi = 12 * (octave + 1) + NOTE[pitch]
    return 440.0 * 2 ** ((midi - 69) / 12)


def buf():
    return np.zeros(N + TAIL)


def place(track, start_sec, sound, gain=1.0):
    i = int(round(start_sec * SR))
    j = min(len(track), i + len(sound))
    track[i:j] += sound[: j - i] * gain


def lowpass(x, cutoff, order=2):
    b, a = butter(order, cutoff / (SR / 2), 'low')
    return lfilter(b, a, x)


def highpass(x, cutoff, order=2):
    b, a = butter(order, cutoff / (SR / 2), 'high')
    return lfilter(b, a, x)


# ---------- instruments ----------


def epiano(f, dur, vel=1.0):
    """Electric-piano tine: FM with a decaying index, slow tremolo, soft attack."""
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    index = 1.6 * np.exp(-t * 7) + 0.25
    mod = np.sin(2 * np.pi * f * t) * index
    tone = np.sin(2 * np.pi * f * t + mod) * 0.8 + 0.2 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 5)
    env = np.minimum(1, t / 0.006) * np.exp(-t * 1.6)
    # Release after the held time.
    rel = np.where(t > dur, np.exp(-(t - dur) * 9), 1.0)
    trem = 1 + 0.08 * np.sin(2 * np.pi * 4.5 * t)
    return tone * env * rel * trem * vel


def bass(f, dur, vel=1.0):
    n = int((dur + 0.3) * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
    env = np.minimum(1, t / 0.012) * np.exp(-t * 2.2)
    rel = np.where(t > dur, np.exp(-(t - dur) * 14), 1.0)
    return tone * env * rel * vel


def musicbox(f, vel=1.0):
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t * 6) + 0.12 * np.sin(2 * np.pi * 4.2 * f * t) * np.exp(-t * 9)
    env = np.minimum(1, t / 0.003) * np.exp(-t * 3.2)
    return tone * env * vel


def kick(vel=1.0):
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    f = 46 + 48 * np.exp(-t * 30)
    phase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(phase) * np.exp(-t * 16) * vel


def shaker(vel=1.0):
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    noise = highpass(rng.standard_normal(n), 5200)
    return noise * np.minimum(1, t / 0.008) * np.exp(-t * 60) * vel


def rim(vel=1.0):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    noise = highpass(rng.standard_normal(n), 1800)
    tone = np.sin(2 * np.pi * 1650 * t)
    return (noise * 0.6 + tone * 0.4) * np.exp(-t * 55) * vel


# ---------- score ----------

# One chord per bar: name, voicing (electric piano), bass root and fifth.
CHORDS = [
    ('Fmaj7', ['F3', 'A3', 'C4', 'E4'], 'F2', 'C3'),
    ('Dm7', ['F3', 'A3', 'C4', 'D4'], 'D2', 'A2'),
    ('Gm7', ['F3', 'Bb3', 'D4', 'G4'], 'G2', 'D3'),
    ('C7', ['E3', 'G3', 'Bb3', 'D4'], 'C2', 'G2'),
    ('Fmaj7', ['E3', 'A3', 'C4', 'F4'], 'F2', 'C3'),
    ('Am7', ['E3', 'G3', 'C4', 'A4'], 'A2', 'E3'),
    ('Bbmaj7', ['F3', 'A3', 'D4', 'Bb4'], 'Bb1', 'F2'),
    ('C7sus', ['F3', 'G3', 'Bb3', 'D4'], 'C2', 'G2'),
    ('Bbmaj7', ['F3', 'A3', 'D4', 'Bb4'], 'Bb1', 'F2'),
    ('Am7', ['E3', 'G3', 'C4', 'A4'], 'A2', 'E3'),
    ('Gm7', ['F3', 'Bb3', 'D4', 'G4'], 'G2', 'D3'),
    ('C7', ['E3', 'G3', 'Bb3', 'D4'], 'C2', 'G2'),
    ('Dm7', ['F3', 'A3', 'C4', 'D4'], 'D2', 'A2'),
    ('Gm7', ['F3', 'Bb3', 'D4', 'G4'], 'G2', 'D3'),
    ('Bbmaj7', ['F3', 'A3', 'D4', 'Bb4'], 'Bb1', 'F2'),
    ('C7', ['E3', 'G3', 'Bb3', 'D4'], 'C2', 'G2'),
]

# Music box: a short original tune over bars 9-16, (bar, beat, note). F major pentatonic.
TUNE = [
    (8, 0, 'D5'), (8, 1, 'F5'), (8, 2.5, 'G5'),
    (9, 0, 'E5'), (9, 2, 'C5'),
    (10, 0, 'D5'), (10, 1, 'F5'), (10, 2, 'A5'), (10, 3, 'G5'),
    (11, 0, 'E5'), (11, 2.5, 'C5'),
    (12, 0, 'A4'), (12, 1, 'C5'), (12, 2, 'D5'),
    (13, 0, 'F5'), (13, 1.5, 'D5'), (13, 3, 'C5'),
    (14, 0, 'D5'), (14, 2, 'F5'),
    (15, 0, 'G5'), (15, 2, 'E5'),
]


def swing(beat_pos: float) -> float:
    """Light swing on the off-beat eighths (58%)."""
    whole = int(beat_pos)
    frac = beat_pos - whole
    return whole + (0.58 if abs(frac - 0.5) < 1e-6 else frac)


def render():
    keys, low, drums, box = buf(), buf(), buf(), buf()
    for bar, (_, voicing, root, fifth) in enumerate(CHORDS):
        t0 = bar * 4 * BEAT
        # Comping: a held chord on beat 1, a softer push on the "and" of 2 (every other bar a third hit on 4).
        hits = [(0, 1.4, 1.0), (1.5, 1.0, 0.55)] + ([(3, 0.8, 0.45)] if bar % 2 else [])
        for beat, length, vel in hits:
            for k, note in enumerate(voicing):
                # Notes rolled very slightly, like a hand on keys.
                place(keys, t0 + swing(beat) * BEAT + k * 0.012, epiano(hz(note), length * BEAT, vel * 0.22))
        # Bass: root on 1, fifth on 3, a short pickup on the "and" of 4 toward the next bar.
        place(low, t0, bass(hz(root), 1.6 * BEAT, 0.9))
        place(low, t0 + 2 * BEAT, bass(hz(fifth), 1.2 * BEAT, 0.7))
        place(low, t0 + swing(3.5) * BEAT, bass(hz(root) * 2, 0.35 * BEAT, 0.35))
        # Brushes: soft kick on 1 and 3, rim on 2 and 4, shaker on eighths. The first bar of each half is lighter.
        light = bar in (0, 8)
        for beat in (0, 2):
            place(drums, t0 + beat * BEAT, kick(0.55 if not light else 0.35))
        for beat in (1, 3):
            place(drums, t0 + beat * BEAT, rim(0.10))
        for e in range(8):
            pos = swing(e / 2)
            place(drums, t0 + pos * BEAT, shaker((0.10 if e % 2 else 0.065) * (0.6 if light else 1)))
    for bar, beat, note in TUNE:
        place(box, bar * 4 * BEAT + swing(beat) * BEAT, musicbox(hz(note), 0.16))

    keys = lowpass(keys, 5200)
    low = lowpass(low, 900)
    drums = lowpass(drums, 9000)
    dry = keys + low * 0.55 + drums + box
    # Wrap the part that rings past the end back onto the start: a seamless loop.
    def wrap(x):
        out = x[:N].copy()
        out[:TAIL] += x[N:N + TAIL]
        return out

    # Room: a short synthetic reverb, slightly different left and right for width.
    def room(seed):
        r = np.random.default_rng(seed)
        n = int(1.8 * SR)
        t = np.arange(n) / SR
        ir = r.standard_normal(n) * np.exp(-t * 3.2)
        return lowpass(ir, 4200) * 0.02

    wet_src = keys + box * 1.2 + drums * 0.4
    wl = fftconvolve(wet_src, room(1))[: N + TAIL]
    wr = fftconvolve(wet_src, room(2))[: N + TAIL]
    left = wrap(dry + wl * 0.35)
    right = wrap(dry + wr * 0.35)
    # Second wrap for anything the reverb pushed further than TAIL (very quiet by then).
    stereo = np.stack([left, right], axis=1)
    stereo = highpass(stereo.T, 35).T
    peak = np.max(np.abs(stereo))
    return stereo / peak * 0.89


def write_wav(path, stereo):
    pcm = (np.clip(stereo, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'public/audio'
    audio = render()
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'music.wav')
        write_wav(wav, audio)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '2', os.path.join(out, 'music.ogg')], check=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '96k', os.path.join(out, 'music.mp3')], check=True)
        if os.environ.get('KEEP_WAV'):
            os.replace(wav, os.path.join(out, 'music_preview.wav'))
    print(f'music: {LENGTH:.1f} s loop, {BPM} BPM, {BARS} bars')


if __name__ == '__main__':
    main()
