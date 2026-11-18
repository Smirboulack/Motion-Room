import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MannyRig } from '../../src/rig.js';

// Lecture CPU du GLB livré : géométrie et skin réelles, sans texture ni navigateur.
export function loadManny({ mesh = false, normalize = false } = {}) {
  const buffer = readFileSync(new URL('../../ue5_male_mannequin_-_manny_-_web_ready.glb', import.meta.url));
  const jsonLength = buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
  const binary = buffer.subarray(28 + jsonLength);
  const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  function attribute(index) {
    const a = gltf.accessors[index], b = gltf.bufferViews[a.bufferView];
    const Type = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5125: Uint32Array }[a.componentType];
    const size = sizes[a.type];
    const start = (b.byteOffset || 0) + (a.byteOffset || 0);
    const bytes = binary.subarray(start, start + a.count * size * Type.BYTES_PER_ELEMENT);
    return new THREE.BufferAttribute(new Type(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), size, Boolean(a.normalized));
  }
  const joints = new Set(gltf.skins.flatMap(skin => skin.joints));
  const objects = gltf.nodes.map((node, index) => {
    let object = joints.has(index) ? new THREE.Bone() : new THREE.Group();
    if (mesh && node.mesh !== undefined) {
      const primitive = gltf.meshes[node.mesh].primitives[0];
      const geometry = new THREE.BufferGeometry();
      for (const [semantic, name] of [['POSITION', 'position'], ['JOINTS_0', 'skinIndex'], ['WEIGHTS_0', 'skinWeight']]) geometry.setAttribute(name, attribute(primitive.attributes[semantic]));
      object = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    }
    object.name = node.name;
    if (node.matrix) new THREE.Matrix4().fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale);
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  gltf.nodes.forEach((node, index) => (node.children || []).forEach(child => objects[index].add(objects[child])));
  if (mesh) gltf.nodes.forEach((node, index) => {
    if (node.skin === undefined) return;
    const skin = gltf.skins[node.skin];
    const inverse = attribute(skin.inverseBindMatrices).array;
    objects[index].bind(new THREE.Skeleton(skin.joints.map(i => objects[i]), skin.joints.map((_, i) => new THREE.Matrix4().fromArray(inverse, i * 16))), new THREE.Matrix4());
  });
  const root = new THREE.Group();
  const model = objects[0];
  root.add(model);
  root.updateMatrixWorld(true);
  if (normalize) {
    const bounds = new THREE.Box3().setFromObject(model);
    const normalizer = new THREE.Group();
    normalizer.scale.setScalar(1.85 / bounds.getSize(new THREE.Vector3()).y);
    normalizer.add(model);
    root.add(normalizer);
    root.updateMatrixWorld(true);
    model.traverse(o => { if (o.isSkinnedMesh) o.boundingBox = null; });
    bounds.setFromObject(model);
    normalizer.position.y = -bounds.min.y + 0.006;
    normalizer.position.x = -(bounds.min.x + bounds.max.x) / 2;
    root.updateMatrixWorld(true);
  }
  return new MannyRig(model, root);
}
