import * as THREE from 'three';

/** Adapteur du squelette Manny. Les angles sont en radians, dans les axes
 * anatomiques de la pose neutre : X = flexion, Y = torsion, Z = ouverture.
 * Chaque frame repart de la pose neutre : une animation ne pollue pas la suivante.
 */
export class MannyRig {
  constructor(model, motionRoot) {
    this.model = model;
    this.root = motionRoot;
    this.bones = new Map();
    this.rest = new Map();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'XYZ');
    this._v = new THREE.Vector3();
    this.lift = 0;
    model.traverse(object => {
      if (object.isBone) this.bones.set(object.name.replace(/_\d+$/, ''), object);
    });
    for (const name of ['pelvis', 'spine_01', 'spine_03', 'spine_05', 'head', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r']) {
      if (!this.bones.has(name)) throw new Error(`Missing model bone ${name}`);
    }
    model.updateWorldMatrix(true, true);
    // Le GLB est en pose A. On détend les deux bras sans changer la géométrie.
    for (const [side, sign] of [['l', 1], ['r', -1]]) {
      this.aim(`upperarm_${side}`, new THREE.Vector3(sign * 0.10, -1, 0.03));
      this.aim(`lowerarm_${side}`, new THREE.Vector3(sign * 0.06, -1, 0.10));
    }
    model.updateWorldMatrix(true, true);
    this.bones.forEach((bone, name) => {
      const world = bone.getWorldQuaternion(new THREE.Quaternion());
      this.rest.set(name, { position: bone.position.clone(), quaternion: bone.quaternion.clone(), world, inverseWorld: world.clone().invert() });
    });
    this.contacts = ['foot_l', 'foot_r', 'ball_l', 'ball_r'].map(name => ({ name, y: this.bones.get(name).getWorldPosition(new THREE.Vector3()).y }));
  }

  aim(name, direction) {
    const bone = this.bones.get(name);
    const current = bone.getWorldQuaternion(new THREE.Quaternion());
    const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const from = new THREE.Vector3(0, 1, 0).applyQuaternion(current);
    const delta = new THREE.Quaternion().setFromUnitVectors(from.normalize(), direction.normalize());
    bone.quaternion.copy(parent.invert().multiply(delta).multiply(current));
    bone.updateWorldMatrix(false, true);
  }

  reset() {
    this.bones.forEach((bone, name) => {
      const rest = this.rest.get(name);
      bone.quaternion.copy(rest.quaternion);
      bone.position.copy(rest.position);
    });
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.lift = 0;
    this.contactsSolved = false;
  }

  rotate(name, x = 0, y = 0, z = 0) {
    const bone = this.bones.get(name);
    const rest = this.rest.get(name);
    if (!bone || !rest) return;
    this._q.setFromEuler(this._e.set(x, y, z));
    // Transformer les axes du studio dans le repère local de cet os au repos.
    this._q.premultiply(rest.inverseWorld).multiply(rest.world);
    bone.quaternion.copy(rest.quaternion).multiply(this._q).normalize();
  }

  fingers(side, amount = 0) {
    for (const digit of ['index', 'middle', 'ring', 'pinky']) {
      for (const segment of ['01', '02', '03']) {
        const name = `${digit}_${segment}_${side}`;
        const bone = this.bones.get(name);
        if (bone) bone.quaternion.copy(this.rest.get(name).quaternion).multiply(this._q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (side === 'l' ? -1 : 1) * amount));
      }
    }
  }

  finish() {
    this.model.updateWorldMatrix(true, true);
    if (this.contactsSolved) {
      this.root.updateWorldMatrix(true, true);
      return;
    }
    if (Math.abs(this.root.rotation.x) + Math.abs(this.root.rotation.z) > 1e-6) {
      const supports = [
        ['head', 0.12], ['spine_03', 0.17], ['pelvis', 0.13],
        ['hand_l', 0.05], ['hand_r', 0.05], ['calf_l', 0.055], ['calf_r', 0.055],
        ['foot_l', 0.045], ['foot_r', 0.045], ['ball_l', 0.025], ['ball_r', 0.025],
      ];
      const lowest = Math.min(...supports.map(([name, radius]) =>
        this.bones.get(name).getWorldPosition(this._v).y - radius,
      ));
      this.root.position.y += 0.006 - lowest + this.lift;
      this.root.updateWorldMatrix(true, true);
      return;
    }
    // Recaler le pied d’appui au sol, puis ajouter la hauteur volontaire du saut.
    let lowest = Infinity;
    for (const contact of this.contacts) {
      lowest = Math.min(lowest, this.bones.get(contact.name).getWorldPosition(this._v).y - contact.y);
    }
    this.root.position.y = -lowest + this.lift;
    this.root.updateWorldMatrix(true, true);
  }
}
