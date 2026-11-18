import { Vector3, Quaternion, MathUtils } from 'three';
import { loadCharacter } from './reference.js';
import { PoseAnimation } from './animation-editor.js';
import { samplePoseKeys, restorePoseKeys } from './pose-keys.js';
import { restoreJointTracks } from './joint-tracks.js';
import { restoreContacts } from './ik.js';
import { objectLibrary, restoreSceneObjects } from './scene-objects.js';
import { JointTimeline } from './joint-timeline.js';
import { MotionAnalysis } from './motion-analysis.js';
import { icon } from './icons.js';

const $ = id => document.getElementById(id);
export const defaultAnalysis = () => ({ ghosts: false, paths: false, offset: 5, ghostSource: 'work', rangeOnly: false });
export function restoreTraining(value, frames) {
  const start = Math.max(0, Math.min(frames - 1, Math.round(Number(value?.start) || 0)));
  return { start, end: Math.max(start + 1, Math.min(frames, Math.round(Number(value?.end) || frames))),
    loop: Boolean(value?.loop), hideReference: Boolean(value?.hideReference), compare: value?.compare ?? 'original' };
}

export function restoreStudioData(record, editor, frames) {
  return {
    tracks: restoreJointTracks(record.tracks, frames, editor.bones.keys()),
    contacts: restoreContacts(record.contacts, frames, editor.ikChains), props: restoreSceneObjects(record.props),
    analysis: { ...defaultAnalysis(), ...record.analysis, offset: Math.max(1, Math.min(120, Number(record.analysis?.offset) || 5)) },
    training: restoreTraining(record.training, frames), notes: String(record.notes ?? '').slice(0, 6000),
    takes: (Array.isArray(record.takes) ? record.takes : []).filter(take => Number.isFinite(take.frames) && take.frames > 0).map(take => ({
      ...take, keys: restorePoseKeys(take.keys, take.frames, editor.bones.keys()),
      tracks: restoreJointTracks(take.tracks, take.frames, editor.bones.keys()),
      contacts: restoreContacts(take.contacts, take.frames, editor.ikChains), props: restoreSceneObjects(take.props),
    })),
    sceneSnap: record.sceneSnap !== false,
  };
}

export class StudioTools {
  constructor(stage, api) {
    this.stage = stage; this.api = api; this.comparisonRequest = 0;
    this.mount();
    this.timeline = new JointTimeline($('advanced-timeline'), api);
    this.motion = new MotionAnalysis(stage, () => this.state, () => api.draw(), frame => this.sampleSource(frame));
    stage.beforeRender = () => this.motion.update();
  }

  get state() { return this.api.getState(); }

