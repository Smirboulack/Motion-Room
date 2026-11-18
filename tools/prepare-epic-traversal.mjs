// Process the exports from export-epic-traversal.py. Run from the repository root.
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

globalThis.FileReader = class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend(); }
};
const folder = join(process.env.TEMP, 'motion-room-traversal');
for (const [id, name, first, last] of [
  ['vault', 'Running vault', 26, 108],
  ['hurdle', 'Running hurdle', 14, 92],
  ['mantle', 'Running mantle', 8, 82],
]) {
  const metadata = JSON.parse(await readFile(join(folder, id + '.json'), 'utf8'));
  const buffer = await readFile(join(folder, id + '.glb'));
  const {scene, animations} = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
  const root = scene.getObjectByName('root');
  if (!root?.isBone) throw new Error('Expected the UEFN root bone.');
  const samples = metadata.root.slice(first, last + 1);
  const times = samples.map((_, index) => index / 60);
  // Unreal centimetres / Z-up to glTF metres / Y-up. The axis exchange
  // reverses handedness, hence the quaternion vector's negative sign.
  const [, [initialX, initialY]] = samples[0];
  const position = samples.flatMap(([, [x, y, z]]) => [(x - initialX) / 100, z / 100, (y - initialY) / 100]);
  const rotation = samples.flatMap(([, , [x, y, z, w]]) => [-x, -z, -y, w]);
  const tracks = animations[0].tracks.filter(track => ![`${root.name}.position`, `${root.name}.quaternion`].includes(track.name)).map(track => {
    const interpolant = track.createInterpolant();
    return new track.constructor(track.name, times, samples.flatMap(([time]) => [...interpolant.evaluate(time)]));
  });
  tracks.push(new THREE.VectorKeyframeTrack(`${root.name}.position`, times, position));
  tracks.push(new THREE.QuaternionKeyframeTrack(`${root.name}.quaternion`, times, rotation));
  const clip = new THREE.AnimationClip(name, (last - first) / 60, tracks).optimize();
  scene.userData = {
    source: 'Epic Games · Game Animation Sample',
    sourceCredit: 'Epic Games · Game Animation Sample',
    sequence: metadata.sequence, sourcePackage: metadata.package,
    sourceFrameRange: [first, last],
    changes: 'Approach, traversal and recovery excerpt at original speed. Horizontal origin rebased; root trajectory and elevation retained. Resampled at 60 fps.',
  };
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip).play(); action.paused = true;
  action.time = 0; mixer.update(0); scene.updateMatrixWorld(true);
  const output = await new GLTFExporter().parseAsync(scene, {animations: [clip], binary: true, trs: true});
  await writeFile(new URL(`../references/epic/${id}.glb`, import.meta.url), Buffer.from(output));
  console.log(JSON.stringify({id, seconds: clip.duration, bytes: output.byteLength, source: metadata.sequence,
    displacement: position.slice(-3).map((value, axis) => value - position[axis])}));
}
