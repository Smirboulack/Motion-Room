# Motion Room product trailer

An English-only product film built in **React and Remotion**, with real Motion Room footage, kinetic typography and an original electronic score. It is designed to remain understandable with sound off. There is no voiceover.

## Deliverables

| Composition | File in `out/` | Size | Duration |
| --- | --- | --- | --- |
| `MotionRoomYouTube` | `motion-room-youtube-1080p.mp4` | 1920 × 1080, 16:9 | 54 seconds |
| `MotionRoomX` | `motion-room-x-1080x1350.mp4` | 1080 × 1350, 4:5 | 36 seconds |
| `MotionRoomShorts` | `motion-room-shorts-1080x1920.mp4` | 1080 × 1920, 9:16 | 36 seconds |
| `MotionRoomThumbnail` | `motion-room-youtube-thumbnail.jpg` | 1920 × 1080 | Still image |

Video exports use H.264, 30 fps, YUV 4:2:0, BT.709 and stereo AAC at 48 kHz. The music master is approximately −16 LUFS, with true peaks below −1.5 dBTP before AAC encoding. All visible copy, the publishing text and this production project are in English.

Open `review.html` to play all three versions and access their download links. With the application server running, it is also available at `/video/review.html`.

## Open the editable project

From this directory:

```sh
npm ci
npm run studio
```

Select a composition in Remotion Studio. Runtime packages are isolated from the animation application; this folder does not change its framework or build process.

## Render

```sh
npm run render
npm run render:youtube
npm run render:x
npm run render:shorts
```

The first render downloads Remotion's Chrome Headless Shell if necessary. Renders run locally. `scripts/render.mjs` bundles once, renders the requested compositions and writes a thumbnail and technical metadata. It uses six concurrent rendering workers; adjust `concurrency` for another machine.

To render preview frames only:

```sh
node scripts/render.mjs all --stills
```

## Edit the film

- `src/trailer.jsx`: visual design, English copy, motion graphics, scene layouts and footage framing.
- `src/index.jsx`: composition sizes, frame rate and durations.
- `lengths` in `trailer.jsx`: seconds per scene for the long and short edits. Update composition frame counts if changing the total length.
- `public/footage/`: H.264 clips exported from the real application.
- `public/screens/`: actual application screenshots used for interface close-ups.
- `public/audio/`: the original score, supplied as render-ready M4A files.
- `public/fonts/`: local fonts and their licenses. No font CDN is used during rendering.
- `publishing.md`: ready-to-use English post copy and a text transcript.

## Story

| YouTube timing | Message | Product evidence |
| --- | --- | --- |
| 00:00–00:04 | Make your next move. | Fast run / sprint / vault montage |
| 00:04–00:11 | From a run to a sprint. | Two distinct Game Animation Sample gaits at original speed |
| 00:11–00:18 | Over it. Onto it. | Supported vault, hands-free hurdle and mantle with fitted obstacles |
| 00:18–00:25 | Make the pose yours. | Wave with authored offsets, pose library and an actual contact pin |
| 00:25–00:32 | Find your rhythm. | Real edited run, arm curve and joint channels |
| 00:32–00:39 | Bring your reference. | Jump, landing, roll, walk comparison, run ghosts and foot trajectory |
| 00:39–00:46 | Keep every take. | Actual editable-project, GLB and video export controls |
| 00:46–00:54 | Your space to animate. | Free / open-source / local positioning and GitHub link |

The 36-second edit keeps the same workflow with shorter holds. The 4:5 and 9:16 versions use separate layouts. Both run and sprint remain visible together, and character-follow reframing keeps the full traversal readable on mobile. The taller version also shows a separate walk-cycle panel.

## Footage and music

The film uses **eight Epic Game Animation Sample movement studies plus the Mesh2Motion CC0 wave**. The gait cycles retain their original speed. The three obstacle studies use actual sample performances with root travel and fitted Motion Room objects; their full approach, traversal and recovery appear in the traversal chapter. That chapter labels its slow motion: 0.65× in the long film and 0.85× in the social versions. The wave chapter retains the original authored wrist poses, saved hand pose and contact pin. The run chapter shows real arm offsets and curves authored in the app.

New footage is exported from Motion Room itself at 1080p/60 fps and prepared for the 30 fps film. Odd-length gait cycles are repeated twice before resampling, preserving native timing and a clean loop. Interface screenshots are real. React / Remotion adds labels, transitions and a measured camera follow over the rendered traversal frames. It does not change character motion or obstacle geometry.

To regenerate the prepared clips after exporting new captures into `public/footage/*.webm`:

```sh
node scripts/prepare-footage.mjs
python scripts/reframe-footage.py
```

The MP4 captures and framing metadata are included, so normal rendering does not require Unreal Engine, Blender, the source GLBs or Python. The parent Motion Room repository documents regeneration in `tools/README.md`; the exact source excerpts are also recorded in [ASSET_CREDITS.md](public/ASSET_CREDITS.md). No raw Epic asset is included in the video source archive.

`scripts/score.py` composes the original 120 BPM score from synthesized pads, plucks, bass and percussion. It uses no external recordings, stock tracks or third-party samples. Render-ready audio is included; Python is only needed to regenerate the score:

```sh
python -m pip install numpy
node scripts/prepare-audio.mjs
```

Regeneration also requires FFmpeg in `PATH`. Asset sources and font licenses are recorded in [ASSET_CREDITS.md](public/ASSET_CREDITS.md). Remotion and its dependencies retain their own licenses independently of Motion Room's original code.

## Validation

Preview frames are inspected across all three layouts before final rendering. FFprobe metadata is saved beside each MP4. Checks include duration, frame rate, dimensions, codecs, pixel format, audio channels, opening and closing frames, English copy and mobile framing. The video is prepared for upload; no social post or YouTube upload is submitted by this project.

With FFmpeg and FFprobe in `PATH`, run `node scripts/verify.mjs` after rendering. It fully decodes all three files, checks dimensions, exact frame counts, audio, streaming layout and loudness, and extracts action and recovery frames for visual inspection. `python scripts/package-source.py` rebuilds the editable source archive with rendered MP4 captures, fonts and music; it excludes caches, raw capture files and editable third-party 3D assets.
