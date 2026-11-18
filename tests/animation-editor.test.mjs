import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Quaternion, Vector3, MathUtils } from 'three';
import { ImportedAnimation, PoseAnimation, exportAnimation, retimeKeys } from '../src/animation-editor.js';
import { makeKey, samplePose } from '../src/keyframes.js';
import { samplePoseKeys, restorePoseKeys, writePoseKey } from '../src/pose-keys.js';
import { loadCharacter, loadReference, readGlb } from '../src/reference.js';

globalThis.FileReader = class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend();
  }
};
const blob = async path => new Blob([await readFile(new URL(path, import.meta.url))]);
const open = async () => loadReference(await blob('../references/accad/right-cross.glb'));
const xbot = async () => new PoseAnimation(await loadCharacter(await blob('../Defeated.fbx')));
const joint = (editor, name) => [...editor.bones].find(([, bone]) => bone.name.endsWith(name));

test('Existing imported rotation edits retain the source motion and seek deterministically', async () => {
  const reference = await open();
  const original = await open();
  const editor = new ImportedAnimation(reference);
  try {
    const [id, bone] = joint(editor, 'hand_r');
    const keys = [makeKey(0), makeKey(15, { [id + '.z']: 35 }), makeKey(45)];
    original.sample(0.5);
    editor.sample(keys, 15, 45);
    const expected = bone.quaternion.clone();
    assert.ok(expected.angleTo(original.model.getObjectByName('hand_r').quaternion) > 0.5);
    for (const frame of [15, 0, 31, 45, 15]) editor.sample(keys, frame, 45);
    assert.ok(bone.quaternion.angleTo(expected) < 1e-7);
    editor.sample([], 15, 45);
    assert.ok(bone.quaternion.angleTo(original.model.getObjectByName('hand_r').quaternion) < 1e-7);
  } finally { editor.dispose(); original.dispose(); }
});

test('Defeated FBX loads both X Bot meshes on one canonical 65-bone rig', async () => {
  const reference = await loadReference(await blob('../Defeated.fbx'));
  try {
    const meshes = [];
    reference.model.traverse(node => { if (node.isSkinnedMesh) meshes.push(node); });
    assert.equal(meshes.length, 2);
    assert.equal(reference.bones.size, 65);
    assert.equal(reference.clips.length, 1);
    assert.ok(reference.duration > 6);
    const ids = [...reference.bones].map(bone => bone.ID);
    assert.equal(new Set(ids).size, ids.length);
    const head = [...reference.bones].find(bone => bone.name.endsWith('Head'));
    const before = head.getWorldPosition(new Vector3());
    reference.sample(3);
    assert.ok(head.getWorldPosition(new Vector3()).distanceTo(before) > 0.01);
  } finally { reference.dispose(); }
});

test('An empty take keeps the reference character in its bind pose at every frame', async () => {
  const editor = await xbot();
  try {
    const read = () => [...editor.bones.values()].flatMap(bone => [...bone.position.toArray(), ...bone.quaternion.toArray()]);
    editor.sample([], 0, 404);
    const initial = read();
    for (const frame of [120, 250, 404, 0]) {
      editor.sample([], frame, 404);
      assert.deepEqual(read(), initial);
    }
    assert.equal(samplePoseKeys([], 30).constructor, Object);
    assert.deepEqual(samplePoseKeys([], 30), {});
  } finally { editor.dispose(); }
});

test('Joint gizmo edits preserve translation and quaternion rotation through seeking and export', async () => {
  const editor = await xbot();
  let exported;
  try {
    const [id, head] = joint(editor, 'Head');
    editor.sample([], 20, 40);
    const rest = head.position.clone();
    head.position.add(new Vector3(3, 1, 0));
    head.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5));
    const pose = editor.captureBone(id, {});
    const keys = [writePoseKey([], 0, {})[0], writePoseKey([], 20, pose)[0], writePoseKey([], 40, {})[0]];
    editor.sample(keys, 20, 40);
    const expected = head.quaternion.clone();
    assert.ok(head.position.distanceTo(rest.clone().add(new Vector3(3, 1, 0))) < 1e-8);
    for (const frame of [20, 0, 40, 20]) editor.sample(keys, frame, 40);
    assert.ok(head.quaternion.angleTo(expected) < 1e-7);
    const scales = [...editor.bones.values()].map(bone => bone.scale.clone());
    editor.setAlignment({ position: [0.2, 0, 0], rotation: [0, 0, 0, 1], scale: 1.4 });
    assert.deepEqual(editor.root.scale.toArray(), [1.4, 1.4, 1.4]);
    [...editor.bones.values()].forEach((bone, index) => assert.ok(bone.scale.distanceTo(scales[index]) < 1e-9));
    const output = await exportAnimation({
      root: editor.root, sample: time => editor.sample(keys, time * 30, 40),
      duration: 40 / 30, fps: 30, name: 'X Bot pose study',
    });
    assert.ok(readGlb(output).skins.length >= 1);
    exported = await loadReference(new Blob([output]));
    exported.sample(20 / 30);
    assert.equal(exported.bones.size, 65);
    const importedHead = [...exported.bones].find(bone => bone.name.endsWith('Head'));
    assert.ok(importedHead.quaternion.angleTo(expected) < 1e-6);
    assert.ok(importedHead.position.distanceTo(rest.clone().add(new Vector3(3, 1, 0))) < 1e-5);
  } finally { editor.dispose(); exported?.dispose(); }
});

