import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const REFERENCE_FPS = 60;
export const lastReferenceFrame = seconds => Math.max(1, Math.ceil(seconds * REFERENCE_FPS - 1e-4));
export const referenceSeconds = (frame, duration) => frame >= lastReferenceFrame(duration)
  ? duration : Math.max(0, frame / REFERENCE_FPS);
export const frameForSeconds = (seconds, duration) => seconds >= duration - 1e-6
  ? lastReferenceFrame(duration) : Math.round(seconds * REFERENCE_FPS);

export function readGlb(buffer, { allowStatic = false } = {}) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a) {
    throw new Error('Choose an animated glTF 2.0 binary (.glb) file.');
  }
  const jsonLength = view.getUint32(12, true);
  if (jsonLength > buffer.byteLength - 20) throw new Error('The GLB file is incomplete.');
  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  } catch {
    throw new Error('The GLB file has invalid scene data.');
  }
  if ((!allowStatic && !json?.animations?.length) || !json.skins?.length) {
    throw new Error('The GLB needs an animated skeleton and its skinned mesh.');
  }
  if ([...(json.buffers ?? []), ...(json.images ?? [])].some(item => item.uri && !item.uri.startsWith('data:'))) {
    throw new Error('Export a self-contained GLB with its textures and buffers embedded.');
  }
  return json;
}

export function phaseAnchors(phases, marks, practiceEnd, duration) {
  const referenceEnd = lastReferenceFrame(duration);
  const anchors = phases.flatMap(({ id, frame }) =>
    Number.isFinite(marks[id]) ? [{ practice: frame, reference: frameForSeconds(marks[id], duration) }] : [],
  );
  if (anchors[0]?.practice !== 0) anchors.unshift({ practice: 0, reference: 0 });
  if (anchors.at(-1).practice !== practiceEnd) anchors.push({ practice: practiceEnd, reference: referenceEnd });
  return anchors;
}

export function mapPhase(value, anchors, from, to) {
  const next = anchors.findIndex(anchor => anchor[from] >= value);
  if (next < 0) return anchors.at(-1)[to];
  if (next === 0) return anchors[0][to];
  const left = anchors[next - 1];
  const right = anchors[next];
  const fraction = (value - left[from]) / (right[from] - left[from]);
  return left[to] + (right[to] - left[to]) * fraction;
}

export function setPhaseMark(phases, marks, phaseId, time, duration, practiceEnd) {
  const index = phases.findIndex(phase => phase.id === phaseId);
  if (index < 0 || !Number.isFinite(time) || time < 0 || time > duration) return null;
  const frame = phases[index].frame;
  const referenceFrame = frameForSeconds(time, duration);
  if ((frame > 0 && referenceFrame === 0)
    || (frame < practiceEnd && referenceFrame === lastReferenceFrame(duration))) return null;
  for (const [otherIndex, phase] of phases.entries()) {
    const other = marks[phase.id];
    if (!Number.isFinite(other)) continue;
    const otherFrame = frameForSeconds(other, duration);
    if ((otherIndex < index && otherFrame >= referenceFrame)
      || (otherIndex > index && otherFrame <= referenceFrame)) return null;
  }
  return { ...marks, [phaseId]: time };
}

async function loadAsset(blob, clipIndex, allowStatic) {
  const buffer = await blob.arrayBuffer();
  const signature = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(80, buffer.byteLength)));
  const isFbx = signature.startsWith('Kaydara FBX Binary') || /FBX|FBXHeaderExtension/.test(signature);
  let loaded;
  try {
    if (isFbx) {
      const manager = new THREE.LoadingManager();
      const resources = new Promise(resolve => { manager.onLoad = resolve; });
      manager.itemStart('character.fbx');
      let scene;
      try { scene = new FBXLoader(manager).parse(buffer, ''); }
      finally { manager.itemEnd('character.fbx'); }
      await resources;
      const canonical = new Map();
      const aliases = [];
      scene.updateMatrixWorld(true);
      scene.traverse(node => {
        if (!node.isBone || node.ID === undefined) return;
        if (canonical.has(node.ID)) aliases.push(node);
        else canonical.set(node.ID, node);
      });
      scene.traverse(node => {
        if (node.isSkinnedMesh) node.skeleton.bones = node.skeleton.bones.map(bone => canonical.get(bone.ID) ?? bone);
      });
      for (const alias of aliases) {
        for (const child of [...alias.children]) canonical.get(alias.ID).attach(child);
        alias.removeFromParent();
      }
      const materials = new Map();
      scene.traverse(node => {
        if (!node.isMesh) return;
        const converted = [node.material].flat().map(original => {
          if (materials.has(original)) return materials.get(original);
          const material = new THREE.MeshStandardMaterial({
            name: original.name, color: original.color, map: original.map,
            normalMap: original.normalMap, bumpMap: original.bumpMap, bumpScale: original.bumpScale,
            alphaMap: original.alphaMap, aoMap: original.aoMap,
            emissive: original.emissive, emissiveMap: original.emissiveMap,
            transparent: original.transparent, opacity: original.opacity, side: original.side,
            roughness: Math.max(0.3, Math.sqrt(2 / ((original.shininess ?? 30) + 2))),
            metalness: 0.12, vertexColors: original.vertexColors,
          });
          material.userData = { ...original.userData };
          materials.set(original, material);
          original.dispose();
          return material;
        });
        node.material = Array.isArray(node.material) ? converted : converted[0];
      });
      loaded = { scene, animations: scene.animations, asset: { format: 'FBX' } };
    } else {
      readGlb(buffer, { allowStatic });
      loaded = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
    }
  } catch (error) {
    console.warn(error);
    throw new Error(isFbx ? 'This FBX could not be opened. Include the rigged model when exporting.'
      : error.message || 'This GLB could not be opened.');
  }
  loaded.scene.userData.sourceAsset = loaded.asset;
  const credits = new Set(loaded.asset.copyright ? [loaded.asset.copyright] : []);
  loaded.scene.traverse(node => {
    for (const key of ['sourceCredit', 'source']) {
      if (typeof node.userData[key] === 'string') credits.add(node.userData[key]);
    }
    if (Array.isArray(node.userData.sourceCredits)) {
      node.userData.sourceCredits.filter(credit => typeof credit === 'string').forEach(credit => credits.add(credit));
    }
  });
  loaded.scene.userData.sourceCredits = [...credits];
  try {
    return new ReferenceClip(loaded.scene, loaded.animations, clipIndex, { allowStatic });
  } catch (error) {
    disposeScene(loaded.scene);
    throw error;
  }
}

