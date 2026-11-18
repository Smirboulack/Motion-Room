import { Quaternion, Euler, Box3 } from 'three';
import { Stage } from './stage.js';
import { icon, mountIcons } from './icons.js';
import { loadCharacter, loadReference, referenceSeconds } from './reference.js';
import { PoseAnimation, retimeKeys } from './animation-editor.js';
import { samplePoseKeys, restorePoseKeys, writePoseKey } from './pose-keys.js';
import { studies, groups } from './practice-library.js';
import { productionReferences } from './reference-catalog.js';
import { readReference, saveReference } from './reference-store.js';
import { journalTake, recoverTake, confirmTake } from './take-journal.js';
import { StudioTools, restoreStudioData, defaultAnalysis, restoreTraining } from './studio-tools.js';
import { retimeTracks, writeJointKey } from './joint-tracks.js';
import { packProject, unpackProject, projectFilename } from './project-file.js';
import { SaveQueue } from './persistence.js';
import { captureEdit, rememberEdit, travelHistory } from './edit-history.js';
import { ProjectManager } from './project-manager.js';
import { PoseTools, restorePoseLibrary } from './pose-tools.js';
import { MediaReference, restoreMediaSettings } from './media-reference.js';
import { WorkspaceLayout } from './workspace-layout.js';
import { WorkspaceExports, downloadBlob } from './workspace-exports.js';

const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const storageKey = 'motion-room-practice-v2';
const readPreferences = key => {
  try { return JSON.parse(localStorage.getItem(key)) ?? {}; } catch { return {}; }
};
const previous = readPreferences('motion-room-ateliers-v1');
const saved = readPreferences(storageKey);
const profile = {
  projects: (saved.projects ?? previous.projects ?? []).filter(item => typeof item?.id === 'string' && typeof item.name === 'string'),
  trash: (saved.trash ?? []).filter(item => typeof item?.id === 'string' && typeof item.name === 'string'),
  studyId: studies.some(item => item.id === (saved.studyId ?? previous.lesson)) ? saved.studyId ?? previous.lesson : 'regard',
  projectId: saved.projectId ?? previous.projectId,
  autoKey: saved.autoKey !== false,
};
const state = {
  kind: 'practice', id: profile.studyId, name: '', studyId: profile.studyId,
  keys: [], draft: null, frame: 0, frames: 60, fps: 30,
  playing: false, loop: true, speed: 1, target: 'character',
  layout: ['side', 'overlay', 'solo'].includes(saved.layout) ? saved.layout : 'side',
  tool: 'rotate', space: 'world', skeleton: true,
  reference: null, editor: null, loading: true, exporting: false,
  referenceFrame: null, undo: [], redo: [], record: null,
  tracks: {}, contacts: [], props: [], analysis: defaultAnalysis(),
  training: restoreTraining(null, 60), notes: '', takes: [], sceneSnap: true,
  mediaBlob: null, mediaReference: null, poseLibrary: [],
};
let stage, recorder, studio, poseTools, media, layout, workspaceExports, catalog, toolSnapshot, toastTimer, dragSnapshot;
let operation = 0;
let profileStorage = true;
let saveState = 'saved';
let saveError = null;
let poseDirty = true;
let lastFrame = -1;
const session = new Map();
const frameNumber = () => Math.round(state.frame);
const busy = () => state.exporting || Boolean(recorder?.busy) || Boolean(stage?.gizmo.dragging) || Boolean(stage?.externalEditing);
const canEdit = () => Boolean(state.editor) && !state.playing && !state.loading && !busy();
const keyAtCursor = () => state.tracks[state.target]?.find(key => key.frame === frameNumber()) ?? state.keys.find(key => key.frame === frameNumber());
const recordKey = record => record.kind === 'library' ? 'pose-library-v1' : record.kind === 'practice' ? 'practice-v2:' + record.id : 'project:' + record.id;
const sessionKey = (kind, id) => kind + ':' + id;
const currentDraft = () => state.draft?.frame === frameNumber() ? state.draft.pose : null;
const currentPose = () => currentDraft() ?? samplePoseKeys(state.keys, state.frame, state.tracks);
const keyCount = () => state.keys.length + Object.values(state.tracks).reduce((total, track) => total + track.length, 0);
const study = () => studies.find(item => item.id === state.studyId);
const fileTitle = file => (file.name ?? 'Imported animation').replace(/\.(glb|fbx)$/i, '');

const persistence = new SaveQueue({
  write: record => saveReference(recordKey(record), record),
  journal: record => { if (record.kind !== 'library') journalTake(localStorage, record); },
  confirm: record => { if (record.kind !== 'library') confirmTake(localStorage, record); },
  onStatus(status, error) { saveState = status; saveError = error; updateSaveStatus(); },
});

function tell(message, action = null) {
  const text = document.createElement('span');
  text.textContent = message;
  $('toast').replaceChildren(text);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', action.run, { once: true });
    $('toast').append(button);
  }
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, action ? 10000 : 4500);
}

function updateSaveStatus() {
  $('save-label').textContent = !profileStorage ? 'Project list not saved' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved locally';
  $('save-status').classList.toggle('unavailable', !profileStorage || saveState === 'error');
  $('save-status').title = saveError?.message ?? '';
  $('retry-save').hidden = profileStorage && saveState !== 'error';
}

function persistPreferences() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      ...profile, layout: state.layout, workspace: state.kind,
    }));
    profileStorage = true;
  } catch { profileStorage = false; }
  updateSaveStatus();
}

function captureRecord() {
  if (!state.record || !state.editor) return null;
  return {
    ...state.record, schema: 2, kind: state.kind, id: state.id, name: state.name,
    savedAt: Date.now(), editRevision: crypto.randomUUID(),
    studyId: state.studyId, poses: state.keys, draft: state.draft,
    frames: state.frames, fps: state.fps, cursor: frameNumber(),
    alignment: state.editor.getAlignment(),
    assetBlob: state.record.assetBlob, clipIndex: state.editor.reference.index,
    referenceBlob: state.reference?.blob ?? null,
    referenceName: state.reference?.name,
    referenceIndex: state.reference?.clip.index ?? 0,
    referenceDefaultIndex: state.reference?.defaultIndex ?? 0,
    referenceSource: state.reference?.source ?? null,
    tracks: state.tracks, contacts: state.contacts, props: state.props, analysis: state.analysis,
    training: state.training, notes: state.notes, takes: state.takes, sceneSnap: state.sceneSnap,
    rootMotion: $('root-motion').checked, layout: state.layout,
    mediaBlob: state.mediaBlob, mediaReference: state.mediaReference, poseLibrary: state.poseLibrary,
  };
}

function writeRecord(record) { return persistence.save(record); }
function flushSave() { return persistence.flush(); }
function queueSave() {
  const record = captureRecord();
  if (!record) return;
  session.set(sessionKey(record.kind, record.id), record);
  persistence.enqueue(record);
}
function savePoseLibrary() {
  persistence.enqueue({ kind: 'library', id: 'poses', items: state.poseLibrary });
  queueSave();
}

function setLibraryOpen(open) {
  $('studio').classList.toggle('library-open', open);
  $('library-toggle').setAttribute('aria-expanded', open);
}

