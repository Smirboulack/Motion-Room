import * as THREE from 'three';

export const objectLibrary = [
  { type: 'wall', name: 'Wall', description: 'Lean, push and climb', size: [2.4, 2.3, 0.22] },
  { type: 'lowWall', name: 'Low wall', description: 'Vaults and sitting', size: [1.8, 0.85, 0.35] },
  { type: 'stairs', name: 'Stairs', description: 'Six steps, 20 cm rise', size: [1.3, 1.2, 1.8] },
  { type: 'ladder', name: 'Ladder', description: 'Climbing and hand contacts', size: [0.65, 2.6, 0.16] },
  { type: 'box', name: 'Box', description: 'Step up, jump and lift', size: [0.7, 0.7, 0.7] },
  { type: 'platform', name: 'Platform', description: 'Landing and elevation', size: [1.8, 0.45, 1.5] },
  { type: 'bench', name: 'Bench', description: 'Sitting and getting up', size: [1.5, 0.5, 0.5] },
  { type: 'hurdle', name: 'Hurdle', description: 'Jump over and duck under', size: [1.4, 1.05, 0.5] },
  { type: 'ramp', name: 'Ramp', description: 'Uphill and downhill steps', size: [1.4, 0.9, 2] },
  { type: 'doorway', name: 'Doorway', description: 'Entrances and narrow passages', size: [1.4, 2.25, 0.22] },
  { type: 'beam', name: 'Balance beam', description: 'Balance and careful footwork', size: [0.22, 0.4, 2.6] },
  { type: 'pole', name: 'Pole', description: 'Reach and grip', size: [0.12, 2.4, 0.12] },
  { type: 'barrel', name: 'Cylinder', description: 'Round support and obstacles', size: [0.7, 0.85, 0.7] },
];

export function makeSceneObject(type) {
  const item = objectLibrary.find(item => item.type === type);
  if (!item) throw new Error('Unknown scene object.');
  const group = new THREE.Group();
  group.name = item.name;
  const body = new THREE.MeshStandardMaterial({ color: '#667687', roughness: 0.87, metalness: 0.08 });
  const top = new THREE.MeshStandardMaterial({ color: '#9aabb7', roughness: 0.8, metalness: 0.05 });
  const foot = new THREE.MeshStandardMaterial({ color: '#384754', roughness: 1 });
  const mesh = (geometry, position, material = body) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    object.castShadow = object.receiveShadow = true;
    group.add(object);
    return object;
  };
  const box = (size, position, material) => mesh(new THREE.BoxGeometry(...size), position, material);
  const [w, h, d] = item.size;
  if (['wall', 'lowWall', 'box', 'platform', 'beam'].includes(type)) {
    box([w, h, d], [0, h / 2, 0]);
    box([w + 0.008, 0.018, d + 0.008], [0, h + 0.009, 0], top);
  } else if (type === 'stairs') {
    for (let step = 0; step < 6; step++) {
      const height = (step + 1) * h / 6, depth = d / 6;
      const z = d / 2 - (step + 0.5) * depth;
      box([w, height, depth], [0, height / 2, z]);
      box([w, 0.015, 0.035], [0, height + 0.0075, z + depth / 2 - 0.02], top);
    }
  } else if (type === 'ladder') {
    for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) box([0.07, h, 0.08], [x, h / 2, 0]);
    for (let y = 0.22; y < h - 0.08; y += 0.28) {
      const rung = mesh(new THREE.CylinderGeometry(0.025, 0.025, w - 0.08, 12), [0, y, 0], top);
      rung.rotation.z = Math.PI / 2;
    }
    for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) box([0.09, 0.07, d], [x, 0.035, 0], foot);
  } else if (type === 'bench') {
    box([w, 0.09, d], [0, h - 0.045, 0], top);
    for (const x of [-w * 0.35, w * 0.35]) for (const z of [-d * 0.32, d * 0.32]) box([0.09, h - 0.09, 0.09], [x, (h - 0.09) / 2, z]);
  } else if (type === 'hurdle') {
    box([w, 0.08, 0.08], [0, h - 0.04, 0], top);
    for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) {
      box([0.065, h, 0.065], [x, h / 2, 0]);
      box([0.2, 0.05, d], [x, 0.025, 0], foot);
    }
  } else if (type === 'doorway') {
    for (const x of [-w / 2 + 0.055, w / 2 - 0.055]) box([0.11, h, d], [x, h / 2, 0]);
    box([w, 0.11, d], [0, h - 0.055, 0], top);
  } else if (type === 'ramp') {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(-d / 2, h); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, steps: 1 });
    geometry.rotateY(-Math.PI / 2); geometry.translate(w / 2, 0, 0);
    mesh(geometry, [0, 0, 0]);
  } else {
    mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, type === 'pole' ? 16 : 32), [0, h / 2, 0]);
    mesh(new THREE.CylinderGeometry(w / 2 + 0.003, w / 2 + 0.003, 0.018, 24), [0, h + 0.009, 0], top);
  }
  const outline = new THREE.LineBasicMaterial({ color: '#c3ef91', transparent: true, opacity: 0, depthWrite: false });
  const parts = [...group.children];
  for (const part of parts) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(part.geometry, 30), outline);
    edges.position.copy(part.position); edges.rotation.copy(part.rotation);
    edges.userData.selectionOutline = true;
    group.add(edges);
  }
  group.selectionMaterial = outline;
  group.ownedMaterials = [body, top, foot, outline];
  group.userData.baseSize = [...item.size];
  return group;
}