test('An imported character without animation can start a blank take', async () => {
  const editor = await xbot();
  let character;
  try {
    const data = await exportAnimation({
      root: editor.root, sample: () => editor.sample([], 0, 1),
      duration: 1, fps: 30, name: 'Neutral',
    });
    const file = Buffer.from(data);
    const jsonLength = file.readUInt32LE(12);
    const json = JSON.parse(file.subarray(20, 20 + jsonLength));
    delete json.animations;
    const encoded = Buffer.from(JSON.stringify(json));
    const padded = Math.ceil(encoded.length / 4) * 4;
    const binary = file.subarray(20 + jsonLength);
    const staticFile = Buffer.alloc(20 + padded + binary.length, 0x20);
    file.copy(staticFile, 0, 0, 20);
    staticFile.writeUInt32LE(staticFile.length, 8);
    staticFile.writeUInt32LE(padded, 12);
    encoded.copy(staticFile, 20);
    binary.copy(staticFile, 20 + padded);
    character = await loadCharacter(new Blob([staticFile]));
    assert.equal(character.clips.length, 0);
    const blank = new PoseAnimation(character);
    blank.sample([], 30, 60);
    assert.equal(blank.bones.size, 65);
  } finally { editor.dispose(); character?.dispose(); }
});

test('Pose interpolation uses quaternion shortest paths and restores only valid joint channels', () => {
  const q = angle => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), MathUtils.degToRad(angle)).toArray();
  const keys = [
    { frame: 0, pose: { head: { position: [0, 0, 0], rotation: q(170) } }, curve: 'linear' },
    { frame: 10, pose: { head: { position: [2, 0, 0], rotation: q(-170) } }, curve: 'linear' },
  ];
  const halfway = samplePoseKeys(keys, 5).head;
  assert.deepEqual(halfway.position, [1, 0, 0]);
  assert.ok(new Quaternion().fromArray(halfway.rotation).angleTo(new Quaternion().fromArray(q(180))) < 1e-7);
  assert.equal(restorePoseKeys(keys, 10, ['head']).length, 2);
  assert.deepEqual(restorePoseKeys([{ frame: 0, pose: { head: { position: [0, NaN, 0], rotation: q(0), scale: [4, 1, 1] } } }], 10, ['head'])[0].pose, {});
  assert.equal(writePoseKey(keys, 5, {}).length, 3);
});

test('Changing duration preserves existing pose order and never inserts starter keys', () => {
  assert.deepEqual(retimeKeys([], 60, 120), []);
  const keys = [makeKey(0, {}, 'linear'), makeKey(30, { 'head.y': 30 }), makeKey(60)];
  const longer = retimeKeys(keys, 60, 120);
  assert.deepEqual(longer.map(key => key.frame), [0, 60, 120]);
  assert.deepEqual(samplePose(longer, 30), samplePose(keys, 15));
});

test('Head-turn reference moves the head and returns while the rest of the rig stays still', async () => {
  const reference = await loadReference(await blob('../references/epic/head-turn.glb'));
  try {
    const head = reference.model.getObjectByName('head');
    const other = [...reference.bones].filter(bone => bone !== head);
    const neutral = head.quaternion.clone();
    const rest = other.flatMap(bone => [...bone.position.toArray(), ...bone.quaternion.toArray()]);
    const forward = head.getWorldQuaternion(new Quaternion());
    reference.sample(1);
    const peak = head.getWorldQuaternion(new Quaternion());
    assert.ok(Math.abs(MathUtils.radToDeg(forward.angleTo(peak)) - 35) < 0.01);
    const current = other.flatMap(bone => [...bone.position.toArray(), ...bone.quaternion.toArray()]);
    assert.ok(current.every((value, index) => Math.abs(value - rest[index]) < 1e-10));
    reference.sample(reference.duration);
    assert.ok(head.quaternion.angleTo(neutral) < 1e-7);
  } finally { reference.dispose(); }
});
