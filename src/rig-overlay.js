import * as THREE from 'three';

export const isDisplayBone = bone => !/twist|corrective|^ik_|^vb[ _]|^root(?:_\d+)?$|rootjoint|^attach|^poi|^weapon_|^prop_|_leaf|_end/i.test(bone.name);
export const isFingerBone = bone => /thumb|index|middle|(?:^|[:_\s]|hand)ring|pinky|little|metacarpal|finger/i.test(bone.name);

export class RigOverlay {
  constructor(bones, color, renderOrder = 100) {
    this.group = new THREE.Group();
    this.group.userData.workspaceHelper = true;
    const visible = [...bones].filter(isDisplayBone);
    const included = new Set(visible);
    this.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false });
    this.selected = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.pickerMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.sphere = new THREE.SphereGeometry(0.014, 10, 8);
    this.pickerGeometry = new THREE.SphereGeometry(0.04, 8, 6);
    this.cylinder = new THREE.CylinderGeometry(0.005, 0.008, 1, 6);
    this.up = new THREE.Vector3(0, 1, 0);
    this.start = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.links = visible.map(bone => {
      const finger = isFingerBone(bone);
      const dotSize = finger ? 0.32 : 1;
      let parent = bone.parent;
      while (parent?.isBone && !included.has(parent)) parent = parent.parent;
      const dot = new THREE.Mesh(this.sphere, this.material);
      dot.scale.setScalar(dotSize);
      dot.renderOrder = renderOrder + 1;
      this.group.add(dot);
      const picker = new THREE.Mesh(this.pickerGeometry, this.pickerMaterial);
      picker.scale.setScalar(finger ? 0.32 : 1);
      picker.userData.bone = bone;
      this.group.add(picker);
      const line = parent?.isBone ? new THREE.Mesh(this.cylinder, this.material) : null;
      if (line) {
        line.renderOrder = renderOrder;
        line.scale.x = line.scale.z = finger ? 0.3 : 1;
        this.group.add(line);
      }
      return { bone, parent, dot, line, picker, dotSize };
    });
  }

  update(selectedBone) {
    if (!this.group.visible) return;
    for (const { bone, parent, dot, line, picker, dotSize } of this.links) {
      bone.getWorldPosition(this.end);
      dot.position.copy(this.end);
      picker.position.copy(this.end);
      const selected = bone === selectedBone;
      dot.material = selected ? this.selected : this.material;
      dot.scale.setScalar(dotSize * (selected ? 1.65 : 1));
      if (!line) continue;
      parent.getWorldPosition(this.start);
      line.position.copy(this.start).lerp(this.end, 0.5);
      this.end.sub(this.start);
      line.visible = this.end.lengthSq() > 1e-8;
      line.scale.y = this.end.length();
      line.quaternion.setFromUnitVectors(this.up, this.end.normalize());
    }
  }

  pickJoint(raycaster) {
    if (!this.group.visible) return null;
    this.group.updateMatrixWorld(true);
    const hits = raycaster.intersectObjects(this.links.map(link => link.picker), false);
    // Prefer the joint centre nearest the pointer, so a large wrist hit area cannot hide a finger.
    const centre = new THREE.Vector3();
    hits.sort((left, right) => {
      const a = raycaster.ray.distanceSqToPoint(left.object.getWorldPosition(centre));
      const b = raycaster.ray.distanceSqToPoint(right.object.getWorldPosition(centre));
      return a - b || left.distance - right.distance;
    });
    return hits[0]?.object.userData.bone ?? null;
  }

  dispose() {
    this.group.removeFromParent();
    this.material.dispose();
    this.selected.dispose();
    this.pickerMaterial.dispose();
    this.pickerGeometry.dispose();
    this.sphere.dispose();
    this.cylinder.dispose();
  }
}
