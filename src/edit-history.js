export function captureEdit(state) {
  return structuredClone({
    keys: state.keys, draft: state.draft, frames: state.frames, fps: state.fps,
    frame: state.frame, alignment: state.editor.getAlignment(),
    tracks: state.tracks, contacts: state.contacts, props: state.props, target: state.target,
    training: state.training, notes: state.notes,
    sourceMode: state.editor.sourceMode, clipIndex: state.editor.reference.index,
    referenceIndex: state.reference?.clip.index,
  });
}

export function rememberEdit(state, before = captureEdit(state)) {
  state.undo.push(before);
  if (state.undo.length > 100) state.undo.shift();
  state.redo = [];
}

export function restoreEdit(state, saved) {
  if (Number.isInteger(saved.clipIndex) && state.editor.reference.index !== saved.clipIndex) state.editor.selectClip(saved.clipIndex);
  if (saved.sourceMode) state.editor.sourceMode = saved.sourceMode;
  if (Number.isInteger(saved.referenceIndex) && state.reference) state.reference.clip.select(saved.referenceIndex);
  for (const field of ['keys', 'draft', 'frames', 'fps', 'frame', 'tracks', 'contacts', 'props', 'target', 'training', 'notes']) {
    if (Object.hasOwn(saved, field)) state[field] = structuredClone(saved[field]);
  }
  state.editor.setAlignment(saved.alignment);
}

export function travelHistory(state, redo = false) {
  const from = redo ? state.redo : state.undo, to = redo ? state.undo : state.redo;
  if (!from.length) return false;
  to.push(captureEdit(state));
  restoreEdit(state, from.pop());
  return true;
}