export function restoreSceneObjects(saved) {
  if (!Array.isArray(saved)) return [];
  const ids = new Set();
  return saved.filter(item => objectLibrary.some(source => source.type === item?.type)).slice(0, 80).map(item => {
    let id = typeof item.id === 'string' && !ids.has(item.id) ? item.id : crypto.randomUUID();
    ids.add(id);
    const vector = (value, fallback, min, max) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
      ? value.map(number => Math.max(min, Math.min(max, number))) : fallback;
    return {
      id, type: item.type, name: String(item.name ?? objectLibrary.find(source => source.type === item.type).name).slice(0, 80),
      position: vector(item.position, [0, 0, 0], -100, 100),
      rotation: vector(item.rotation, [0, 0, 0], -Math.PI * 100, Math.PI * 100),
      scale: vector(item.scale, [1, 1, 1], 0.05, 30),
    };
  });
}

export class SceneObjects {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Scene objects';
    this.objects = new Map();
  }

  sync(records) {
    const wanted = new Set(records.map(item => item.id));
    for (const [id, object] of this.objects) if (!wanted.has(id)) {
      this.disposeObject(object); this.objects.delete(id);
    }
    for (const item of records) {
      let object = this.objects.get(item.id);
      if (!object) {
        object = makeSceneObject(item.type);
        object.userData.propId = item.id;
        this.objects.set(item.id, object);
        this.group.add(object);
      }
      object.name = item.name;
      object.position.fromArray(item.position);
      object.rotation.set(...item.rotation);
      object.scale.fromArray(item.scale);
    }
    this.group.updateMatrixWorld(true);
  }

  select(id) {
    for (const [key, object] of this.objects) object.selectionMaterial.opacity = key === id ? 0.85 : 0;
  }

  pick(raycaster) {
    this.group.updateMatrixWorld(true);
    const meshes = [];
    this.group.traverse(node => { if (node.isMesh) meshes.push(node); });
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    let root = hit.object;
    while (root && !root.userData.propId) root = root.parent;
    return root ? { id: root.userData.propId, distance: hit.distance } : null;
  }

  read(id) {
    const object = this.objects.get(id);
    return object && { position: object.position.toArray(), rotation: [object.rotation.x, object.rotation.y, object.rotation.z], scale: object.scale.toArray() };
  }

  floorPosition(id) {
    const object = this.objects.get(id);
    if (!object) return 0;
    object.updateWorldMatrix(true, true);
    return object.position.y - new THREE.Box3().setFromObject(object).min.y;
  }

  exportClone() {
    const result = this.group.clone(true);
    result.position.set(0, 0, 0);
    const remove = [];
    result.traverse(node => { if (node.userData.selectionOutline) remove.push(node); });
    remove.forEach(node => node.removeFromParent());
    return result;
  }

  disposeObject(object) {
    object.removeFromParent();
    const materials = new Set();
    object.traverse(node => {
      node.geometry?.dispose();
      if (node.material) materials.add(node.material);
    });
    materials.forEach(material => material.dispose());
    object.ownedMaterials?.forEach(material => material.dispose());
  }

  dispose() {
    for (const object of this.objects.values()) this.disposeObject(object);
    this.objects.clear(); this.group.removeFromParent();
  }
}
