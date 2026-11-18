import * as THREE from 'three';

// Cycle original, dessiné en coordonnées de contact. Aucune animation importée.
// Un cycle = deux pas ; la locomotion reste sur place, à vitesse de sol constante.
export const WALK_DURATION = 1.2;
export const STANCE_END = 0.62;
const TAU = Math.PI * 2;
const X = new THREE.Vector3(1, 0, 0);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const cache = new WeakMap();
const wrap = p => ((p % 1) + 1) % 1;

// Hermite : les tangentes explicites contrôlent les accélérations et garantissent
// la même vitesse à la sortie/entrée d’un appui et à la fermeture de la boucle.
function hermite(x, x0, x1, y0, y1, m0, m1) {
  const span = x1 - x0, u = clamp((x - x0) / span, 0, 1);
  return (2 * u ** 3 - 3 * u ** 2 + 1) * y0 + (u ** 3 - 2 * u ** 2 + u) * span * m0
    + (-2 * u ** 3 + 3 * u ** 2) * y1 + (u ** 3 - u ** 2) * span * m1;
}
function curve(p, keys) {
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const [x0, y0, m0] = keys[i - 1], [x1, y1, m1] = keys[i];
      return hermite(p, x0, x1, y0, y1, m0, m1);
    }
  }
  return keys.at(-1)[1];
}

// Angle absolu du pied : talon d’abord, pied à plat, déroulé sur l’avant-pied,
// pointe au décollage, flexion de cheville pour dégager le sol pendant le retour.
const FOOT_PITCH = [[0, -0.23, 1.6], [0.10, 0, 0], [0.38, 0, 0], [0.50, 0.19, 3],
  [0.62, 0.58, 2.4], [0.72, 0.10, -4.0], [0.82, -0.13, -0.9], [0.94, -0.27, 0], [1, -0.23, 1.6]];
const TOE_FLEX = [[0, 0, 0], [0.38, 0, 0], [0.50, -0.19, -3], [0.62, -0.58, -2.4],
  [0.72, -0.10, 3.0], [0.80, 0, 0], [1, 0, 0]];
const PELVIS_HEIGHT = [[0, -0.043, -0.07], [0.075, -0.044, 0], [0.28, -0.003, 0], [0.50, -0.043, -0.07]];

function position(bone) { return bone.getWorldPosition(new THREE.Vector3()); }
function rotateX(vector, angle) { return vector.clone().applyAxisAngle(X, angle); }

export function getWalkCalibration(rig) {
  if (cache.has(rig)) return cache.get(rig);
  // Appelé après reset() : on mesure toujours la pose neutre, jamais la pose précédente.
  rig.model.updateWorldMatrix(true, true);
  const pelvis = position(rig.bones.get('pelvis'));
  const feet = {};
  for (const side of ['l', 'r']) {
    const ankle = position(rig.bones.get(`foot_${side}`));
    const ball = position(rig.bones.get(`ball_${side}`));
    const hip = position(rig.bones.get(`thigh_${side}`));
    const knee = position(rig.bones.get(`calf_${side}`));
    const upper = hip.distanceTo(knee), lower = knee.distanceTo(ankle);
    const length = upper + lower;
    const points = [];
    // La semelle vient de la géométrie fournie. Elle ne se réduit pas à l’os du pied.
    rig.model.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      const footIndex = mesh.skeleton.bones.indexOf(rig.bones.get(`foot_${side}`));
      const toeIndex = mesh.skeleton.bones.indexOf(rig.bones.get(`ball_${side}`));
      const { skinIndex, skinWeight, position: vertices } = mesh.geometry.attributes;
      if (footIndex < 0 || toeIndex < 0 || !skinIndex || !skinWeight) return;
      for (let i = 0; i < vertices.count; i++) {
        let footWeight = 0, toeWeight = 0;
        for (let c = 0; c < 4; c++) {
          const index = skinIndex.getComponent(i, c), weight = skinWeight.getComponent(i, c);
          if (index === footIndex) footWeight += weight;
          if (index === toeIndex) toeWeight += weight;
        }
        if (footWeight + toeWeight < 0.8) continue;
        const world = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        if (world.y < ankle.y - length * 0.025) points.push({ world, toe: toeWeight > footWeight });
      }
    });
    const floor = points.length ? Math.min(...points.map(p => p.world.y)) : ball.y - length * 0.009;
    const heelZ = points.length ? Math.min(...points.filter(p => p.world.y < floor + length * 0.004).map(p => p.world.z)) : ankle.z - length * 0.04;
    const heelPivot = new THREE.Vector3(0, floor - ankle.y, heelZ - ankle.z);
    const ballPivot = new THREE.Vector3(ball.x - ankle.x, floor - ankle.y, ball.z - ankle.z);
    const ballOffset = ball.clone().sub(ankle);
    // Garder la silhouette inférieure par petits intervalles : moins de 150 points
    // de contact à évaluer par pied et par frame, sans parcourir tout le mesh.
    const bins = new Map();
    for (const point of points) {
      const key = `${point.toe}:${Math.round((point.world.z - ankle.z) / (length * 0.003))}`;
      if (!bins.has(key) || bins.get(key).world.y > point.world.y) bins.set(key, point);
    }
    const sole = [...bins.values()].map(p => ({ offset: p.world.clone().sub(p.toe ? ball : ankle), toe: p.toe }));
    if (!sole.length) sole.push({ offset: heelPivot.clone(), toe: false }, { offset: ballPivot.clone(), toe: false },
      { offset: new THREE.Vector3(0, floor - ball.y, length * 0.075), toe: true });
    feet[side] = { side, ankle, ball, hip, upper, lower, length, floor, heelPivot, ballPivot, ballOffset, sole,
      footRotation: rig.rest.get(`foot_${side}`).world.clone().normalize(), toeRotation: rig.rest.get(`ball_${side}`).world.clone().normalize() };
  }
  const data = { pelvis, feet, length: (feet.l.length + feet.r.length) / 2 };
  cache.set(rig, data);
  return data;
}

