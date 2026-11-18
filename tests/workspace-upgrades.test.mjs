import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Group, Bone, Quaternion, Vector3, Euler } from 'three';
import { packProject, unpackProject } from '../src/project-file.js';
import { SaveQueue } from '../src/persistence.js';
import { captureEdit, rememberEdit, travelHistory } from '../src/edit-history.js';
import { poseRow, keyToken, editTimelineKeys, copyTimelineKeys } from '../src/timeline-edit.js';
import { samplePoseKeys } from '../src/pose-keys.js';
import { mirrorPose, namedPose, applyNamedPose, scopedJoints, restorePoseLibrary, rigSignature } from '../src/pose-tools.js';
import { mediaTime, mediaProjectFrame, restoreMediaSettings } from '../src/media-reference.js';
import { StudioTools } from '../src/studio-tools.js';
import { PoseAnimation, exportAnimation } from '../src/animation-editor.js';
import { loadCharacter } from '../src/reference.js';
import { WebMWriter } from '../src/webm-writer.js';

const transform = x => ({ position: [x, 0, 0], rotation: [0, 0, 0, 1] });
const key = (frame, x) => ({ frame, pose: { hand: transform(x), head: transform(x / 2) }, curve: 'linear' });
const timeline = () => ({ keys: [key(0, 0), key(10, 2), key(20, 4)], tracks: {}, frames: 60,
  editor: { bones: new Map([['hand', { name: 'hand' }], ['head', { name: 'head' }]]) } });

test('portable project preserves binary assets, media, takes, curves and notes without base64', async () => {
  const asset = new Blob(['character'], { type: 'model/gltf-binary' });
  const record = { schema: 2, name: 'My take', sourceMode: 'blank', frames: 60, fps: 30,
    assetBlob: asset, referenceBlob: asset, mediaBlob: new Blob(['video'], { type: 'video/webm' }),
    poses: [key(0, 1)], tracks: { hand: [{ frame: 10, transform: transform(1), ease: [0.2, 0, 0.8, 1] }] },
    contacts: [{ chain: 'leftLeg', from: 0, to: 20 }], props: [{ type: 'box' }], takes: [{ name: 'First' }],
    notes: 'Keep the contact', mediaReference: { offset: 1 }, poseLibrary: [{ name: 'Hand' }] };
  const file = packProject(record), result = await unpackProject(file);
  assert.equal(await result.assetBlob.text(), 'character');
  assert.equal(result.assetBlob, result.referenceBlob);
  assert.equal(await result.mediaBlob.text(), 'video');
  for (const field of ['poses', 'tracks', 'contacts', 'props', 'takes', 'notes', 'poseLibrary', 'mediaReference']) assert.deepEqual(result[field], record[field]);
  const length = new DataView(await file.slice(0, 12).arrayBuffer()).getUint32(8, true);
  const manifest = JSON.parse(await file.slice(12, 12 + length).text());
  assert.equal(manifest.files.length, 2); assert.equal(manifest.record.assetBlob, undefined);
  await assert.rejects(unpackProject(file.slice(0, file.size - 1)), /incomplete/);
  await assert.rejects(unpackProject(new Blob([file, 'garbage'])), /trailing/);
  await assert.rejects(unpackProject(new Blob(['not a project'])), /not a Motion Room/);
});

test('portable projects reject unsupported versions and invalid asset indices before loading a model', async () => {
  const file = packProject({ schema: 2, name: 'Test', frames: 30, fps: 30, sourceMode: 'clip', assetBlob: new Blob(['x']) });
  const bytes = new Uint8Array(await file.arrayBuffer()), length = new DataView(bytes.buffer).getUint32(8, true);
  const manifest = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + length)));
  const alter = data => {
    const json = new TextEncoder().encode(JSON.stringify(data)), header = bytes.slice(0, 12);
    new DataView(header.buffer).setUint32(8, json.length, true);
    return new Blob([header, json, bytes.subarray(12 + length)]);
  };
  await assert.rejects(unpackProject(alter({ ...manifest, version: 999 })), /version/);
  await assert.rejects(unpackProject(alter({ ...manifest, assets: { assetBlob: -1 } })), /index/);
});

test('autosave snapshots edits, coalesces queued revisions and serializes writes across projects', async () => {
  let release, active = 0, maximum = 0; const writes = [], statuses = [];
  const queue = new SaveQueue({ delay: 10000, onStatus: status => statuses.push(status), write: async record => {
    active++; maximum = Math.max(maximum, active); writes.push(record);
    if (writes.length === 1) await new Promise(resolve => { release = resolve; });
    active--;
  } });
  const first = { kind: 'project', id: 'a', poses: [1] }; queue.enqueue(first); first.poses.push(99);
  const flushing = queue.flush();
  queue.enqueue({ kind: 'project', id: 'b', revision: 1 });
  queue.enqueue({ kind: 'project', id: 'b', revision: 2 });
  release(); await flushing;
  assert.equal(maximum, 1); assert.deepEqual(writes[0].poses, [1]);
  assert.equal(writes.length, 2); assert.equal(writes[1].revision, 2); assert.equal(statuses.at(-1), 'saved');
});