export const loadReference = (blob, clipIndex = 0) => loadAsset(blob, clipIndex, false);
export const loadCharacter = (blob, clipIndex = 0) => loadAsset(blob, clipIndex, true);

export class ReferenceClip {
  constructor(model, animations, clipIndex = 0, { allowStatic = false } = {}) {
    this.model = model;
    this.bones = new Set();
    model.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = true;
      if (!mesh.isSkinnedMesh) return;
      mesh.frustumCulled = false;
      mesh.skeleton.bones.forEach(bone => this.bones.add(bone));
    });
    const boneNames = new Set([...this.bones].flatMap(bone => [bone.name, bone.uuid]));
    this.clips = animations.filter(clip => Number.isFinite(clip.duration) && clip.duration > 0 && clip.tracks.some(track => {
      const binding = THREE.PropertyBinding.parseTrackName(track.name);
      return boneNames.has(binding.nodeName) && (binding.propertyName === 'position' || binding.propertyName === 'quaternion');
    }));
    if (!this.bones.size) throw new Error('Include the skinned character and its skeleton in the file.');
    if (!this.clips.length && !allowStatic) throw new Error('Include an animation and its rigged model in the file.');

    model.updateMatrixWorld(true);
    const initial = [];
    model.traverse(node => initial.push({
      node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(),
    }));
    const skeletons = new Set();
    model.traverse(node => {
      if (node.isSkinnedMesh) skeletons.add(node.skeleton);
    });
    skeletons.forEach(skeleton => skeleton.pose());
    model.updateMatrixWorld(true);
    this.bindPose = [];
    model.traverse(node => this.bindPose.push({
      node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(),
    }));
    const bounds = new THREE.Box3();
    model.traverse(node => { if (node.isSkinnedMesh) bounds.expandByObject(node, true); });
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(height) || height <= 0) throw new Error('This file has no visible character to frame.');
    const scale = 1.85 / height;
    const center = bounds.getCenter(new THREE.Vector3());
    const placement = new THREE.Group();
    placement.scale.setScalar(scale);
    placement.position.set(-center.x * scale, -bounds.min.y * scale + 0.006, -center.z * scale);
    placement.add(model);
    this.placement = placement;
    this.group = new THREE.Group();
    this.group.add(placement);
    this.tracking = [...this.bones].find(bone => /(pelvis|hips)(?:_\d+)?$/i.test(bone.name))
      ?? [...this.bones].find(bone => !bone.parent?.isBone);
    for (const { node, position, quaternion, scale } of initial) {
      node.position.copy(position);
      node.quaternion.copy(quaternion);
      node.scale.copy(scale);
    }
    this.mixer = new THREE.AnimationMixer(model);
    this.index = -1;
    if (this.clips.length) this.select(Number.isInteger(clipIndex) && this.clips[clipIndex] ? clipIndex : 0);
    else this.resetPose();
  }

  get duration() { return this.clips[this.index]?.duration ?? 0; }
  get frames() { return lastReferenceFrame(this.duration); }

  select(index) {
    if (!this.clips[index]) return;
    this.action?.stop();
    this.index = index;
    this.action = this.mixer.clipAction(this.clips[index]).play();
    this.action.paused = true;
    this.sample(0);
  }

  sample(time) {
    if (!this.action) return;
    this.action.time = Math.max(0, Math.min(time, this.duration));
    this.mixer.update(0);
    for (const bone of this.bones) bone.quaternion.normalize();
    this.group.updateMatrixWorld(true);
  }

  resetPose() {
    this.action?.stop();
    for (const { node, position, quaternion, scale } of this.bindPose) {
      node.position.copy(position);
      node.quaternion.copy(quaternion);
      node.scale.copy(scale);
    }
    this.group.updateMatrixWorld(true);
  }

  centerOnCharacter(target) {
    if (!this.tracking) return target.set(0, 0, 0);
    this.tracking.getWorldPosition(target);
    target.y = 0;
    return target;
  }

  dispose() {
    this.group.removeFromParent();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    disposeScene(this.model);
  }
}

function disposeScene(model) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const skeletons = new Set();
  model.traverse(object => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    for (const material of [object.material].flat()) materials.add(material);
    if (object.isSkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value?.isTexture) textures.add(value);
    }
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}
