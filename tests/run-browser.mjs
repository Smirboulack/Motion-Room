import { chromium } from 'playwright';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runWorkspaceChecks } from './browser-workflows.mjs';
import { inspectWebM } from './helpers/webm.mjs';

// Use a temporary profile so regression checks cannot modify personal projects.
const profile = await mkdtemp(join(tmpdir(), 'motion-room-browser-'));
const browser = await chromium.launchPersistentContext(profile, { headless: true, acceptDownloads: true, viewport: { width: 1440, height: 900 } });
try {
  const page = await browser.newPage();
  await page.goto(process.env.MOTION_ROOM_URL || 'http://127.0.0.1:5173');
  const result = await runWorkspaceChecks({ playwright: page, reload: () => page.reload() }, {
    imagePath: resolve('assets/motion-room-logo.png'), jumpPath: resolve('references/epic/jump.glb'),
  });
  for (const check of result.results) console.log('PASS ' + check);
  if (result.videoPath) {
    const video = inspectWebM(await readFile(result.videoPath));
    if (video.frames !== 60 || Math.abs(video.fps - 30) > 0.01) throw new Error('The export must contain exactly 60 frames at 30 fps.');
    console.log('PASS Export contains exactly 60 timestamped frames at 30 fps');
  }
} finally {
  await browser.close();
  if (resolve(profile).startsWith(resolve(join(tmpdir(), 'motion-room-browser-')))) await rm(profile, { recursive: true, force: true });
}
