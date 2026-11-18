import { Euler, Quaternion, Vector3, MathUtils } from 'three';

export const neutralTransform = () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] });
export const defaultEase = [0.33, 0, 0.67, 1];
export const channels = [
  ['rx', 'Rotation X', '°'], ['ry', 'Rotation Y', '°'], ['rz', 'Rotation Z', '°'],
  ['px', 'Local position X', ''], ['py', 'Local position Y', ''], ['pz', 'Local position Z', ''],
];

export function easeAmount(t, curve = 'smooth', ease = defaultEase) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (curve === 'hold') return 0;
  if (curve === 'linear') return t;
  if (curve !== 'bezier') return t * t * (3 - 2 * t);
  const cubic = (u, a, b) => 3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (cubic(mid, ease[0], ease[2]) < t) lo = mid; else hi = mid;
  }
  return cubic((lo + hi) / 2, ease[1], ease[3]);
}

export function sampleJointTrack(track, frame) {
  if (!track?.length) return neutralTransform();
  const index = track.findIndex(key => key.frame >= frame);
  if (index < 0) return structuredClone(track.at(-1).transform);
  const right = track[index];
  if (index === 0 || right.frame === frame) return structuredClone(right.transform);
  const left = track[index - 1];
  const t = easeAmount((frame - left.frame) / (right.frame - left.frame), left.curve, left.ease);
  return {
    position: new Vector3().fromArray(left.transform.position).lerp(new Vector3().fromArray(right.transform.position), t).toArray(),
    rotation: new Quaternion().fromArray(left.transform.rotation).slerp(new Quaternion().fromArray(right.transform.rotation), t).normalize().toArray(),
  };
}

export function writeJointKey(track, frame, transform, curve = 'smooth') {
  const previous = track?.find(key => key.frame === frame);
  return [...(track ?? []).filter(key => key.frame !== frame), {
    frame, transform: structuredClone(transform), curve,
    ...(previous?.ease ? { ease: [...previous.ease] } : {}),
  }].sort((a, b) => a.frame - b.frame);
}

export function restoreJointTracks(saved, frames, ids) {
  const allowed = new Set(ids), result = {};
  for (const [id, track] of Object.entries(saved ?? {})) {
    if (!allowed.has(id) || !Array.isArray(track)) continue;
    const keys = new Map();
    for (const key of track) {
      const transform = key?.transform;
      if (!Number.isInteger(key?.frame) || key.frame < 0 || key.frame > frames
        || !Array.isArray(transform?.position) || transform.position.length !== 3 || !transform.position.every(Number.isFinite)
        || !Array.isArray(transform?.rotation) || transform.rotation.length !== 4 || !transform.rotation.every(Number.isFinite)) continue;
      const quaternion = new Quaternion().fromArray(transform.rotation);
      if (quaternion.lengthSq() < 1e-12) continue;
      const ease = Array.isArray(key.ease) && key.ease.length === 4 && key.ease.every(Number.isFinite)
        ? key.ease.map((v, i) => MathUtils.clamp(v, i % 2 ? -3 : 0, i % 2 ? 4 : 1)) : defaultEase;
      keys.set(key.frame, {
        frame: key.frame, transform: { position: [...transform.position], rotation: quaternion.normalize().toArray() },
        curve: ['smooth', 'linear', 'hold', 'bezier'].includes(key.curve) ? key.curve : 'smooth', ease: [...ease],
      });
    }
    if (keys.size) result[id] = [...keys.values()].sort((a, b) => a.frame - b.frame);
  }
  return result;
}

export function channelValue(transform, channel) {
  const index = 'xyz'.indexOf(channel[1]);
  if (channel[0] === 'p') return transform.position[index];
  const euler = new Euler().setFromQuaternion(new Quaternion().fromArray(transform.rotation), 'XYZ');
  return MathUtils.radToDeg(euler.toArray()[index]);
}

export function withChannelValue(transform, channel, value) {
  const result = structuredClone(transform), index = 'xyz'.indexOf(channel[1]);
  if (channel[0] === 'p') result.position[index] = value;
  else {
    const euler = new Euler().setFromQuaternion(new Quaternion().fromArray(result.rotation), 'XYZ');
    euler[['x', 'y', 'z'][index]] = MathUtils.degToRad(value);
    result.rotation = new Quaternion().setFromEuler(euler).toArray();
  }
  return result;
}

export function retimeTracks(tracks, oldFrames, newFrames) {
  return Object.fromEntries(Object.entries(tracks).map(([id, track]) => {
    const keys = new Map(track.map(key => {
      const frame = Math.round(key.frame / oldFrames * newFrames);
      return [frame, { ...key, frame }];
    }));
    return [id, [...keys.values()].sort((a, b) => a.frame - b.frame)];
  }));
}
