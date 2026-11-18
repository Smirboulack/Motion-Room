import { samplePoseKeys } from './pose-keys.js';
import { neutralTransform } from './joint-tracks.js';

export const poseRow = '$pose';
export const keyToken = (joint, frame) => joint + ':' + frame;
export const parseToken = token => { const i = token.lastIndexOf(':'); return { joint: token.slice(0, i), frame: Number(token.slice(i + 1)) }; };

export function timelineTrack(state, joint) {
  if (joint === poseRow) return state.keys;
  return state.tracks[joint] ?? state.keys.map(key => ({ frame: key.frame,
    transform: structuredClone(samplePoseKeys(state.keys, key.frame)[joint] ?? neutralTransform()),
    curve: key.curve, ...(key.ease ? { ease: [...key.ease] } : {}),
  }));
}

export function copyTimelineKeys(state, selection) {
  const items = [...selection].flatMap(token => {
    const { joint, frame } = parseToken(token), key = timelineTrack(state, joint).find(item => item.frame === frame);
    return key ? [{ joint, key: structuredClone(key) }] : [];
  });
  if (!items.length) return null;
  const first = Math.min(...items.map(item => item.key.frame));
  return items.map(item => ({ ...item, key: { ...item.key, frame: item.key.frame - first } }));
}

/** Atomic edits reject collisions instead of silently overwriting another key. */
export function editTimelineKeys(state, selection, { delta = 0, scale = 1, remove = false, clipboard = null, at = 0 } = {}) {
  const selected = [...selection].map(parseToken);
  if (!clipboard && !selected.length) return null;
  const start = selected.length ? Math.min(...selected.map(item => item.frame)) : 0;
  const end = selected.length ? Math.max(...selected.map(item => item.frame)) : 0;
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(delta) || !Number.isFinite(at)) return null;
  if (!clipboard) delta = Math.max(-start, Math.min(state.frames - Math.round(start + (end - start) * scale), Math.round(delta)));
  const items = clipboard ?? selected.map(({ joint, frame }) => ({ joint, key: timelineTrack(state, joint).find(key => key.frame === frame) })).filter(item => item.key);
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.joint)) groups.set(item.joint, []);
    groups.get(item.joint).push(item.key);
  }
  const result = { keys: state.keys, tracks: { ...state.tracks }, selection: new Set() };
  const emptied = [];
  for (const [joint, keys] of groups) {
    if (joint !== poseRow && !state.editor.bones.has(joint)) return null;
    const oldFrames = new Set(keys.map(key => key.frame));
    const kept = timelineTrack(state, joint).filter(key => clipboard || !oldFrames.has(key.frame));
    const moved = remove ? [] : keys.map(key => ({ ...structuredClone(key), frame: clipboard
      ? Math.round(at + key.frame) : Math.round(start + (key.frame - start) * scale + delta) }));
    const occupied = new Set(kept.map(key => key.frame));
    for (const key of moved) {
      if (key.frame < 0 || key.frame > state.frames || occupied.has(key.frame)) return null;
      occupied.add(key.frame); result.selection.add(keyToken(joint, key.frame));
    }
    const track = [...kept, ...moved].sort((a, b) => a.frame - b.frame);
    if (joint === poseRow) result.keys = track;
    else if (track.length) result.tracks[joint] = track;
    else { delete result.tracks[joint]; emptied.push(joint); }
  }
  if (emptied.length) result.keys = result.keys.map(key => ({ ...key, pose: Object.fromEntries(Object.entries(key.pose).filter(([id]) => !emptied.includes(id))) }));
  return result;
}
