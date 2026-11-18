import { Matrix4, Quaternion, Vector3 } from 'three';
import { neutralTransform, channelValue, withChannelValue } from './joint-tracks.js';

export const rigSignature = editor => JSON.stringify([...editor.bones.values()].map(bone => bone.name).sort());
const validTransform = value => value?.position?.length === 3 && value.position.every(Number.isFinite)
  && value?.rotation?.length === 4 && value.rotation.every(Number.isFinite)
  && new Quaternion().fromArray(value.rotation).lengthSq() > 1e-12;

export function restorePoseLibrary(value) {
  return (Array.isArray(value) ? value : []).filter(item => typeof item?.id === 'string'
    && typeof item.name === 'string' && typeof item.rig === 'string' && item.pose && typeof item.pose === 'object')
    .map(item => ({ id: item.id, name: item.name.slice(0, 80), rig: item.rig,
      pose: Object.fromEntries(Object.entries(item.pose).filter(([name, transform]) => name.length < 256 && validTransform(transform))
        .map(([name, transform]) => [name, { position: [...transform.position], rotation: new Quaternion().fromArray(transform.rotation).normalize().toArray() }])) }));
}

export function scopedJoints(editor, target, scope) {
  if (scope === 'whole') return [...editor.bones.keys()];
  const selected = editor.bones.get(target);
  if (!selected) return [];
  if (scope !== 'branch') return [target];
  const descendants = new Set(); selected.traverse(node => descendants.add(node));
  return [...editor.bones].filter(([, bone]) => descendants.has(bone)).map(([id]) => id);
}

export function namedPose(editor, pose, ids) {
  return Object.fromEntries(ids.map(id => [editor.bones.get(id).name, structuredClone(pose[id] ?? neutralTransform())]));
}

export function applyNamedPose(editor, pose, saved) {
  const result = structuredClone(pose), ids = [];
  for (const [id, bone] of editor.bones) if (validTransform(saved[bone.name])) {
    result[id] = structuredClone(saved[bone.name]); ids.push(id);
  }
  return { pose: result, ids };
}

function oppositeName(name, names) {
  const swaps = [
    [/left/ig, 'right'], [/right/ig, 'left'], [/_l(?=_|$)/i, '_r'], [/_r(?=_|$)/i, '_l'],
    [/\.l$/i, '.r'], [/\.r$/i, '.l'], [/^l_/i, 'r_'], [/^r_/i, 'l_'],
  ];
  for (const [pattern, replacement] of swaps) {
    const swapped = name.replace(pattern, replacement);
    if (swapped.toLowerCase() !== name.toLowerCase()) {
      const match = names.find(candidate => candidate.toLowerCase() === swapped.toLowerCase());
      if (match) return match;
    }
  }
  return name;
}

// Mirror offsets through the character's rest-space sagittal plane. Converting
// through each bone's rest basis also handles mirrored local bone axes.
export function mirrorPose(editor, pose, ids) {
  const bind = new Map(editor.reference.bindPose.map(item => [item.node, item]));
  const matrices = new Map();
  const matrix = node => {
    if (!node || node === editor.root) return new Matrix4();
    if (matrices.has(node)) return matrices.get(node);
    const transform = bind.get(node) ?? node;
    const result = matrix(node.parent).clone().multiply(new Matrix4().compose(transform.position, transform.quaternion, transform.scale));
    matrices.set(node, result); return result;
  };
  const entries = [...editor.bones], names = entries.map(([, bone]) => bone.name);
  const result = structuredClone(pose), changed = [];
  for (const id of ids) {
    const bone = editor.bones.get(id), transform = pose[id] ?? neutralTransform();
    const targetName = oppositeName(bone.name, names), [targetId, target] = entries.find(([, candidate]) => candidate.name === targetName);
    const fromRotation = new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(matrix(bone)));
    const toRotation = new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(matrix(target)));
    const rotation = fromRotation.clone().multiply(new Quaternion().fromArray(transform.rotation)).multiply(fromRotation.clone().invert());
    rotation.y *= -1; rotation.z *= -1;
    rotation.premultiply(toRotation.clone().invert()).multiply(toRotation).normalize();
    const origin = new Vector3().applyMatrix4(matrix(bone.parent));
    const position = new Vector3().fromArray(transform.position).applyMatrix4(matrix(bone.parent)).sub(origin);
    position.x *= -1;
    const targetParent = matrix(target.parent), targetOrigin = new Vector3().applyMatrix4(targetParent);
    position.add(targetOrigin).applyMatrix4(targetParent.clone().invert());
    result[targetId] = { position: position.toArray(), rotation: rotation.toArray() }; changed.push(targetId);
  }
  return { pose: result, ids: changed };
}