test('failed saves stay retryable and cannot report a successful project copy', async () => {
  let failing = true; const statuses = [], confirmed = [];
  const queue = new SaveQueue({ write: async () => { if (failing) throw new Error('quota'); }, confirm: value => confirmed.push(value), onStatus: status => statuses.push(status) });
  assert.equal(await queue.save({ kind: 'project', id: 'a' }), false);
  await queue.flush(); assert.equal(statuses.at(-1), 'error'); assert.equal(confirmed.length, 0);
  failing = false; await queue.retry();
  assert.equal(statuses.at(-1), 'saved'); assert.equal(confirmed.length, 1);
});

test('group retiming materializes only edited joint tracks and preserves other joint timing', () => {
  const state = timeline(), selection = new Set([keyToken('hand', 10), keyToken('hand', 20)]);
  const moved = editTimelineKeys(state, selection, { delta: 5 });
  assert.deepEqual(moved.tracks.hand.map(key => key.frame), [0, 15, 25]);
  assert.equal(moved.keys, state.keys); assert.equal(moved.tracks.head, undefined);
  assert.equal(samplePoseKeys(moved.keys, 10, moved.tracks).head.position[0], 1);
  assert.equal(state.tracks.hand, undefined);
  const stretched = editTimelineKeys({ ...state, ...moved }, moved.selection, { scale: 2 });
  assert.deepEqual(stretched.tracks.hand.map(key => key.frame), [0, 15, 35]);
});

test('key groups reject collisions atomically, clamp movement as a group, and paste relative timing', () => {
  const state = timeline(), selection = new Set([keyToken(poseRow, 10), keyToken(poseRow, 20)]);
  assert.equal(editTimelineKeys(state, selection, { delta: -10 }), null);
  const right = editTimelineKeys(state, selection, { delta: 100 });
  assert.deepEqual(right.keys.map(key => key.frame), [0, 50, 60]);
  const clipboard = copyTimelineKeys(state, selection);
  const pasted = editTimelineKeys(state, selection, { clipboard, at: 30 });
  assert.deepEqual(pasted.keys.map(key => key.frame), [0, 10, 20, 30, 40]);
  assert.equal(editTimelineKeys(state, selection, { clipboard, at: 55 }), null);
});

test('deleting the last independent joint keys does not resurrect legacy whole-pose values', () => {
  const state = timeline(), selection = new Set([0, 10, 20].map(frame => keyToken('hand', frame)));
  const result = editTimelineKeys(state, selection, { remove: true });
  assert.deepEqual(samplePoseKeys(result.keys, 10, result.tracks).head, transform(1));
  assert.equal(samplePoseKeys(result.keys, 10, result.tracks).hand, undefined);
});

test('saved takes and undo restore source clip, source mode, notes and reference clip together', () => {
  const state = { ...timeline(), id: 'p', frame: 12, fps: 30, undo: [], redo: [], target: 'hand', training: { start: 0, end: 60 }, notes: 'Original', record: { originalReference: true } };
  state.editor.reference = { index: 1, clips: [{ name: 'A' }, { name: 'B' }] };
  state.editor.sourceMode = 'clip'; state.editor.selectClip = index => { state.editor.reference.index = index; };
  state.editor.getAlignment = () => ({ scale: 1 }); state.editor.setAlignment = () => {};
  state.reference = { clip: { index: 1, select(index) { this.index = index; } } };
  state.takes = [{ id: 'take-a', name: 'A', clipIndex: 0, sourceMode: 'clip', keys: [], tracks: {}, contacts: [], props: [], frames: 30, fps: 30, notes: 'Saved' }];
  const before = captureEdit(state); let resets = 0;
  StudioTools.prototype.loadTake.call({ state, stage: { resetReferenceOrigin: () => { resets++; } }, api: {
    canEdit: () => true, commit: change => { rememberEdit(state); change(); }, contextChanged() {}, toast() {},
  } }, 'take-a');
  assert.equal(state.editor.reference.index, 0); assert.equal(state.reference.clip.index, 0); assert.equal(state.notes, 'Saved'); assert.equal(resets, 1);
  assert.ok(travelHistory(state)); assert.equal(state.editor.reference.index, 1); assert.equal(state.reference.clip.index, 1); assert.equal(state.notes, 'Original');
  assert.deepEqual(captureEdit(state), before);
});