function renderLibrary() {
  $('motion-library').innerHTML = groups.map(group => `
    <section class="library-group"><h3>${group.name}</h3>
      ${studies.filter(item => item.group === group.id).map(item => `
        <button type="button" class="motion" data-study="${item.id}">
          <span class="motion-icon">${icon(item.icon)}</span>
          <span class="motion-name"><strong>${item.title}</strong><small>${item.skill}</small></span>
        </button>`).join('')}
    </section>`).join('');
}

function renderProjects() { catalog.render(); }
function setWorkspaceTab(tab) { catalog.setTab(tab); }

function sourceInfo(blob, asset, record, source = null) {
  return {
    blob, clip: asset, name: record.referenceName ?? source?.title ?? fileTitle(blob),
    source: source ?? record.referenceSource ?? null,
    defaultIndex: record.referenceDefaultIndex ?? (record.originalReference ? record.clipIndex ?? 0 : 0),
  };
}

async function fetchReference(id) {
  const descriptor = productionReferences[id];
  const response = await fetch(descriptor.url);
  if (!response.ok) throw new Error('The reference file could not be found.');
  return { blob: await response.blob(), descriptor };
}

function migrateKeys(keys, editor, frames) {
  if (!Array.isArray(keys)) return [];
  const converted = keys.filter(key => Number.isInteger(key.frame) && key.frame <= frames).map(key => {
    const pose = {};
    for (const channel of Object.keys(key.pose ?? {})) {
      const index = channel.lastIndexOf('.');
      const name = channel.slice(0, index);
      if (name === 'body' || name === 'body_rotation') continue;
      const entry = editor.bones.has(name) ? [name, editor.bones.get(name)]
        : [...editor.bones].find(([, bone]) => bone.name === name || bone.name.replace(/_\d+$/, '') === name);
      if (!entry || pose[entry[0]]) continue;
      const rotation = new Quaternion().setFromEuler(new Euler(...['x', 'y', 'z'].map(axis =>
        (key.pose[name + '.' + axis] ?? 0) * Math.PI / 180)));
      pose[entry[0]] = { position: [0, 0, 0], rotation: rotation.toArray() };
    }
    return { frame: key.frame, pose, curve: key.curve };
  });
  return restorePoseKeys(converted, frames, editor.bones.keys());
}

async function buildRuntime(record, referenceOverride = null) {
  let editor, reference;
  try {
    let assetBlob = record.assetBlob ?? record.blob;
    let refBlob = referenceOverride?.blob ?? record.referenceBlob;
    let descriptor = referenceOverride?.source ?? record.referenceSource;
    if (!assetBlob) {
      const fallback = await fetchReference(record.studyId ?? profile.studyId);
      assetBlob = fallback.blob;
      if (!refBlob) { refBlob = fallback.blob; descriptor = fallback.descriptor; }
    }
    const loaded = await Promise.allSettled([
      loadCharacter(assetBlob, record.clipIndex ?? 0),
      refBlob ? loadReference(refBlob, record.referenceIndex ?? 0) : Promise.resolve(null),
    ]);
    if (loaded.some(result => result.status === 'rejected')) {
      for (const result of loaded) if (result.status === 'fulfilled') result.value?.dispose();
      throw loaded.find(result => result.status === 'rejected').reason;
    }
    const [character, animation] = loaded.map(result => result.value);
    editor = new PoseAnimation(character, record.sourceMode ?? (record.blob ? 'clip' : 'blank'), record.alignment);
    if (animation) reference = sourceInfo(refBlob, animation, record, descriptor);
    const frames = Math.max(1, Math.round(record.frames ?? (editor.duration || 3) * (record.fps ?? 30)));
    const keys = record.schema === 2 ? restorePoseKeys(record.poses, frames, editor.bones.keys())
      : migrateKeys(record.keys, editor, frames);
    return { editor, reference, keys, studioData: restoreStudioData(record, editor, frames), record: { ...record, assetBlob, frames } };
  } catch (error) {
    editor?.dispose();
    reference?.clip.dispose();
    throw error;
  }
}

function releaseActors() {
  studio?.releaseRuntime();
  stage.setActors(null, null);
  state.reference?.clip.dispose();
  state.editor?.dispose();
}

function installRuntime(runtime) {
  releaseActors();
  const { record, editor, reference, keys } = runtime;
  Object.assign(state, {
    kind: record.kind, id: record.id, studyId: record.studyId,
    name: record.name, record, editor, reference, keys,
    draft: record.draft ?? null, frames: record.frames, fps: [24, 30, 60].includes(record.fps) ? record.fps : 30,
    frame: Math.max(0, Math.min(record.frames, record.cursor ?? 0)),
    referenceFrame: null, playing: false, undo: [], redo: [], loading: false,
    ...runtime.studioData,
    mediaBlob: record.mediaBlob instanceof Blob ? record.mediaBlob : null,
    mediaReference: record.mediaBlob ? restoreMediaSettings(record.mediaReference) : null,
    poseLibrary: [...new Map([...state.poseLibrary, ...restorePoseLibrary(record.poseLibrary)].map(item => [item.id, item])).values()],
  });
  $('loading').hidden = true;
  $('root-motion').checked = record.rootMotion === undefined
    ? record.sourceMode === 'clip' && Boolean(record.contacts?.length) : Boolean(record.rootMotion);
  if (['side', 'overlay', 'solo'].includes(record.layout)) state.layout = record.layout;
  const target = [...editor.bones].find(([, bone]) => state.studyId === 'regard'
    ? /head(?:_\d+)?$/i.test(bone.name) : /(hips|pelvis)(?:_\d+)?$/i.test(bone.name));
  state.target = target?.[0] ?? 'character';
  if (state.kind === 'practice') profile.studyId = state.id;
  else profile.projectId = state.id;
  reference?.clip.sample(0);
  stage.setActors(reference?.clip ?? null, editor);
  draw();
  stage.setTarget(state.target);
  stage.setTool(state.tool, state.space);
  if (state.tool === 'scale') state.target = 'character';
  renderContext();
  studio?.bindRuntime();
  poseTools?.refresh();
  void media?.bind();
  document.querySelector('.inspector-scroll').scrollTop = 0;
  setCamera();
  setLibraryOpen(false);
  queueSave();
  persistPreferences();
}

