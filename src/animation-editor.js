import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { BODY, samplePose, valueAt } from './keyframes.js';
import { samplePoseKeys } from './pose-keys.js';
import { findIKChains, solveTwoBone } from './ik.js';

export class ImportedAnimation {
  constructor(reference) {
    this.reference = reference;
    this.bones = new Map([...reference.bones].map((bone, index) => ['bone_' + index, bone]));
    this.originals = new Map();
    this.rotation = new THREE.Quaternion();
    this.euler = new THREE.Euler();
  }

  get root() { return this.reference.group; }
  get duration() { return this.reference.duration; }
  get frameRate() {
    const clip = this.reference.clips[this.reference.index];
    if (!clip) return 30;
    return [24, 30, 60].find(fps => clip.tracks.every(track =>
      track.times.every(time => Math.abs(time * fps - Math.round(time * fps)) < 0.001),
    )) ?? 60;
  }

  sample(keys, frame, frames) {
    for (const [bone, original] of this.originals) {
      bone.position.copy(original.position);
      bone.quaternion.copy(original.quaternion);
    }
    this.originals.clear();
    this.reference.sample(frame / frames * this.duration);
    const pose = samplePose(keys, frame);
    for (const [id, bone] of this.bones) {
      const angles = ['x', 'y', 'z'].map(axis => valueAt(pose, id, axis));
      if (!angles.some(Boolean)) continue;
      this.remember(bone);
      this.euler.set(...angles.map(THREE.MathUtils.degToRad));
      bone.quaternion.multiply(this.rotation.setFromEuler(this.euler)).normalize();
    }
    const movement = new THREE.Vector3(...['x', 'y', 'z'].map(axis => valueAt(pose, BODY, axis) / 100));
    const pelvis = this.reference.tracking;
    if (pelvis && movement.lengthSq()) {
      this.remember(pelvis);
      this.root.updateMatrixWorld(true);
      const target = pelvis.getWorldPosition(new THREE.Vector3()).add(movement);
      pelvis.position.copy(pelvis.parent.worldToLocal(target));
    }
    this.root.updateMatrixWorld(true);
  }

  remember(bone) {
    if (!this.originals.has(bone)) {
      this.originals.set(bone, { position: bone.position.clone(), quaternion: bone.quaternion.clone() });
    }
  }

  selectClip(index) {
    for (const [bone, original] of this.originals) {
      bone.position.copy(original.position);
      bone.quaternion.copy(original.quaternion);
    }
    this.originals.clear();
    this.reference.select(index);
  }

  dispose() { this.reference.dispose(); }
}

export class PoseAnimation extends ImportedAnimation {
  constructor(reference, sourceMode = 'blank', alignment = {}) {
    super(reference);
    this.sourceMode = sourceMode;
    this.tracks = {};
    this.contacts = [];
    this.ikChains = findIKChains(this.bones);
    this.characterRoot = new THREE.Group();
    this.characterRoot.name = 'Character';
    this.characterRoot.add(reference.group);
    this.base = new Map();
    this.motionOffset = new THREE.Vector3();
    if (sourceMode === 'blank') reference.resetPose();
    this.rest = new Map([...this.bones.values()].map(bone => [bone, {
      position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone(),
    }]));
    this.origin = this.contentCenter();
    this.setAlignment(alignment ?? {});
    this.sample([], 0, 1);
  }

  get root() { return this.characterRoot; }

  contentCenter() {
    this.root.updateMatrixWorld(true);
    const position = this.reference.tracking?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();
    return this.reference.group.worldToLocal(position);
  }

  setAlignment({ position = [0, 0, 0], rotation = [0, 0, 0, 1], scale = 1 } = {}) {
    this.root.position.fromArray(position);
    this.root.quaternion.fromArray(rotation).normalize();
    this.root.scale.setScalar(Math.max(0.05, Math.min(20, Number.isFinite(scale) ? scale : 1)));
    this.root.updateMatrixWorld(true);
  }

  getAlignment() {
    return { position: this.root.position.toArray(), rotation: this.root.quaternion.toArray(), scale: this.root.scale.x };
  }

  sample(keys, frame, frames, draft = null) {
    for (const [bone, original] of this.originals) {
      bone.position.copy(original.position);
      bone.quaternion.copy(original.quaternion);
    }
    this.originals.clear();
    if (this.sourceMode === 'clip') {
      this.reference.sample(frames ? frame / frames * this.duration : 0);
      this.motionOffset.copy(this.contentCenter()).sub(this.origin);
    } else {
      for (const [bone, rest] of this.rest) {
        bone.position.copy(rest.position);
        bone.quaternion.copy(rest.quaternion);
        bone.scale.copy(rest.scale);
      }
      this.motionOffset.set(0, 0, 0);
    }
    this.base.clear();
    for (const bone of this.bones.values()) {
      this.base.set(bone, { position: bone.position.clone(), quaternion: bone.quaternion.clone() });
    }
    const pose = draft ?? samplePoseKeys(keys, frame, this.tracks);
    for (const [id, transform] of Object.entries(pose)) {
      const bone = this.bones.get(id);
      if (!bone) continue;
      this.remember(bone);
      bone.position.add(new THREE.Vector3().fromArray(transform.position));
      bone.quaternion.multiply(new THREE.Quaternion().fromArray(transform.rotation)).normalize();
    }
    this.root.updateMatrixWorld(true);
    for (const contact of this.contacts) {
      if (frame < contact.from || frame > contact.to) continue;
      const chain = this.ikChains.get(contact.chain);
      if (!chain) continue;
      for (const bone of [chain.upper, chain.middle, chain.end]) this.remember(bone);
      const position = this.root.localToWorld(new THREE.Vector3().fromArray(contact.position));
      const rotation = contact.rotation ? this.root.getWorldQuaternion(new THREE.Quaternion())
        .multiply(new THREE.Quaternion().fromArray(contact.rotation)) : undefined;
      solveTwoBone(chain, position, { rotation, bend: contact.bend ?? 0 });
    }
  }

