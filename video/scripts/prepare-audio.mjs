import {spawnSync} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args) => {
  const result = spawnSync(command, args, {cwd: root, stdio: 'inherit', windowsHide: true});
  if (result.status !== 0) throw new Error(command + ' failed.');
};
run('python', ['scripts/score.py']);
for (const name of ['youtube', 'social']) {
  const raw = join(root, 'public/audio', 'score-' + name + '.wav');
  const mix = join(root, 'public/audio', 'score-' + name + '-mix.wav');
  const encoded = join(root, 'public/audio', 'score-' + name + '.m4a');
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9', '-ar', '48000', '-c:a', 'pcm_s16le', mix]);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', mix, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', encoded]);
}
