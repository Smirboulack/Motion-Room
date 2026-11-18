import { Vector3, Quaternion } from 'three';

const normalizedName = name => name.toLowerCase().replace(/^mixamorig[:_]?/, '').replace(/_\d+$/, '').replace(/[^a-z0-9]/g, '');
const labels = { leftArm: 'Left hand', rightArm: 'Right hand', leftLeg: 'Left foot', rightLeg: 'Right foot' };

export function findIKChains(bones) {
  const entries = [...bones];
  const find = names => entries.find(([, bone]) => names.includes(normalizedName(bone.name)));
  const result = new Map();
  for (const side of ['left', 'right']) {
    const letter = side[0];
    for (const limb of ['Arm', 'Leg']) {
      const names = limb === 'Arm'
        ? [[side + 'arm', 'upperarm' + letter, letter + 'upperarm'], [side + 'forearm', 'lowerarm' + letter, letter + 'forearm'], [side + 'hand', 'hand' + letter, letter + 'hand']]
        : [[side + 'upleg', 'thigh' + letter, letter + 'thigh'], [side + 'leg', 'calf' + letter, letter + 'shin'], [side + 'foot', 'foot' + letter, letter + 'foot']];
      const found = names.map(find);
      if (found.some(item => !item)) continue;
      const [upper, middle, end] = found.map(item => item[1]);
      if (!isAncestor(upper, middle) || !isAncestor(middle, end)) continue;
      const id = side + limb;
      result.set(id, { id, label: labels[id], ids: found.map(item => item[0]), upper, middle, end });
    }
  }
  return result;
}

function isAncestor(parent, child) {
  for (let node = child.parent; node; node = node.parent) if (node === parent) return true;
  return false;
}

function rotateWorld(bone, from, to) {
  if (from.lengthSq() < 1e-14 || to.lengthSq() < 1e-14) return;
  const delta = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
  const world = bone.getWorldQuaternion(new Quaternion()).premultiply(delta);
  const parent = bone.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
  bone.quaternion.copy(parent.invert().multiply(world)).normalize();
  bone.updateWorldMatrix(false, true);
}

/** Analytic two-bone IK. Only rotations change; bone lengths and positions are preserved. */
export function solveTwoBone(chain, target, { pole, bend = 0, rotation } = {}) {
  const { upper, middle, end } = chain;
  upper.updateWorldMatrix(true, true);
  const root = upper.getWorldPosition(new Vector3());
  const elbow = middle.getWorldPosition(new Vector3());
  const tip = end.getWorldPosition(new Vector3());
  const orientation = rotation?.clone() ?? end.getWorldQuaternion(new Quaternion());
  const a = root.distanceTo(elbow), b = elbow.distanceTo(tip);
  if (a < 1e-8 || b < 1e-8) return false;
  const direction = target.clone().sub(root);
  const requested = direction.length();
  if (requested < 1e-10) direction.copy(tip).sub(root);
  if (direction.lengthSq() < 1e-10) direction.set(0, -1, 0);
  direction.normalize();
  const distance = Math.max(Math.abs(a - b) + 1e-6, Math.min(a + b - 1e-6, requested));
  const towardPole = (pole ? pole.clone().sub(root) : elbow.clone().sub(root));
  towardPole.addScaledVector(direction, -towardPole.dot(direction));
  if (towardPole.lengthSq() < 1e-10) {
    towardPole.set(0, 0, 1).addScaledVector(direction, -direction.z);
    if (towardPole.lengthSq() < 1e-10) towardPole.set(1, 0, 0).addScaledVector(direction, -direction.x);
  }
  towardPole.normalize().applyAxisAngle(direction, bend);
  const cosine = Math.max(-1, Math.min(1, (a * a + distance * distance - b * b) / (2 * a * distance)));
  const desiredElbow = root.clone().addScaledVector(direction, a * cosine)
    .addScaledVector(towardPole, a * Math.sqrt(Math.max(0, 1 - cosine * cosine)));
  rotateWorld(upper, elbow.clone().sub(root), desiredElbow.clone().sub(root));
  const newElbow = middle.getWorldPosition(new Vector3());
  const newTip = end.getWorldPosition(new Vector3());
  const reachable = root.clone().addScaledVector(direction, distance);
  rotateWorld(middle, newTip.sub(newElbow), reachable.sub(newElbow));
  const parent = end.parent.getWorldQuaternion(new Quaternion());
  end.quaternion.copy(parent.invert().multiply(orientation)).normalize();
  end.updateWorldMatrix(false, true);
  return { reached: end.getWorldPosition(new Vector3()).distanceTo(target), requested, reach: a + b };
}

export function restoreContacts(saved, frames, chains) {
  if (!Array.isArray(saved)) return [];
  return saved.filter(item => chains.has(item?.chain) && Array.isArray(item.position)
    && item.position.length === 3 && item.position.every(Number.isFinite)).map(item => ({
    id: typeof item.id === 'string' ? item.id : crypto.randomUUID(), chain: item.chain,
    position: [...item.position],
    rotation: Array.isArray(item.rotation) && item.rotation.length === 4 && item.rotation.every(Number.isFinite)
      ? new Quaternion().fromArray(item.rotation).normalize().toArray() : null,
    from: Math.max(0, Math.min(frames, Math.round(item.from ?? 0))),
    to: Math.max(0, Math.min(frames, Math.round(item.to ?? frames))),
    bend: Number.isFinite(item.bend) ? item.bend : 0,
  })).filter(item => item.to >= item.from);
}
