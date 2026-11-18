# Testing Motion Room

Run `npm ci` and `npm test` for the CPU-side suite. It covers the existing animation engine plus portable binary project round trips and malformed files, serialized/retryable autosaves, independent joint/group timing, atomic collision rejection, pose mirroring with different bone axes, media time offsets, clip-aware saved takes and undo, and export cancellation.

For browser workflows, start `npm start` in a separate terminal, then run:

```sh
npx playwright install chromium
npm run test:browser
```

The runner creates a temporary browser profile and removes that profile after closing it. It does not use personal browser projects. Set `MOTION_ROOM_URL` to test another local address. The default is `http://127.0.0.1:5173`.

`tests/browser-workflows.mjs` uses visible controls and DOM assertions. It checks numeric posing and the pose library, group move/stretch/copy/paste and undo, zoom, keyboard resizing and focus mode, image import, project-file download/reopening, browser reload, GLB export, actual WebM playback, multi-clip take restoration and export cancellation. `tests/helpers/webm.mjs` independently checks the real exported file's frame count, frame rate and dimensions.

The same workflows can be exercised through the Computer Use tab API. No application state is injected. Browser tests need `assets/motion-room-logo.png` and the multi-clip `references/epic/jump.glb`; the asset notices apply to those fixtures. The full CPU suite also needs the references documented in the README.

Frame-by-frame video is tested when the browser exposes WebCodecs; VP8 encoding must be available. Quick video remains a separate browser-dependent recording path. Imported video/image formats are limited to codecs supported by the browser.

WebM container implementation follows the [WebM container guidelines](https://www.webmproject.org/docs/container/) and uses the browser's [WebCodecs API](https://www.w3.org/TR/webcodecs/).
