import {bundle} from '@remotion/bundler';
import {getCompositions, renderMedia, renderStill} from '@remotion/renderer';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'out');
await mkdir(output, {recursive: true});
const requested = process.argv[2] ?? 'all';
const actionPreview = process.argv.includes('--action-stills');
const preview = process.argv.includes('--stills') || actionPreview;
console.log('Bundling the React / Remotion trailer…');
const serveUrl = await bundle({entryPoint: join(root, 'src/index.jsx'), publicDir: join(root, 'public'), outDir: join(root, 'build')});
const compositions = await getCompositions(serveUrl);
const lookup = id => {
  const item = compositions.find(composition => composition.id === id);
  if (!item) throw new Error('Missing composition ' + id);
  return item;
};
const versions = [
  {name: 'youtube', id: 'MotionRoomYouTube', file: 'motion-room-youtube-1080p.mp4', samples: [60, 180, 360, 630, 840, 1050, 1230, 1500]},
  {name: 'x', id: 'MotionRoomX', file: 'motion-room-x-1080x1350.mp4', samples: [45, 150, 270, 450, 600, 750, 870, 1005]},
  {name: 'shorts', id: 'MotionRoomShorts', file: 'motion-room-shorts-1080x1920.mp4', samples: [45, 150, 270, 450, 600, 750, 870, 1005]},
].filter(version => requested === 'all' || requested === version.name);
if (!versions.length) throw new Error('Choose all, youtube, x or shorts.');
await writeFile(join(output, 'compositions.json'), JSON.stringify(compositions.map(({id, width, height, fps, durationInFrames}) => ({id, width, height, fps, durationInFrames})), null, 2));

if (preview) {
  for (const version of versions) {
    const folder = actionPreview ? 'actions-' + version.name : version.name;
    const samples = actionPreview ? version.name === 'youtube' ? [355, 385, 425, 455, 495, 525, 820, 895] : [259, 282, 309, 332, 354, 382, 600, 640] : version.samples;
    await mkdir(join(output, 'stills', folder), {recursive: true});
    for (const [index, frame] of samples.entries()) {
      await renderStill({serveUrl, composition: lookup(version.id), output: join(output, 'stills', folder, `${index + 1}.jpg`), frame, imageFormat: 'jpeg', jpegQuality: 94, scale: 0.6});
    }
    console.log('Previewed ' + version.name);
  }
} else {
  for (const version of versions) {
    let last = -1;
    const composition = lookup(version.id);
    console.log(`Rendering ${version.name}: ${composition.width}×${composition.height}, ${composition.durationInFrames / composition.fps}s`);
    await renderMedia({serveUrl, composition, codec: 'h264', outputLocation: join(output, version.file),
      pixelFormat: 'yuv420p', colorSpace: 'bt709', crf: 18, x264Preset: 'medium',
      audioCodec: 'aac', audioBitrate: '192k', concurrency: 6, jpegQuality: 95,
      metadata: {title: 'Motion Room — Your space to animate', artist: 'Motion Room', comment: 'English product trailer. Original score. React / Remotion.'},
      onProgress: ({progress}) => {const step = Math.floor(progress * 20); if (step > last) {last = step; console.log(`${version.name}: ${Math.min(100, step * 5)}%`);}},
    });
    console.log('Wrote ' + join(output, version.file));
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,pix_fmt,r_frame_rate,sample_rate,channels', '-of', 'json', join(output, version.file)], {encoding: 'utf8', windowsHide: true});
    if (probe.status === 0) await writeFile(join(output, version.name + '-metadata.json'), probe.stdout);
  }
}
await renderStill({serveUrl, composition: lookup('MotionRoomThumbnail'), output: join(output, 'motion-room-youtube-thumbnail.jpg'), imageFormat: 'jpeg', jpegQuality: 96});
console.log('Thumbnail ready.');
