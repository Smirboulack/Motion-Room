import {spawnSync} from 'node:child_process';
import {readdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const folder = join(root, 'public/footage');
const cycles = new Set(['run', 'sprint', 'sprint-front', 'walk', 'walk-comparison', 'run-comparison', 'run-overlay', 'run-analysis']);
const captures = [...cycles, 'jump', 'landing', 'roll', 'vault', 'vault-side', 'hurdle', 'mantle'];
const execute = (command, args) => {
  const result = spawnSync(command, args, {encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) throw new Error(result.stderr || command + ' failed');
  return result.stdout;
};
const probe = file => JSON.parse(execute('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames:format=duration', '-of', 'json', file]));
for (const name of captures) {
  const input = join(folder, name + '.webm');
  const data = probe(input), stream = data.streams[0];
  const [numerator, denominator] = stream.r_frame_rate.split('/').map(Number);
  const sourceFps = numerator / denominator;
  const sourceFrames = Number(stream.nb_read_frames);
  // Two odd-length 60 fps gait cycles form an exact 30 fps loop. This retains
  // the source speed instead of stretching a short run or sprint to fit a shot.
  const repeat = cycles.has(name) && Math.abs(sourceFrames / sourceFps * 30 % 1) > 0.01 ? 2 : 1;
  const frames = Math.round(sourceFrames / sourceFps * repeat * 30);
  execute('ffmpeg', ['-v', 'error', '-y', '-stream_loop', String(repeat - 1), '-i', input, '-an', '-r', '30', '-frames:v', String(frames),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(folder, name + '.mp4')]);
  console.log(`${name}: ${sourceFrames} source frames @ ${sourceFps}, ${frames} output frames @ 30`);
}
const manifest = {};
for (const file of (await readdir(folder)).filter(name => name.endsWith('.mp4')).sort()) {
  const data = probe(join(folder, file)), stream = data.streams[0];
  manifest[file.slice(0, -4)] = {frames: Number(stream.nb_read_frames), width: stream.width, height: stream.height, fps: 30};
}
await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