  mount() {
    $('ik-tools').innerHTML = `
      <div class="section-heading"><h2>IK & contacts</h2><span id="ik-status"></span></div>
      <label class="field">Pose mode<select id="pose-mode"><option value="fk">FK · rotate joints</option><option value="ik">IK · reach with hands & feet</option></select></label>
      <label class="field">Limb<select id="ik-limb" aria-label="IK limb"></select></label>
      <p class="subtle">In IK mode, move the target to pose the whole limb. Bone lengths stay fixed.</p>
      <div class="compact-actions"><button class="button small" id="ik-focus">Focus joint</button><button class="button small" id="ik-flip">Flip bend</button></div>
      <div class="timing-fields"><label class="field">Contact from<input id="contact-from" type="number" min="0" value="0" step="1"></label><label class="field">To frame<input id="contact-to" type="number" min="0" value="60" step="1"></label></div>
      <button class="button full-width" id="pin-contact">Pin current hand / foot</button>
      <div class="contact-list" id="contact-list"></div>`;
    $('scene-tools').innerHTML = `
      <div class="section-heading"><h2>Scene objects</h2><span id="scene-count">0</span></div>
      <button class="button primary full-width" id="object-library-open">Open object library</button>
      <p class="subtle">Add an obstacle, then drag its gizmo. Objects use metres and are saved with this take.</p>
      <label class="checkbox-row"><input type="checkbox" id="object-snap" checked>Snap objects · 10 cm / 15°</label>
      <label class="field">Selected object<select id="scene-object-select" aria-label="Scene object"></select></label>
      <div id="object-properties" hidden>
        <label class="field">Object name<input id="object-name" type="text" maxlength="80"></label>
        ${[['position', 'Position (m)', 0.1], ['rotation', 'Rotation (°)', 15], ['size', 'Dimensions (m)', 0.1]].map(([kind, label, step]) => `<div class="object-transform"><h3>${label}</h3><div class="xyz-fields">${['x', 'y', 'z'].map((axis, i) => `<label>${axis.toUpperCase()}<input type="number" id="object-${kind}-${i}" data-object-component="${kind}" data-axis="${i}" step="${step}" aria-label="Object ${kind} ${axis.toUpperCase()}"></label>`).join('')}</div></div>`).join('')}
        <div class="compact-actions"><button class="button small" id="object-floor">Place on floor</button><button class="button small" id="object-focus">Focus object</button></div>
        <div class="compact-actions"><button class="button small" id="object-duplicate">Duplicate</button><button class="button small" id="object-reset">Reset transform</button><button class="button small danger-text" id="object-delete">Delete</button></div>
      </div>
      <div class="object-scene-list" id="object-scene-list"></div>
      <p class="subtle">Obstacles are placement and contact guides. Contacts are authored explicitly; there is no automatic collision simulation.</p>`;
    $('analysis-tools').innerHTML = `
      <div class="section-heading"><h2>Motion study</h2><span>Visual analysis</span></div>
      <label class="checkbox-row"><input type="checkbox" id="onion-skin">Show past & future poses</label>
      <div class="timing-fields"><label class="field">Ghosts of<select id="ghost-source"><option value="work">Your take</option><option value="reference">Reference</option><option value="both">Both</option></select></label><label class="field">Frame spacing<input type="number" id="ghost-offset" min="1" max="120" step="1" value="5"></label></div>
      <p class="ghost-legend"><span>● Past</span><span>● Future</span></p>
      <label class="checkbox-row"><input type="checkbox" id="motion-paths">Draw selected joint trajectories</label>
      <label class="checkbox-row"><input type="checkbox" id="path-range">Use the A–B range for paths</label>
      <p class="subtle">Dots mark equal time intervals. Select a wrist, foot or the hips to inspect its path.</p>
      <button class="button small full-width" id="study-focus">Focus selected joint</button>`;
    $('training-tools').innerHTML = `
      <div class="section-heading"><h2>Practice session</h2><span id="training-range-label"></span></div>
      <div class="timing-fields"><label class="field">A · first frame<input type="number" id="range-start" min="0" step="1"></label><label class="field">B · last frame<input type="number" id="range-end" min="1" step="1"></label></div>
      <div class="compact-actions"><button class="button small" id="set-range-start">Set A here</button><button class="button small" id="set-range-end">Set B here</button><button class="button small" id="reset-range">Full clip</button></div>
      <label class="checkbox-row"><input type="checkbox" id="range-loop">Loop this section</label>
      <label class="checkbox-row"><input type="checkbox" id="hide-reference">Hide reference while I try</label>
      <label class="field">Take name<input id="version-name" type="text" maxlength="80" placeholder="Take 1"></label>
      <div class="compact-actions"><button class="button small" id="save-version">Save take</button><button class="button small" id="new-attempt">New attempt</button></div>
      <label class="field">Compare against<select id="compare-take"></select></label>
      <label class="field">Saved takes<select id="load-take-select" aria-label="Saved takes"></select></label>
      <button class="button small full-width" id="load-version">Continue this take</button>
      <label class="field">My notes<textarea id="practice-notes" rows="3" maxlength="6000" placeholder="What I want to improve on my next take…"></textarea></label>`;
    const dialog = document.createElement('dialog'); dialog.id = 'object-dialog'; dialog.setAttribute('aria-labelledby', 'object-dialog-title');
    dialog.innerHTML = `<div class="dialog-heading"><div><h2 id="object-dialog-title">Add a scene object</h2><p class="subtle">Contact guides sized for a human character</p></div><button class="icon-button" aria-label="Close object library">×</button></div><div class="object-library">${objectLibrary.map(item => `<button type="button" class="object-card" data-spawn-object="${item.type}"><span class="object-card-icon">${icon('cube')}</span><strong>${item.name}</strong><small>${item.description}</small></button>`).join('')}</div>`;
    document.body.append(dialog);
    dialog.querySelector('[aria-label="Close object library"]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { const button = event.target.closest('[data-spawn-object]'); if (button) { this.addObject(button.dataset.spawnObject); dialog.close(); } });
    for (const id of ['add-object', 'object-library-open']) $(id).addEventListener('click', () => { if (this.api.canEdit()) dialog.showModal(); });
    for (const button of document.querySelectorAll('[data-inspector-tab]')) button.addEventListener('click', () => this.activateTab(button.dataset.inspectorTab));
    for (const button of document.querySelectorAll('[data-timeline-mode]')) button.addEventListener('click', () => {
      this.timeline.setMode(button.dataset.timelineMode);
      requestAnimationFrame(() => { this.stage.resize(); this.stage.invalidate(); });
    });
    $('pose-mode').addEventListener('change', () => {
      this.stage.setPoseMode($('pose-mode').value);
      if ($('pose-mode').value === 'ik') this.selectLimb();
    });
    $('ik-limb').addEventListener('change', () => this.selectLimb());
    $('ik-focus').addEventListener('click', () => this.stage.focusSelected());
    $('ik-flip').addEventListener('click', () => this.flipBend());
    $('pin-contact').addEventListener('click', () => this.pinContact());
    $('contact-list').addEventListener('click', event => { const button = event.target.closest('[data-remove-contact]'); if (button) this.api.commit(() => { this.state.contacts = this.state.contacts.filter(item => item.id !== button.dataset.removeContact); }); });
    $('object-snap').addEventListener('change', () => { this.state.sceneSnap = $('object-snap').checked; this.stage.setSnap(this.state.sceneSnap); this.api.save(); });
    $('scene-object-select').addEventListener('change', () => { if ($('scene-object-select').value) this.api.select('prop:' + $('scene-object-select').value); });
    $('object-name').addEventListener('change', () => this.editObject(item => { item.name = $('object-name').value.trim() || item.name; }));
    for (const input of $('scene-tools').querySelectorAll('[data-object-component]')) input.addEventListener('change', () => {
      const value = input.valueAsNumber, axis = Number(input.dataset.axis), kind = input.dataset.objectComponent;
      if (!Number.isFinite(value)) return;
      this.editObject(item => {
        if (kind === 'position') item.position[axis] = MathUtils.clamp(value, -100, 100);
        else if (kind === 'rotation') item.rotation[axis] = MathUtils.degToRad(value);
        else item.scale[axis] = MathUtils.clamp(value / objectLibrary.find(source => source.type === item.type).size[axis], 0.05, 30);
      });
    });
    $('object-floor').addEventListener('click', () => this.editObject(item => {
      item.position[1] = this.stage.sceneObjects.floorPosition(item.id);
    }));
    $('object-focus').addEventListener('click', () => this.stage.focusSelected());
    $('object-duplicate').addEventListener('click', () => this.duplicateObject());
    $('object-reset').addEventListener('click', () => this.editObject(item => { item.position = [0, 0, 0]; item.rotation = [0, 0, 0]; item.scale = [1, 1, 1]; }));
    $('object-delete').addEventListener('click', () => this.deleteObject());
    $('object-scene-list').addEventListener('click', event => { const button = event.target.closest('[data-scene-object]'); if (button) this.api.select('prop:' + button.dataset.sceneObject); });
    for (const id of ['onion-skin', 'ghost-source', 'ghost-offset', 'motion-paths', 'path-range']) $(id).addEventListener('change', () => {
      this.state.analysis = { ghosts: $('onion-skin').checked, paths: $('motion-paths').checked,
        ghostSource: $('ghost-source').value, offset: Math.max(1, Math.min(120, Number($('ghost-offset').value) || 5)), rangeOnly: $('path-range').checked };
      this.motion.invalidate(); this.api.save();
    });
    $('study-focus').addEventListener('click', () => this.stage.focusSelected());
    for (const id of ['range-start', 'range-end']) $(id).addEventListener('change', () => this.setRange(Number($('range-start').value), Number($('range-end').value)));
    $('set-range-start').addEventListener('click', () => this.setRange(Math.round(this.state.frame), this.state.training.end));
    $('set-range-end').addEventListener('click', () => this.setRange(this.state.training.start, Math.round(this.state.frame)));
    $('reset-range').addEventListener('click', () => this.setRange(0, this.state.frames, false));
    $('range-loop').addEventListener('change', () => { this.state.training.loop = $('range-loop').checked; this.api.save(); });
    $('hide-reference').addEventListener('change', () => { this.state.training.hideReference = $('hide-reference').checked; this.api.comparisonChanged(); this.api.save(); });
    $('save-version').addEventListener('click', () => this.saveTake());
    $('new-attempt').addEventListener('click', () => this.newAttempt());
    $('compare-take').addEventListener('change', () => void this.compareTake($('compare-take').value));
    $('load-version').addEventListener('click', () => this.loadTake($('load-take-select').value));
    $('practice-notes').addEventListener('input', () => { this.state.notes = $('practice-notes').value; this.api.save(); });
  }

  activateTab(tab) {
    for (const button of document.querySelectorAll('[data-inspector-tab]')) button.setAttribute('aria-pressed', button.dataset.inspectorTab === tab);
    for (const panel of document.querySelectorAll('[data-inspector-panel]')) panel.hidden = panel.dataset.inspectorPanel !== tab;
    document.querySelector('.inspector-scroll').scrollTop = 0;
  }

  releaseRuntime() {
    this.comparisonRequest++; this.motion.runtimeChanged();
    this.stage.setComparisonTake(null);
    this.comparison?.editor.dispose(); this.comparison = null;
  }

  bindRuntime() {
    this.objectStamp = ''; this.stage.setPoseMode('fk');
    $('pose-mode').value = 'fk';
    $('contact-from').value = 0; $('contact-to').value = this.state.frames;
    this.motion.runtimeChanged(); this.activateTab('pose'); this.refresh();
    if (!['original', 'none'].includes(this.state.training.compare)) void this.compareTake(this.state.training.compare, true);
    this.api.comparisonChanged();
  }

  refresh() {
    const state = this.state; if (!state.editor) return;
    const stamp = JSON.stringify(state.props);
    if (stamp !== this.objectStamp) { this.stage.syncObjects(state.props); this.objectStamp = stamp; }
    this.stage.setSnap(state.sceneSnap);
    this.renderIK(); this.renderScene(); this.renderStudy(); this.timeline.refresh();
    this.motion.invalidate();
  }

  onSelection() {
    if (this.state.target.startsWith('prop:')) this.activateTab('scene');
    const chain = [...this.state.editor.ikChains.values()].find(item => item.ids.includes(this.state.target));
    if (chain) $('ik-limb').value = chain.id;
    this.renderScene(); this.timeline.refresh(); this.motion.invalidate();
  }

  selectLimb() {
    const chain = this.state.editor.ikChains.get($('ik-limb').value); if (!chain) return;
    $('pose-mode').value = 'ik'; this.stage.setPoseMode('ik');
    this.api.select(chain.ids[2]); this.api.setTool('translate');
  }

  renderIK() {
    const chains = [...this.state.editor.ikChains.values()], current = $('ik-limb').value;
    $('ik-limb').replaceChildren(...chains.map(chain => new Option(chain.label, chain.id, false, chain.id === current)));
    $('ik-status').textContent = chains.length ? chains.length + ' limbs' : 'No matching limb chains';
    for (const id of ['pose-mode', 'ik-limb', 'ik-flip', 'pin-contact']) $(id).disabled = !chains.length;
    $('contact-from').max = $('contact-to').max = this.state.frames;
    const list = this.state.contacts.map(contact => {
      const row = document.createElement('div'); row.className = 'contact-item';
      const text = document.createElement('span'); text.textContent = (this.state.editor.ikChains.get(contact.chain)?.label ?? contact.chain) + ' · ' + contact.from + '–' + contact.to;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-button';
      remove.textContent = '×'; remove.dataset.removeContact = contact.id; remove.setAttribute('aria-label', 'Release ' + text.textContent);
      row.append(text, remove); return row;
    });
    $('contact-list').replaceChildren(...list);
  }

  pinContact() {
    const state = this.state, chain = state.editor.ikChains.get($('ik-limb').value);
    if (!chain || !this.api.canEdit()) return;
    if (state.editor.sourceMode === 'clip' && this.stage.options.lockRoot) {
      $('root-motion').checked = true;
      this.api.comparisonChanged();
    }
    this.api.draw();
    const position = state.editor.root.worldToLocal(chain.end.getWorldPosition(new Vector3()));
    const rotation = state.editor.root.getWorldQuaternion(new Quaternion()).invert().multiply(chain.end.getWorldQuaternion(new Quaternion()));
    const from = Math.max(0, Math.min(state.frames, Math.round(Number($('contact-from').value) || 0)));
    const to = Math.max(from, Math.min(state.frames, Math.round(Number($('contact-to').value) || state.frames)));
    this.api.commit(() => {
      state.contacts = state.contacts.filter(item => item.chain !== chain.id || item.to < from || item.from > to);
      state.contacts.push({ id: crypto.randomUUID(), chain: chain.id, position: position.toArray(), rotation: rotation.toArray(), from, to, bend: 0 });
    });
    this.api.toast(chain.label + ' contact pinned for frames ' + from + '–' + to + '.');
  }

  flipBend() {
    const chain = this.state.editor.ikChains.get($('ik-limb').value); if (!chain || !this.api.canEdit()) return;
    this.api.draw();
    const position = chain.end.getWorldPosition(new Vector3()), pole = chain.middle.getWorldPosition(new Vector3());
    this.state.editor.solveIK(chain.id, position, { pole, bend: Math.PI });
    const pose = this.state.editor.captureBones(chain.ids, samplePoseKeys(this.state.keys, this.state.frame, this.state.tracks));
    this.api.authorPose(pose, chain.ids);
  }

  get selectedObject() { return this.state.props.find(item => 'prop:' + item.id === this.state.target); }

  addObject(type) {
    if (!this.api.canEdit() || this.state.props.length >= 80) return;
    const source = objectLibrary.find(item => item.type === type), id = crypto.randomUUID();
    const item = { id, type, name: source.name, position: this.stage.spawnPosition(this.state.props.length), rotation: [0, 0, 0], scale: [1, 1, 1] };
    this.api.commit(() => { this.state.props = [...this.state.props, item]; });
    this.api.select('prop:' + id); this.api.setTool('translate');
    this.stage.frameScene();
  }

  editObject(change) {
    const selected = this.selectedObject; if (!selected) return;
    this.api.commit(() => { this.state.props = this.state.props.map(item => { if (item.id !== selected.id) return item; const result = structuredClone(item); change(result); return result; }); });
  }

  duplicateObject() {
    const source = this.selectedObject; if (!source || this.state.props.length >= 80) return false;
    const copy = structuredClone(source); copy.id = crypto.randomUUID(); copy.name += ' copy'; copy.position[0] += 0.3; copy.position[2] += 0.3;
    this.api.commit(() => { this.state.props = [...this.state.props, copy]; }); this.api.select('prop:' + copy.id); return true;
  }

  deleteObject() {
    const source = this.selectedObject; if (!source) return false;
    this.api.commit(() => { this.state.props = this.state.props.filter(item => item.id !== source.id); });
    this.api.select('character'); return true;
  }

  captureObjectDrag(id) {
    const value = this.stage.sceneObjects.read(id.slice(5)); if (!value) return;
    this.state.props = this.state.props.map(item => item.id === id.slice(5) ? { ...item, ...value } : item);
    this.renderSceneFields();
  }

  renderSceneFields() {
    const item = this.selectedObject; $('object-properties').hidden = !item;
    if (!item) return;
    $('object-name').value = item.name;
    const size = objectLibrary.find(source => source.type === item.type).size;
    for (let i = 0; i < 3; i++) {
      $('object-position-' + i).value = Number(item.position[i].toFixed(3));
      $('object-rotation-' + i).value = Number(MathUtils.radToDeg(item.rotation[i]).toFixed(2));
      $('object-size-' + i).value = Number((size[i] * item.scale[i]).toFixed(3));
    }
  }

  renderScene() {
    const state = this.state;
    $('scene-count').textContent = state.props.length;
    $('object-snap').checked = state.sceneSnap;
    $('scene-object-select').replaceChildren(...state.props.map(item => new Option(item.name, item.id, false, 'prop:' + item.id === state.target)));
    if (!state.props.length) $('scene-object-select').append(new Option('No scene objects yet', ''));
    this.renderSceneFields();
    $('object-scene-list').replaceChildren(...state.props.map(item => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'scene-object-row' + ('prop:' + item.id === state.target ? ' selected' : '');
      button.dataset.sceneObject = item.id; button.textContent = item.name; return button;
    }));
  }