export class PoseTools {
  constructor(container, api) {
    this.api = api; this.clipboard = null;
    container.innerHTML = `<div class="section-heading"><h2>Pose workshop</h2><span id="pose-scope-count"></span></div>
      <div id="joint-numbers" class="joint-numbers">${['p', 'r'].map(kind => `<div class="object-transform"><h3>${kind === 'p' ? 'Local offset (rig units)' : 'Rotation offset (°)'}</h3><div class="xyz-fields">${['x', 'y', 'z'].map(axis => `<label>${axis.toUpperCase()}<input type="number" step="${kind === 'p' ? '0.01' : '1'}" data-pose-channel="${kind + axis}" aria-label="Joint ${kind === 'p' ? 'position' : 'rotation'} ${axis.toUpperCase()}"></label>`).join('')}</div></div>`).join('')}</div>
      <label class="field">Pose scope<select id="pose-scope"><option value="joint">Selected joint</option><option value="branch">Joint and children</option><option value="whole">Whole pose</option></select></label>
      <div class="compact-actions"><button class="button small" id="copy-pose">Copy pose</button><button class="button small" id="paste-pose">Paste pose</button><button class="button small" id="mirror-pose">Mirror pose</button><button class="button small" id="reset-pose">Reset offsets</button></div>
      <details class="pose-library-details"><summary>Pose library</summary>
      <label class="field">Pose name<input id="pose-preset-name" maxlength="80" placeholder="Relaxed hand"></label>
      <button class="button small full-width" id="save-pose-preset">Save pose to library</button>
      <label class="field">Personal pose library<select id="pose-preset"></select></label>
      <div class="compact-actions"><button class="button small" id="apply-pose-preset">Apply pose</button><button class="button small" id="remove-pose-preset">Remove preset</button></div>
      </details><p class="subtle">Select a hand and its children to include fingers. With source motion, these tools edit offsets over the original animation.</p>`;
    this.container = container;
    this.$ = id => document.getElementById(id);
    this.$('joint-search').addEventListener('input', () => this.filterJoints());
    this.$('pose-scope').addEventListener('change', () => this.refresh());
    for (const input of container.querySelectorAll('[data-pose-channel]')) input.addEventListener('change', () => {
      if (!Number.isFinite(input.valueAsNumber) || !this.api.canEdit()) return;
      const id = this.state.target; if (!this.state.editor.bones.has(id)) return;
      const pose = structuredClone(api.getPose());
      pose[id] = withChannelValue(pose[id] ?? neutralTransform(), input.dataset.poseChannel, input.valueAsNumber);
      api.authorPose(pose, [id]);
    });
    this.$('copy-pose').addEventListener('click', () => {
      this.clipboard = { rig: rigSignature(this.state.editor), pose: namedPose(this.state.editor, api.getPose(), this.ids) };
      this.refresh(); api.toast('Pose copied.');
    });
    this.$('paste-pose').addEventListener('click', () => this.apply(this.clipboard));
    this.$('mirror-pose').addEventListener('click', () => {
      if (!api.canEdit()) return;
      const result = mirrorPose(this.state.editor, api.getPose(), this.ids); api.authorPose(result.pose, result.ids);
    });
    this.$('reset-pose').addEventListener('click', () => {
      if (!api.canEdit()) return;
      const pose = structuredClone(api.getPose()), ids = this.ids;
      ids.forEach(id => { pose[id] = neutralTransform(); }); api.authorPose(pose, ids);
    });
    this.$('save-pose-preset').addEventListener('click', () => {
      if (!api.canEdit() || !this.ids.length) return;
      if (this.state.poseLibrary.length >= 1000) { api.toast('The pose library is full. Save a project backup before removing presets.'); return; }
      const item = { id: crypto.randomUUID(), name: this.$('pose-preset-name').value.trim() || 'Pose ' + (this.state.poseLibrary.length + 1),
        rig: rigSignature(this.state.editor), pose: namedPose(this.state.editor, api.getPose(), this.ids) };
      this.state.poseLibrary = [...this.state.poseLibrary, item];
      this.$('pose-preset-name').value = ''; api.saveLibrary(); this.refresh(); this.$('pose-preset').value = item.id;
    });
    this.$('apply-pose-preset').addEventListener('click', () => this.apply(this.state.poseLibrary.find(item => item.id === this.$('pose-preset').value)));
    this.$('remove-pose-preset').addEventListener('click', () => {
      const id = this.$('pose-preset').value;
      const removed = this.state.poseLibrary.find(item => item.id === id);
      this.state.poseLibrary = this.state.poseLibrary.filter(item => item.id !== id); api.saveLibrary(); this.refresh();
      if (removed) api.toast('Pose preset removed.', { label: 'Undo', run: () => {
        if (!this.state.poseLibrary.some(item => item.id === removed.id)) this.state.poseLibrary.push(removed);
        api.saveLibrary(); this.refresh();
      } });
    });
  }

