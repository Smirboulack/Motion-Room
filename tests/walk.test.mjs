import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { loadManny } from './helpers/manny.mjs';
import { animations, walk } from '../src/animations.js';
import { getWalkCalibration, sampleWalkFoot, WALK_DURATION, STANCE_END } from '../src/walk.js';

const rig = loadManny({ mesh: true, normalize: true });
const calibration = getWalkCalibration(rig);
const point = new THREE.Vector3();
const soleVertices = [];
rig.model.traverse(mesh => {
  if (!mesh.isSkinnedMesh) return;
  const indices = [];
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
    mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
    if (point.y < 0.06) indices.push(i);
  }
  soleVertices.push({ mesh, indices });
});
function pose(phase, amplitude = 1) {
  rig.reset(); walk(rig, phase * WALK_DURATION, amplitude); rig.finish();
}

test('Idle et toutes les animations hors marche restent exactement identiques', () => {
  const reference = JSON.parse(readFileSync(new URL('./helpers/unchanged-animations.json', import.meta.url)));
  const originalRig = loadManny();
  // Y compris après avoir joué la nouvelle marche, pour contrôler son isolation.
  originalRig.reset(); walk(originalRig, 0.31); originalRig.finish();
  for (const animation of animations.filter(a => a.id !== 'walk')) {
    const hash = createHash('sha256');
    for (const amplitude of [0, 1, 1.5]) for (let i = 0; i < 31; i++) {
      originalRig.reset(); animation.update(originalRig, i * animation.duration / 30, amplitude); originalRig.finish();
      hash.update(JSON.stringify([originalRig.root.position.toArray(), ...[...originalRig.bones.values()].map(b => [b.position.toArray(), b.quaternion.toArray()])]));
    }
    assert.equal(hash.digest('hex'), reference[animation.id], animation.name);
  }
});

test('Les deux jambes atteignent les trajectoires sans étirer les os', () => {
  for (const amplitude of [0.25, 1, 1.5]) for (let frame = 0; frame < 120; frame++) {
    const p = frame / 120;
    pose(p, amplitude);
    for (const [side, offset] of [['l', 0], ['r', 0.5]]) {
      const foot = calibration.feet[side];
      const target = sampleWalkFoot(p + offset, foot, amplitude).target;
      const hip = rig.bones.get(`thigh_${side}`).getWorldPosition(new THREE.Vector3());
      const knee = rig.bones.get(`calf_${side}`).getWorldPosition(new THREE.Vector3());
      const ankle = rig.bones.get(`foot_${side}`).getWorldPosition(new THREE.Vector3());
      assert.ok(ankle.distanceTo(target) < 2e-5, `${side} ${p} : cible non atteinte`);
      assert.ok(Math.abs(hip.distanceTo(knee) - foot.upper) < 2e-5);
      assert.ok(Math.abs(knee.distanceTo(ankle) - foot.lower) < 2e-5);
    }
  }
});

test('La vraie géométrie des semelles reste au-dessus du sol, avec un appui permanent', () => {
  for (const amplitude of [0.25, 1, 1.5]) for (let frame = 0; frame < 72; frame++) {
    pose(frame / 72, amplitude);
    let lowest = Infinity;
    for (const { mesh, indices } of soleVertices) for (const i of indices) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      lowest = Math.min(lowest, point.y);
    }
    assert.ok(lowest > -0.001, `Pénétration de ${(-lowest * 1000).toFixed(1)} mm, frame ${frame}, amplitude ${amplitude}`);
    assert.ok(lowest < 0.011, `Les deux pieds flottent : ${lowest}, frame ${frame}`);
  }
});

test('Le pied reste fixe en ajoutant la vitesse d’avance pendant chaque appui', () => {
  const foot = calibration.feet.l;
  // Talon, semelle à plat puis avant-pied : chacun conserve sa position au sol.
  for (const [start, end, pivot] of [[0, 0.099, foot.heelPivot], [0.11, 0.37, foot.ballPivot], [0.39, STANCE_END, foot.ballPivot]]) {
    let first;
    for (let i = 0; i <= 20; i++) {
      const p = start + (end - start) * i / 20;
      const sample = sampleWalkFoot(p, foot);
      const contactZ = sample.target.z + pivot.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), sample.pitch).z + sample.stride * p;
      if (first === undefined) first = contactZ;
      assert.ok(Math.abs(contactZ - first) < 1e-8, 'Glissement du pivot d’appui');
    }
  }
});

test('Entrée/sortie des appuis et raccord du cycle : positions et vitesses continues', () => {
  const foot = calibration.feet.l, h = 1e-5;
  for (const p of [0, 0.10, 0.38, 0.50, STANCE_END, 0.72, 0.74, 0.80, 0.82, 0.88, 0.94]) {
    const left = sampleWalkFoot(p - h, foot), center = sampleWalkFoot(p, foot), right = sampleWalkFoot(p + h, foot);
    const v0 = center.target.clone().sub(left.target).divideScalar(h);
    const v1 = right.target.clone().sub(center.target).divideScalar(h);
    assert.ok(v0.distanceTo(v1) < 0.02, `Discontinuité de vitesse à ${p} : ${v0.distanceTo(v1)}`);
    assert.ok(Math.abs((center.pitch - left.pitch) / h - (right.pitch - center.pitch) / h) < 0.01);
  }
});

test('La jambe se détend en milieu d’appui et se fléchit pendant le retour', () => {
  function flexion(p) {
    pose(p);
    const [hip, knee, ankle] = ['thigh_l', 'calf_l', 'foot_l'].map(name => rig.bones.get(name).getWorldPosition(new THREE.Vector3()));
    return knee.clone().sub(hip).angleTo(ankle.clone().sub(knee));
  }
  assert.ok(flexion(0.28) < THREE.MathUtils.degToRad(16));
  assert.ok(flexion(0.74) > THREE.MathUtils.degToRad(40));
  assert.ok(flexion(0) < THREE.MathUtils.degToRad(22));
});