async function loadStudy(id) {
  if (busy()) return;
  queueSave();
  flushSave();
  const request = ++operation;
  setLoading(true, 'Loading reference and character…');
  let runtime;
  try {
    let record = session.get(sessionKey('practice', id))
      ?? recoverTake(localStorage, await readReference('practice-v2:' + id).catch(() => null));
    if (!record) {
      const { blob, descriptor } = await fetchReference(id);
      const fps = 60;
      record = {
        schema: 2, kind: 'practice', id, studyId: id, name: studies.find(item => item.id === id).title + ' take',
        assetBlob: blob, assetName: descriptor.title, referenceBlob: blob,
        referenceName: descriptor.title, referenceSource: descriptor,
        sourceMode: descriptor.scene ? 'clip' : 'blank', fps, poses: [], characterVersion: 'reference',
        props: descriptor.scene?.props ?? [], rootMotion: Boolean(descriptor.scene),
        ...(descriptor.scene ? { layout: 'solo' } : {}),
      };
    }
    // Preserve older personal-character studies as projects before returning to the reference rig.
    if (record.customCharacter || (record.characterVersion && record.characterVersion !== 'reference')) {
      if (record.poses?.length || Object.keys(record.tracks ?? {}).length || record.draft) await registerProject({
        ...record, id: crypto.randomUUID(), kind: 'project', name: record.name + ' · saved take',
      });
      record = {
        ...record, assetBlob: record.referenceBlob, assetName: record.referenceName,
        poses: [], tracks: {}, contacts: [], takes: [], draft: null, alignment: undefined, cursor: 0,
        clipIndex: record.referenceIndex ?? 0, customCharacter: false, characterVersion: 'reference',
      };
    }
    if (request !== operation) return;
    runtime = await buildRuntime(record);
    if (request !== operation) { runtime.editor.dispose(); runtime.reference?.clip.dispose(); return; }
    installRuntime(runtime);
    return true;
  } catch (error) {
    if (request === operation) { tell(error.message); setLoading(false); }
  }
}

async function openProject(id) {
  if (busy() || catalog.busy || !profile.projects.some(project => project.id === id)) return;
  queueSave();
  flushSave();
  const request = ++operation;
  setLoading(true, 'Opening animation…');
  try {
    const record = session.get(sessionKey('project', id))
      ?? recoverTake(localStorage, await readReference('project:' + id));
    if (!record) throw new Error('The saved animation is unavailable in this browser.');
    const runtime = await buildRuntime({ ...record, kind: 'project', id });
    if (request !== operation) { runtime.editor.dispose(); runtime.reference?.clip.dispose(); return; }
    installRuntime(runtime);
  } catch (error) {
    if (request === operation) { tell(error.message); setLoading(false); }
  }
}

function setLoading(value, message = '') {
  state.loading = value;
  $('loading').hidden = !value;
  $('loading-text').textContent = message;
  updateControls();
}

function registerProject(record) { return catalog.register(record); }
function removeProject(id) { return catalog.remove(id); }
function restoreProject(id) { return catalog.restore(id); }

async function createProject(record) {
  if (busy()) return;
  queueSave();
  flushSave();
  const request = ++operation;
  setLoading(true, 'Preparing character…');
  try {
    record = { ...record, id: crypto.randomUUID(), kind: 'project', schema: 2 };
    const runtime = await buildRuntime(record);
    if (request !== operation) { runtime.editor.dispose(); runtime.reference?.clip.dispose(); return; }
    await registerProject({ ...runtime.record, poses: runtime.keys });
    if (request !== operation) { runtime.editor.dispose(); runtime.reference?.clip.dispose(); return; }
    installRuntime(runtime);
    return true;
  } catch (error) {
    if (request === operation) { tell(error.message); setLoading(false); }
  }
}

async function importAnimation(file) {
  await createProject({
    name: fileTitle(file), assetBlob: file, assetName: file.name, referenceBlob: file,
    referenceName: fileTitle(file) + ' · original', sourceMode: 'clip',
    originalReference: true, characterVersion: 'reference', poses: [], fps: 60,
  });
}

async function replaceReference(file) {
  if (busy() || !state.record) return;
  const request = ++operation;
  queueSave();
  flushSave();
  setLoading(true, 'Loading reference…');
  try {
    const previousTake = captureRecord();
    const record = {
      ...previousTake, referenceBlob: file, referenceName: fileTitle(file),
      referenceIndex: 0, referenceDefaultIndex: 0, referenceSource: null,
      assetBlob: file, assetName: file.name, clipIndex: 0,
      sourceMode: 'blank', originalReference: false, characterVersion: 'reference', customCharacter: false,
      poses: [], tracks: {}, contacts: [], takes: [], training: undefined, draft: null, alignment: null, frames: undefined, cursor: 0, clipTakes: undefined,
    };
    const runtime = await buildRuntime(record);
    if (request !== operation) { runtime.editor.dispose(); runtime.reference?.clip.dispose(); return; }
    if (previousTake.poses.length || Object.keys(previousTake.tracks ?? {}).length || previousTake.draft || previousTake.sourceMode === 'clip') {
      await registerProject({ ...previousTake, kind: 'project', id: crypto.randomUUID(), name: state.name + ' · saved take' });
    }
    if (request !== operation) { runtime.editor.dispose(); runtime.reference?.clip.dispose(); return; }
    installRuntime(runtime);
    tell('Reference loaded. The working character is ready.');
  } catch (error) {
    if (request === operation) { tell(error.message); setLoading(false); }
  }
}

function jointName(id) {
  if (id === 'character') return 'Whole character';
  if (id.startsWith('prop:')) return state.props.find(item => item.id === id.slice(5))?.name ?? 'Scene object';
  const name = state.editor?.bones.get(id)?.name ?? id;
  return name.replace(/^mixamorig[:_]?/i, '').replaceAll('_', ' ');
}

function renderContext() {
  const item = study();
  $('workspace-title').textContent = state.kind === 'practice' ? item.title : state.name;
  $('workspace-kind').textContent = state.kind === 'practice' ? item.skill : 'Your animation';
  $('take-name').value = state.name;
  $('take-duration').value = Number((state.frames / state.fps).toFixed(3));
  $('take-fps').value = state.fps;
  $('character-name').textContent = state.record.assetName ?? 'Reference character';
  $('source-mode-label').textContent = state.editor.sourceMode === 'clip' ? 'Source motion' : 'Blank take';
  $('frame-end').textContent = state.frames;
  $('timeline').max = state.frames;
  $('timeline-rate').textContent = state.fps + ' fps';
  const options = [new Option('Whole character', 'character'),
    ...[...state.editor.bones.keys()].map(id => new Option(jointName(id), id)),
    ...state.props.map(item => new Option(item.name + ' · object', 'prop:' + item.id))];
  $('joint').replaceChildren(...options);
  const clips = state.editor.reference.clips;
  $('source-clip-row').hidden = state.editor.sourceMode !== 'clip' || clips.length < 2;
  $('source-clip').replaceChildren(...clips.map((clip, index) => new Option(clip.name || 'Clip ' + (index + 1), index, false, index === state.editor.reference.index)));
  for (const button of all('[data-study]')) button.classList.toggle('current', state.kind === 'practice' && button.dataset.study === state.id);
  catalog.trashOpen = false;
  renderProjects();
  setWorkspaceTab(state.kind === 'practice' ? 'practice' : 'projects');
  renderReferencePanel();
  renderKeys();
  renderRuler();
  studio?.refresh();
  stage.setTarget(state.target);
  updateComparison();
  updateSelection();
  lastFrame = -1;
  updateFrame();
  updateControls();
}

const phaseNames = {
  breath: 'Breath', glance: 'Side glance', raised: 'Arm raised',
  'arm-up': 'Arm up', 'wrist-out': 'Wrist out', 'wrist-back': 'Wrist back',
  'lower-arm': 'Lowering', bottom: 'Lowest pose', 'left-contact': 'Left contact',
  'right-contact': 'Right contact', 'left-passing': 'Left passing',
  'right-passing': 'Right passing', 'next-contact': 'Next contact',
  'flight-one': 'First flight', 'flight-two': 'Second flight', windup: 'Windup',
  extension: 'Extension', guard: 'Guard', chamber: 'Chamber', recovery: 'Recovery',
  tuck: 'Tuck', inverted: 'Inverted pose', recover: 'Feet recover',
};

