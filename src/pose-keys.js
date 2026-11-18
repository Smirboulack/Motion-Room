import { Quaternion, Vector3 } from 'three';
import { easeAmount, sampleJointTrack } from './joint-tracks.js';

const identity = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };

export function samplePoseKeys(keys, frame, tracks = null) {
  const pose = sampleBasePose(keys, frame);
  for (const [id, track] of Object.entries(tracks ?? {})) if (track.length) pose[id] = sampleJointTrack(track, frame);
  return pose;
}

function sampleBasePose(keys, frame) {
  if (!keys.length) return {};
  const index = keys.findIndex(key => key.frame >= frame);
  if (index < 0) return structuredClone(keys.at(-1).pose);
  const right = keys[index];
  if (index === 0 || right.frame === frame) return structuredClone(right.pose);
  const left = keys[index - 1];
  if (left.curve === 'hold') return structuredClone(left.pose);
  const progress = (frame - left.frame) / (right.frame - left.frame);
  const amount = easeAmount(progress, left.curve, left.ease);
  const pose = {};
  for (const id of new Set([...Object.keys(left.pose), ...Object.keys(right.pose)])) {
    const from = left.pose[id] ?? identity;
    const to = right.pose[id] ?? identity;
    pose[id] = {
      position: new Vector3().fromArray(from.position).lerp(new Vector3().fromArray(to.position), amount).toArray(),
      rotation: new Quaternion().fromArray(from.rotation).slerp(new Quaternion().fromArray(to.rotation), amount).toArray(),
    };
  }
  return pose;
}

export function writePoseKey(keys, frame, pose, curve = 'smooth') {
  const previous = keys.find(item => item.frame === frame);
  const key = { frame, pose: structuredClone(pose), curve, ...(previous?.ease ? { ease: [...previous.ease] } : {}) };
  return [...keys.filter(item => item.frame !== frame), key].sort((left, right) => left.frame - right.frame);
}

export function restorePoseKeys(saved, end, ids) {
  if (!Array.isArray(saved)) return [];
  const allowed = new Set(ids);
  const byFrame = new Map();
  for (const item of saved) {
    if (!Number.isInteger(item?.frame) || item.frame < 0 || item.frame > end || !item.pose) continue;
    const pose = {};
    for (const [id, transform] of Object.entries(item.pose)) {
      if (!allowed.has(id)) continue;
      const position = transform?.position;
      const rotation = transform?.rotation;
      if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)
        || !Array.isArray(rotation) || rotation.length !== 4 || !rotation.every(Number.isFinite)) continue;
      const quaternion = new Quaternion().fromArray(rotation);
      if (quaternion.lengthSq() < 1e-12) continue;
      pose[id] = { position: [...position], rotation: quaternion.normalize().toArray() };
    }
    byFrame.set(item.frame, {
      frame: item.frame, pose, curve: ['smooth', 'linear', 'hold', 'bezier'].includes(item.curve) ? item.curve : 'smooth',
      ...(Array.isArray(item.ease) && item.ease.length === 4 && item.ease.every(Number.isFinite) ? { ease: item.ease } : {}),
    });
  }
  return [...byFrame.values()].sort((left, right) => left.frame - right.frame);
}
