import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), output = join(root, 'out');
const run = (command, args) => {
  const result = spawnSync(command, args, {encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024});
  if (result.status !== 0) throw new Error(result.stderr || command + ' failed');
  return result;
};
const versions = [
  {id: 'youtube', file: 'motion-room-youtube-1080p.mp4', width: 1920, height: 1080, seconds: 54,
    frames: {opening: 20, run: 45, sprint: 65, gaits: 180, vault: 355, 'vault-landing': 385, hurdle: 425, 'hurdle-landing': 455, mantle: 495, 'mantle-recovery': 525, pose: 630, timing: 820, 'run-overlay': 895, 'jump-takeoff': 980, landing: 1003, roll: 1037, analysis: 1090, closing: 1500}},
  {id: 'x', file: 'motion-room-x-1080x1350.mp4', width: 1080, height: 1350, seconds: 36,
    frames: {opening: 20, gaits: 150, vault: 259, 'vault-landing': 282, hurdle: 309, 'hurdle-landing': 332, mantle: 354, 'mantle-recovery': 382, pose: 450, timing: 600, 'run-overlay': 640, 'jump-takeoff': 710, landing: 730, roll: 755, analysis: 800, closing: 1005}},
  {id: 'shorts', file: 'motion-room-shorts-1080x1920.mp4', width: 1080, height: 1920, seconds: 36,
    frames: {opening: 20, gaits: 150, vault: 259, 'vault-landing': 282, hurdle: 309, 'hurdle-landing': 332, mantle: 354, 'mantle-recovery': 382, pose: 450, timing: 600, 'run-overlay': 640, 'jump-takeoff': 710, landing: 730, roll: 755, analysis: 800, closing: 1005}},
];
const report = {checkedAt: new Date().toISOString(), results: []};
for (const version of versions) {
  const file = join(output, version.file);
  const data = JSON.parse(run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file]).stdout);
  const video = data.streams.find(stream => stream.codec_type === 'video'), audio = data.streams.find(stream => stream.codec_type === 'audio');
  assert.equal(video.codec_name, 'h264'); assert.equal(video.pix_fmt, 'yuv420p');
  assert.equal(video.width, version.width); assert.equal(video.height, version.height);
  assert.equal(video.r_frame_rate, '30/1'); assert.equal(Number(video.nb_read_frames), version.seconds * 30);
  assert.ok(Math.abs(Number(video.duration) - version.seconds) < 0.001);
  assert.ok(Math.abs(Number(data.format.duration) - version.seconds) < 0.05);
  assert.equal(audio.codec_name, 'aac'); assert.equal(Number(audio.sample_rate), 48000); assert.equal(audio.channels, 2);
  const bytes = await readFile(file);
  assert.ok(bytes.indexOf('moov') > 0 && bytes.indexOf('moov') < bytes.indexOf('mdat'), 'MP4 must support progressive playback.');
  run('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-f', 'null', '-']);
  const review = join(output, 'verification', version.id);
  await mkdir(review, {recursive: true});
  for (const [name, frame] of Object.entries(version.frames)) {
    run('ffmpeg', ['-v', 'error', '-y', '-ss', String(frame / 30), '-i', file, '-frames:v', '1', '-q:v', '2', join(review, name + '.jpg')]);
  }
  let loudness;
  if (version.id !== 'shorts') {
    const result = run('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-vn', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json', '-f', 'null', '-']);
    const start = result.stderr.lastIndexOf('{');
    loudness = JSON.parse(result.stderr.slice(start, result.stderr.indexOf('}', start) + 1));
    assert.ok(Number(loudness.input_tp) < 0, 'Audio must not clip.');
    assert.ok(Math.abs(Number(loudness.input_i) + 16) < 1, 'Audio must be near -16 LUFS.');
  }
  report.results.push({id: version.id, file: version.file, width: video.width, height: video.height, frames: Number(video.nb_read_frames), seconds: Number(video.duration), bytes: bytes.length, video: video.codec_name, audio: audio.codec_name, fps: 30, progressive: true, decoded: true, ...(loudness ? {loudness} : {})});
  console.log(`${version.id}: dimensions, duration, frames, codecs, audio, progressive playback and full decode passed.`);
}
await writeFile(join(output, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
