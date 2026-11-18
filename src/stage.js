import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RigOverlay } from './rig-overlay.js';
import { SceneObjects } from './scene-objects.js';

const directions = {
  perspective: [0.48, 0.18, 0.87], front: [0, 0.04, 1],
  side: [1, 0.04, 0], back: [0, 0.04, -1],
};

export class Stage {
  constructor(viewport, canvas, callbacks = {}) {
    this.viewport = viewport;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a2028');
    this.scene.fog = new THREE.Fog('#1a2028', 10, 32);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.04, 250);
    this.camera.position.set(3, 2, 6);
    this.sourceLane = new THREE.Group();
    this.workLane = new THREE.Group();
    this.scene.add(this.sourceLane, this.workLane);
    this.sceneObjects = new SceneObjects();
    this.scene.add(this.sceneObjects.group);
    this.ikTarget = new THREE.Object3D();
    this.ikTarget.name = 'IK target';
    this.scene.add(this.ikTarget);
    this.poseMode = 'fk';
    this.snap = false;
    this.options = { layout: 'side', spacing: 2.3, skeleton: true, lockRoot: true, ghostOpacity: 0.25 };
    this.axis = new THREE.Vector3(1, 0, 0);
    this.sourceOrigin = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(environment, 0.05).texture;
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = 0.4;
    environment.dispose();
    pmrem.dispose();

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: '#242e39', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(80, 160, '#758a9e', '#46586a');
    grid.position.y = 0.008;
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    grid.material.depthWrite = false;
    this.scene.add(grid);
    this.scene.add(new THREE.HemisphereLight('#e4ecff', '#66707f', 2.4));
    const key = new THREE.DirectionalLight('#fff2e3', 3.2);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -6;
    key.shadow.camera.right = key.shadow.camera.top = 6;
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.0003;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#acbdf5', 2);
    rim.position.set(-3, 3, -4);
    this.scene.add(rim);

    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.setMode('rotate');
    this.gizmo.setSpace('world');
    this.gizmo.setSize(0.8);
    this.gizmoHelper = this.gizmo.getHelper();
    this.scene.add(this.gizmoHelper);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.95, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 120;
    this.controls.addEventListener('start', () => callbacks.onFreeView?.());
    this.gizmo.addEventListener('dragging-changed', event => {
      this.controls.enabled = !event.value;
    });
    this.gizmo.addEventListener('mouseDown', () => {
      this.controls.enableDamping = false;
      this.ikPole = this.activeIK?.middle.getWorldPosition(new THREE.Vector3());
      callbacks.onDragStart?.(this.selectedId, this.dragContext());
    });
    this.gizmo.addEventListener('objectChange', () => {
      if (this.gizmo.mode === 'scale' && this.selectedId === 'character') {
        const object = this.editor.root;
        const axis = this.gizmo.axis;
        const amount = axis === 'X' ? object.scale.x : axis === 'Y' ? object.scale.y
          : axis === 'Z' ? object.scale.z : Math.max(object.scale.x, object.scale.y, object.scale.z);
        object.scale.setScalar(THREE.MathUtils.clamp(amount, 0.05, 20));
      }
      if (this.selectedId?.startsWith('prop:') && this.gizmo.mode === 'scale') {
        const object = this.sceneObjects.objects.get(this.selectedId.slice(5));
        for (const axis of ['x', 'y', 'z']) object.scale[axis] = THREE.MathUtils.clamp(object.scale[axis], 0.05, 30);
      }
      if (this.selectedId?.startsWith('prop:') && this.gizmo.mode === 'translate' && this.snap) {
        const object = this.sceneObjects.objects.get(this.selectedId.slice(5));
        for (const axis of ['x', 'y', 'z']) if (this.gizmo.axis?.includes(axis.toUpperCase())) object.position[axis] = Math.round(object.position[axis] * 10) / 10;
      }
      this.editor?.root.updateMatrixWorld(true);
      callbacks.onDrag?.(this.selectedId, this.dragContext());
    });
    this.gizmo.addEventListener('mouseUp', () => {
      this.controls.enableDamping = true;
      queueMicrotask(() => callbacks.onDragEnd?.(this.selectedId, this.dragContext()));
    });
    canvas.addEventListener('pointermove', event => {
      const bounds = canvas.getBoundingClientRect();
      this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1,
        -(event.clientY - bounds.top) / bounds.height * 2 + 1);
      this.hasPointer = true;
    });
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.gizmo.axis || !this.gizmo.enabled || !this.editor) return;
      const bounds = canvas.getBoundingClientRect();
      this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1,
        -(event.clientY - bounds.top) / bounds.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const bone = this.workRig?.pickJoint(this.raycaster);
      if (bone) {
        const id = [...this.editor.bones].find(([, value]) => value === bone)?.[0];
        if (id) callbacks.onSelect?.(id);
      } else {
        const object = this.sceneObjects.pick(this.raycaster);
        if (object) callbacks.onSelect?.('prop:' + object.id);
      }
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(viewport);
    this.resize();
  }

  setActors(reference, editor) {
    if (reference === this.reference && editor === this.editor) return;
    this.gizmo.detach();
    this.comparisonEditor?.root.removeFromParent();
    this.comparisonEditor = null;
    this.reference?.group.removeFromParent();
    this.editor?.root.removeFromParent();
    this.sourceRig?.dispose();
    this.workRig?.dispose();
    this.reference = reference;
    this.editor = editor;
    this.sourceLane.position.set(0, 0, 0);
    this.workLane.position.set(0, 0, 0);
    this.sourceRig = null;
    this.workRig = null;
    if (reference) {
      this.sourceLane.add(reference.group);
      this.sourceRig = new RigOverlay(reference.bones, '#70d9ff', 100);
      this.scene.add(this.sourceRig.group);
      reference.group.updateMatrixWorld(true);
      const center = reference.tracking.getWorldPosition(new THREE.Vector3());
      this.sourceOrigin.copy(reference.group.worldToLocal(center));
    }
    if (editor) {
      this.workLane.add(editor.root);
      this.workRig = new RigOverlay(editor.bones.values(), '#c3ef91', 120);
      this.scene.add(this.workRig.group);
    }
    this.setComparison(this.options);
  }

  resetReferenceOrigin() {
    if (!this.reference) return;
    this.reference.group.updateWorldMatrix(true, true);
    const center = this.reference.tracking.getWorldPosition(new THREE.Vector3());
    this.sourceOrigin.copy(this.reference.group.worldToLocal(center));
  }

  setComparison(options = {}) {
    Object.assign(this.options, options);
    const { layout, skeleton, ghostOpacity } = this.options;
    this.sourceLane.visible = Boolean((this.reference || this.comparisonEditor) && layout !== 'solo' && this.options.referenceVisible !== false);
    if (this.sourceRig) this.sourceRig.group.visible = this.sourceLane.visible && skeleton;
    if (this.workRig) this.workRig.group.visible = skeleton;
    this.sourceRoot?.traverse(node => {
      if (!node.isMesh) return;
      node.renderOrder = layout === 'overlay' ? 10 : 0;
      for (const material of [node.material].flat()) {
        material.userData.workspaceAppearance ??= {
          opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite,
        };
        const original = material.userData.workspaceAppearance;
        const opacity = layout === 'overlay' ? ghostOpacity : 1;
        const transparent = original.transparent || opacity < 1;
        if (material.transparent !== transparent) material.needsUpdate = true;
        material.transparent = transparent;
        material.opacity = original.opacity * opacity;
        material.depthWrite = original.depthWrite && opacity === 1;
        material.forceSinglePass = true;
      }
    });
    this.updateActors();
  }

  setTarget(id) {
    if (!this.editor || this.gizmo.dragging) return;
    const prop = id.startsWith('prop:');
    let object = prop ? this.sceneObjects.objects.get(id.slice(5)) : this.editor.target(id);
    if (!object) return;
    this.activeIK = !prop && this.poseMode === 'ik' ? [...this.editor.ikChains.values()].find(chain => chain.ids[2] === id) : null;
    if (this.activeIK) {
      this.ikTarget.position.copy(this.activeIK.end.getWorldPosition(new THREE.Vector3()));
      this.ikTarget.quaternion.copy(this.activeIK.end.getWorldQuaternion(new THREE.Quaternion()));
      object = this.ikTarget;
    }
    if (!prop && id !== 'character' && this.gizmo.mode === 'scale') this.gizmo.setMode('rotate');
    this.selectedId = id;
    this.setSnap(this.snap);
    this.sceneObjects.select(prop ? id.slice(5) : null);
    if (this.gizmo.object !== object) this.gizmo.attach(object);
    this.updateActors();
  }

  setTool(mode, space = 'world') {
    if (mode === 'scale' && !this.selectedId?.startsWith('prop:')) {
      this.selectedId = 'character';
      this.activeIK = null;
      this.gizmo.attach(this.editor.root);
    }
    this.gizmo.setSpace(space);
    this.gizmo.setMode(mode);
    return this.selectedId;
  }

  get sourceRoot() { return this.comparisonEditor?.root ?? this.reference?.group; }
  get sourceTracking() { return this.comparisonEditor?.reference.tracking ?? this.reference?.tracking; }

  setComparisonTake(editor) {
    this.sourceRoot?.removeFromParent();
    this.sourceRig?.dispose();
    this.comparisonEditor = editor;
    if (this.sourceRoot) this.sourceLane.add(this.sourceRoot);
    const bones = editor ? editor.bones.values() : this.reference?.bones;
    this.sourceRig = bones ? new RigOverlay(bones, '#70d9ff', 100) : null;
    if (this.sourceRig) this.scene.add(this.sourceRig.group);
    this.setComparison(this.options);
  }

  dragContext() {
    return this.activeIK ? { chain: this.activeIK, position: this.ikTarget.position.clone(),
      rotation: this.ikTarget.quaternion.clone(), pole: this.ikPole?.clone() } : null;
  }

  setPoseMode(mode) {
    this.poseMode = mode;
    if (this.selectedId) this.setTarget(this.selectedId);
  }

  setSnap(enabled) {
    this.snap = enabled;
    const active = enabled && this.selectedId?.startsWith('prop:');
    // Object positions are stored in the practice area's coordinates, independently of comparison spacing.
    this.gizmo.setTranslationSnap(null);
    this.gizmo.setRotationSnap(active ? THREE.MathUtils.degToRad(15) : null);
    this.gizmo.setScaleSnap(active ? 0.1 : null);
  }

  syncObjects(records) {
    this.sceneObjects.sync(records);
    this.sceneObjects.select(this.selectedId?.startsWith('prop:') ? this.selectedId.slice(5) : null);
  }

  getLaneAnchor(which) {
    const paired = (this.reference || this.comparisonEditor) && this.options.referenceVisible !== false && this.options.layout === 'side';
    const separation = paired ? this.options.spacing / 2 : 0;
    const anchor = this.axis.clone().multiplyScalar(which === 'work' ? separation : -separation);
    const origin = which === 'work' ? this.editor?.origin : this.comparisonEditor?.origin ?? this.sourceOrigin;
    if (origin) { anchor.x -= origin.x; anchor.z -= origin.z; }
    return anchor;
  }

  spawnPosition(count = 0) {
    this.sceneObjects.group.updateWorldMatrix(true, false);
    if (this.hasPointer) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const position = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      if (position) {
        this.sceneObjects.group.worldToLocal(position);
        if (position.length() < 5) return [Math.round(position.x * 10) / 10, 0, Math.round(position.z * 10) / 10];
      }
    }
    return [0.95 + (count % 4) * 0.25, 0, -0.4 - Math.floor(count / 4) * 0.25];
  }

  focusSelected() {
    const target = this.selectedId?.startsWith('prop:') ? this.sceneObjects.objects.get(this.selectedId.slice(5)) : this.editor?.target(this.selectedId);
    if (!target) return;
    const box = this.selectedId.startsWith('prop:') ? new THREE.Box3().setFromObject(target) : null;
    const center = box ? box.getCenter(new THREE.Vector3()) : target.getWorldPosition(new THREE.Vector3());
    const size = box ? Math.max(...box.getSize(new THREE.Vector3()).toArray(), 0.5) : 0.45;
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.enableDamping = false;
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, size / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.8);
    this.controls.update(); this.controls.enableDamping = true;
  }

  setInteraction(enabled) {
    this.gizmo.enabled = enabled;
    this.gizmoHelper.visible = enabled && Boolean(this.gizmo.object);
  }

  updateActors() {
    const { layout, spacing, lockRoot } = this.options;
    const paired = (this.reference || this.comparisonEditor) && this.options.referenceVisible !== false && layout === 'side';
    const separation = paired ? spacing / 2 : 0;
    const facing = this.camera.position.clone().sub(this.controls.target);
    this.axis.set(facing.z, 0, -facing.x).normalize();
    if (this.comparisonEditor) {
      this.sourceLane.position.copy(this.getLaneAnchor('source'));
      if (lockRoot) this.sourceLane.position.sub(new THREE.Vector3(this.comparisonEditor.motionOffset.x, 0, this.comparisonEditor.motionOffset.z));
      this.sourceLane.updateMatrixWorld(true);
    } else if (this.reference) {
      this.sourceLane.position.set(0, 0, 0);
      this.sourceLane.updateMatrixWorld(true);
      const center = this.reference.tracking.getWorldPosition(new THREE.Vector3());
      this.reference.group.worldToLocal(center);
      const origin = lockRoot ? center : this.sourceOrigin;
      this.sourceLane.position.copy(this.axis).multiplyScalar(-separation);
      this.sourceLane.position.x -= origin.x;
      this.sourceLane.position.z -= origin.z;
      this.sourceLane.updateMatrixWorld(true);
    }
    if (this.editor) {
      const motion = lockRoot ? this.editor.motionOffset : new THREE.Vector3();
      this.workLane.position.copy(this.axis).multiplyScalar(separation);
      this.workLane.position.x -= this.editor.origin.x + motion.x;
      this.workLane.position.z -= this.editor.origin.z + motion.z;
      this.workLane.updateMatrixWorld(true);
    }
    this.sourceRig?.update();
    this.workRig?.update(this.editor?.bones.get(this.selectedId));
    this.sceneObjects.group.position.copy(this.getLaneAnchor('work'));
    this.sceneObjects.group.updateMatrixWorld(true);
    if (this.activeIK && !this.gizmo.dragging) {
      this.ikTarget.position.copy(this.activeIK.end.getWorldPosition(new THREE.Vector3()));
      this.ikTarget.quaternion.copy(this.activeIK.end.getWorldQuaternion(new THREE.Quaternion()));
    }
  }

  setView(view = 'perspective') {
    if (this.gizmo.dragging) return;
    this.controls.enableDamping = false;
    this.controls.update();
    this.updateActors();
    const bounds = new THREE.Box3();
    if (this.editor) bounds.expandByObject(this.editor.root, true);
    if (this.sourceRoot && this.sourceLane.visible) bounds.expandByObject(this.sourceRoot, true);
    if (this.sceneObjects.objects.size) bounds.expandByObject(this.sceneObjects.group, true);
    if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
    this.fitBounds(bounds, new THREE.Vector3(...directions[view]).normalize());
    this.controls.update();
    this.controls.enableDamping = true;
    this.updateActors();
  }

  frameScene() {
    this.updateActors();
    const bounds = new THREE.Box3();
    if (this.editor) bounds.expandByObject(this.editor.root, true);
    if (this.sourceRoot && this.sourceLane.visible) bounds.expandByObject(this.sourceRoot, true);
    if (this.sceneObjects.objects.size) bounds.expandByObject(this.sceneObjects.group, true);
    if (bounds.isEmpty()) return;
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.enableDamping = false;
    this.fitBounds(bounds, direction);
    this.controls.update(); this.controls.enableDamping = true; this.updateActors();
  }

  fitBounds(bounds, direction) {
    const center = bounds.getCenter(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(this.camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const height = Math.max(100, this.viewport.clientHeight);
    const top = Math.max(0.25, 1 - 130 / height), bottom = Math.max(0.35, 1 - 84 / height);
    let distance = 2;
    // Fit every corner in camera space, including depth and the overlaid toolbars.
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const offset = new THREE.Vector3(x, y, z).sub(center), depth = offset.dot(direction), vertical = offset.dot(up);
      distance = Math.max(distance, depth + Math.abs(offset.dot(right)) / (tangent * this.camera.aspect * 0.9),
        depth + Math.abs(vertical) / (tangent * (vertical >= 0 ? top : bottom)));
    }
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance * 1.04);
  }

  resize() {
    if (this.capturing) return;
    const width = this.viewport.clientWidth;
    const height = this.viewport.clientHeight;
    if (!width || !height || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  setCaptureSize(width, height) {
    this.capturing = true;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  endCapture() {
    this.capturing = false;
    this.width = this.height = 0;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.resize();
  }

  render(dt) {
    this.controls.update(dt);
    this.updateActors();
    this.beforeRender?.();
    this.renderer.render(this.scene, this.camera);
  }
}
