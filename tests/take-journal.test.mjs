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
  const edited = { ...take, savedAt: 2, editRevision: 'gizmo', cursor: 60,
    poses: [{ frame: 60, pose: { bone_0: { rotation: [0, 1, 0, 0] } } }] };
  journalTake(store, edited);
  const recovered = recoverTake(store, take);
  assert.deepEqual(recovered.poses, edited.poses);
  assert.equal(recovered.cursor, 60);
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
