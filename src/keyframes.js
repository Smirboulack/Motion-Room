export const FPS = 30;
export const BODY = 'body';
export const BODY_ROTATION = 'body_rotation';
export const ROTATION_AXES = [
  { id: 'x', label: 'Flexion', min: -180, max: 180, step: 1, unit: '°' },
  { id: 'y', label: 'Twist', min: -180, max: 180, step: 1, unit: '°' },
  { id: 'z', label: 'Tilt', min: -180, max: 180, step: 1, unit: '°' },
];
export const TRANSLATION_AXES = [
  { id: 'x', label: 'Sideways', min: -60, max: 60, step: 1, unit: ' cm' },
  { id: 'y', label: 'Height', min: 0, max: 120, step: 1, unit: ' cm' },
  { id: 'z', label: 'Depth', min: -60, max: 60, step: 1, unit: ' cm' },
];
const BODY_ROTATION_AXES = ROTATION_AXES.map(axis => ({ ...axis, label: 'Rotation', min: -720, max: 720 }));
export const CURVES = { smooth: 'Ease in and out', linear: 'Linear', hold: 'Stepped' };

function paired(id, label) {
  return [
    { id: id + '_l', label: 'Left ' + label, pair: id + '_r' },
    { id: id + '_r', label: 'Right ' + label, pair: id + '_l' },
  ];
}

export const joints = new Map([
  { id: 'head', label: 'Head' },
  { id: 'spine_03', label: 'Torso' },
  { id: 'pelvis', label: 'Pelvis' },
  { id: BODY, label: 'Whole body' },
  { id: BODY_ROTATION, label: 'Whole body rotation' },
  ...paired('upperarm', 'upper arm'),
  ...paired('lowerarm', 'forearm'),
  ...paired('hand', 'wrist'),
  ...paired('thigh', 'thigh'),
  ...paired('calf', 'knee'),
  ...paired('foot', 'foot'),
].map(joint => [joint.id, joint]));

export const axesFor = joint => joint === BODY ? TRANSLATION_AXES
  : joint === BODY_ROTATION ? BODY_ROTATION_AXES : ROTATION_AXES;
export const makeKey = (frame, pose = {}, curve = 'smooth') => ({ frame, pose, curve });
export const valueAt = (pose, joint, axis) => pose[joint + '.' + axis] ?? 0;

export function samplePose(keys, frame) {
  const rightIndex = keys.findIndex(key => key.frame >= frame);
  if (rightIndex === -1) return keys.at(-1)?.pose ?? {};
  const right = keys[rightIndex];
  if (rightIndex === 0 || right.frame === frame) return right.pose;
  const left = keys[rightIndex - 1];
  if (left.curve === 'hold') return left.pose;
  const progress = (frame - left.frame) / (right.frame - left.frame);
  const t = left.curve === 'linear' ? progress : progress * progress * (3 - 2 * progress);
  const pose = {};
  for (const channel of new Set([...Object.keys(left.pose), ...Object.keys(right.pose)])) {
    const from = left.pose[channel] ?? 0;
    const to = right.pose[channel] ?? 0;
    pose[channel] = from + (to - from) * t;
  }
  return pose;
}

export function segmentCurve(keys, frame) {
  return keys.findLast(key => key.frame <= frame)?.curve ?? 'smooth';
}

export function writeKey(keys, frame, changes = {}, curve = segmentCurve(keys, frame)) {
  const pose = { ...samplePose(keys, frame), ...changes };
  for (const channel of Object.keys(pose)) {
    if (pose[channel] === 0) delete pose[channel];
  }
  const key = makeKey(frame, pose, curve);
  const index = keys.findIndex(item => item.frame >= frame);
  if (index === -1) return [...keys, key];
  return [...keys.slice(0, index), key, ...keys.slice(index + Number(keys[index].frame === frame))];
}

export function applyPose(rig, pose) {
  const radians = Math.PI / 180;
  const animatedJoints = new Set(Object.keys(pose).map(channel => channel.slice(0, channel.lastIndexOf('.'))));
  for (const joint of animatedJoints) {
    const x = valueAt(pose, joint, 'x');
    const y = valueAt(pose, joint, 'y');
    const z = valueAt(pose, joint, 'z');
    if (joint === BODY) {
      rig.root.position.x = x / 100;
      rig.root.position.z = z / 100;
      rig.lift = y / 100;
    } else if (joint === BODY_ROTATION) {
      rig.root.rotation.set(x * radians, y * radians, z * radians);
    } else if (x || y || z) {
      rig.rotate(joint, x * radians, y * radians, z * radians);
    }
  }
}

export function restoreKeys(saved, lastFrame, allowedJoints, axisOptions = axesFor) {
  if (!Array.isArray(saved)) return null;
  const byFrame = new Map();
  for (const item of saved) {
    if (!Number.isInteger(item?.frame) || item.frame < 0 || item.frame > lastFrame) continue;
    if (!item.pose || typeof item.pose !== 'object') continue;
    const pose = {};
    for (const joint of allowedJoints) {
      for (const axis of axisOptions(joint)) {
        const channel = joint + '.' + axis.id;
        const value = item.pose[channel];
        if (Number.isFinite(value) && value !== 0) {
          pose[channel] = Math.min(axis.max, Math.max(axis.min, value));
        }
      }
    }
    byFrame.set(item.frame, makeKey(item.frame, pose, Object.hasOwn(CURVES, item.curve) ? item.curve : 'smooth'));
  }
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}
