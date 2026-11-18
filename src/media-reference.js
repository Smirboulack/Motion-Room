export function restoreMediaSettings(value = {}) {
  return { name: String(value?.name ?? 'Reference').slice(0, 180),
    kind: value?.kind === 'video' ? 'video' : 'image',
    offset: Number.isFinite(value?.offset) ? Math.max(-3600, Math.min(3600, value.offset)) : 0,
    fps: Number.isFinite(value?.fps) ? Math.max(1, Math.min(120, value.fps)) : 30,
    linked: value?.linked !== false, visible: value?.visible !== false,
    time: Number.isFinite(value?.time) ? Math.max(0, value.time) : 0 };
}

export const mediaTime = (seconds, settings, duration) => Math.max(0, Math.min(Number.isFinite(duration) ? duration : 0,
  settings.linked ? seconds - settings.offset : settings.time));
export const mediaProjectFrame = (time, settings, fps) => Math.round((time + settings.offset) * fps);

export class MediaReference {
  constructor(container, board, api) {
    this.api = api; this.board = board; this.request = 0; this.boundBlob = null;
    container.innerHTML = `<div class="section-heading"><h2>Video & image reference</h2></div>
      <button class="button full-width" id="open-media-reference">Open video or image</button>
      <input type="file" id="media-reference-file" accept="video/*,image/*" hidden>
      <p class="subtle" id="media-reference-name">Add your own footage or a pose sheet.</p>
      <div id="media-reference-settings" hidden>
        <label class="checkbox-row"><input type="checkbox" id="show-media-reference" checked>Show reference board</label>
        <div id="media-video-settings">
          <label class="checkbox-row"><input type="checkbox" id="link-media-reference" checked>Link video to playhead</label>
          <div class="timing-fields"><label class="field">Start at project time (s)<input type="number" id="media-offset" step="0.01" min="-3600" max="3600" value="0"></label><label class="field">Source frame rate<input type="number" id="media-fps" min="1" max="120" step="1" value="30"></label></div>
          <label class="field">Video time <output id="media-time-label">0.00 s</output><input type="range" id="media-time" min="0" max="1" step="0.001" value="0"></label>
          <div class="compact-actions"><button class="button small" id="media-previous">Previous video frame</button><button class="button small" id="media-next">Next video frame</button></div>
          <button class="button small full-width" id="media-align">Align current video frame here</button>
        </div>
        <button class="button small full-width" id="remove-media-reference">Remove reference board</button>
      </div>`;
    board.innerHTML = `<div class="media-board-heading"><span id="media-board-title">Reference</span><button class="icon-button" id="hide-media-board" aria-label="Hide reference board">×</button></div><div id="media-board-content"></div>`;
    this.$ = id => document.getElementById(id);
    this.$('open-media-reference').addEventListener('click', () => this.$('media-reference-file').click());
    this.$('media-reference-file').addEventListener('change', event => {
      const file = event.target.files[0]; event.target.value = '';
      if (file) void this.import(file);
    });
    for (const [id, field] of [['show-media-reference', 'visible'], ['link-media-reference', 'linked']]) this.$(id).addEventListener('change', () => {
      if (field === 'linked' && !this.$(id).checked && this.video) this.state.mediaReference.time = this.video.currentTime;
      this.state.mediaReference[field] = this.$(id).checked; api.save(); this.refresh(); this.sync();
    });
    for (const [id, field] of [['media-offset', 'offset'], ['media-fps', 'fps']]) this.$(id).addEventListener('change', () => {
      this.state.mediaReference = restoreMediaSettings({ ...this.state.mediaReference, [field]: this.$(id).valueAsNumber });
      api.save(); this.refresh(); this.sync();
    });
    this.$('media-time').addEventListener('input', () => this.seekVideo(Number(this.$('media-time').value)));
    this.$('media-previous').addEventListener('click', () => this.seekVideo((this.video?.currentTime ?? 0) - 1 / this.state.mediaReference.fps));
    this.$('media-next').addEventListener('click', () => this.seekVideo((this.video?.currentTime ?? 0) + 1 / this.state.mediaReference.fps));
    this.$('media-align').addEventListener('click', () => {
      this.state.mediaReference.offset = this.state.frame / this.state.fps - (this.video?.currentTime ?? 0);
      this.state.mediaReference.linked = true; api.save(); this.refresh(); this.sync();
    });
    this.$('hide-media-board').addEventListener('click', () => { this.state.mediaReference.visible = false; api.save(); this.refresh(); });
    this.$('remove-media-reference').addEventListener('click', () => {
      this.state.mediaBlob = null; this.state.mediaReference = null; void this.bind(); api.save();
    });
  }

  get state() { return this.api.getState(); }

