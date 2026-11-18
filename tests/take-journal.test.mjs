import test from 'node:test';
import assert from 'node:assert/strict';
import { journalTake, recoverTake, confirmTake } from '../src/take-journal.js';

function storage() {
  const values = new Map();
  return {
    setItem: (key, value) => values.set(key, value),
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
  };
}

const take = {
  kind: 'practice', id: 'regard', assetName: 'X Bot', referenceName: 'Head turn',
  sourceMode: 'blank', assetBlob: new Blob(['model']), schema: 2,
  poses: [], frames: 120, fps: 60, savedAt: 1, editRevision: 'initial',
};

test('an immediate reload recovers the last pose without duplicating the model file', () => {
  const store = storage();
  const edited = { ...take, savedAt: 2, editRevision: 'gizmo', cursor: 60, rootMotion: true, layout: 'solo',
    poses: [{ frame: 60, pose: { bone_0: { rotation: [0, 1, 0, 0] } } }] };
  journalTake(store, edited);
  const recovered = recoverTake(store, take);
  assert.deepEqual(recovered.poses, edited.poses);
  assert.equal(recovered.cursor, 60);
  assert.equal(recovered.rootMotion, true);
  assert.equal(recovered.layout, 'solo');
  assert.equal(recovered.assetBlob, take.assetBlob);
  assert.deepEqual(recoverTake(store, { ...take, assetName: 'Different rig' }).poses, []);
  assert.deepEqual(recoverTake(store, { ...take, savedAt: 3 }).poses, []);
});

test('an older database save cannot discard a newer edit journal', () => {
  const store = storage();
  const first = { ...take, savedAt: 2, editRevision: 'first', cursor: 30 };
  const second = { ...take, savedAt: 2, editRevision: 'second', cursor: 60 };
  journalTake(store, second);
  confirmTake(store, first);
  assert.equal(recoverTake(store, take).cursor, 60);
  confirmTake(store, second);
  assert.deepEqual(recoverTake(store, take), take);
});

test('reload recovery never pairs newly imported media settings with an older media file', () => {
  const store = storage();
  const previous = { ...take, mediaBlob: new Blob(['old']), mediaReference: { name: 'old.webm', offset: 0 } };
  const edited = { ...previous, savedAt: 2, cursor: 40, mediaBlob: new Blob(['new footage']), mediaReference: { name: 'new.webm', offset: 2 } };
  journalTake(store, edited);
  const recovered = recoverTake(store, previous);
  assert.equal(recovered.cursor, 40);
  assert.equal(recovered.mediaBlob, previous.mediaBlob);
  assert.deepEqual(recovered.mediaReference, previous.mediaReference);
  const storedMedia = { ...previous, mediaBlob: edited.mediaBlob, mediaReference: { ...edited.mediaReference, offset: 0 } };
  assert.equal(recoverTake(store, storedMedia).mediaReference.offset, 2);
});