test('pose scopes include fingers and mirrored offsets survive different local bone axes', () => {
  const root = new Group(), left = new Bone(), right = new Bone(), finger = new Bone();
  left.name = 'LeftHand'; right.name = 'RightHand'; finger.name = 'LeftFinger';
  left.position.set(1, 1, 0); right.position.set(-1, 1, 0); right.quaternion.setFromEuler(new Euler(0.2, 0.5, 1));
  root.add(left, right); left.add(finger);
  const bindPose = [left, right, finger].map(node => ({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }));
  const editor = { root, bones: new Map([['l', left], ['r', right], ['finger', finger]]), reference: { bindPose } };
  assert.deepEqual(scopedJoints(editor, 'l', 'branch'), ['l', 'finger']);
  const pose = { l: { position: [0.2, 0.1, 0.3], rotation: new Quaternion().setFromEuler(new Euler(0.3, 0.1, -0.4)).toArray() } };
  const once = mirrorPose(editor, pose, ['l']), twice = mirrorPose(editor, once.pose, ['r']);
  assert.ok(new Vector3().fromArray(twice.pose.l.position).distanceTo(new Vector3().fromArray(pose.l.position)) < 1e-9);
  assert.ok(new Quaternion().fromArray(twice.pose.l.rotation).angleTo(new Quaternion().fromArray(pose.l.rotation)) < 1e-7);
  const named = namedPose(editor, pose, ['l', 'finger']);
  assert.equal(Object.keys(named).length, 2); assert.deepEqual(applyNamedPose(editor, {}, named).ids, ['l', 'finger']);
  const library = restorePoseLibrary([{ id: 'x', name: 'Hand', rig: rigSignature(editor), pose: named }, { broken: true }]);
  assert.equal(library.length, 1);
});

test('video reference offsets, negative starts, manual time and stepping use project time consistently', () => {
  const settings = restoreMediaSettings({ kind: 'video', offset: 2, fps: 24 });
  assert.equal(mediaTime(1, settings, 10), 0); assert.equal(mediaTime(5, settings, 10), 3);
  assert.equal(mediaTime(20, settings, 10), 10); assert.equal(mediaProjectFrame(3, settings, 60), 300);
  assert.equal(mediaTime(5, { ...settings, linked: false, time: 1.25 }, 10), 1.25);
  assert.equal(mediaTime(0, { ...settings, offset: -2 }, 10), 2);
});

test('GLB baking reports progress and cancellation interrupts sampling before serialization', async () => {
  const root = new Group(), child = new Bone(); root.add(child);
  const controller = new AbortController(); let sampled = 0;
  await assert.rejects(exportAnimation({ root, sample: () => { sampled++; }, duration: 10, fps: 30, name: 'Cancel', signal: controller.signal,
    onProgress: () => controller.abort() }), { name: 'AbortError' });
  assert.equal(sampled, 30);
});

test('a real multi-clip project survives a portable file round trip', async () => {
  const assetBlob = new Blob([await readFile(new URL('../references/epic/jump.glb', import.meta.url))]);
  const result = await unpackProject(packProject({ schema: 2, name: 'Jump', sourceMode: 'clip', clipIndex: 1, frames: 60, fps: 60,
    assetBlob, referenceBlob: assetBlob, poses: [], takes: [{ clipIndex: 0, name: 'Takeoff' }] }));
  const editor = new PoseAnimation(await loadCharacter(result.assetBlob, result.clipIndex), result.sourceMode);
  try { assert.equal(editor.reference.index, 1); assert.ok(editor.reference.clips.length > 1); }
  finally { editor.dispose(); }
});

test('WebM muxer writes an EBML header, duration and seek index and rejects a missing keyframe', async () => {
  const writer = new WebMWriter({ width: 1280, height: 720, fps: 30 });
  const chunk = (timestamp, type) => ({ timestamp, type, byteLength: 4, copyTo: target => target.set([1, 2, 3, 4]) });
  assert.throws(() => writer.addChunk(chunk(0, 'delta')), /out of order/);
  writer.addChunk(chunk(0, 'key')); writer.addChunk(chunk(33333, 'delta')); writer.addChunk(chunk(2000000, 'key'));
  const file = writer.finish(3), buffer = Buffer.from(await file.arrayBuffer());
  assert.equal(buffer.subarray(0, 4).toString('hex'), '1a45dfa3');
  assert.ok(buffer.includes(Buffer.from('webm'))); assert.ok(buffer.includes(Buffer.from('V_VP8')));
  assert.ok(buffer.includes(Buffer.from('1c53bb6b', 'hex'))); assert.equal(file.type, 'video/webm');
});
