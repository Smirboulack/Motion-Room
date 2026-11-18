import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { lessons } from '../src/lessons.js';
import { studies } from '../src/practice-library.js';
import { productionReferences } from '../src/reference-catalog.js';
import { frameForSeconds, loadReference, mapPhase, phaseAnchors, readGlb, referenceSeconds, setPhaseMark } from '../src/reference.js';

function glbHeader(document) {
  const data = Buffer.from(JSON.stringify(document));
  const paddedSize = Math.ceil(data.length / 4) * 4;
  const glb = new ArrayBuffer(20 + paddedSize);
  const view = new DataView(glb);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, glb.byteLength, true);
  view.setUint32(12, paddedSize, true);
  view.setUint32(16, 0x4e4f534a, true);
  const payload = new Uint8Array(glb, 20);
  payload.fill(0x20);
  payload.set(data);
  return glb;
}

test('Reference imports require animation, skinning and embedded resources', () => {
  assert.throws(() => readGlb(new ArrayBuffer(12)), /glTF 2.0 binary/);
  assert.throws(() => readGlb(glbHeader({ skins: [{}] })), /animated skeleton/);
  assert.throws(() => readGlb(glbHeader({ animations: [{}], skins: [{}], images: [{ uri: 'textures/external.png' }] })), /self-contained/);
});

test('Practice and reference playheads map through marked phases in both directions', () => {
  const { referencePhases: phases } = lessons.find(lesson => lesson.id === 'marche');
  const marks = { 'left-contact': 0, 'left-passing': 0.25, 'right-contact': 0.6, 'right-passing': 0.8, 'next-contact': 1.1 };
  const anchors = phaseAnchors(phases, marks, 36, 1.1);
  assert.equal(mapPhase(18, anchors, 'practice', 'reference'), 36);
  assert.equal(mapPhase(15, anchors, 'reference', 'practice'), 9);
  assert.equal(mapPhase(24, anchors, 'practice', 'reference'), 44);
  assert.equal(setPhaseMark(phases, marks, 'right-contact', 0.84, 1.1, 36), null);
  assert.equal(setPhaseMark(phases, {}, 'left-passing', 0, 1.1, 36), null);
  assert.equal(setPhaseMark(phases, marks, 'right-contact', 0.65, 1.1, 36)['right-contact'], 0.65);
  assert.equal(setPhaseMark(phases, marks, 'left-contact', 0, 1.1, 36)['left-contact'], 0);
  assert.equal(setPhaseMark(phases, marks, 'next-contact', 1.1, 1.1, 36)['next-contact'], 1.1);
  assert.equal(frameForSeconds(1.102, 1.102), 67);
  assert.equal(referenceSeconds(67, 1.102), 1.102);
});

test('A single interior pose in a custom reference cannot use either clip endpoint', () => {
  const lesson = lessons.find(lesson => lesson.id === 'regard');
  const { referencePhases: phases, frames } = lesson;
  assert.equal(setPhaseMark(phases, {}, 'glance', 0, 1.2, frames), null);
  assert.equal(setPhaseMark(phases, {}, 'glance', 1.2, 1.2, frames), null);
  const marks = setPhaseMark(phases, {}, 'glance', 0.7, 1.2, frames);
  const anchors = phaseAnchors(phases, marks, frames, 1.2);
  assert.equal(mapPhase(42, anchors, 'reference', 'practice'), 24);
});

test('Every practice motion includes its credited rigged reference', () => {
  assert.deepEqual(Object.keys(productionReferences).sort(), studies.map(study => study.id).sort());
  for (const study of studies) {
    const source = productionReferences[study.id];
    assert.match(source.creditUrl, /^https:\/\//);
  }
});

for (const [lessonId, source] of Object.entries(productionReferences)) {
  test(`${source.title} loads with its source skeleton and supports precise seeking`, async () => {
    const url = new URL(`../${source.url}`, import.meta.url);
    const reference = await loadReference(new Blob([await readFile(url)]));
    try {
      const marks = Object.values(source.marks ?? {});
      assert.ok(marks.every((time, index) => time >= 0 && time <= reference.duration + 1e-6
        && (index === 0 || time > marks[index - 1])));
      const start = reference.centerOnCharacter(new Vector3());
      reference.sample(reference.duration);
      const end = reference.centerOnCharacter(new Vector3());
      if (lessonId === 'marche') assert.ok(start.distanceTo(end) > 1.4);
      if (lessonId === 'course') assert.ok(start.distanceTo(end) > 2.4);
      reference.sample(0);
      assert.ok(reference.centerOnCharacter(new Vector3()).distanceTo(start) < 1e-7);
      if (lessonId === 'saut') {
        assert.deepEqual(reference.clips.map(clip => clip.name), ['Jump takeoff', 'Landing and recovery']);
        reference.select(1);
        const pelvis = reference.model.getObjectByName('pelvis');
        const beforeLanding = pelvis.getWorldPosition(new Vector3()).y;
        reference.sample(reference.duration * 0.6);
        assert.ok(beforeLanding - pelvis.getWorldPosition(new Vector3()).y > 0.5);
      }
    } finally {
      reference.dispose();
    }
  });
}
