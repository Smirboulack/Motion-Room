import { samplePoseKeys } from './pose-keys.js';
import { channels, neutralTransform, writeJointKey, sampleJointTrack, channelValue, withChannelValue, defaultEase } from './joint-tracks.js';
import { poseRow, keyToken, parseToken, timelineTrack, copyTimelineKeys, editTimelineKeys } from './timeline-edit.js';
import { rigSignature } from './pose-tools.js';

const svgNS = 'http://www.w3.org/2000/svg';
const svgNode = (tag, attrs = {}, text = null) => {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== null) node.textContent = text;
  return node;
};

export class JointTimeline {
  constructor(container, api) {
    this.api = api; this.mode = 'closed'; this.channel = 'rz'; this.selectedFrame = 0;
    this.selection = new Set(); this.clipboard = null; this.zoom = 1;
    container.innerHTML = `
      <div class="joint-timeline-toolbar">
        <select id="track-joint" aria-label="Timeline joint"></select>
        <select id="track-channel" aria-label="Curve channel">${channels.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select>
        <button class="button small" id="track-add">Key joint</button>
        <select id="track-curve" aria-label="Joint interpolation"><option value="smooth">Smooth</option><option value="linear">Linear</option><option value="hold">Stepped</option><option value="bezier">Bezier</option></select>
        <button class="icon-button" id="track-delete" aria-label="Delete joint key">×</button>
      </div>
      <div class="timeline-batch-toolbar">
        <div class="timeline-action-group">
        <span id="timeline-selection-count" role="status">0 selected</span>
        <button class="button small" id="timeline-select-all">Select all</button><button class="button small" id="timeline-copy">Copy</button><button class="button small" id="timeline-paste">Paste</button><button class="button small" id="timeline-duplicate">Duplicate</button><button class="button small" id="timeline-delete">Delete selection</button>
        </div><div class="timeline-action-group">
        <label>Move by <input type="number" id="timeline-shift" value="1" step="1" aria-label="Move selected keys by frames"></label><button class="button small" id="timeline-move">Move</button>
        <label>Span <input type="number" id="timeline-span" min="1" step="1" aria-label="Selected key span in frames"></label><button class="button small" id="timeline-stretch">Stretch</button>
        <label>Zoom <select id="timeline-zoom" aria-label="Timeline zoom"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option><option value="16">16×</option></select></label><button class="button small" id="timeline-fit">Fit</button>
        </div>
      </div>
      <div class="dope-sheet" id="dope-sheet" aria-label="Joint animation channels" tabindex="0"></div>
      <div class="curve-scroll" id="curve-scroll"><svg class="curve-graph" id="curve-graph" viewBox="0 0 640 145" preserveAspectRatio="none" role="group" aria-label="Animation curve. Drag a key or a Bezier handle."></svg></div>
      <div class="curve-key-fields" id="curve-key-fields">
        <label>Frame<input type="number" id="curve-frame" aria-label="Curve key frame" min="0" step="1"></label>
        <label>Value<input type="number" id="curve-value" aria-label="Curve key value" step="0.1"></label>
        <span class="bezier-fields" id="bezier-fields"><label>Out X<input type="number" id="ease-0" min="0" max="1" step="0.05"></label><label>Out Y<input type="number" id="ease-1" min="-3" max="4" step="0.05"></label><label>In X<input type="number" id="ease-2" min="0" max="1" step="0.05"></label><label>In Y<input type="number" id="ease-3" min="-3" max="4" step="0.05"></label></span>
        <span class="curve-unit" id="curve-unit"></span>
      </div>`;
    this.container = container;
    this.joint = container.querySelector('#track-joint'); this.channelSelect = container.querySelector('#track-channel');
    this.curve = container.querySelector('#track-curve'); this.dope = container.querySelector('#dope-sheet');
    this.svg = container.querySelector('#curve-graph'); this.fields = container.querySelector('#curve-key-fields');
    this.channelSelect.value = this.channel;
    const $ = id => container.querySelector('#' + id);
    $('timeline-select-all').addEventListener('click', () => this.selectAll());
    $('timeline-copy').addEventListener('click', () => this.copySelection());
    $('timeline-paste').addEventListener('click', () => this.pasteSelection());
    $('timeline-duplicate').addEventListener('click', () => this.duplicateSelection());
    $('timeline-delete').addEventListener('click', () => this.applyBatch({ remove: true }));
    $('timeline-move').addEventListener('click', () => this.applyBatch({ delta: $('timeline-shift').valueAsNumber }));
    $('timeline-stretch').addEventListener('click', () => {
      const frames = [...this.selection].map(token => parseToken(token).frame), span = Math.max(...frames) - Math.min(...frames);
      if (span > 0) this.applyBatch({ scale: $('timeline-span').valueAsNumber / span });
    });
    $('timeline-zoom').addEventListener('change', () => this.setZoom(Number($('timeline-zoom').value)));
    $('timeline-fit').addEventListener('click', () => this.setZoom(1));
    this.joint.addEventListener('change', () => { this.id = this.joint.value; api.select(this.id); this.refresh(); });
    this.channelSelect.addEventListener('change', () => { this.channel = this.channelSelect.value; this.drawGraph(); this.updateFields(); });
    container.querySelector('#track-add').addEventListener('click', () => this.addKey());
    container.querySelector('#track-delete').addEventListener('click', () => this.deleteKey());
    this.curve.addEventListener('change', () => this.setCurve(this.curve.value));
    container.querySelector('#curve-frame').addEventListener('change', event => this.moveKey(event.target.valueAsNumber));
    container.querySelector('#curve-value').addEventListener('change', event => {
      if (!Number.isFinite(event.target.valueAsNumber)) return;
      this.editKey(key => { key.transform = withChannelValue(key.transform, this.channel, event.target.valueAsNumber); });
    });
    for (let i = 0; i < 4; i++) container.querySelector('#ease-' + i).addEventListener('change', event => {
      const value = event.target.valueAsNumber;
      if (!Number.isFinite(value)) return;
      this.editKey(key => { key.curve = 'bezier'; key.ease ??= [...defaultEase]; key.ease[i] = Math.max(i % 2 ? -3 : 0, Math.min(i % 2 ? 4 : 1, value)); });
    });
    this.svg.addEventListener('pointerdown', event => this.beginDrag(event, 'graph'));
    this.svg.addEventListener('keydown', event => {
      const key = event.target.closest('[data-frame]');
      if (key && ['Enter', ' '].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); this.selectedFrame = Number(key.dataset.frame);
        this.api.seek(this.selectedFrame); this.drawGraph(); this.updateFields();
      }
    });
    this.dope.addEventListener('pointerdown', event => this.beginDrag(event, 'dope'));
    for (const target of [this.svg, this.dope]) {
      target.addEventListener('pointermove', event => this.drag(event));
      target.addEventListener('pointerup', event => this.endDrag(event));
      target.addEventListener('pointercancel', event => this.endDrag(event));
    }
  }

  get state() { return this.api.getState(); }
  get track() { return this.state.tracks[this.id] ?? []; }

  ensureTrack(id = this.id) {
    if (this.state.tracks[id]) return;
    this.state.tracks[id] = this.state.keys.map(key => ({ frame: key.frame,
      transform: structuredClone(samplePoseKeys(this.state.keys, key.frame)[id] ?? neutralTransform()),
      curve: key.curve, ...(key.ease ? { ease: [...key.ease] } : {}),
    }));
  }

  addKey() {
    if (!this.id) return;
    const frame = Math.round(this.state.frame);
    const transform = samplePoseKeys(this.state.keys, frame, this.state.tracks)[this.id] ?? neutralTransform();
    this.selectedFrame = frame;
    this.selection = new Set([keyToken(this.id, frame)]);
    this.api.commit(() => {
      this.ensureTrack();
      this.state.tracks[this.id] = writeJointKey(this.track, frame, transform, this.curve.value);
    });
  }

  editKey(change) {
    if (!this.track.some(key => key.frame === this.selectedFrame)) return;
    this.api.commit(() => {
      const track = structuredClone(this.track);
      change(track.find(key => key.frame === this.selectedFrame));
      this.state.tracks[this.id] = track;
    });
  }

  setCurve(curve) { this.editKey(key => { key.curve = curve; if (curve === 'bezier') key.ease ??= [...defaultEase]; }); }

  moveKey(frame) {
    if (!Number.isInteger(frame) || frame < 0 || frame > this.state.frames || this.track.some(key => key.frame === frame && frame !== this.selectedFrame)) return;
    const previous = this.selectedFrame;
    if (!this.track.some(key => key.frame === previous)) return;
    this.api.commit(() => {
      this.state.tracks[this.id] = this.track.map(key => key.frame === previous ? { ...key, frame } : key).sort((a, b) => a.frame - b.frame);
      this.selectedFrame = frame; this.state.frame = frame;
    });
  }

  deleteKey() {
    if (!this.track.some(key => key.frame === this.selectedFrame)) return false;
    this.api.commit(() => {
      this.state.tracks[this.id] = this.track.filter(key => key.frame !== this.selectedFrame);
      if (!this.state.tracks[this.id].length) {
        delete this.state.tracks[this.id];
        this.state.keys = this.state.keys.map(key => { const pose = { ...key.pose }; delete pose[this.id]; return { ...key, pose }; });
      }
    });
    return true;
  }

  setMode(mode) {
    this.mode = this.mode === mode ? 'closed' : mode;
    document.querySelector('.workspace').classList.toggle('advanced-open', this.mode !== 'closed');
    this.container.hidden = this.mode === 'closed';
    this.refresh();
  }

  refresh() {
    if (this.dragging || !this.state.editor) return;
    const editor = this.state.editor;
    const runtime = this.state.id + ':' + editor.reference.index;
    if (this.runtime !== runtime) { this.selection.clear(); this.runtime = runtime; }
    this.selection = new Set([...this.selection].filter(token => { const { joint, frame } = parseToken(token); return timelineTrack(this.state, joint).some(key => key.frame === frame); }));
    if (editor.bones.has(this.state.target)) this.id = this.state.target;
    if (!editor.bones.has(this.id)) this.id = editor.bones.keys().next().value;
    this.joint.replaceChildren(...[...editor.bones].map(([id, bone]) => new Option(bone.name.replace(/^mixamorig[:_]?/i, '').replaceAll('_', ' '), id, false, id === this.id)));
    this.dope.hidden = this.mode !== 'channels'; this.container.querySelector('#curve-scroll').hidden = this.mode !== 'curves';
    this.fields.hidden = this.mode !== 'curves'; this.channelSelect.hidden = this.mode !== 'curves';
    this.selectedFrame = this.track.some(key => key.frame === Math.round(this.state.frame)) ? Math.round(this.state.frame) : this.selectedFrame;
    for (const button of document.querySelectorAll('[data-timeline-mode]')) button.setAttribute('aria-pressed', button.dataset.timelineMode === this.mode);
    this.drawRows(); this.drawGraph(); this.updateFields(); this.updateBatch();
  }

  drawRows() {
    const ids = new Set([...(this.state.keys.length ? [poseRow] : []), this.id, ...Object.keys(this.state.tracks), ...this.state.keys.flatMap(key => Object.keys(key.pose))]);
    const rows = [];
    for (const id of ids) {
      const bone = this.state.editor.bones.get(id); if (!bone && id !== poseRow) continue;
      const row = document.createElement('div'); row.className = 'dope-row' + (id === this.id ? ' selected' : '');
      const label = document.createElement('button'); label.className = 'dope-joint'; label.type = 'button';
      const name = id === poseRow ? 'Whole pose' : bone.name.replace(/^mixamorig[:_]?/i, '').replaceAll('_', ' ');
      label.textContent = name;
      label.addEventListener('click', () => { if (id !== poseRow) { this.id = id; this.api.select(id); this.refresh(); } });
      const lane = document.createElement('div'); lane.className = 'dope-lane'; lane.dataset.joint = id;
      const track = timelineTrack(this.state, id);
      for (const key of track) {
        const dot = document.createElement('button'); dot.className = 'dope-key'; dot.type = 'button';
        dot.dataset.frame = key.frame; dot.dataset.joint = id;
        dot.classList.toggle('selected', this.selection.has(keyToken(id, key.frame)));
        dot.setAttribute('aria-pressed', this.selection.has(keyToken(id, key.frame)));
        dot.style.left = key.frame / this.state.frames * 100 + '%';
        dot.setAttribute('aria-label', name + ' key at frame ' + key.frame);
        dot.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); this.selection = new Set([keyToken(id, key.frame)]); this.selectedFrame = key.frame; if (id !== poseRow) { this.id = id; this.api.select(id); } this.api.seek(key.frame); this.drawRows(); this.updateBatch(); } });
        lane.append(dot);
      }
      const cursor = document.createElement('span'); cursor.className = 'dope-playhead'; cursor.style.left = this.state.frame / this.state.frames * 100 + '%'; lane.append(cursor);
      row.append(label, lane); rows.push(row);
    }
    if (!rows.length) { const text = document.createElement('p'); text.textContent = 'Select a joint and choose Key joint to create a channel.'; rows.push(text); }
    const content = document.createElement('div'); content.className = 'dope-content'; content.style.width = this.zoom * 100 + '%'; content.append(...rows);
    this.dope.replaceChildren(content);
  }

  drawGraph() {
    if (!this.state.editor || this.mode !== 'curves') return;
    const track = this.track;
    const values = track.map(key => channelValue(key.transform, this.channel));
    let min = Math.min(0, ...values), max = Math.max(0, ...values);
    const pad = Math.max(this.channel[0] === 'r' ? 5 : 0.05, (max - min) * 0.22);
    min -= pad; max += pad;
    this.bounds = { min, max, left: 48, right: 640 * this.zoom - 20, top: 10, bottom: 122 };
    const b = this.bounds, x = frame => b.left + frame / this.state.frames * (b.right - b.left);
    const y = value => b.bottom - (value - min) / (max - min) * (b.bottom - b.top);
    const nodes = [];
    for (let i = 0; i <= 4; i++) {
      const value = min + (max - min) * i / 4;
      nodes.push(svgNode('line', { x1: b.left, x2: b.right, y1: y(value), y2: y(value), class: 'curve-grid' }));
      nodes.push(svgNode('text', { x: b.left - 7, y: y(value) + 3, 'text-anchor': 'end', class: 'curve-label' }, Number(value.toFixed(2))));
      const frame = Math.round(this.state.frames * i / 4);
      nodes.push(svgNode('text', { x: x(frame), y: 139, 'text-anchor': 'middle', class: 'curve-label' }, frame));
    }
    if (track.length) {
      const count = Math.min(320, Math.max(80, this.state.frames));
      const points = [];
      let previous;
      for (let i = 0; i <= count; i++) {
        const frame = this.state.frames * i / count;
        let value = channelValue(sampleJointTrack(track, frame), this.channel);
        if (this.channel[0] === 'r' && previous !== undefined) { while (value - previous > 180) value -= 360; while (value - previous < -180) value += 360; }
        previous = value;
        points.push(x(frame) + ',' + y(value));
      }
      nodes.push(svgNode('polyline', { points: points.join(' '), class: 'curve-line' }));
      const index = track.findIndex(key => key.frame === this.selectedFrame), key = track[index], next = track[index + 1];
      if (key?.curve === 'bezier' && next) {
        const ease = key.ease ?? defaultEase, a = channelValue(key.transform, this.channel), d = channelValue(next.transform, this.channel) - a;
        if (Math.abs(d) > 1e-8) for (let handle = 0; handle < 2; handle++) {
          const hx = x(key.frame + (next.frame - key.frame) * ease[handle * 2]);
          const hy = y(a + d * ease[handle * 2 + 1]);
          nodes.push(svgNode('line', { x1: x(handle ? next.frame : key.frame), y1: y(handle ? a + d : a), x2: hx, y2: hy, class: 'curve-handle-line' }));
          nodes.push(svgNode('circle', { cx: hx, cy: hy, r: 5, class: 'curve-handle', 'data-handle': handle }));
        }
      }
      for (const key of track) nodes.push(svgNode('circle', { cx: x(key.frame), cy: y(channelValue(key.transform, this.channel)), r: 4.5,
        class: 'curve-key' + (key.frame === this.selectedFrame ? ' selected' : ''), 'data-frame': key.frame, tabindex: 0, role: 'button', 'aria-label': 'Curve key at frame ' + key.frame }));
    } else nodes.push(svgNode('text', { x: 330, y: 67, 'text-anchor': 'middle', class: 'curve-empty' }, 'Key this joint to edit its animation curve'));
    nodes.push(svgNode('line', { x1: x(this.state.frame), x2: x(this.state.frame), y1: 8, y2: 123, class: 'curve-cursor' }));
    this.svg.replaceChildren(...nodes);
  }

  updateFields() {
    const key = this.track.find(key => key.frame === this.selectedFrame);
    this.curve.value = key?.curve ?? 'smooth';
    for (const input of this.fields.querySelectorAll('input')) input.disabled = !key;
    this.container.querySelector('#track-delete').disabled = !key;
    this.container.querySelector('#curve-frame').value = key?.frame ?? Math.round(this.state.frame);
    this.container.querySelector('#curve-frame').max = this.state.frames;
    this.container.querySelector('#curve-value').value = key ? Number(channelValue(key.transform, this.channel).toFixed(3)) : 0;
    this.container.querySelector('#bezier-fields').hidden = key?.curve !== 'bezier';
    const ease = key?.ease ?? defaultEase;
    for (let i = 0; i < 4; i++) this.container.querySelector('#ease-' + i).value = Number(ease[i].toFixed(3));
    this.container.querySelector('#curve-unit').textContent = channels.find(item => item[0] === this.channel)?.[2] || 'rig units';
  }

  beginDrag(event, source) {
    if (event.button !== 0 || !this.api.canEdit()) return;
    if (source === 'dope') { this.beginDopeDrag(event); return; }
    const target = event.target.closest('[data-frame], [data-handle]');
    if (!target) {
      if (source === 'graph') { const p = this.point(event); this.api.seek(Math.round((p.x - 48) / (640 * this.zoom - 68) * this.state.frames)); }
      return;
    }
    event.preventDefault();
    const laneBounds = source === 'dope' ? target.closest('.dope-lane').getBoundingClientRect() : null;
    if (source === 'dope') { this.id = target.dataset.joint; this.api.select(this.id); }
    if (target.dataset.frame !== undefined) this.selectedFrame = Number(target.dataset.frame);
    this.selection = new Set([keyToken(this.id, this.selectedFrame)]); this.updateBatch();
    this.api.seek(this.selectedFrame);
    this.api.begin(); this.dragging = true;
    const effective = this.state.tracks[this.id] ?? this.state.keys.map(key => ({ frame: key.frame,
      transform: structuredClone(samplePoseKeys(this.state.keys, key.frame)[this.id] ?? neutralTransform()), curve: key.curve, ...(key.ease ? { ease: [...key.ease] } : {}) }));
    this.dragState = { source, pointer: event.pointerId, frame: this.selectedFrame, track: structuredClone(effective),
      handle: target.dataset.handle !== undefined ? Number(target.dataset.handle) : null,
      lane: laneBounds,
      bounds: { ...this.bounds }, selected: this.selectedFrame };
    (source === 'graph' ? this.svg : this.dope).setPointerCapture(event.pointerId);
    this.drawGraph(); this.updateFields();
  }

  point(event) {
    const matrix = this.svg.getScreenCTM();
    if (matrix) return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const bounds = this.svg.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width * 640, y: (event.clientY - bounds.top) / bounds.height * 145 };
  }

  drag(event) {
    const drag = this.dragState; if (!drag || event.pointerId !== drag.pointer) return;
    if (drag.source === 'batch' || drag.source === 'box') { this.dragDope(event); return; }
    event.preventDefault();
    const track = structuredClone(drag.track), index = track.findIndex(key => key.frame === drag.frame), key = track[index];
    if (!key) return;
    let frame = drag.frame;
    if (drag.handle !== null) {
      const p = this.point(event), b = drag.bounds, next = track[index + 1]; if (!next) return;
      const a = channelValue(key.transform, this.channel), d = channelValue(next.transform, this.channel) - a;
      if (Math.abs(d) < 1e-8) return;
      key.curve = 'bezier'; key.ease ??= [...defaultEase];
      const time = (p.x - b.left) / (b.right - b.left) * this.state.frames;
      const value = b.min + (b.bottom - p.y) / (b.bottom - b.top) * (b.max - b.min);
      key.ease[drag.handle * 2] = Math.max(0, Math.min(1, (time - key.frame) / (next.frame - key.frame)));
      key.ease[drag.handle * 2 + 1] = Math.max(-3, Math.min(4, (value - a) / d));
    } else {
      const p = drag.source === 'graph' ? this.point(event) : null, b = drag.bounds;
      const amount = p ? (p.x - b.left) / (b.right - b.left) : (event.clientX - drag.lane.left) / drag.lane.width;
      frame = Math.max(0, Math.min(this.state.frames, Math.round(amount * this.state.frames)));
      if (track.some((item, i) => i !== index && item.frame === frame)) return;
      key.frame = frame;
      if (p) key.transform = withChannelValue(key.transform, this.channel,
        b.min + (b.bottom - p.y) / (b.bottom - b.top) * (b.max - b.min));
    }
    this.selectedFrame = frame;
    this.selection = new Set([keyToken(this.id, frame)]);
    this.api.preview(() => { this.state.tracks[this.id] = track.sort((a, b) => a.frame - b.frame); this.state.frame = frame; });
    this.drawGraph(); this.drawRows(); this.updateFields();
  }

  endDrag(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointer) return;
    if (this.dragState.source === 'box' || (this.dragState.source === 'batch' && !this.dragState.editing)) {
      this.box?.remove(); this.box = null; this.dragState = null; this.dragging = false; this.updateBatch(); return;
    }
    this.dragState = null; this.dragging = false; this.api.end(); this.refresh();
  }

  setZoom(value) {
    this.zoom = Math.max(1, Math.min(16, value)); this.container.querySelector('#timeline-zoom').value = this.zoom;
    this.svg.style.width = this.zoom * 100 + '%'; this.svg.setAttribute('viewBox', '0 0 ' + (640 * this.zoom) + ' 145'); this.drawRows(); this.drawGraph();
    if (this.zoom === 1) { this.dope.scrollLeft = 0; this.container.querySelector('#curve-scroll').scrollLeft = 0; }
  }

  selectAll() {
    this.selection = new Set([...this.dope.querySelectorAll('.dope-key')].map(node => keyToken(node.dataset.joint, Number(node.dataset.frame))));
    this.drawRows(); this.updateBatch();
  }

  copySelection() {
    const keys = copyTimelineKeys(this.state, this.selection);
    if (keys) { this.clipboard = { rig: rigSignature(this.state.editor), keys }; this.api.toast(keys.length + ' keys copied.'); }
    this.updateBatch();
  }

  pasteSelection(at = Math.round(this.state.frame), clipboard = this.clipboard) {
    if (clipboard?.rig !== rigSignature(this.state.editor)) { this.api.toast('Copy keys from this rig before pasting.'); return; }
    this.applyBatch({ clipboard: clipboard.keys, at });
  }

  duplicateSelection() {
    const keys = copyTimelineKeys(this.state, this.selection); if (!keys) return;
    this.pasteSelection(Math.max(...[...this.selection].map(token => parseToken(token).frame)) + 1, { rig: rigSignature(this.state.editor), keys });
  }

  applyBatch(options) {
    if (!this.api.canEdit()) return;
    const result = editTimelineKeys(this.state, this.selection, options);
    if (!result) { this.api.toast('Keys would overlap or leave the take. Choose another time or span.'); return; }
    this.api.commit(() => { this.state.keys = result.keys; this.state.tracks = result.tracks; this.state.draft = null; this.selection = result.selection; });
    this.updateBatch();
  }

  updateBatch() {
    const $ = id => this.container.querySelector('#' + id), count = this.selection.size, available = this.api.canEdit();
    $('timeline-selection-count').textContent = count + ' selected';
    const frames = [...this.selection].map(token => parseToken(token).frame), span = count ? Math.max(...frames) - Math.min(...frames) : 0;
    if (document.activeElement !== $('timeline-span')) $('timeline-span').value = span;
    for (const id of ['timeline-copy', 'timeline-duplicate', 'timeline-delete', 'timeline-move']) $(id).disabled = !available || !count;
    $('timeline-stretch').disabled = !available || span <= 0;
    $('timeline-paste').disabled = !available || this.clipboard?.rig !== rigSignature(this.state.editor);
  }

  handleShortcut(event) {
    if (this.mode === 'closed' || !this.api.canEdit() || this.state.target.startsWith('prop:')) return false;
    const key = event.key.toLowerCase(), modifier = event.ctrlKey || event.metaKey;
    if (modifier && key === 'a' && event.target.closest('#advanced-timeline')) this.selectAll();
    else if (modifier && key === 'c' && this.selection.size) this.copySelection();
    else if (modifier && key === 'v' && this.clipboard) this.pasteSelection();
    else if (modifier && key === 'd' && this.selection.size) this.duplicateSelection();
    else if (key === 'delete' && this.selection.size) this.applyBatch({ remove: true });
    else if (event.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(event.key) && this.selection.size) this.applyBatch({ delta: event.key === 'ArrowRight' ? 1 : -1 });
    else return false;
    event.preventDefault(); return true;
  }

  beginDopeDrag(event) {
    if (event.target.closest('.dope-joint')) return;
    event.preventDefault();
    const target = event.target.closest('.dope-key');
    if (!target) {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) this.selection.clear();
      this.dragState = { source: 'box', pointer: event.pointerId, x: event.clientX, y: event.clientY, selection: new Set(this.selection) };
      this.box = document.createElement('div'); this.box.className = 'key-selection-box'; this.dope.append(this.box);
    } else {
      const joint = target.dataset.joint, frame = Number(target.dataset.frame), token = keyToken(joint, frame);
      if (event.ctrlKey || event.metaKey) {
        if (this.selection.has(token)) this.selection.delete(token); else this.selection.add(token);
      } else if (event.shiftKey) {
        const a = Math.min(this.selectedFrame, frame), b = Math.max(this.selectedFrame, frame);
        for (const key of timelineTrack(this.state, joint)) if (key.frame >= a && key.frame <= b) this.selection.add(keyToken(joint, key.frame));
      } else if (!this.selection.has(token)) this.selection = new Set([token]);
      this.selectedFrame = frame;
      const laneWidth = target.closest('.dope-lane').getBoundingClientRect().width;
      if (joint !== poseRow) { this.id = joint; this.api.select(joint); }
      this.api.seek(frame);
      this.dragState = { source: 'batch', pointer: event.pointerId, x: event.clientX, laneWidth, selection: new Set(this.selection), keys: this.state.keys, tracks: this.state.tracks, editing: false };
      this.drawRows();
    }
    this.dope.setPointerCapture(event.pointerId); this.updateBatch();
  }

  dragDope(event) {
    const drag = this.dragState; event.preventDefault();
    if (drag.source === 'box') {
      const left = Math.min(drag.x, event.clientX), right = Math.max(drag.x, event.clientX), top = Math.min(drag.y, event.clientY), bottom = Math.max(drag.y, event.clientY);
      this.selection = new Set(drag.selection);
      for (const node of this.dope.querySelectorAll('.dope-key')) {
        const bounds = node.getBoundingClientRect(), x = (bounds.left + bounds.right) / 2, y = (bounds.top + bounds.bottom) / 2;
        if (x >= left && x <= right && y >= top && y <= bottom) this.selection.add(keyToken(node.dataset.joint, Number(node.dataset.frame)));
        node.classList.toggle('selected', this.selection.has(keyToken(node.dataset.joint, Number(node.dataset.frame))));
        node.setAttribute('aria-pressed', this.selection.has(keyToken(node.dataset.joint, Number(node.dataset.frame))));
      }
      const bounds = this.dope.getBoundingClientRect();
      Object.assign(this.box.style, { left: left - bounds.left + this.dope.scrollLeft + 'px', top: top - bounds.top + this.dope.scrollTop + 'px', width: right - left + 'px', height: bottom - top + 'px' });
      this.updateBatch(); return;
    }
    if (!drag.selection.size || Math.abs(event.clientX - drag.x) < 3 && !drag.editing) return;
    if (!drag.editing) { this.api.begin(); drag.editing = true; this.dragging = true; }
    const result = editTimelineKeys({ ...this.state, keys: drag.keys, tracks: drag.tracks }, drag.selection, { delta: Math.round((event.clientX - drag.x) / drag.laneWidth * this.state.frames) });
    if (!result) return;
    this.selection = result.selection;
    this.api.preview(() => { this.state.keys = result.keys; this.state.tracks = result.tracks; this.state.draft = null; });
    this.drawRows(); this.drawGraph(); this.updateBatch();
  }

  updateFrame(frame) {
    for (const node of this.dope.querySelectorAll('.dope-playhead')) node.style.left = frame / this.state.frames * 100 + '%';
    const x = 48 + frame / this.state.frames * (640 * this.zoom - 68);
    const cursor = this.svg.querySelector('.curve-cursor'); if (cursor) { cursor.setAttribute('x1', x); cursor.setAttribute('x2', x); }
  }
}