  renderStudy() {
    const state = this.state;
    $('onion-skin').checked = state.analysis.ghosts; $('motion-paths').checked = state.analysis.paths;
    $('ghost-source').value = state.analysis.ghostSource; $('ghost-offset').value = state.analysis.offset; $('path-range').checked = state.analysis.rangeOnly;
    $('range-start').value = state.training.start; $('range-end').value = state.training.end;
    $('range-start').max = state.frames - 1; $('range-end').max = state.frames;
    $('range-loop').checked = state.training.loop; $('hide-reference').checked = state.training.hideReference;
    $('practice-notes').value = state.notes;
    $('version-name').placeholder = 'Take ' + (state.takes.length + 1);
    const versions = state.takes;
    $('compare-take').replaceChildren(new Option('Original reference', 'original'), new Option('No comparison', 'none'),
      ...versions.map(take => new Option(this.takeLabel(take), take.id)));
    $('compare-take').value = state.training.compare;
    const selected = $('load-take-select').value;
    $('load-take-select').replaceChildren(...versions.map(take => new Option(this.takeLabel(take), take.id, false, take.id === selected)));
    if (!versions.length) $('load-take-select').append(new Option('No saved takes yet', ''));
    $('load-version').disabled = !versions.length;
    this.updateFrame(state.frame);
  }

