"""Compose an original electronic score. No samples, stock music or network calls."""
from pathlib import Path
import wave
import numpy as np

RATE = 48000
ROOT = Path(__file__).resolve().parents[1]


def hz(note):
    return 440.0 * 2.0 ** ((note - 69) / 12.0)


def compose(seconds, cues, name):
    rng = np.random.default_rng(4127)
    count = round(seconds * RATE)
    music = np.zeros((count, 2), dtype=np.float64)
    chords = [[50, 57, 60, 64, 69], [53, 60, 64, 67, 72], [45, 52, 55, 59, 64], [43, 50, 57, 62, 67]]

    def add(sound, start, level, pan=0.0):
        offset = round(start * RATE)
        if offset >= count:
            return
        if offset < 0:
            sound = sound[-offset:]
            offset = 0
        sound = sound[:count - offset] * level
        music[offset:offset + len(sound), 0] += sound * np.sqrt((1 - pan) / 2)
        music[offset:offset + len(sound), 1] += sound * np.sqrt((1 + pan) / 2)

    def chord_at(time):
        return chords[0] if time >= seconds - 8 else chords[int(time // 8) % len(chords)]

    # Long, soft pads with overlapping tails and detuned harmonics.
    for start in np.arange(-0.5, seconds, 8):
        chord = chord_at(max(0, start + 0.5))
        t = np.arange(round(10 * RATE)) / RATE
        envelope = np.minimum(1, t / 1.4) * np.minimum(1, np.maximum(0, (10 - t) / 2.8))
        for index, note in enumerate(chord):
            frequency = hz(note)
            signal = np.sin(2 * np.pi * frequency * t + index * 0.3)
            signal += 0.26 * np.sin(2 * np.pi * frequency * 2.001 * t)
            signal += 0.09 * np.sin(2 * np.pi * frequency * 3 * t)
            signal *= envelope * (0.92 + 0.08 * np.sin(2 * np.pi * 0.16 * t + index))
            add(signal, start, 0.039, (index - 2) / 3.6)

    # Original eight-note arpeggio; the voice is a softly decaying additive pluck.
    pattern = [0, 2, 1, 3, 2, 4, 3, 1]
    for index, start in enumerate(np.arange(0, seconds - 1.25, 0.25)):
        chord = chord_at(start)
        note = chord[pattern[index % len(pattern)]] + 12
        frequency = hz(note)
        t = np.arange(round(0.72 * RATE)) / RATE
        signal = np.sin(2 * np.pi * frequency * t) + 0.21 * np.sin(2 * np.pi * frequency * 2 * t)
        signal += 0.055 * np.sin(2 * np.pi * frequency * 3 * t)
        signal *= np.minimum(1, t / 0.004) * np.exp(-t * (7.6 + index % 3))
        level = 0.056 if index % 4 == 0 else 0.039
        add(signal, start, level, np.sin(index * 1.35) * 0.65)

    # A rounded bass pulse, light kick, clap and high hats.
    for index, start in enumerate(np.arange(0, seconds - 1.5, 0.5)):
        chord = chord_at(start)
        t = np.arange(round(0.46 * RATE)) / RATE
        frequency = hz(chord[0] - 12)
        bass = np.sin(2 * np.pi * frequency * t) + 0.24 * np.sin(2 * np.pi * frequency * 2 * t)
        bass *= np.minimum(1, t / 0.012) * np.exp(-t * 6.8)
        add(np.tanh(bass * 1.2), start, 0.12 if index % 2 == 0 else 0.075)
        t = np.arange(round(0.38 * RATE)) / RATE
        phase = 2 * np.pi * (46 * t + 55 * 0.028 * (1 - np.exp(-t / 0.028)))
        kick = np.sin(phase) * np.exp(-t * 12) * np.minimum(1, t / 0.002)
        add(kick, start, 0.22 if start > 3 else 0.12)
        if index % 2:
            t = np.arange(round(0.16 * RATE)) / RATE
            noise = rng.standard_normal(len(t))
            noise -= np.convolve(noise, np.ones(11) / 11, mode='same')
            clap = noise * np.exp(-t * 32) + 0.22 * np.sin(2 * np.pi * 185 * t) * np.exp(-t * 40)
            add(clap, start + 0.002, 0.042, -0.08)

    for index, start in enumerate(np.arange(2, seconds - 1.5, 0.25)):
        t = np.arange(round(0.09 * RATE)) / RATE
        noise = rng.standard_normal(len(t))
        high = np.concatenate(([0], np.diff(noise)))
        high *= np.exp(-t * (70 if index % 2 == 0 else 40)) * np.minimum(1, t / 0.001)
        add(high, start, 0.012 if index % 2 else 0.008, 0.35)

    # Short, original transition sweeps and a quiet two-note confirmation tone.
    for cue in cues[1:]:
        t = np.arange(round(0.26 * RATE)) / RATE
        noise = rng.standard_normal(len(t))
        noise = np.convolve(noise, np.ones(8) / 8, mode='same')
        sweep = noise * np.sin(np.pi * t / 0.26) ** 2
        add(sweep, cue - 0.13, 0.035, 0.1)
        t = np.arange(round(0.6 * RATE)) / RATE
        chime = (np.sin(2 * np.pi * hz(74) * t) + 0.35 * np.sin(2 * np.pi * hz(81) * t))
        chime *= np.minimum(1, t / 0.004) * np.exp(-t * 9)
        add(chime, cue, 0.035, -0.2)

    dry = music.copy()
    for delay, level in [(0.12, 0.12), (0.24, 0.07), (0.36, 0.035)]:
        shift = round(delay * RATE)
        music[shift:, 0] += dry[:-shift, 1] * level
        music[shift:, 1] += dry[:-shift, 0] * level
    timeline = np.arange(count) / RATE
    fade = np.minimum(1, timeline / 0.06) * np.minimum(1, np.maximum(0, (seconds - timeline) / 1.8))
    music *= fade[:, None]
    music = np.tanh(music * 1.12)
    music *= 10 ** (-2 / 20) / max(0.001, np.max(np.abs(music)))
    target = ROOT / 'public' / 'audio' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(target), 'wb') as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes((np.clip(music, -1, 1) * 32767).astype('<i2').tobytes())
    print(f'Composed {target.name}: {seconds}s, stereo, 48 kHz')


if __name__ == '__main__':
    compose(54, [0, 4, 11, 18, 25, 32, 39, 46], 'score-youtube.wav')
    compose(36, [0, 3, 8, 13, 18, 23, 28, 31], 'score-social.wav')