  async load(blob, settings) {
    const url = URL.createObjectURL(blob);
    const element = document.createElement(settings.kind === 'video' ? 'video' : 'img');
    if (settings.kind === 'video') { element.muted = true; element.playsInline = true; element.preload = 'auto'; }
    else element.alt = settings.name;
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('This reference took too long to open.')), 20000);
        const finish = fn => { clearTimeout(timer); element.onload = element.onloadeddata = element.onerror = null; fn(); };
        element.onload = element.onloadeddata = () => finish(resolve);
        element.onerror = () => finish(() => reject(new Error('This image or video format could not be opened.')));
        element.src = url;
      });
      return { element, url };
    } catch (error) { element.removeAttribute('src'); element.load?.(); URL.revokeObjectURL(url); throw error; }
  }

  release() {
    this.video?.pause();
    if (this.element) { this.element.removeAttribute('src'); this.element.load?.(); }
    if (this.url) URL.revokeObjectURL(this.url);
    this.video = this.element = this.url = null; this.boundBlob = null;
    this.$('media-board-content').replaceChildren();
  }

  async import(file) {
    if (!this.api.canEdit()) return;
    const kind = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name) ? 'video' : 'image';
    const settings = restoreMediaSettings({ name: file.name, kind }), request = ++this.request;
    try {
      const loaded = await this.load(file, settings);
      if (request !== this.request || !this.api.canEdit()) { loaded.element.pause?.(); URL.revokeObjectURL(loaded.url); return; }
      this.install(loaded, file); this.state.mediaBlob = file; this.state.mediaReference = settings;
      this.refresh(); this.sync(); this.api.save();
    } catch (error) { if (request === this.request) this.api.toast(error.message); }
  }

  install({ element, url }, blob) {
    this.release(); this.boundBlob = blob; this.element = element; this.url = url;
    this.video = element.tagName === 'VIDEO' ? element : null;
    this.$('media-board-content').replaceChildren(element);
  }

  async bind() {
    const request = ++this.request, blob = this.state.mediaBlob;
    if (!blob || !this.state.mediaReference) { this.release(); this.refresh(); return; }
    if (blob === this.boundBlob) { this.refresh(); this.sync(); return; }
    try {
      const loaded = await this.load(blob, this.state.mediaReference);
      if (request !== this.request) { loaded.element.pause?.(); URL.revokeObjectURL(loaded.url); return; }
      this.install(loaded, blob); this.refresh(); this.sync();
    } catch (error) { if (request === this.request) { this.release(); this.refresh(); this.api.toast(error.message); } }
  }

  seekVideo(time) {
    if (!this.video || !this.api.canEdit()) return;
    const settings = this.state.mediaReference;
    time = Math.max(0, Math.min(this.video.duration, time)); settings.time = time;
    if (settings.linked) {
      const frame = mediaProjectFrame(time, settings, this.state.fps);
      if (frame < 0 || frame > this.state.frames) { settings.linked = false; this.refresh(); }
      else this.api.seek(frame);
    }
    this.video.currentTime = time; this.api.save(); this.updateTime();
  }

  sync() {
    const settings = this.state.mediaReference, video = this.video;
    if (!video || !settings) return;
    const seconds = this.state.frame / this.state.fps;
    const time = mediaTime(seconds, settings, video.duration);
    const playing = this.state.playing && settings.linked && settings.visible && seconds >= settings.offset && time < video.duration;
    video.playbackRate = this.state.speed;
    if (Math.abs(video.currentTime - time) > (playing ? 0.12 : 0.001)) {
      if (!video.seeking || !playing) video.currentTime = time;
    }
    if (playing && video.paused) void video.play().catch(() => {});
    else if (!playing && !video.paused) video.pause();
    this.updateTime();
  }

  updateTime() {
    if (!this.video) return;
    this.$('media-time').max = this.video.duration || 1;
    this.$('media-time').value = this.video.currentTime;
    this.$('media-time-label').textContent = this.video.currentTime.toFixed(2) + ' s';
  }

  refresh() {
    const settings = this.state.mediaReference, present = Boolean(settings && this.state.mediaBlob);
    this.board.hidden = !present || !settings.visible || !this.element;
    this.$('media-reference-settings').hidden = !present;
    this.$('media-reference-name').textContent = present ? settings.name : 'Add your own footage or a pose sheet.';
    if (!present) return;
    this.$('media-board-title').textContent = settings.name;
    this.$('media-video-settings').hidden = settings.kind !== 'video';
    this.$('show-media-reference').checked = settings.visible; this.$('link-media-reference').checked = settings.linked;
    this.$('media-offset').value = Number(settings.offset.toFixed(3)); this.$('media-fps').value = settings.fps;
  }
}