  setRange(start, end, loop = true) {
    this.state.training = { ...this.state.training, ...restoreTraining({ ...this.state.training, start, end, loop }, this.state.frames) };
    this.renderStudy(); this.motion.invalidate(); this.api.save();
  }

  versionData(name) {
    const state = this.state;
    return structuredClone({ id: crypto.randomUUID(), name, createdAt: Date.now(), keys: state.keys, tracks: state.tracks,
      contacts: state.contacts, props: state.props, frames: state.frames, fps: state.fps,
      alignment: state.editor.getAlignment(), clipIndex: Math.max(0, state.editor.reference.index), sourceMode: state.editor.sourceMode, notes: state.notes });
  }

  takeLabel(take) {
    const clips = this.state.editor.reference.clips;
    return clips.length > 1 ? take.name + ' · ' + (clips[take.clipIndex]?.name || 'Clip ' + ((take.clipIndex ?? 0) + 1)) : take.name;
  }

  saveTake(quiet = false) {
    if (!this.api.canEdit()) return;
    const name = $('version-name').value.trim() || 'Take ' + (this.state.takes.length + 1);
    const take = this.versionData(name), last = this.state.takes.at(-1);
    const signature = value => JSON.stringify([value.keys, value.tracks, value.contacts, value.props, value.frames, value.fps, value.alignment, value.clipIndex, value.sourceMode, value.notes]);
    if (quiet && last && signature(take) === signature(last)) return;
    this.state.takes = [...this.state.takes, take];
    $('version-name').value = ''; this.renderStudy(); this.api.save();
    if (!quiet) this.api.toast(name + ' saved for comparison.');
  }