  solveIK(id, position, options = {}) {
    const chain = this.ikChains.get(id);
    if (!chain) return null;
    for (const bone of [chain.upper, chain.middle, chain.end]) this.remember(bone);
    return solveTwoBone(chain, position, options);
  }

  captureBones(ids, pose) {
    for (const id of ids) pose = this.captureBone(id, pose);
    return pose;
  }

  captureBone(id, pose) {
    const bone = this.bones.get(id);
    const base = this.base.get(bone);
    if (!base) return pose;
    const result = structuredClone(pose);
    const position = bone.position.clone().sub(base.position);
    const rotation = base.quaternion.clone().invert().multiply(bone.quaternion).normalize();
    if (position.lengthSq() < 1e-14 && Math.abs(rotation.w) > 1 - 1e-12) delete result[id];
    else result[id] = { position: position.toArray(), rotation: rotation.toArray() };
    return result;
  }

  target(id) {
    return id === 'character' ? this.root : this.bones.get(id);
  }

  selectClip(index) {
    super.selectClip(index);
    this.origin.copy(this.contentCenter());
    this.motionOffset.set(0, 0, 0);
  }

  dispose() {
    this.root.removeFromParent();
    super.dispose();
  }
}

export function retimeKeys(keys, oldFrames, newFrames) {
  const byFrame = new Map();
  for (const key of keys) {
    const frame = Math.round(key.frame / oldFrames * newFrames);
    byFrame.set(frame, { ...key, frame });
  }
  return [...byFrame.values()].sort((left, right) => left.frame - right.frame);
}

export async function exportAnimation({ root, sample, duration, fps, name, credit, signal, onProgress = () => {} }) {
  signal?.throwIfAborted();
  const copied = clone(root);
  copied.parent = null;
  copied.userData = { ...copied.userData, ...(credit ? { sourceCredit: credit } : {}) };
  const originals = [];
  const copies = [];
  root.traverse(node => originals.push(node));
  copied.traverse(node => copies.push(node));
  copied.traverse(node => {
    if (!node.isMesh) return;
    const materials = [node.material].flat().map(original => {
      const material = original.clone();
      Object.assign(material, original.userData.workspaceAppearance ?? {});
      delete material.userData.workspaceAppearance;
      return material;
    });
    node.material = Array.isArray(node.material) ? materials : materials[0];
  });
  try {
    const tracks = [];
    const steps = Math.max(1, Math.round(duration * fps));
    const times = Float32Array.from({ length: steps + 1 }, (_, index) => index / steps * duration);
    const captures = originals.map((node, index) => ({
      node, target: copies[index], position: [], quaternion: [], scale: [], morph: [],
    }));
    let frameIndex = 0;
    for (const time of times) {
      signal?.throwIfAborted();
      sample(time);
      for (const capture of captures) {
        const { node } = capture;
        capture.position.push(...node.position.toArray());
        capture.quaternion.push(...node.quaternion.toArray());
        capture.scale.push(...node.scale.toArray());
        if (node.morphTargetInfluences?.length) capture.morph.push(...node.morphTargetInfluences);
      }
      if (++frameIndex % 30 === 0) {
        onProgress(frameIndex / times.length * 0.9);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    for (const capture of captures) {
      const { target, position, quaternion, scale, morph } = capture;
      target.position.fromArray(position);
      target.quaternion.fromArray(quaternion);
      target.scale.fromArray(scale);
      tracks.push(
        new THREE.VectorKeyframeTrack(target.uuid + '.position', times, position),
        new THREE.QuaternionKeyframeTrack(target.uuid + '.quaternion', times, quaternion),
        new THREE.VectorKeyframeTrack(target.uuid + '.scale', times, scale),
      );
      if (morph.length) tracks.push(new THREE.NumberKeyframeTrack(target.uuid + '.morphTargetInfluences', times, morph));
    }
    const clip = new THREE.AnimationClip(name, duration, tracks).optimize();
    signal?.throwIfAborted(); onProgress(0.92);
    const bytes = await new GLTFExporter().parseAsync(copied, { binary: true, animations: [clip], onlyVisible: true });
    signal?.throwIfAborted(); onProgress(1); return bytes;
  } finally {
    copied.traverse(node => { if (node.isMesh) for (const material of [node.material].flat()) material.dispose(); });
  }
}