function soleHeight(foot, pitch, toeFlex) {
  const sin = Math.sin(pitch), cos = Math.cos(pitch);
  const toeSin = Math.sin(pitch + toeFlex), toeCos = Math.cos(pitch + toeFlex);
  const ballY = cos * foot.ballOffset.y - sin * foot.ballOffset.z;
  let lowest = Infinity;
  for (const { offset, toe } of foot.sole) {
    const y = toe ? ballY + toeCos * offset.y - toeSin * offset.z : cos * offset.y - sin * offset.z;
    lowest = Math.min(lowest, y);
  }
  return foot.floor - lowest;
}

function stanceZ(p, foot, stride, pitch) {
  const pivot = p < 0.2 ? foot.heelPivot : foot.ballPivot;
  return foot.ankle.z + stride * (0.31 - p) + pivot.z - rotateX(pivot, pitch).z;
}
function stanceVelocity(p, foot, stride, pitch, angularVelocity) {
  const pivot = p < 0.2 ? foot.heelPivot : foot.ballPivot;
  return -stride - (pivot.y * Math.cos(pitch) - pivot.z * Math.sin(pitch)) * angularVelocity;
}

/** Trajectoires originales. Le pied d’appui recule à vitesse constante dans le
 * repère du tapis ; en ajoutant l’avance du personnage, son pivot est immobile.
 */
export function sampleWalkFoot(phase, foot, amplitude = 1) {
  const p = wrap(phase);
  const a = Math.max(0, amplitude);
  const strideAmount = a / (1 + Math.max(0, a - 1) * 0.5);
  const stride = foot.length * 1.22 * strideAmount;
  const pitch = curve(p, FOOT_PITCH) * a;
  const toeFlex = curve(p, TOE_FLEX) * a;
  let z, clearance = 0;
  if (p <= STANCE_END) {
    z = stanceZ(p, foot, stride, pitch);
  } else {
    const startPitch = 0.58 * a, endPitch = -0.23 * a;
    const start = stanceZ(STANCE_END, foot, stride, startPitch);
    const end = stanceZ(0, foot, stride, endPitch);
    const v0 = stanceVelocity(STANCE_END, foot, stride, startPitch, 2.4 * a);
    const v1 = stanceVelocity(0, foot, stride, endPitch, 1.6 * a);
    z = hermite(p, STANCE_END, 1, start, end, v0, v1);
    // Dégagement de la semelle, pas seulement de la cheville. Une petite courbe
    // asymétrique remonte le pied rapidement puis prépare un contact doux du talon.
    clearance = curve(p, [[STANCE_END, 0, 0], [0.74, 0.098, 0], [0.88, 0.035, -0.45], [1, 0, 0]]) * foot.length * a;
  }
  const sign = foot.side === 'l' ? 1 : -1;
  const x = lerp(foot.ankle.x, foot.hip.x * 0.84, Math.min(a, 1))
    + (p > STANCE_END ? sign * Math.sin((p - STANCE_END) / (1 - STANCE_END) * Math.PI) ** 2 * 0.006 * foot.length * a : 0);
  return { phase: p, stance: p <= STANCE_END, stride, pitch, toeFlex, clearance,
    target: new THREE.Vector3(x, soleHeight(foot, pitch, toeFlex) + clearance, z) };
}

function setWorldRotation(bone, rotation) {
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()).normalize();
  bone.quaternion.copy(parent.invert().multiply(rotation)).normalize();
  bone.updateWorldMatrix(false, true);
}
function aimAt(bone, child, target) {
  const origin = position(bone);
  const from = position(child).sub(origin).normalize();
  const to = target.clone().sub(origin).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  const current = bone.getWorldQuaternion(new THREE.Quaternion()).normalize();
  setWorldRotation(bone, delta.multiply(current));
}