function renderReferencePanel() {
  const reference = state.reference;
  $('reference-details').hidden = !reference;
  $('reference-empty').hidden = Boolean(reference);
  if (!reference) return;
  $('reference-name').textContent = reference.name;
  const source = reference.source;
  $('reference-credit').hidden = !source?.creditUrl;
  if (source?.creditUrl?.startsWith('https://')) {
    $('reference-credit').textContent = source.credit;
    $('reference-credit').href = source.creditUrl;
  }
  $('reference-clip-row').hidden = reference.clip.clips.length < 2;
  $('reference-clip').replaceChildren(...reference.clip.clips.map((clip, index) =>
    new Option(clip.name || 'Clip ' + (index + 1), index, false, index === reference.clip.index)));
  $('reference-time').max = reference.clip.frames;
  $('reference-observe').textContent = source?.observe ?? '';
  const marks = reference.clip.index === 0 ? source?.marks ?? {} : {};
  $('phase-buttons').replaceChildren(...Object.entries(marks).map(([id, time]) => {
    const button = document.createElement('button');
    button.className = 'button';
    button.type = 'button';
    button.dataset.time = time;
    button.textContent = phaseNames[id] ?? id;
    return button;
  }));
}

function renderKeys() {
  const frames = [...new Set([...state.keys.map(key => key.frame), ...Object.values(state.tracks).flatMap(track => track.map(key => key.frame))])].sort((a, b) => a - b);
  $('key-points').replaceChildren(...frames.map(frame => {
    const button = document.createElement('button');
    button.className = 'track-key';
    button.type = 'button';
    button.dataset.frame = frame;
    button.setAttribute('aria-label', 'Key at frame ' + frame);
    button.title = 'Key at frame ' + frame;
    button.style.left = frame / state.frames * 100 + '%';
    button.append(document.createElement('span'));
    return button;
  }));
  const count = keyCount();
  $('key-count').textContent = count + (count === 1 ? ' key' : ' keys');
}

function renderRuler() {
  $('ruler').replaceChildren(...Array.from({ length: 5 }, (_, index) => {
    const node = document.createElement('span');
    node.style.left = index * 25 + '%';
    node.textContent = Math.round(state.frames * index / 4);
    return node;
  }));
}

function referenceTime() {
  if (!state.reference) return 0;
  return state.referenceFrame === null ? state.frame / state.frames * state.reference.clip.duration
    : referenceSeconds(state.referenceFrame, state.reference.clip.duration);
}

function updateFrame(force = false) {
  const frame = frameNumber();
  if (!force && frame === lastFrame) return;
  lastFrame = frame;
  poseDirty = true;
  $('frame-current').textContent = frame;
  $('timeline').value = frame;
  $('timeline').setAttribute('aria-valuetext', 'Frame ' + frame + ' of ' + state.frames);
  $('playhead').style.left = state.frame / state.frames * 100 + '%';
  const key = keyAtCursor();
  const draft = currentDraft();
  $('pose-status').textContent = draft ? 'Pose not keyed' : key ? 'Key pose'
    : !keyCount() ? state.editor?.sourceMode === 'blank' ? 'Empty take' : 'Source motion'
    : 'Between poses';
  $('key-frame-editor').style.visibility = key ? 'visible' : 'hidden';
  $('key-frame').value = frame;
  $('key-frame').max = state.frames;
  $('key-frame').disabled = !key || !canEdit();
  $('delete-key').disabled = !key || !canEdit();
  $('add-key').disabled = !canEdit();
  $('interpolation').disabled = !key || !canEdit();
  $('interpolation').value = key?.curve ?? 'smooth';
  for (const point of $('key-points').children) point.classList.toggle('current', Number(point.dataset.frame) === frame);
  if (state.reference) {
    const time = referenceTime();
    $('reference-time').value = time * 60;
    $('source-frame').textContent = Math.round(time * 60);
    $('reference-time-label').textContent = 'Reference ' + time.toFixed(2) + ' s' + (state.referenceFrame === null ? ' · linked' : ' · manual');
  } else $('reference-time-label').textContent = '';
  if (studio?.comparison) $('reference-time-label').textContent = studio.comparison.take.name + ' · comparison';
  studio?.updateFrame(state.frame);
}

function updateSelection() {
  for (const option of [...$('joint').options]) if (option.value.startsWith('prop:')) option.remove();
  for (const item of state.props) $('joint').add(new Option(item.name + ' · object', 'prop:' + item.id));
  $('joint').value = state.target;
  poseTools?.refresh();
  const prop = state.target.startsWith('prop:');
  document.querySelector('[data-tool="scale"]').title = prop ? 'Scale scene object (R)' : 'Scale whole character (R)';
  $('selected-kind').textContent = prop ? 'Scene object' : state.target === 'character' ? 'Character' : 'Joint';
  $('character-scale').value = Math.round((state.editor?.root.scale.x ?? 1) * 100);
  $('transform-space').value = state.space;
  const whole = state.target === 'character';
  $('transform-hint').textContent = prop ? 'Drag the gizmo to place the selected scene object.'
    : stage.activeIK ? 'Move the target to pose the whole limb. Rotate to orient the hand or foot.'
    : state.tool === 'scale' ? 'Drag the scale gizmo to resize the whole character uniformly.'
    : whole ? 'Drag the gizmo to align the whole character.'
    : state.tool === 'translate' ? 'Drag an arrow to move the selected joint.' : 'Drag a ring to rotate the selected joint.';
  $('viewport-hint').textContent = whole ? 'Whole character' : jointName(state.target);
  for (const button of all('[data-tool]')) {
    const active = button.dataset.tool === state.tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  }
}

function updateComparison() {
  stage.setComparison({
    layout: state.layout, spacing: Number($('character-spacing').value),
    skeleton: state.skeleton, ghostOpacity: Number($('ghost-opacity').value),
    lockRoot: !$('root-motion').checked,
    referenceVisible: studio ? studio.hasComparison() : Boolean(state.reference),
  });
  $('actor-labels').className = 'actor-labels ' + ((studio ? studio.hasComparison() : state.reference) ? state.layout : 'solo');
  document.querySelector('.source-label').textContent = studio?.comparisonLabel() ?? 'REFERENCE';
  studio?.motion.invalidate();
  for (const button of all('[data-layout]')) {
    const active = button.dataset.layout === state.layout;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  }
}

