"""Measure the rendered character to drive a gentle editorial camera follow.

This only reads rendered pixels. It changes neither the source animation nor
the obstacle. Run prepare-footage.mjs first. Requires numpy.
"""
import json
import subprocess
from pathlib import Path

import numpy as np

folder = Path(__file__).resolve().parents[1] / "public" / "footage"
result = {}
for name in ("vault", "vault-side", "hurdle", "mantle"):
    raw = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(folder / (name + ".mp4")),
        "-vf", "scale=640:360", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ])
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 360, 640, 3)
    background = np.median(frames, axis=0).astype(np.int16)
    centers, heights, widths, bounds = [], [], [], []
    for frame in frames:
        rgb = frame.astype(np.int16)
        # The mannequin is neutral white; the obstacle caps are cool grey.
        # Reject their blue tint so a bright bar cannot pull the camera away
        # from the character during the landing.
        chroma = rgb.max(axis=2) - rgb.min(axis=2)
        moving = np.abs(rgb - background).max(axis=2) > 20
        mask = (rgb[:, :, 0] > 175) & (chroma < 9) & moving
        ys, xs = np.where(mask)
        if len(xs) < 10:
            raise ValueError("Character could not be located in " + name)
        centers.append([(float(xs.min()) + float(xs.max())) / 1280, (float(ys.min()) + float(ys.max())) / 720])
        heights.append((float(ys.max()) - float(ys.min())) / 360)
        widths.append((float(xs.max()) - float(xs.min())) / 640)
        bounds.append([float(xs.min()) / 640, float(ys.min()) / 360, float(xs.max()) / 640, float(ys.max()) / 360])
    points = np.array(centers)
    # Symmetric smoothing avoids a delayed camera at takeoff and landing.
    smooth = np.stack([np.convolve(np.pad(points[:, axis], (2, 2), mode="edge"), [0.1, 0.2, 0.4, 0.2, 0.1], mode="valid") for axis in range(2)], axis=1)
    result[name] = {"maxHeight": round(max(heights), 5), "maxWidth": round(max(widths), 5), "centers": np.round(smooth, 5).tolist(), "bounds": np.round(bounds, 5).tolist()}
    print(name, len(frames), "frames; character height", round(max(heights), 3), "centers", np.round(smooth[[0, len(frames)//2, -1]], 2).tolist())
(folder / "reframe.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