  newAttempt() {
    if (!this.api.canEdit()) return;
    const hadWork = this.state.keys.length || Object.keys(this.state.tracks).length || this.state.contacts.length;
    if (hadWork) this.saveTake(true);
    this.api.commit(() => { this.state.keys = []; this.state.tracks = {}; this.state.contacts = []; this.state.draft = null; this.state.frame = this.state.training.start; });
    this.api.toast(hadWork ? 'New attempt ready. The previous take is saved.' : 'Empty attempt ready.');
  }

  loadTake(id) {
    const take = this.state.takes.find(item => item.id === id); if (!take || !this.api.canEdit()) return;
    this.api.commit(() => {
      const index = Math.max(0, take.clipIndex ?? 0);
      if (this.state.editor.reference.clips.length && index !== this.state.editor.reference.index) this.state.editor.selectClip(index);
      this.state.editor.sourceMode = take.sourceMode ?? this.state.editor.sourceMode;
      if (this.state.record.originalReference && this.state.reference) {
        this.state.reference.clip.select(index); this.stage.resetReferenceOrigin();
      }
      Object.assign(this.state, structuredClone({ keys: take.keys, tracks: take.tracks, contacts: take.contacts, props: take.props, frames: take.frames, fps: take.fps, notes: take.notes ?? '' }), { draft: null, frame: 0 });
      this.state.editor.setAlignment(take.alignment);
      this.state.training = restoreTraining(this.state.training, this.state.frames);
    });
    this.api.contextChanged(); this.api.toast(take.name + ' opened for editing. Undo restores the previous motion.');
  }

