"""
Soundtrack for the Coinside promo (promo.html, 44 s): an original minimal electronic track in A minor at 120 BPM
plus sound design on the picture's events (the coin closing, scene changes, cursor clicks, the deposit arriving,
"Free"). Everything is synthesized here, so there is nothing to license.

    python3 brand/video/music.py out.wav      # needs numpy and scipy

The times below match promo.html; change them together.
"""

import sys

import numpy as np
from scipy import signal

SR = 48000
DUR = 44.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

# the beat grid: bar lines at T0 + 2k, so the drop (8.6 s) and the end card (40.6 s) land on a bar
T0 = 0.6
BEAT = 0.5
DROP, BREAK, END = 8.6, 35.4, 40.6

dry = np.zeros((2, N))
send = np.zeros((2, N))  # to the reverb


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def idx(t):
    return int(round(t * SR))


def filt(x, kind, f, order=2):
    sos = signal.butter(order, f, kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def put(x, start, gain=1.0, pan=0.0, rev=0.0):
    """Add mono x at `start` s, panned (-1 left .. 1 right, equal power), with a reverb send."""
    i = idx(start)
    if i >= N:
        return
    x = x[: N - i] * gain
    a = (pan + 1) * np.pi / 4
    g = np.array([np.cos(a), np.sin(a)]) * np.sqrt(2)
    dry[:, i : i + len(x)] += g[:, None] * x
    if rev:
        send[:, i : i + len(x)] += g[:, None] * x * rev


def curve(points):
    """Automation: [(t, value), ...] → per-sample values."""
    ts, vs = zip(*points)
    return np.interp(tt(N), ts, vs)


def saw(f, n, phase=0.0):
    return 2 * ((f * tt(n) + phase) % 1.0) - 1


def adsr(n, a, r):
    e = np.ones(n)
    na, nr = min(int(a * SR), n), min(int(r * SR), n)
    e[:na] = np.linspace(0, 1, na)
    e[n - nr :] *= np.linspace(1, 0, nr)
    return e


# ---- harmony: Am, F, C, G, one bar each ----
CHORDS = [
    (45, [57, 60, 64]),  # Am: A3 C4 E4, root A2
    (41, [57, 60, 65]),  # F: A3 C4 F4
    (48, [55, 60, 64]),  # C: G3 C4 E4
    (43, [55, 59, 62]),  # G: G3 B3 D4
]


def chord_at(t):
    if t < T0:
        return CHORDS[0]
    return CHORDS[int((t - T0) // 2) % 4]


# ---- pad: detuned saws, low-passed, one chord per bar ----
pad = np.zeros((2, N))
bar_starts = [0.0] + [T0 + 2 * k for k in range(1, 20)]  # the first Am runs from 0 to the second bar
for k, start in enumerate(bar_starts):
    if start >= DUR:
        break
    nxt = bar_starts[k + 1] if k + 1 < len(bar_starts) else DUR
    final = start >= END - 0.01
    length = (DUR - start) if final else (nxt - start) + 0.5
    n = int(length * SR)
    _, notes = chord_at(start + 0.01)
    env = adsr(n, 0.35 if k else 1.2, 0.5 if not final else 2.5)
    for m in notes + [notes[0] + 12]:
        for cents, ch in ((-9, 0), (0, None), (9, 1)):
            v = saw(hz(m) * 2 ** (cents / 1200), n, rng.random()) * env * 0.2
            if ch is None:
                pad[0, idx(start) : idx(start) + n] += v[: N - idx(start)] * 0.7
                pad[1, idx(start) : idx(start) + n] += v[: N - idx(start)] * 0.7
            else:
                pad[ch, idx(start) : idx(start) + n] += v[: N - idx(start)]
pad = np.stack([filt(pad[0], "low", 2400), filt(pad[1], "low", 2400)])
pad *= curve(
    [
        (0, 0),
        (2.5, 0.8),
        (DROP, 0.85),
        (DROP + 0.2, 0.55),
        (BREAK, 0.55),
        (BREAK + 0.6, 0.95),
        (END, 0.95),
        (DUR, 0.9),
    ]
)


# ---- kick, four on the floor from the drop to the break ----
def kick():
    n = int(0.45 * SR)
    t = tt(n)
    f = 46 + 120 * np.exp(-t / 0.028)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.17)
    click = filt(rng.standard_normal(n), "high", 3000) * np.exp(-t / 0.003) * 0.25
    return np.tanh(1.6 * (body + click))


kicks = [T0 + BEAT * k for k in range(200) if DROP - 0.01 <= T0 + BEAT * k < BREAK - 0.01]
K = kick()
for t0 in kicks:
    put(K, t0, 0.5)

# sidechain: pad and bass duck under each kick
duck = np.ones(N)
for t0 in kicks:
    i = idx(t0)
    n = min(int(0.5 * SR), N - i)
    duck[i : i + n] *= 1 - 0.55 * np.exp(-tt(n) / 0.11)

# ---- bass: the chord root, warm sub ----
bass = np.zeros(N)
for start in [T0 + 2 * k for k in range(20)]:
    if start < DROP - 0.01 or start >= END:
        continue
    n = int(2.0 * SR)
    root, _ = chord_at(start + 0.01)
    f = hz(root - 12) if root - 12 >= 33 else hz(root)
    x = np.tanh(1.8 * np.sin(2 * np.pi * f * tt(n))) * adsr(n, 0.01, 0.08)
    bass[idx(start) : idx(start) + n] += x[: N - idx(start)]
bass = filt(bass, "low", 220) * curve(
    [(0, 0), (DROP, 0.3), (BREAK, 0.3), (BREAK + 0.3, 0.2), (END, 0.2), (END + 0.01, 0)]
)
# the last chord: a long A
n = N - idx(END)
bass[idx(END) :] += (
    filt(np.tanh(1.5 * np.sin(2 * np.pi * hz(33) * tt(n))), "low", 200) * np.exp(-tt(n) / 1.6) * 0.35
)

dry += np.stack([pad[0] * duck, pad[1] * duck])
dry += np.stack([bass * duck, bass * duck])
send += pad * 0.35


# ---- hats and claps ----
def hat(decay=0.012):
    n = int(0.08 * SR)
    return filt(rng.standard_normal(n), "high", 7500) * np.exp(-tt(n) / decay)


def clap():
    n = int(0.3 * SR)
    t = tt(n)
    noise = filt(rng.standard_normal(n), "band", [900, 2600])
    env = np.exp(-t / 0.09) + 0.6 * np.exp(-np.maximum(t - 0.011, 0) / 0.004) * (t > 0.011)
    return noise * env


for k in range(400):
    t0 = T0 + 0.25 * k
    if t0 < 13.4 or t0 >= BREAK - 0.01:
        continue
    step = k % 4
    if step == 2:  # the off-beat 8th
        put(hat(), t0, 0.5, pan=0.25)
    elif t0 >= 19.6 and step in (1, 3):
        put(hat(0.007), t0, 0.15, pan=-0.3)
for k in range(100):
    t0 = T0 + BEAT + 2 * BEAT * k
    if 13.4 <= t0 < BREAK - 0.01:
        put(clap(), t0, 0.55, rev=0.4)

# ---- pluck arpeggio, 16ths, from the second scene to the break ----
PATTERN = [0, 1, 2, 3, 2, 1, 2, 3]
arp_gain = curve([(0, 0), (4.0, 0), (4.1, 0.35), (DROP, 0.7), (BREAK - 0.2, 0.6), (BREAK, 0)])
for k in range(400):
    t0 = 4.0 + 0.125 * k
    if t0 >= BREAK:
        break
    _, notes = chord_at(t0)
    tones = [m + 12 for m in notes] + [notes[0] + 24]
    m = tones[PATTERN[k % 8]]
    n = int(0.35 * SR)
    t = tt(n)
    x = (np.sin(2 * np.pi * hz(m) * t) + 0.3 * np.sin(4 * np.pi * hz(m) * t)) * np.exp(-t / 0.13)
    put(filt(x, "low", 3500), t0, 0.22 * arp_gain[idx(t0)], pan=0.45 if k % 2 else -0.45, rev=0.5)


# ---- sound design ----
def boom():
    n = int(2.2 * SR)
    t = tt(n)
    f = 42 + 50 * np.exp(-t / 0.08)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    air = filt(rng.standard_normal(n), "low", 1800) * np.exp(-t / 0.25) * 0.35
    return np.tanh(1.3 * (sub + air))


def riser(length):
    n = int(length * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    chunks = 48
    for c in range(chunks):
        a, b = c * n // chunks, (c + 1) * n // chunks
        fc = 400 * (9000 / 400) ** (c / chunks)
        seg_ = filt(noise[max(0, a - 2000) : b], "band", [fc * 0.7, min(fc * 1.4, 20000)])
        out[a:b] = seg_[-(b - a) :]
    ramp = np.linspace(0, 1, n) ** 2.2
    tone = np.sin(2 * np.pi * np.cumsum(np.linspace(220, 880, n)) / SR) * 0.12
    return (out * 0.8 + tone) * ramp


def whoosh(length=0.6):
    n = int(length * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    chunks = 24
    for c in range(chunks):
        a, b = c * n // chunks, (c + 1) * n // chunks
        fc = 3500 * (700 / 3500) ** (c / chunks)
        seg_ = filt(noise[max(0, a - 1500) : b], "band", [fc * 0.6, fc * 1.6])
        out[a:b] = seg_[-(b - a) :]
    return out * np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5


def tick():
    n = int(0.12 * SR)
    t = tt(n)
    hi = filt(rng.standard_normal(n), "high", 2500) * np.exp(-t / 0.004)
    tone = np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.012) * 0.5
    thump = np.sin(2 * np.pi * 140 * t) * np.exp(-t / 0.03) * 0.6
    return hi * 0.6 + tone + thump


def bell(m, decay=1.1):
    n = int(2.0 * SR)
    t = tt(n)
    f = hz(m)
    return (
        np.sin(2 * np.pi * f * t) * np.exp(-t / decay)
        + 0.4 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / (decay * 0.6))
        + 0.15 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / (decay * 0.35))
    ) * (1 - np.exp(-t / 0.002))


# the coin's halves meet, then the name sparkles in
put(boom(), 0.85, 0.75, rev=0.5)
for i, (t0, m) in enumerate([(1.25, 81), (1.45, 84), (1.65, 88), (2.0, 93)]):
    put(bell(m, 0.9), t0, 0.07, pan=(-0.5, 0.3, -0.2, 0.5)[i], rev=0.8)
# build into the drop, and into the end card
put(riser(2.0), DROP - 2.0, 0.22, rev=0.3)
put(boom(), DROP, 0.55, rev=0.35)
put(riser(1.8), END - 1.8, 0.2, rev=0.3)
put(boom(), END, 0.7, rev=0.5)
# scene changes
for t0, pan in [(3.55, -0.4), (13.2, 0.4), (19.4, -0.4), (24.8, 0.4), (29.4, -0.4), (35.2, 0.3)]:
    put(whoosh(), t0, 0.2, pan=pan, rev=0.25)
# cursor clicks (feature start + its click time in promo.html)
for t0 in (8.6 + 3.6, 19.6 + 3.1, 25.0 + 1.5, 29.6 + 2.15):
    put(tick(), t0, 0.32, pan=0.15)
# the deposit arrives; "Free" shows
put(bell(88, 1.2), 17.15, 0.14, rev=0.6)
put(bell(95, 1.0), 17.32, 0.1, rev=0.6)
put(bell(88, 1.0), 36.62, 0.12, rev=0.6)
put(bell(93, 1.2), 36.8, 0.12, rev=0.6)

# ---- reverb: a decaying noise tail, slightly different per side ----
n = int(2.4 * SR)
ir = np.stack([filt(rng.standard_normal(n), "low", 6000) * np.exp(-tt(n) / 0.55) for _ in range(2)])
ir[:, : int(0.02 * SR)] = 0
ir /= np.abs(ir).sum(axis=1, keepdims=True) ** 0.5 * 12
wet = np.stack([signal.fftconvolve(send[c], ir[c])[:N] for c in range(2)])

mix = dry + wet * 0.9
mix = np.stack([filt(mix[c], "high", 28) for c in range(2)])
mix /= np.max(np.abs(mix)) / 0.9
mix = np.tanh(1.15 * mix) / np.tanh(1.15)
fade = curve([(0, 0), (0.03, 1), (DUR - 1.2, 1), (DUR, 0)])
mix *= fade * 0.95

out = sys.argv[1] if len(sys.argv) > 1 else "music.wav"
pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
import wave

with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out, f"peak {np.max(np.abs(mix)):.2f}")