function updateControls() {
  const blocked = busy() || catalog.busy;
  const editable = canEdit();
  $('play').innerHTML = icon(state.playing ? 'pause' : 'play');
  $('play').setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  $('play').disabled = !state.editor || state.loading || blocked;
  $('auto-key').setAttribute('aria-pressed', profile.autoKey);
  $('auto-key').disabled = !state.editor || blocked;
  $('loop').setAttribute('aria-pressed', state.loop);
  $('loop').classList.toggle('active', state.loop);
  $('undo').disabled = !editable || !state.undo.length;
  $('redo').disabled = !editable || !state.redo.length;
  $('delete-key').disabled = !editable || !keyAtCursor();
  $('add-key').disabled = !editable;
  $('interpolation').disabled = !editable || !keyAtCursor();
  $('export-btn').disabled = !state.editor || state.exporting || state.loading;
  $('export-btn').querySelector('span:last-child').textContent = recorder?.busy ? 'Stop' : state.exporting ? 'Exporting…' : 'Export';
  $('capture-badge').hidden = !recorder?.busy;
  $('studio').classList.toggle('recording', Boolean(recorder?.busy));
  $('export-video').disabled = !recorder?.supported || blocked;
  for (const id of ['restart', 'step-back', 'step-forward', 'timeline', 'joint',
    'transform-space', 'take-name', 'take-duration', 'take-fps', 'source-clip',
    'character-scale', 'clear-take', 'save-as-project']) {
    $(id).disabled = !state.editor || state.loading || blocked;
  }
  for (const id of ['import-animation', 'import-reference', 'new-project']) $(id).disabled = state.loading || blocked;
  for (const id of ['reference-time', 'reference-clip', 'resync-reference', 'reset-reference', 'edit-source']) $(id).disabled = !state.reference || state.loading || blocked;
  for (const button of all('[data-study], [data-project], [data-workspace], [data-tool], [data-layout]')) button.disabled = blocked;
  for (const button of all('[data-delete-project], [data-restore-project], #project-trash-toggle')) button.disabled = blocked || state.loading;
  if (!stage?.gizmo.dragging) stage?.setInteraction(editable);
  studio?.updateEnabled(editable, blocked || state.loading);
  poseTools?.refresh();
  for (const input of all('#media-reference-tools input, #media-reference-tools button')) input.disabled = !editable;
  $('save-project-file').disabled = !state.editor || blocked || state.loading;
  $('open-project-file').disabled = blocked || state.loading;
}

function setCamera(view = study()?.view ?? 'perspective') {
  let bounds;
  // Fit the complete animated take: jumping still needs vertical space with
  // horizontal root travel locked. Restore the pose without moving a playhead.
  if (state.editor && (state.editor.sourceMode === 'clip' || $('root-motion').checked)) {
    bounds = new Box3();
    const sourceTime = state.reference?.clip.action?.time;
    try {
      for (let step = 0; step <= 24; step++) {
        const progress = step / 24;
        state.editor.sample(state.keys, progress * state.frames, state.frames);
        if (studio?.comparison) studio.sampleSource(progress * state.frames);
        else state.reference?.clip.sample(progress * state.reference.clip.duration);
        stage.updateActors();
        bounds.expandByObject(state.editor.root, true);
        if (stage.sourceRoot && stage.sourceLane.visible) bounds.expandByObject(stage.sourceRoot, true);
      }
      if (state.props.length) bounds.expandByObject(stage.sceneObjects.group, true);
    } finally {
      if (sourceTime !== undefined) state.reference.clip.sample(sourceTime);
      draw();
    }
  }
  stage.setView(view, bounds);
  for (const button of all('[data-view]')) {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  }
}

function resetReference() {
  if (!state.reference || state.loading || busy()) return;
  state.playing = false;
  state.frame = 0;
  state.referenceFrame = null;
  state.speed = 1;
  state.loop = true;
  state.layout = 'side';
  state.skeleton = true;
  state.training = { ...state.training, start: 0, end: state.frames, loop: false, hideReference: false, compare: 'original' };
  state.analysis = defaultAnalysis();
  void studio?.compareTake('original');
  const index = state.record.originalReference ? state.editor.reference.index : state.reference.defaultIndex;
  state.reference.clip.select(index);
  stage.resetReferenceOrigin();
  for (const id of ['character-spacing', 'ghost-opacity']) $(id).value = $(id).defaultValue;
  $('root-motion').checked = Boolean(state.reference.source?.scene);
  $('speed').value = '1';
  for (const id of ['loop', 'skeleton-toggle']) {
    $(id).classList.add('active');
    $(id).setAttribute('aria-pressed', true);
  }
  updateComparison();
  renderReferencePanel();
  studio?.refresh();
  updateControls();
  updateFrame(true);
  draw();
  setCamera();
  queueSave();
  persistPreferences();
  tell('Reference settings reset.');
}

function setTarget(id) {
  if (!state.editor || busy()) return;
  state.target = id;
  if (id !== 'character' && !id.startsWith('prop:') && state.tool === 'scale') state.tool = 'rotate';
  stage.setTarget(id);
  stage.setTool(state.tool, state.space);
  updateSelection();
  studio?.onSelection();
  updateFrame(true);
}

function setTool(mode) {
  if (!state.editor || busy()) return;
  state.tool = mode;
  state.target = stage.setTool(mode, state.space);
  updateSelection();
}

function snapshot() { return captureEdit(state); }
function remember(before = snapshot()) { rememberEdit(state, before); }

function changed({ preview = false } = {}) {
  renderKeys();
  if (!preview) {
    studio?.refresh();
    if (state.target.startsWith('prop:') && !state.props.some(item => item.id === state.target.slice(5))) state.target = 'character';
    stage.setTarget(state.target);
    updateSelection();
  }
  draw();
  lastFrame = -1;
  updateFrame();
  updateControls();
  queueSave();
}

function setKeys(keys, before = null) {
  remember(before ?? snapshot());
  state.keys = keys;
  state.draft = null;
  changed();
}

function undo(redo = false) {
  if (!canEdit() || !travelHistory(state, redo)) return;
  stage.resetReferenceOrigin();
  void studio.compareTake(state.training.compare, true);
  renderContext(); queueSave();
}

function keyPose() {
  if (!canEdit()) return;
  remember();
  const pose = currentPose();
  updateJointKeys(pose);
  state.keys = writePoseKey(state.keys, frameNumber(), pose, keyAtCursor()?.curve ?? 'smooth');
  state.draft = null; changed();
}