  async compareTake(id, preserveVisibility = false) {
    const state = this.state, request = ++this.comparisonRequest;
    state.training.compare = id;
    if (id !== 'none' && !preserveVisibility) { state.training.hideReference = false; $('hide-reference').checked = false; }
    if (id === 'original' || id === 'none') {
      this.motion.runtimeChanged(); this.stage.setComparisonTake(null); this.comparison?.editor.dispose(); this.comparison = null;
      this.api.comparisonChanged(); this.api.save(); return;
    }
    const take = state.takes.find(item => item.id === id); if (!take) return;
    try {
      const reference = await loadCharacter(state.record.assetBlob, take.clipIndex);
      if (request !== this.comparisonRequest) { reference.dispose(); return; }
      const editor = new PoseAnimation(reference, take.sourceMode, take.alignment);
      editor.tracks = take.tracks; editor.contacts = take.contacts;
      editor.sample(take.keys, state.frame / state.frames * take.frames, take.frames);
      const previous = this.comparison;
      this.motion.runtimeChanged(); this.comparison = { editor, take };
      this.stage.setComparisonTake(editor); previous?.editor.dispose();
      this.api.comparisonChanged(); this.api.save();
    } catch (error) { if (request === this.comparisonRequest) { state.training.compare = 'original'; this.renderStudy(); this.api.toast('This saved take could not be opened for comparison.'); } }
  }

