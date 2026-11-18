import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MannyRig } from '../src/rig.js';
import { animations } from '../src/animations.js';

// Tester le vrai squelette du GLB, sans dépendre d’un canvas ou du GPU.
function loadRig() {
  const buffer = readFileSync(new URL('../ue5_male_mannequin_-_manny_-_web_ready.glb', import.meta.url));
  const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  const joints = new Set(gltf.skins.flatMap(skin => skin.joints));
  const objects = gltf.nodes.map((node, index) => {
    const object = joints.has(index) ? new THREE.Bone() : new THREE.Group();
    object.name = node.name;
    if (node.matrix) new THREE.Matrix4().fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale);
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  gltf.nodes.forEach((node, index) => (node.children || []).forEach(child => objects[index].add(objects[child])));
  const root = new THREE.Group();
  root.add(objects[0]);
  root.updateMatrixWorld(true);
  return new MannyRig(objects[0], root);
}
const rig = loadRig();
function pose(animation, time, amplitude = 1) {
  rig.reset(); animation.update(rig, time, amplitude); rig.finish();
  return [...rig.root.position.toArray(), ...[...rig.bones.values()].flatMap(bone => [...bone.position.toArray(), ...bone.quaternion.toArray()])];
}

test('Le mannequin fournit les 80 os attendus et chaque mouvement sa propre fonction', () => {
  assert.equal(rig.bones.size, 80);
  assert.equal(new Set(animations.map(a => a.id)).size, animations.length);
  assert.equal(new Set(animations.map(a => a.update)).size, animations.length);
});

for (const animation of animations) {
  test(`${animation.name} : poses valides, sol, amplitude et boucle`, () => {
    for (const amplitude of [0, 1, 1.5]) {
      for (let frame = 0; frame <= 60; frame++) {
        const values = pose(animation, animation.duration * frame / 60, amplitude);
        assert.ok(values.every(Number.isFinite), `Pose invalide à ${frame}/60`);
        for (const bone of rig.bones.values()) assert.ok(Math.abs(bone.quaternion.length() - 1) < 1e-6, bone.name);
        // Le déroulé de la marche est contrôlé sur la semelle réelle dans walk.test.mjs.
        // Un os de cheville n’a pas la même hauteur quand le talon se soulève.
        if (animation.id !== 'walk') {
          const contact = Math.min(...rig.contacts.map(c => rig.bones.get(c.name).getWorldPosition(new THREE.Vector3()).y - c.y));
          assert.ok(contact >= -1e-6, `Un pied traverse le sol à ${frame}/60`);
        }
      }
      const start = pose(animation, 0, amplitude);
      const end = pose(animation, animation.duration, amplitude);
      assert.ok(start.every((value, i) => Math.abs(value - end[i]) < 1e-5), 'Boucle discontinue');
      const almostEnd = pose(animation, animation.duration - 1e-6, amplitude);
      assert.ok(start.every((value, i) => Math.abs(value - almostEnd[i]) < 1e-4), 'Saut à la frontière de la boucle');
    }
  });
  test(`${animation.name} : scrub déterministe et aucune contamination entre mouvements`, () => {
    const expected = pose(animation, animation.duration * 0.37);
    for (const other of animations) pose(other, other.duration * 0.61, 1.5);
    assert.deepEqual(pose(animation, animation.duration * 0.37), expected);
  });
}

test('Une amplitude nulle conserve la pose neutre pour toutes les animations', () => {
  const neutral = pose(animations[0], 0, 0);
  for (const animation of animations) {
    const values = pose(animation, animation.duration * 0.42, 0);
    assert.ok(values.every((value, i) => Math.abs(value - neutral[i]) < 1e-6), animation.name);
  }
});

test('Le saut quitte effectivement le sol et le squat abaisse le bassin', () => {
  const jump = animations.find(a => a.id === 'jump');
  pose(jump, jump.duration * 0.52);
  assert.ok(rig.lift > 0.49);
  const squat = animations.find(a => a.id === 'squat');
  pose(squat, 0);
  const startHeight = rig.bones.get('pelvis').getWorldPosition(new THREE.Vector3()).y;
  pose(squat, squat.duration / 2);
  assert.ok(rig.bones.get('pelvis').getWorldPosition(new THREE.Vector3()).y < startHeight - 0.25);
});
