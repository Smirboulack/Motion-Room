import test from 'node:test';
import assert from 'node:assert/strict';
import { makeKey, restoreKeys, samplePose, writeKey } from '../src/keyframes.js';
import { availableJoints, drawLesson, evaluateLesson, lessons } from '../src/lessons.js';
import { loadManny } from './helpers/manny.mjs';

test('L’interpolation est déterminée par la clé qui commence le segment', () => {
  const neutral = {};
  const turn = { 'head.y': 40 };
  const clip = curve => [makeKey(0, neutral, curve), makeKey(20, turn)];
  assert.equal(samplePose(clip('linear'), 5)['head.y'], 10);
  assert.equal(samplePose(clip('smooth'), 5)['head.y'], 6.25);
  assert.deepEqual(samplePose(clip('hold'), 19.99), neutral);
  assert.deepEqual(samplePose(clip('hold'), 20), turn);
});

test('Une nouvelle clé conserve les autres articulations et les clés restent ordonnées', () => {
  const starter = [makeKey(0, {}, 'linear'), makeKey(30, { 'head.y': 30, 'spine_03.x': 12 })];
  const withKey = writeKey(starter, 15, { 'head.y': 35 });
  assert.deepEqual(withKey[1], makeKey(15, { 'head.y': 35, 'spine_03.x': 6 }, 'linear'));
  const edited = writeKey(withKey, 15, { 'head.y': 0 }, 'hold');
  assert.deepEqual(edited.map(key => key.frame), [0, 15, 30]);
  assert.deepEqual(edited[1], makeKey(15, { 'spine_03.x': 6 }, 'hold'));
  assert.equal(starter.length, 2);
});

test('Le chargement ignore les trames et commandes invalides sans perdre une pose valide', () => {
  const loaded = restoreKeys([
    makeKey(35, { 'head.y': 60 }),
    makeKey(20, { 'head.y': 700, 'head.z': null, 'unknown.x': 2 }, 'unknown'),
    makeKey(-1),
    makeKey(0, { 'head.x': 20 }, 'hold'),
  ], 30, ['head']);
  assert.deepEqual(loaded, [makeKey(0, { 'head.x': 20 }, 'hold'), makeKey(20, { 'head.y': 180 })]);
  assert.deepEqual(restoreKeys([], 30, ['head']), []);
});

const rig = loadManny({ mesh: true, normalize: true });
const framePose = (lesson, keys, frame, reference = false) => {
  drawLesson(rig, lesson, keys, frame, reference);
  return [
    ...rig.root.position.toArray(),
    ...[...rig.bones.values()].flatMap(bone => [...bone.position.toArray(), ...bone.quaternion.toArray()]),
  ];
};

for (const lesson of lessons) {
  test(`${lesson.title} · consignes, validation et lecture sur Manny`, () => {
    for (const step of lesson.steps) {
      assert.ok(step.frame >= 0 && step.frame <= lesson.frames);
      assert.ok(availableJoints(lesson).includes(step.joint));
    }
    assert.ok(evaluateLesson(lesson, lesson.starter).some(criterion => !criterion.passed));
    let solution = lesson.reference;
    if (lesson.id === 'marche') {
      const neutralArms = { 'upperarm_l.x': 0, 'upperarm_r.x': 0 };
      const contact = writeKey(lesson.starter, 18, { 'upperarm_l.x': -17, 'upperarm_r.x': 17 });
      assert.equal(evaluateLesson(lesson, contact).at(-1).passed, false);
      const passing = writeKey(writeKey(contact, 9, neutralArms), 27, neutralArms);
      solution = writeKey(passing, 36, passing[0].pose);
    }
    assert.ok(evaluateLesson(lesson, solution).every(criterion => criterion.passed));
    assert.deepEqual(restoreKeys(JSON.parse(JSON.stringify(solution)), lesson.frames, availableJoints(lesson)), solution);

    const frame = lesson.steps[0].frame;
    const expected = framePose(lesson, solution, frame);
    for (const fraction of [0, 0.35, 0.65, 1]) {
      assert.ok(framePose(lesson, solution, fraction * lesson.frames).every(Number.isFinite));
      assert.ok(framePose(lesson, solution, fraction * lesson.frames, true).every(Number.isFinite));
    }
    assert.deepEqual(framePose(lesson, solution, frame), expected);
  });
}
