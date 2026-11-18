// Keep the last small edit synchronous while the model file is saved in IndexedDB.
const keyFor = record => 'motion-room-edit-v2:' + record.kind + ':' + record.id;
const identity = record => JSON.stringify([
  record.assetName, record.characterVersion, record.referenceName, record.sourceMode,
]);
const mediaIdentity = record => JSON.stringify([record.mediaReference?.name, record.mediaBlob?.size, record.mediaBlob?.type]);

export function journalTake(storage, record) {
  const { name, poses, draft, frames, fps, cursor, alignment, clipIndex,
    referenceIndex, clipTakes, savedAt, editRevision, tracks, contacts, props, analysis,
    training, notes, takes, sceneSnap, rootMotion, layout, mediaReference, poseLibrary } = record;
  storage.setItem(keyFor(record), JSON.stringify({
    identity: identity(record), mediaIdentity: mediaIdentity(record), name, poses, draft, frames, fps, cursor, alignment,
    clipIndex, referenceIndex, clipTakes, savedAt, editRevision,
    tracks, contacts, props, analysis, training, notes, takes, sceneSnap, rootMotion, layout, mediaReference, poseLibrary,
  }));
}

export function recoverTake(storage, record) {
  if (!record) return record;
  try {
    const pending = JSON.parse(storage.getItem(keyFor(record)));
    if (!pending || pending.identity !== identity(record)
      || pending.savedAt < (record.savedAt ?? 0)) return record;
    const { identity: _, mediaIdentity: media, ...edit } = pending;
    if (media !== undefined && media !== mediaIdentity(record)) delete edit.mediaReference;
    return { ...record, ...edit, schema: 2 };
  } catch { return record; }
}

export function confirmTake(storage, record) {
  try {
    const pending = JSON.parse(storage.getItem(keyFor(record)));
    if (pending?.editRevision && pending.editRevision === record.editRevision) {
      storage.removeItem(keyFor(record));
    }
  } catch { /* The IndexedDB copy is already saved. */ }
}
