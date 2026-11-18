import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Box3, Vector3} from 'three';
import {loadReference} from '../src/reference.js';
import {productionReferences} from '../src/reference-catalog.js';
import {makeSceneObject, restoreSceneObjects} from '../src/scene-objects.js';

for (const id of ['vault', 'hurdle', 'mantle']) {
  test(`${id} preserves travel, clears its obstacle and recovers at the destination height`, async () => {
    const source = productionReferences[id];
    const reference = await loadReference(new Blob([await readFile(new URL('../' + source.url, import.meta.url))]));
    try {
      const [prop] = restoreSceneObjects(source.scene.props);
      const object = makeSceneObject(prop.type);
      object.position.fromArray(prop.position); object.rotation.fromArray(prop.rotation); object.scale.fromArray(prop.scale);
      object.updateMatrixWorld(true);
      const obstacle = new Box3().setFromObject(object);
      const point = name => reference.model.getObjectByName(name).getWorldPosition(new Vector3());
      reference.sample(0); const start = point('root');
      let clearanceSamples = 0, supportSamples = 0;
      // Sweep between source frames as well: the feet cross a thin hurdle in
      // less than one source frame at full running speed.
      for (let frame = 0; frame <= reference.frames * 4; frame++) {
        reference.sample(Math.min(frame / 240, reference.duration));
        for (const name of ['ball_l', 'ball_r']) {
          const foot = point(name);
          const overObstacle = id === 'mantle' ? foot.z > obstacle.min.z + 0.12
            : Math.abs(foot.z - prop.position[2]) < (id === 'vault' ? 0.22 : 0.04);
          if (overObstacle) {
            assert.ok(foot.y > obstacle.max.y - 0.08, `${name} intersects ${id} at frame ${frame / 4}`);
            clearanceSamples++;
          }
        }
        if (id === 'vault') {
          const hand = point('hand_r');
          if (hand.z > obstacle.min.z && hand.z < obstacle.max.z && Math.abs(hand.y - obstacle.max.y) < 0.10) supportSamples++;
        }
      }
      reference.sample(reference.duration); const end = point('root');
      assert.ok(end.z - start.z > 6, 'Source travel must survive conversion.');
      assert.ok(clearanceSamples > 2, 'The clip must actually cross the supplied obstacle.');
      assert.ok(Math.abs(end.y - (id === 'mantle' ? obstacle.max.y : start.y)) < 0.04, 'Recovery must match the destination surface.');
      if (id === 'vault') assert.ok(supportSamples >= 4, 'The supporting hand must reach the wall top.');
    } finally { reference.dispose(); }
  });
}
