import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Vector3, Quaternion, Raycaster, Group } from 'three';
import { loadCharacter, loadReference, readGlb } from '../src/reference.js';
import { PoseAnimation, exportAnimation } from '../src/animation-editor.js';
import { samplePoseKeys } from '../src/pose-keys.js';
import { sampleJointTrack, restoreJointTracks, easeAmount, retimeTracks } from '../src/joint-tracks.js';
import { makeSceneObject, objectLibrary, restoreSceneObjects, SceneObjects } from '../src/scene-objects.js';
import { restoreTraining, restoreStudioData } from '../src/studio-tools.js';

const open = async (path, mode = 'blank') => new PoseAnimation(await loadCharacter(new Blob([await readFile(new URL(path, import.meta.url))])), mode);
const transform = (x, angle = 0) => ({ position: [x, 0, 0], rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle).toArray() });

for (const [name, path] of [['Unreal', '../references/epic/idle.glb'], ['Mixamo', '../Defeated.fbx']]) {
  test(`${name} IK reaches a target without stretching either limb segment`, async () => {
    const editor = await open(path);
    try {
      assert.equal(editor.ikChains.size, 4);
      for (const chain of editor.ikChains.values()) {
        editor.sample([], 0, 60);
        const before = chain.ids.map(id => editor.bones.get(id).position.clone());
        const root = chain.upper.getWorldPosition(new Vector3());
        const end = chain.end.getWorldPosition(new Vector3());
        const target = end.clone().lerp(root, 0.18).add(new Vector3(0, 0, 0.1));
        const lengths = [root.distanceTo(chain.middle.getWorldPosition(new Vector3())), chain.middle.getWorldPosition(new Vector3()).distanceTo(end)];
        const solved = editor.solveIK(chain.id, target);
        assert.ok(solved.reached < 1e-5, `${chain.id}: ${solved.reached}`);
        chain.ids.forEach((id, i) => assert.ok(editor.bones.get(id).position.distanceTo(before[i]) < 1e-10));
        assert.ok(Math.abs(chain.upper.getWorldPosition(new Vector3()).distanceTo(chain.middle.getWorldPosition(new Vector3())) - lengths[0]) < 1e-5);
        assert.ok(Math.abs(chain.middle.getWorldPosition(new Vector3()).distanceTo(chain.end.getWorldPosition(new Vector3())) - lengths[1]) < 1e-5);
        const far = editor.solveIK(chain.id, root.clone().add(new Vector3(5, 2, 1)));
        assert.ok(Number.isFinite(far.reached));
        assert.ok(chain.end.getWorldPosition(new Vector3()).distanceTo(root) <= lengths[0] + lengths[1] + 1e-5);
      }
    } finally { editor.dispose(); }
  });
}

test('a pinned foot keeps its position and orientation while the source clip moves', async () => {
  const editor = await open('../references/epic/walk-cycle.glb', 'clip');
  try {
    const chain = editor.ikChains.get('leftLeg');
    const position = editor.root.worldToLocal(chain.end.getWorldPosition(new Vector3()));
    const rotation = editor.root.getWorldQuaternion(new Quaternion()).invert().multiply(chain.end.getWorldQuaternion(new Quaternion()));
    editor.contacts = [{ chain: chain.id, position: position.toArray(), rotation: rotation.toArray(), from: 0, to: 8 }];
    for (const frame of [2, 5, 8, 0, 5]) {
      editor.sample([], frame, 61);
      const actual = editor.root.worldToLocal(chain.end.getWorldPosition(new Vector3()));
      assert.ok(actual.distanceTo(position) < 1e-4, `Foot moved ${actual.distanceTo(position)} at ${frame}`);
      assert.ok(chain.end.getWorldQuaternion(new Quaternion()).angleTo(rotation) < 1e-5);
    }
    editor.sample([], 30, 61);
    assert.ok(editor.root.worldToLocal(chain.end.getWorldPosition(new Vector3())).distanceTo(position) > 0.01);
  } finally { editor.dispose(); }
});

test('independent joint keys can change one limb timing without moving another channel', () => {
  const keys = [{ frame: 0, pose: { head: transform(0), hand: transform(0) }, curve: 'linear' }, { frame: 60, pose: { head: transform(6), hand: transform(3) }, curve: 'linear' }];
  const tracks = { hand: [{ frame: 0, transform: transform(0), curve: 'linear' }, { frame: 30, transform: transform(3), curve: 'linear' }] };
  assert.equal(samplePoseKeys(keys, 15, tracks).head.position[0], 1.5);
  assert.equal(samplePoseKeys(keys, 15, tracks).hand.position[0], 1.5);
  assert.equal(samplePoseKeys(keys, 45, tracks).hand.position[0], 3);
  const moved = retimeTracks(tracks, 60, 120);
  assert.equal(moved.hand[1].frame, 60);
  assert.equal(sampleJointTrack(moved.hand, 30).position[0], 1.5);
});

test('Bezier timing uses editable handles and joint tracks reject invalid values', () => {
  const track = [{ frame: 0, transform: transform(0), curve: 'bezier', ease: [0.7, 0, 0.9, 0.4] }, { frame: 60, transform: transform(6) }];
  assert.ok(sampleJointTrack(track, 30).position[0] < 2);
  assert.equal(easeAmount(0, 'bezier'), 0);
  assert.ok(Math.abs(easeAmount(1, 'bezier') - 1) < 1e-6);
  const restored = restoreJointTracks({ hand: track, bad: track }, 60, ['hand']);
  assert.deepEqual(Object.keys(restored), ['hand']);
  assert.equal(restored.hand.length, 2);
  assert.deepEqual(restoreJointTracks({ hand: [{ frame: 1, transform: transform(NaN) }] }, 60, ['hand']), {});
});