  sampleSource(frame = this.state.frame) {
    if (this.comparison) {
      const { editor, take } = this.comparison;
      editor.sample(take.keys, frame / this.state.frames * take.frames, take.frames);
    } else if (this.state.reference) this.state.reference.clip.sample(frame / this.state.frames * this.state.reference.clip.duration);
  }

  sampleComparison() {
    if (this.comparison) this.sampleSource();
  }

  hasComparison() { return Boolean(this.comparison || this.state.reference) && this.state.training.compare !== 'none' && !this.state.training.hideReference; }
  comparisonLabel() { return this.comparison ? this.comparison.take.name.toUpperCase() : 'REFERENCE'; }

  updateFrame(frame) {
    this.timeline?.updateFrame(frame);
    $('training-range-label').textContent = (this.state.training.end - this.state.training.start) / this.state.fps < 10
      ? ((this.state.training.end - this.state.training.start) / this.state.fps).toFixed(2) + ' s' : 'A–B';
  }

  updateEnabled(enabled, loading) {
    for (const input of document.querySelectorAll('#scene-tools input, #scene-tools select, #scene-tools button, #ik-tools button, #ik-tools input, #ik-tools select, .joint-timeline-toolbar button, .joint-timeline-toolbar select, .curve-key-fields input, .timeline-batch-toolbar button, .timeline-batch-toolbar input, #save-version, #new-attempt, #load-version, #version-name')) input.disabled = !enabled;
    for (const button of document.querySelectorAll('#add-object, [data-timeline-mode]')) button.disabled = loading;
    if (enabled) {
      const available = this.state.editor?.ikChains.size;
      for (const id of ['pose-mode', 'ik-limb', 'ik-flip', 'pin-contact']) $(id).disabled = !available;
      $('load-version').disabled = !$('load-take-select').value;
      this.timeline.updateFields();
      this.timeline.updateBatch();
    }
  }
}