  get state() { return this.api.getState(); }
  get ids() { return scopedJoints(this.state.editor, this.state.target, this.$('pose-scope').value); }

  apply(item) {
    if (!item || !this.api.canEdit()) return;
    if (item.rig !== rigSignature(this.state.editor)) { this.api.toast('Choose a pose saved with this rig.'); return; }
    const result = applyNamedPose(this.state.editor, this.api.getPose(), item.pose);
    this.api.authorPose(result.pose, result.ids);
  }

  filterJoints() {
    if (!this.state.editor) return;
    const query = this.$('joint-search').value.trim().toLowerCase();
    const options = [new Option('Whole character', 'character')];
    for (const [id, bone] of this.state.editor.bones) {
      const name = bone.name.replace(/^mixamorig[:_]?/i, '').replaceAll('_', ' ');
      if (id === this.state.target || !query || name.toLowerCase().includes(query)) options.push(new Option(name, id));
    }
    for (const prop of this.state.props) if (!query || prop.name.toLowerCase().includes(query)) options.push(new Option(prop.name + ' · object', 'prop:' + prop.id));
    this.$('joint').replaceChildren(...options); this.$('joint').value = this.state.target;
  }

  refresh() {
    if (!this.state.editor) return;
    this.filterJoints();
    const id = this.state.target, available = this.api.canEdit(), joint = this.state.editor.bones.has(id);
    this.$('joint-numbers').hidden = !joint;
    const transform = this.api.getPose()[id] ?? neutralTransform();
    for (const input of this.container.querySelectorAll('[data-pose-channel]')) {
      if (document.activeElement !== input) input.value = Number(channelValue(transform, input.dataset.poseChannel).toFixed(4));
      input.disabled = !available || !joint;
    }
    const current = this.$('pose-preset').value, signature = rigSignature(this.state.editor);
    const items = this.state.poseLibrary.filter(item => item.rig === signature);
    this.$('pose-preset').replaceChildren(...items.map(item => new Option(item.name, item.id)));
    if (!items.length) this.$('pose-preset').append(new Option('No poses saved for this rig', ''));
    else if (items.some(item => item.id === current)) this.$('pose-preset').value = current;
    this.$('pose-scope-count').textContent = this.ids.length + (this.ids.length === 1 ? ' joint' : ' joints');
    for (const button of this.container.querySelectorAll('button')) button.disabled = !available || !this.ids.length;
    this.$('paste-pose').disabled = !available || this.clipboard?.rig !== signature;
    this.$('apply-pose-preset').disabled = this.$('remove-pose-preset').disabled = !available || !items.length;
  }
}