function updateJointKeys(pose, ids = Object.keys(state.tracks)) {
  for (const id of ids) if (state.tracks[id]) state.tracks[id] = writeJointKey(state.tracks[id], frameNumber(), pose[id] ?? { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    state.tracks[id].find(key => key.frame === frameNumber())?.curve ?? 'smooth');
}

function authorPose(pose, ids) {
  if (!canEdit()) return;
  remember();
  if (profile.autoKey) { updateJointKeys(pose, ids); state.keys = writePoseKey(state.keys, frameNumber(), pose); state.draft = null; }
  else state.draft = { frame: frameNumber(), pose };
  changed();
}

function deleteCursorKey() {
  if (!canEdit()) return;
  if (state.tracks[state.target]?.some(key => key.frame === frameNumber())) {
    studio.timeline.id = state.target; studio.timeline.selectedFrame = frameNumber(); studio.timeline.deleteKey(); return;
  }
  if (keyAtCursor()) setKeys(state.keys.filter(key => key.frame !== frameNumber()));
}

function seek(frame) {
  if (!state.editor || busy()) return;
  state.frame = Math.max(0, Math.min(state.frames, Math.round(frame)));
  state.playing = false;
  state.referenceFrame = null;
  studio?.motion.invalidate();
  updateControls();
  updateFrame(true);
  queueSave();
}

function togglePlay() {
  if (!state.editor || state.loading || busy()) return;
  state.playing = !state.playing;
  const range = state.training.loop ? state.training : { start: 0, end: state.frames };
  if (state.playing && (state.frame >= range.end || state.frame < range.start)) state.frame = range.start;
  state.referenceFrame = null;
  if (!state.playing) state.frame = Math.round(state.frame);
  updateControls();
  updateFrame(true);
}

function beginGizmo() {
  state.playing = false;
  dragSnapshot = snapshot();
  updateControls();
}

function previewGizmo(id, context) {
  if (id.startsWith('prop:')) { studio.captureObjectDrag(id); return; }
  if (context?.chain) {
    const active = state.contacts.filter(contact => contact.chain === context.chain.id && state.frame >= contact.from && state.frame <= contact.to);
    if (active.length) {
      const position = state.editor.root.worldToLocal(context.position.clone());
      const rotation = state.editor.root.getWorldQuaternion(new Quaternion()).invert().multiply(context.rotation);
      state.contacts = state.contacts.map(contact => active.includes(contact) ? { ...contact, position: position.toArray(), rotation: rotation.toArray() } : contact);
      state.editor.contacts = state.contacts;
    } else {
      state.editor.solveIK(context.chain.id, context.position, { pole: context.pole, rotation: context.rotation });
      state.draft = { frame: frameNumber(), pose: state.editor.captureBones(context.chain.ids, currentPose()) };
    }
    updateFrame(true); return;
  }
  if (id === 'character') $('character-scale').value = Math.round(state.editor.root.scale.x * 100);
  else state.draft = { frame: frameNumber(), pose: state.editor.captureBone(id, currentPose()) };
  updateFrame(true);
}

function finishGizmo(id, context) {
  if (!dragSnapshot) return;
  const startPose = dragSnapshot.draft?.frame === frameNumber() ? dragSnapshot.draft.pose
    : samplePoseKeys(dragSnapshot.keys, state.frame, dragSnapshot.tracks);
  const poseChanged = JSON.stringify(startPose) !== JSON.stringify(currentPose());
  const aligned = JSON.stringify(dragSnapshot.alignment) !== JSON.stringify(state.editor.getAlignment());
  const sceneChanged = JSON.stringify(dragSnapshot.props) !== JSON.stringify(state.props);
  const contactsChanged = JSON.stringify(dragSnapshot.contacts) !== JSON.stringify(state.contacts);
  if (id !== 'character' && !id.startsWith('prop:') && poseChanged && profile.autoKey) {
    updateJointKeys(currentPose(), context?.chain.ids ?? [id]);
    state.keys = writePoseKey(state.keys, frameNumber(), currentPose(), keyAtCursor()?.curve ?? 'smooth');
    state.draft = null;
  }
  if (poseChanged || aligned || sceneChanged || contactsChanged) remember(dragSnapshot);
  else state.draft = dragSnapshot.draft;
  dragSnapshot = null;
  changed();
  updateSelection();
}

function draw() {
  if (!state.editor) return;
  state.editor.tracks = state.tracks; state.editor.contacts = state.contacts;
  state.reference?.clip.sample(referenceTime());
  state.editor.sample(state.keys, state.frame, state.frames, currentDraft());
  studio?.sampleComparison();
  poseDirty = false;
  stage.invalidate();
}



function changeTiming() {
  if (!canEdit()) return;
  const duration = Number($('take-duration').value);
  const fps = Number($('take-fps').value);
  if (!Number.isFinite(duration) || duration < 0.1 || duration > 3600 || ![24, 30, 60].includes(fps)) return;
  const before = snapshot();
  const frames = Math.max(1, Math.round(duration * fps));
  state.keys = retimeKeys(state.keys, state.frames, frames);
  state.tracks = retimeTracks(state.tracks, state.frames, frames);
  state.contacts = state.contacts.map(item => ({ ...item, from: Math.round(item.from / state.frames * frames), to: Math.round(item.to / state.frames * frames) }));
  state.training = restoreTraining({ ...state.training, start: Math.round(state.training.start / state.frames * frames), end: Math.round(state.training.end / state.frames * frames) }, frames);
  if (state.draft) state.draft.frame = Math.round(state.draft.frame / state.frames * frames);
  state.frame = Math.round(state.frame / state.frames * frames);
  state.frames = frames;
  state.fps = fps;
  remember(before);
  renderContext();
  queueSave();
}

function saveProjectCopy() { return catalog.copy(); }
async function openProjectFile(file) {
  if (busy() || state.loading) return;
  try { await createProject(await unpackProject(file)); }
  catch (error) { tell(error.message); }
}
function saveProjectFile() {
  if (!state.editor || busy()) return;
  try {
    queueSave();
    downloadBlob(packProject(captureRecord()), projectFilename(state.name));
    tell('Editable project saved to a .motionroom file.');
  } catch (error) { tell(error.message); }
}
async function updateStorageInfo() {
  try {
    const estimate = await navigator.storage?.estimate();
    if (estimate) $('storage-info').textContent = 'Browser storage: ' + (estimate.usage / 1048576).toFixed(1) + ' MB used of about ' + Math.round(estimate.quota / 1048576) + ' MB. Keep a project file for backup.';
    const persistent = await navigator.storage?.persisted();
    $('persist-storage').hidden = Boolean(persistent) || !navigator.storage?.persist;
  } catch { $('storage-info').textContent = 'Save a .motionroom file to keep an editable backup outside this browser.'; }
}

async function init() {
  stage = new Stage($('viewport'), $('scene'), {
    onSelect: setTarget, onDragStart: beginGizmo, onDrag: previewGizmo, onDragEnd: finishGizmo,
    onFreeView() {
      for (const button of all('[data-view]')) {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', false);
      }
    },
  });
  workspaceExports = new WorkspaceExports(stage, {
    getState: () => state, canEdit, draw, toast: tell,
    refresh() { draw(); updateControls(); updateFrame(true); },
  });
  recorder = workspaceExports.recorder;

  studio = new StudioTools(stage, {
    getState: () => state, canEdit, select: setTarget, setTool, seek, draw,
    save: queueSave, toast: tell, authorPose, contextChanged: renderContext,
    comparisonChanged() { updateComparison(); draw(); updateFrame(true); },
    commit(change) {
      if (!canEdit()) return;
      remember(); change(); changed();
    },
    begin() { if (!canEdit()) return; toolSnapshot = snapshot(); stage.externalEditing = true; updateControls(); },
    preview(change) { change(); changed({ preview: true }); },
    end() {
      stage.externalEditing = false;
      if (toolSnapshot && JSON.stringify(toolSnapshot) !== JSON.stringify(snapshot())) remember(toolSnapshot);
      toolSnapshot = null; changed();
    },
  });
  poseTools = new PoseTools($('pose-workshop'), { getState: () => state, getPose: currentPose, canEdit, authorPose, toast: tell, saveLibrary: savePoseLibrary });
  media = new MediaReference($('media-reference-tools'), $('media-board'), { getState: () => state, canEdit, save: queueSave, seek, toast: tell });
  layout = new WorkspaceLayout($('studio'), document.querySelector('.workspace'));
  try { state.poseLibrary = restorePoseLibrary((await readReference('pose-library-v1'))?.items); } catch { /* Projects also carry their pose library. */ }
  let previousTime = performance.now();
  stage.renderer.setAnimationLoop(time => {
    const delta = Math.max(0, Math.min(0.1, (time - previousTime) / 1000));
    previousTime = time;
    if (state.exporting) return;
    if (state.playing) {
      state.frame += delta * state.fps * (recorder.active ? 1 : state.speed);
      const range = !recorder.active && state.training.loop ? state.training : { start: 0, end: state.frames };
      if (state.frame >= range.end) {
        if (state.loop && !recorder.active) state.frame = range.start + (state.frame - range.end) % Math.max(1, range.end - range.start);
        else {
          state.frame = range.end;
          state.playing = false;
          updateControls();
        }
      }
      updateFrame();
    }
    if (state.playing || poseDirty || recorder.active) draw();
    media?.sync();
    stage.render(delta);
    workspaceExports.updateRecording();
    if (recorder.active && !state.playing) recorder.stop();
  });
  void updateStorageInfo();
  if (saved.workspace === 'project' && profile.projects.some(project => project.id === profile.projectId)) await openProject(profile.projectId);
  else await loadStudy(profile.studyId);
  $('scene').addEventListener('webglcontextlost', event => {
    event.preventDefault();
    state.playing = false;
    queueSave();
    flushSave();
    recorder.stop();
    tell('The graphics context was interrupted. Reload to reopen your saved take.');
  });
}

catalog = new ProjectManager({
  getState: () => state, profile, studyCount: studies.length, blocked: busy,
  capture: captureRecord, write: writeRecord, cache: record => session.set(sessionKey(record.kind, record.id), record),
  persist: persistPreferences, loadStudy, refresh: updateControls, toast: tell,
});
mountIcons();
renderLibrary();
renderProjects();
setWorkspaceTab('practice');

$('motion-library').addEventListener('click', event => {
  const button = event.target.closest('[data-study]');
  if (button) void loadStudy(button.dataset.study);
});
$('project-list').addEventListener('click', event => {
  const remove = event.target.closest('[data-delete-project]');
  if (remove) { void removeProject(remove.dataset.deleteProject); return; }
  const button = event.target.closest('[data-project]');
  if (button) void openProject(button.dataset.project);
});
$('project-trash').addEventListener('click', event => {
  const button = event.target.closest('[data-restore-project]');
  if (button) restoreProject(button.dataset.restoreProject);
});
$('project-trash-toggle').addEventListener('click', () => {
  catalog.trashOpen = !catalog.trashOpen;
  renderProjects();
  setWorkspaceTab('projects');
});
for (const button of all('[data-workspace]')) button.addEventListener('click', () => {
  catalog.trashOpen = false;
  renderProjects();
  setWorkspaceTab(button.dataset.workspace);
});
$('library-toggle').addEventListener('click', () => setLibraryOpen(!$('studio').classList.contains('library-open')));
for (const button of all('[data-layout]')) button.addEventListener('click', () => {
  state.layout = button.dataset.layout;
  updateComparison();
  setCamera();
  persistPreferences();
  queueSave();
});
for (const button of all('[data-tool]')) button.addEventListener('click', () => setTool(button.dataset.tool));
for (const button of all('[data-view]')) button.addEventListener('click', () => setCamera(button.dataset.view));
$('frame-view').addEventListener('click', () => setCamera());
$('joint').addEventListener('change', event => setTarget(event.target.value));
$('transform-space').addEventListener('change', event => {
  state.space = event.target.value;
  stage.setTool(state.tool, state.space);
});
$('skeleton-toggle').addEventListener('click', () => {
  state.skeleton = !state.skeleton;
  $('skeleton-toggle').setAttribute('aria-pressed', state.skeleton);
  $('skeleton-toggle').classList.toggle('active', state.skeleton);
  updateComparison();
});
for (const id of ['character-spacing', 'ghost-opacity', 'root-motion']) $(id).addEventListener('input', () => {
  updateComparison();
  if (id === 'character-spacing') setCamera();
  if (id === 'root-motion') { setCamera(); queueSave(); }
});
$('character-scale').addEventListener('change', event => {
  const scale = event.target.valueAsNumber / 100;
  if (!canEdit() || !Number.isFinite(scale)) return;
  remember();
  const alignment = state.editor.getAlignment();
  alignment.scale = scale;
  state.editor.setAlignment(alignment);
  updateSelection();
  changed();
});
$('take-name').addEventListener('input', event => {
  state.name = event.target.value.trim() || 'Untitled animation';
  if (state.kind === 'project') {
    $('workspace-title').textContent = state.name;
    const metadata = profile.projects.find(item => item.id === state.id);
    if (metadata) metadata.name = state.name;
    renderProjects();
    persistPreferences();
  }
  queueSave();
});
$('take-duration').addEventListener('change', changeTiming);
$('take-fps').addEventListener('change', changeTiming);
$('interpolation').addEventListener('change', event => {
  if (!canEdit()) return;
  if (state.tracks[state.target]?.some(key => key.frame === frameNumber())) {
    studio.timeline.id = state.target; studio.timeline.selectedFrame = frameNumber(); studio.timeline.setCurve(event.target.value); return;
  }
  const key = keyAtCursor();
  if (key) setKeys(state.keys.map(item => item === key ? { ...item, curve: event.target.value } : item));
});
$('key-frame').addEventListener('change', event => {
  const frame = event.target.valueAsNumber;
  const key = keyAtCursor();
  if (!canEdit() || !key || !Number.isInteger(frame) || frame < 0 || frame > state.frames) return;
  if (state.tracks[state.target]?.some(key => key.frame === frameNumber())) {
    studio.timeline.id = state.target; studio.timeline.selectedFrame = frameNumber(); studio.timeline.moveKey(frame); return;
  }
  if (state.keys.some(item => item !== key && item.frame === frame)) {
    tell('A pose is already keyed at that frame.');
    updateFrame(true);
    return;
  }
  const before = snapshot();
  state.frame = frame;
  setKeys(state.keys.map(item => item === key ? { ...item, frame } : item).sort((left, right) => left.frame - right.frame), before);
});
$('timeline').addEventListener('input', event => seek(event.target.valueAsNumber));
$('key-points').addEventListener('click', event => {
  const button = event.target.closest('[data-frame]');
  if (button) seek(Number(button.dataset.frame));
});
$('restart').addEventListener('click', () => seek(0));
$('step-back').addEventListener('click', () => seek(frameNumber() - 1));
$('step-forward').addEventListener('click', () => seek(frameNumber() + 1));
$('play').addEventListener('click', togglePlay);
$('speed').addEventListener('change', event => { state.speed = Number(event.target.value); });
$('loop').addEventListener('click', () => {
  state.loop = !state.loop;
  $('loop').setAttribute('aria-pressed', state.loop);
  $('loop').classList.toggle('active', state.loop);
});
$('auto-key').addEventListener('click', () => {
  profile.autoKey = !profile.autoKey;
  persistPreferences();
  updateControls();
});
$('add-key').addEventListener('click', keyPose);
$('delete-key').addEventListener('click', deleteCursorKey);
$('undo').addEventListener('click', () => undo());
$('redo').addEventListener('click', () => undo(true));
$('clear-take').addEventListener('click', () => {
  if (!canEdit()) return;
  remember(); state.keys = []; state.tracks = {}; state.draft = null; changed();
  tell('Keys cleared. Undo restores your take.');
});
$('save-as-project').addEventListener('click', saveProjectCopy);
$('new-project').addEventListener('click', () => {
  $('new-name').value = 'Untitled animation';
  $('new-dialog').showModal();
});
$('new-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!state.editor || busy()) return;
  const reference = $('keep-reference').checked ? state.reference : null;
  const record = {
    name: $('new-name').value.trim() || 'Untitled animation',
    assetBlob: state.record.assetBlob, assetName: state.record.assetName,
    sourceMode: 'blank', poses: [], fps: Number($('new-fps').value),
    frames: Math.round(Number($('new-duration').value) * Number($('new-fps').value)),
    referenceBlob: reference?.blob ?? null, referenceName: reference?.name,
    referenceSource: reference?.source, characterVersion: 'reference',
    props: state.props, sceneSnap: state.sceneSnap,
    rootMotion: $('root-motion').checked, layout: state.layout,
  };
  $('new-dialog').close();
  void createProject(record);
});
for (const [button, input, handler] of [
  ['import-animation', 'animation-file', importAnimation],
  ['import-reference', 'reference-file', replaceReference],
]) {
  $(button).addEventListener('click', () => $(input).click());
  $(input).addEventListener('change', event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) void handler(file);
  });
}
$('edit-source').addEventListener('click', () => {
  const reference = state.reference;
  if (!reference) return;
  void createProject({
    name: reference.name + ' · edited', assetBlob: reference.blob, assetName: reference.name,
    referenceBlob: reference.blob, referenceName: reference.name + ' · original',
    referenceSource: reference.source, originalReference: true,
    sourceMode: 'clip', clipIndex: reference.clip.index, referenceIndex: reference.clip.index,
    props: state.props, rootMotion: $('root-motion').checked, layout: state.layout,
    fps: 60, poses: [],
  });
});
$('reference-time').addEventListener('input', event => {
  if (busy()) return;
  state.playing = false;
  state.referenceFrame = event.target.valueAsNumber;
  updateControls();
  updateFrame(true);
});
$('resync-reference').addEventListener('click', () => {
  state.referenceFrame = null;
  updateFrame(true);
});
$('reset-reference').addEventListener('click', resetReference);
$('phase-buttons').addEventListener('click', event => {
  const button = event.target.closest('[data-time]');
  if (button) seek(Number(button.dataset.time) / state.reference.clip.duration * state.frames);
});
$('reference-clip').addEventListener('change', event => {
  state.reference.clip.select(Number(event.target.value));
  state.referenceFrame = null;
  stage.resetReferenceOrigin();
  renderReferencePanel();
  updateFrame(true);
  studio?.motion.invalidate();
  queueSave();
});
$('source-clip').addEventListener('change', event => {
  if (!canEdit()) return;
  const oldIndex = state.editor.reference.index;
  const takes = { ...state.record.clipTakes, [oldIndex]: {
    poses: state.keys, frames: state.frames, fps: state.fps, draft: state.draft,
    tracks: state.tracks, contacts: state.contacts,
  } };
  const index = Number(event.target.value);
  state.editor.selectClip(index);
  const take = takes[index];
  state.keys = take ? restorePoseKeys(take.poses, take.frames, state.editor.bones.keys()) : [];
  state.frames = take?.frames ?? Math.max(1, Math.round(state.editor.duration * state.fps));
  state.fps = take?.fps ?? state.fps;
  state.tracks = take?.tracks ?? {}; state.contacts = take?.contacts ?? [];
  state.training = restoreTraining(null, state.frames);
  void studio.compareTake('original');
  state.draft = take?.draft ?? null;
  state.record.clipTakes = takes;
  state.frame = 0;
  state.undo = [];
  state.redo = [];
  if (state.record.originalReference) {
    state.reference.clip.select(index);
    stage.resetReferenceOrigin();
  }
  renderContext();
  queueSave();
});
$('help-btn').addEventListener('click', () => $('help-dialog').showModal());
for (const button of all('[data-close]')) button.addEventListener('click', () => $(button.dataset.close).close());
$('export-btn').addEventListener('click', () => {
  if (recorder.busy) { recorder.stop(); return; }
  if (state.playing) seek(state.frame);
  $('export-dialog').showModal();
});
$('export-glb').addEventListener('click', () => void workspaceExports.glb($('export-scene').checked));
$('export-video').addEventListener('click', () => workspaceExports.quickVideo({ height: Number($('export-quality').value), fps: Number($('export-fps').value) }));
$('export-frame-video').addEventListener('click', () => void workspaceExports.video({ height: Number($('export-quality').value), fps: Number($('export-fps').value) }));
$('save-project-file').addEventListener('click', saveProjectFile);
$('open-project-file').addEventListener('click', () => $('project-file').click());
$('project-file').addEventListener('change', event => { const file = event.target.files[0]; event.target.value = ''; if (file) void openProjectFile(file); });
$('retry-save').addEventListener('click', () => { persistPreferences(); void persistence.retry(); });
$('persist-storage').addEventListener('click', async () => {
  const retained = await navigator.storage.persist().catch(() => false);
  tell(retained ? 'This browser will protect local projects from automatic storage eviction.' : 'Persistent storage was not granted. Save a project file for backup.');
  void updateStorageInfo();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (recorder?.active) workspaceExports.cancel();
    queueSave();
    flushSave();
  }
});
window.addEventListener('pagehide', () => { queueSave(); flushSave(); });
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || event.target.closest('input, textarea, select')) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 's') { event.preventDefault(); saveProjectFile(); return; }
  if (studio?.timeline.handleShortcut(event)) return;
  if ((event.ctrlKey || event.metaKey) && key === 'd' && state.target.startsWith('prop:')) { event.preventDefault(); if (canEdit()) studio.duplicateObject(); return; }
  if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); undo(event.shiftKey); return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (key === ' ' && !event.target.closest('button, a')) { event.preventDefault(); togglePlay(); }
  if (key === 'arrowleft' || key === 'arrowright') { event.preventDefault(); seek(frameNumber() + (key === 'arrowleft' ? -1 : 1)); }
  const tool = { w: 'translate', e: 'rotate', r: 'scale' }[key];
  if (tool) setTool(tool);
  if (key === 'k') keyPose();
  if (key === 'delete' && canEdit()) { if (state.target.startsWith('prop:')) studio.deleteObject(); else deleteCursorKey(); }
  if (key === 'f') { if (event.shiftKey) stage.focusSelected(); else setCamera(); }
  if (key === 'escape') setLibraryOpen(false);
  const view = { 0: 'perspective', 1: 'front', 3: 'side', 7: 'back' }[key];
  if (view) setCamera(view);
});
init().catch(error => {
  console.error(error);
  $('loading').hidden = false;
  $('loading-text').textContent = 'The 3D view could not start. Reload to try again.';
  tell(error.message);
});
