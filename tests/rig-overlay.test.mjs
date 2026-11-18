import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Bone, Raycaster, Vector3 } from 'three';
import { loadReference } from '../src/reference.js';
import { RigOverlay, isFingerBone } from '../src/rig-overlay.js';

for (const [label, file] of [
  ['Unreal', '../references/epic/idle.glb'],
  ['Mixamo', '../Defeated.fbx'],
]) {
  test(`${label} hand joints are visible, connected and selectable through the rig overlay`, async () => {
    const reference = await loadReference(new Blob([await readFile(new URL(file, import.meta.url))]));
    const overlay = new RigOverlay(reference.bones, '#c3ef91');
    try {
      const fingers = [...reference.bones].filter(isFingerBone);
      assert.ok(fingers.length >= 30);
      assert.ok(fingers.every(bone => overlay.links.some(link => link.bone === bone)));
      const index = fingers.find(bone => /index.*1/i.test(bone.name));
      overlay.update(index);
      const link = overlay.links.find(link => link.bone === index);
      assert.ok(link.line?.visible);
      assert.ok(link.dot.position.distanceTo(index.getWorldPosition(new Vector3())) < 1e-8);
      assert.equal(link.dot.material, overlay.selected);
      assert.ok(overlay.links.every(link => !/twist|^ik_|^VB/i.test(link.bone.name)));
      const origin = link.dot.position.clone().add(new Vector3(0, 0, 2));
      const ray = new Raycaster(origin, new Vector3(0, 0, -1));
      assert.equal(overlay.pickJoint(ray), index);
    } finally { overlay.dispose(); reference.dispose(); }
  });
}

test('a wrist selection area cannot mask the finger under the pointer', () => {
  const wrist = new Bone();
  wrist.name = 'LeftHand';
  wrist.position.set(0.02, 0, 0.025);
  const finger = new Bone();
  finger.name = 'LeftHandIndex1';
  finger.position.set(-0.02, 0, -0.025);
  wrist.add(finger);
  wrist.updateMatrixWorld(true);
  const overlay = new RigOverlay([wrist, finger], '#c3ef91');
  try {
    overlay.update();
    const ray = new Raycaster(new Vector3(0, 0, 1), new Vector3(0, 0, -1));
    assert.equal(overlay.pickJoint(ray), finger);
  } finally { overlay.dispose(); }
});