test('every obstacle has finite geometry standing on the floor', () => {
  const objects = new SceneObjects();
  try {
    objects.sync(objectLibrary.map((item, i) => ({ id: String(i), type: item.type, name: item.name, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })));
    for (const object of objects.objects.values()) {
      const bounds = new Box3().setFromObject(object);
      assert.ok(bounds.min.y >= -1e-6, object.name + ' below the floor');
      assert.ok(bounds.max.y > 0.1, object.name);
      assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
    }
  } finally { objects.dispose(); }
});

test('stairs provide ascending contact surfaces and the doorway stays open', () => {
  const stairs = makeSceneObject('stairs'), doorway = makeSceneObject('doorway');
  stairs.updateMatrixWorld(true); doorway.updateMatrixWorld(true);
  const cast = (root, z) => new Raycaster(new Vector3(0, 4, z), new Vector3(0, -1, 0)).intersectObjects(root.children.filter(node => node.isMesh), true)[0]?.point.y;
  const heights = [0.75, 0.45, 0.15, -0.15, -0.45, -0.75].map(z => cast(stairs, z));
  assert.ok(heights.every((height, i) => i === 0 || height > heights[i - 1] + 0.15));
  const through = new Raycaster(new Vector3(0, 1.3, 2), new Vector3(0, 0, -1)).intersectObjects(doorway.children.filter(node => node.isMesh), true);
  assert.equal(through.length, 0);
  const disposer = new SceneObjects(); disposer.disposeObject(stairs); disposer.disposeObject(doorway);
});

test('scene transforms and practice data survive serialization without creating starter keys', async () => {
  const editor = await open('../references/epic/idle.glb');
  try {
    const props = restoreSceneObjects([{ id: 'wall', type: 'wall', name: 'Vault', position: [1.2, 0, -0.3], rotation: [0, 1, 0], scale: [1, 0.5, 1] }]);
    const restored = restoreStudioData(JSON.parse(JSON.stringify({ props, training: { start: 12, end: 36, loop: true }, notes: 'Hold the anticipation.' })), editor, 60);
    assert.deepEqual(restored.props, props);
    assert.deepEqual(restored.tracks, {});
    assert.deepEqual(restored.contacts, []);
    assert.equal(restored.training.start, 12);
    assert.equal(restored.training.end, 36);
    assert.equal(restored.notes, 'Hold the anticipation.');
    assert.deepEqual(restoreTraining({ start: 100, end: -1 }, 60), { start: 59, end: 60, loop: false, hideReference: false, compare: 'original' });
  } finally { editor.dispose(); }
});

test('a rotated obstacle can be placed precisely on the floor', () => {
  const objects = new SceneObjects();
  try {
    objects.sync([{ id: 'wall', type: 'wall', name: 'Tilted wall', position: [1, 0.8, 0], rotation: [0.4, 0.3, 0.2], scale: [1.4, 0.7, 1] }]);
    const object = objects.objects.get('wall');
    object.position.y = objects.floorPosition('wall');
    object.updateMatrixWorld(true);
    assert.ok(Math.abs(new Box3().setFromObject(object).min.y) < 1e-7);
  } finally { objects.dispose(); }
});

test('GLB export bakes joint curves and contact pins alongside scene geometry', async () => {
  globalThis.FileReader = class { async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend(); } };
  const editor = await open('../references/epic/walk-cycle.glb', 'clip');
  const objects = new SceneObjects(); let reread;
  try {
    const leg = editor.ikChains.get('leftLeg');
    const pin = editor.root.worldToLocal(leg.end.getWorldPosition(new Vector3()));
    editor.contacts = [{ chain: leg.id, position: pin.toArray(), from: 0, to: 8 }];
    const [headId] = [...editor.bones].find(([, bone]) => bone.name === 'head');
    editor.tracks = { [headId]: [{ frame: 0, transform: transform(0), curve: 'bezier', ease: [0.4, 0.1, 0.7, 0.8] }, { frame: 61, transform: transform(0, 0.45), curve: 'linear' }] };
    objects.sync([{ id: 'ladder', type: 'ladder', name: 'Climbing ladder', position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }]);
    const root = new Group(); root.add(editor.root, objects.exportClone());
    const bytes = await exportAnimation({ root, sample: time => editor.sample([], time * 60, 61), duration: 61 / 60, fps: 60, name: 'Contacts and props' });
    const json = readGlb(bytes);
    assert.ok(json.nodes.some(node => node.name === 'Climbing ladder'));
    assert.ok(!json.nodes.some(node => node.name?.includes('gizmo')));
    reread = await loadReference(new Blob([bytes]));
    assert.equal(reread.bones.size, editor.bones.size);
    editor.sample([], 5, 61); reread.sample(5 / 60);
    const foot = [...reread.bones].find(bone => bone.name === leg.end.name);
    assert.ok(foot.getWorldPosition(new Vector3()).distanceTo(pin) < 1e-4);
    editor.sample([], 30, 61); reread.sample(30 / 60);
    const head = [...reread.bones].find(bone => bone.name === 'head');
    assert.ok(head.quaternion.angleTo(editor.bones.get(headId).quaternion) < 1e-5);
  } finally { editor.dispose(); objects.dispose(); reread?.dispose(); }
});
