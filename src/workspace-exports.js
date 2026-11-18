import { Group } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { exportAnimation } from './animation-editor.js';
import { CanvasRecorder } from './recorder.js';
import { WebMWriter } from './webm-writer.js';

export const safeFilename = name => String(name || 'animation').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'animation';
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.hidden = true;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const breathe = () => new Promise(resolve => setTimeout(resolve, 0));

export class WorkspaceExports {
  constructor(stage, api) {
    this.stage = stage; this.api = api; this.controller = null;
    this.$ = id => document.getElementById(id);
    this.recorder = new CanvasRecorder(stage.renderer.domElement, {
      prepare: (width, height) => {
        this.playback = this.capturePlayback();
        Object.assign(this.state, { frame: 0, playing: true, referenceFrame: null });
        stage.setInteraction(false); stage.setCaptureSize(width, height); api.draw(); stage.render(0);
      },
      restore: () => { Object.assign(this.state, this.playback); stage.endCapture(); api.refresh(); this.$('export-progress-dialog').close(); },
      onStop: ({ blob, filename }) => { downloadBlob(blob, filename); api.toast('Video exported.'); },
      onError: message => { this.$('export-progress-dialog').close(); api.toast(message); },
    });
    this.$('cancel-export').addEventListener('click', () => this.cancel());
    this.$('export-progress-dialog').addEventListener('cancel', event => { event.preventDefault(); this.cancel(); });
    this.$('export-frame-video').disabled = typeof VideoEncoder === 'undefined';
    if (typeof VideoEncoder === 'undefined') this.$('frame-video-support').textContent = 'Frame-by-frame video needs WebCodecs. Quick video is available when your browser supports recording.';
  }

  get state() { return this.api.getState(); }
  capturePlayback() { return { frame: this.state.frame, playing: this.state.playing, referenceFrame: this.state.referenceFrame }; }
  progress(value, label = 'Exporting…') {
    this.$('export-progress').value = value;
    this.$('export-progress-label').textContent = label;
  }

  cancel() {
    if (this.controller) { this.controller.abort(); this.progress(this.$('export-progress').value, 'Cancelling…'); }
    else if (this.recorder.busy) { this.recorder.stop({ discard: true }); this.api.toast('Video export cancelled.'); }
  }

  async run(label, action, capture = null) {
    if (!this.api.canEdit()) return;
    const playback = this.capturePlayback(); this.controller = new AbortController();
    const signal = this.controller.signal;
    this.state.exporting = true; this.state.playing = false;
    this.$('export-dialog').close(); this.$('export-progress-dialog').showModal(); this.progress(0, label);
    this.api.refresh(); this.stage.setInteraction(false);
    try {
      await breathe(); signal.throwIfAborted();
      if (capture) this.stage.setCaptureSize(capture.width, capture.height);
      const result = await action(signal);
      signal.throwIfAborted();
      downloadBlob(result.blob, result.filename); this.api.toast(result.message);
    } catch (error) {
      if (signal.aborted) this.api.toast('Export cancelled.');
      else { console.warn(error); this.api.toast(error.message || 'This export could not be completed.'); }
    } finally {
      if (capture) this.stage.endCapture();
      Object.assign(this.state, playback, { exporting: false }); this.controller = null;
      this.$('export-progress-dialog').close(); this.api.refresh();
    }
  }

  glb(includeScene = false) {
    return this.run('Baking animation…', async signal => {
      const state = this.state;
      state.editor.tracks = state.tracks; state.editor.contacts = state.contacts;
      let root = state.editor.root, sample = time => state.editor.sample(state.keys, time * state.fps, state.frames);
      if (includeScene && state.props.length) {
        const character = clone(root), originals = [], copies = [];
        root.traverse(node => originals.push(node)); character.traverse(node => copies.push(node));
        root = new Group(); root.name = state.name; root.add(character, this.stage.sceneObjects.exportClone());
        sample = time => {
          state.editor.sample(state.keys, time * state.fps, state.frames);
          originals.forEach((node, index) => {
            copies[index].position.copy(node.position); copies[index].quaternion.copy(node.quaternion); copies[index].scale.copy(node.scale);
            if (node.morphTargetInfluences) copies[index].morphTargetInfluences = [...node.morphTargetInfluences];
          });
        };
      }
      const credit = (state.editor.reference.model.userData.sourceCredits ?? []).join(' · ') || state.reference?.source?.credit;
      const bytes = await exportAnimation({ root, sample, duration: state.frames / state.fps, fps: state.fps, name: state.name, credit, signal,
        onProgress: value => this.progress(value, value < 0.9 ? 'Baking animation… ' + Math.round(value * 100) + '%' : 'Writing GLB…') });
      return { blob: new Blob([bytes], { type: 'model/gltf-binary' }), filename: safeFilename(state.name) + '.glb', message: 'Animated character exported.' };
    });
  }

  video({ height = 720, fps = 30 } = {}) {
    const width = Math.round(height * 16 / 9);
    return this.run('Preparing frame-by-frame video…', async signal => {
      if (typeof VideoEncoder === 'undefined') throw new Error('This browser does not support frame-by-frame video. Use Quick video.');
      const config = { codec: 'vp8', width, height, bitrate: height >= 1080 ? 12000000 : 6000000, framerate: fps };
      const support = await VideoEncoder.isConfigSupported(config);
      if (!support.supported) throw new Error('VP8 encoding is unavailable at this size. Try 720p or Quick video.');
      const duration = this.state.frames / this.state.fps, count = Math.max(1, Math.round(duration * fps));
      const writer = new WebMWriter({ width, height, fps, title: this.state.name });
      let failure;
      const encoder = new VideoEncoder({ output: chunk => { try { writer.addChunk(chunk); } catch (error) { failure = error; } }, error: error => { failure = error; } });
      try {
        encoder.configure(support.config);
        for (let index = 0; index < count; index++) {
          signal.throwIfAborted(); if (failure) throw failure;
          this.state.frame = index / fps * this.state.fps; this.state.referenceFrame = null;
          this.api.draw(); this.stage.render(0);
          const frame = new VideoFrame(this.stage.renderer.domElement, { timestamp: Math.round(index / fps * 1e6), duration: Math.round(1e6 / fps) });
          try { encoder.encode(frame, { keyFrame: index % (fps * 2) === 0 }); } finally { frame.close(); }
          if (index % 8 === 7 || index === count - 1) {
            await encoder.flush(); signal.throwIfAborted(); if (failure) throw failure;
            this.progress((index + 1) / count * 0.95, 'Rendering frame ' + (index + 1) + ' of ' + count); await breathe();
          }
        }
        this.progress(0.98, 'Writing video…'); await breathe(); signal.throwIfAborted();
        return { blob: writer.finish(duration), filename: safeFilename(this.state.name) + '.webm', message: 'Frame-by-frame video exported.' };
      } finally { if (encoder.state !== 'closed') encoder.close(); }
    }, { width, height });
  }

  quickVideo(options) {
    if (!this.api.canEdit()) return;
    this.$('export-dialog').close();
    if (this.recorder.start({ ...options, name: safeFilename(this.state.name) })) {
      this.progress(0, 'Recording video…'); this.$('export-progress-dialog').showModal(); this.api.refresh();
    }
  }

  updateRecording() {
    if (this.recorder.active) this.progress(this.state.frame / this.state.frames, 'Recording video… ' + Math.round(this.state.frame / this.state.frames * 100) + '%');
  }
}
