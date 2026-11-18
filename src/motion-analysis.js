import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export class MotionAnalysis {
  constructor(stage, getState, restore, sampleSource) {
    this.stage = stage; this.getState = getState; this.restore = restore; this.sampleSource = sampleSource;
    this.work = new THREE.Group(); this.source = new THREE.Group();
    this.work.userData.workspaceHelper = this.source.userData.workspaceHelper = true;
    stage.scene.add(this.work, this.source);
    this.ghosts = []; this.paths = []; this.pins = []; this.revision = 0; this.dirty = true;
  }

  invalidate() { this.dirty = true; this.revision++; this.lastGhost = ''; }

  releaseGhosts() {
    for (const ghost of this.ghosts) {
      ghost.wrapper.removeFromParent();
      ghost.material.dispose();
    }
    this.ghosts = [];
  }

  runtimeChanged() {
    this.releaseGhosts(); this.clearPaths(); this.clearPins();
    this.sourceId = null; this.editorId = null; this.invalidate();
  }

  makeGhost(root, parent, offset, color, actor) {
    const copied = clone(root), originals = [], copies = [];
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.15,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    material.forceSinglePass = true;
    root.traverse(node => originals.push(node));
    copied.traverse(node => {
      copies.push(node);
      if (node.isMesh) { node.material = material; node.castShadow = node.receiveShadow = false; node.renderOrder = 2; }
    });
    const wrapper = new THREE.Group(); wrapper.add(copied); parent.add(wrapper);
    this.ghosts.push({ wrapper, copied, originals, copies, material, offset, actor });
  }

  ensureGhosts() {
    const state = this.getState(), stage = this.stage;
    const signature = [state.editor?.root.uuid, stage.sourceRoot?.uuid, state.analysis.ghostSource].join(':');
    if (signature === this.ghostSignature) return;
    this.releaseGhosts(); this.ghostSignature = signature;
    if (state.editor && state.analysis.ghostSource !== 'reference') {
      this.makeGhost(state.editor.root, this.work, -1, '#74b7ff', 'work');
      this.makeGhost(state.editor.root, this.work, 1, '#edb875', 'work');
    }
    if (stage.sourceRoot && state.analysis.ghostSource !== 'work') {
      this.makeGhost(stage.sourceRoot, this.source, -1, '#74b7ff', 'source');
      this.makeGhost(stage.sourceRoot, this.source, 1, '#edb875', 'source');
    }
  }

  sourceMotion() {
    const stage = this.stage;
    if (stage.comparisonEditor) return stage.comparisonEditor.motionOffset.clone();
    if (!stage.reference) return new THREE.Vector3();
    const centre = stage.sourceLane.worldToLocal(stage.reference.tracking.getWorldPosition(new THREE.Vector3()));
    return centre.sub(stage.sourceOrigin);
  }

  buildPaths() {
    this.clearPaths();
    const state = this.getState(), stage = this.stage;
    if (!state.analysis.paths || !state.editor) return;
    const selected = state.editor.bones.get(state.target) ?? state.editor.reference.tracking;
    const sourceBones = stage.comparisonEditor ? [...stage.comparisonEditor.bones.values()] : [...(stage.reference?.bones ?? [])];
    const sourceBone = sourceBones.find(bone => bone.name === selected.name);
    const start = state.analysis.rangeOnly ? state.training.start : 0;
    const end = state.analysis.rangeOnly ? state.training.end : state.frames;
    const steps = Math.max(1, Math.min(160, end - start));
    const work = [], source = [];
    for (let i = 0; i <= steps; i++) {
      const frame = start + (end - start) * i / steps;
      state.editor.sample(state.keys, frame, state.frames);
      const point = stage.workLane.worldToLocal(selected.getWorldPosition(new THREE.Vector3()));
      if (stage.options.lockRoot) { point.x -= state.editor.motionOffset.x; point.z -= state.editor.motionOffset.z; }
      work.push(point);
      if (sourceBone) {
        this.sampleSource(frame);
        const position = stage.sourceLane.worldToLocal(sourceBone.getWorldPosition(new THREE.Vector3()));
        if (stage.options.lockRoot) { const motion = this.sourceMotion(); position.x -= motion.x; position.z -= motion.z; }
        source.push(position);
      }
    }
    const path = (points, parent, color) => {
      if (!points.length) return;
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
      const dots = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.018, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
      line.renderOrder = dots.renderOrder = 80;
      parent.add(line, dots); this.paths.push(line, dots);
    };
    path(work, this.work, '#c3ef91'); path(source, this.source, '#70d9ff');
    this.restore();
  }

  clearPaths() {
    for (const object of this.paths) { object.removeFromParent(); object.geometry.dispose(); object.material.dispose(); }
    this.paths = [];
  }

  clearPins() {
    for (const object of this.pins) { object.removeFromParent(); object.geometry.dispose(); object.material.dispose(); }
    this.pins = [];
  }

  buildPins() {
    this.clearPins();
    const state = this.getState();
    for (const contact of state.contacts) {
      const marker = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, 6, 20),
        new THREE.MeshBasicMaterial({ color: '#e8b97c', transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
      marker.rotation.x = -Math.PI / 2; marker.renderOrder = 90;
      marker.position.fromArray(contact.position).applyMatrix4(state.editor.root.matrix);
      marker.userData.contact = contact;
      this.work.add(marker); this.pins.push(marker);
    }
  }

  update() {
    const state = this.getState(), stage = this.stage;
    if (!state.editor) return;
    this.work.position.copy(stage.getLaneAnchor('work'));
    this.source.position.copy(stage.getLaneAnchor('source'));
    this.source.visible = stage.sourceLane.visible;
    if (stage.gizmo.dragging || stage.externalEditing) { this.work.visible = this.source.visible = false; return; }
    this.work.visible = true;
    if (this.dirty) { this.buildPaths(); this.buildPins(); this.dirty = false; }
    for (const marker of this.pins) {
      const contact = marker.userData.contact;
      marker.visible = state.frame >= contact.from && state.frame <= contact.to;
      marker.position.fromArray(contact.position).applyMatrix4(state.editor.root.matrix);
      if (stage.options.lockRoot) { marker.position.x -= state.editor.motionOffset.x; marker.position.z -= state.editor.motionOffset.z; }
    }
    if (!state.analysis.ghosts) {
      this.ghosts.forEach(ghost => { ghost.wrapper.visible = false; });
      return;
    }
    this.ensureGhosts();
    const stamp = [Math.round(state.frame), this.revision, state.analysis.offset, stage.options.lockRoot].join(':');
    if (stamp === this.lastGhost) return;
    this.lastGhost = stamp;
    for (const ghost of this.ghosts) {
      const frame = Math.max(0, Math.min(state.frames, state.frame + ghost.offset * state.analysis.offset));
      ghost.wrapper.visible = Math.abs(frame - state.frame) > 0.01;
      if (ghost.actor === 'work') state.editor.sample(state.keys, frame, state.frames);
      else this.sampleSource(frame);
      ghost.originals.forEach((node, index) => {
        const target = ghost.copies[index];
        target.position.copy(node.position); target.quaternion.copy(node.quaternion); target.scale.copy(node.scale);
        if (node.morphTargetInfluences) target.morphTargetInfluences = [...node.morphTargetInfluences];
      });
      const motion = ghost.actor === 'work' ? state.editor.motionOffset : this.sourceMotion();
      ghost.wrapper.position.set(stage.options.lockRoot ? -motion.x : 0, 0, stage.options.lockRoot ? -motion.z : 0);
      ghost.copied.updateMatrixWorld(true);
    }
    this.restore();
  }

  dispose() { this.runtimeChanged(); this.work.removeFromParent(); this.source.removeFromParent(); }
}