// IK analytique à deux segments : longueur des os conservée, genou vers l’avant.
function solveLeg(rig, foot, target) {
  const thigh = rig.bones.get(`thigh_${foot.side}`), calf = rig.bones.get(`calf_${foot.side}`), ankle = rig.bones.get(`foot_${foot.side}`);
  const hip = position(thigh);
  const direction = target.clone().sub(hip);
  const distance = clamp(direction.length(), Math.abs(foot.upper - foot.lower) + 1e-6, foot.length - 1e-6);
  direction.normalize();
  const pole = new THREE.Vector3(foot.side === 'l' ? 0.035 : -0.035, 0, 1);
  pole.addScaledVector(direction, -pole.dot(direction)).normalize();
  const along = (foot.upper ** 2 - foot.lower ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, foot.upper ** 2 - along ** 2));
  const knee = hip.clone().addScaledVector(direction, along).addScaledVector(pole, height);
  aimAt(thigh, calf, knee);
  aimAt(calf, ankle, target);
}

export function animateWalk(rig, time, amplitude = 1) {
  if (amplitude <= 0) return; // Exactement la même pose neutre que les autres gestes.
  const data = getWalkCalibration(rig);
  const a = amplitude, p = wrap(time / WALK_DURATION), angle = p * TAU;
  const targets = { l: sampleWalkFoot(p, data.feet.l, a), r: sampleWalkFoot(p + 0.5, data.feet.r, a) };

  rig.rotate('pelvis', 0.018 * a, -0.065 * Math.cos(angle) * a, 0.035 * Math.sin(angle) * a);
  rig.rotate('spine_01', 0.022 * a, 0.035 * Math.cos(angle - 0.12) * a, -0.012 * Math.sin(angle) * a);
  rig.rotate('spine_03', 0.012 * a, 0.055 * Math.cos(angle - 0.12) * a, -0.018 * Math.sin(angle) * a);
  rig.rotate('spine_05', -0.012 * a, 0.025 * Math.cos(angle - 0.15) * a);
  rig.rotate('head', -0.035 * a + 0.006 * Math.sin(2 * angle - 0.4) * a, -0.04 * Math.cos(angle - 0.1) * a);
  for (const [side, offset, sign] of [['l', 0, 1], ['r', Math.PI, -1]]) {
    const swing = Math.cos(angle + offset - 0.15);
    rig.rotate(`clavicle_${side}`, 0, -0.012 * swing * a, sign * 0.009 * Math.sin(angle + offset) * a);
    rig.rotate(`upperarm_${side}`, 0.29 * swing * a, sign * 0.025 * a, sign * 0.025 * a);
    rig.rotate(`lowerarm_${side}`, -(0.16 + 0.10 * (0.5 - 0.5 * Math.cos(angle + offset - 0.50))) * a);
    rig.rotate(`hand_${side}`, -0.025 * a, 0, -sign * 0.02 * Math.cos(angle + offset - 0.5) * a);
    rig.fingers(side, 0.14 * a);
  }

  const pelvis = rig.bones.get('pelvis');
  const center = data.pelvis.clone().add(new THREE.Vector3(
    0.022 * data.length * Math.sin(angle - 0.08) * a,
    curve(p % 0.5, PELVIS_HEIGHT) * data.length * a,
    0.006 * data.length * Math.sin(2 * angle - 0.15) * a,
  ));
  pelvis.position.copy(pelvis.parent.worldToLocal(center));
  rig.model.updateWorldMatrix(true, true);
  // Borne douce de portée : empêcher les jambes de s’étirer à grande amplitude.
  let drop = 0;
  for (const side of ['l', 'r']) {
    const hip = position(rig.bones.get(`thigh_${side}`)), target = targets[side].target;
    const length = data.feet[side].length * 0.998;
    const horizontalSq = (hip.x - target.x) ** 2 + (hip.z - target.z) ** 2;
    const limit = target.y + Math.sqrt(Math.max(0, length ** 2 - horizontalSq));
    const excess = hip.y - limit;
    const softness = data.length * 0.002;
    drop = Math.max(drop, 0.5 * (excess + Math.sqrt(excess ** 2 + softness ** 2)));
  }
  if (drop > 0) {
    const lowered = position(pelvis); lowered.y -= drop;
    pelvis.position.copy(pelvis.parent.worldToLocal(lowered));
    rig.model.updateWorldMatrix(true, true);
  }
  for (const side of ['l', 'r']) {
    const foot = data.feet[side], sample = targets[side];
    solveLeg(rig, foot, sample.target);
    setWorldRotation(rig.bones.get(`foot_${side}`), new THREE.Quaternion().setFromAxisAngle(X, sample.pitch).multiply(foot.footRotation));
    setWorldRotation(rig.bones.get(`ball_${side}`), new THREE.Quaternion().setFromAxisAngle(X, sample.pitch + sample.toeFlex).multiply(foot.toeRotation));
  }
  // Ces contacts sont déjà résolus. L’ancien recalage vertical annulerait le
  // déroulé talon/pointe et les oscillations du bassin. Activation pour la marche seule.
  rig.contactsSolved = true;
}
