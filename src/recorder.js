/** Capture the canvas using the container and codec supported by the browser. */
export class CanvasRecorder {
  constructor(canvas, { prepare, restore, onStop, onError }) {
    this.canvas = canvas;
    this.prepare = prepare;
    this.restore = restore;
    this.onStop = onStop;
    this.onError = onError;
    this.recorder = null;
    this.stream = null;
    this.url = null;
    const formats = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    this.mimeType = typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function' ? formats.find(type => MediaRecorder.isTypeSupported(type)) : null;
  }
  get supported() { return Boolean(this.mimeType); }
  get extension() { return this.mimeType?.includes('mp4') ? 'mp4' : 'webm'; }
  get active() { return this.recorder?.state === 'recording'; }
  get busy() { return Boolean(this.recorder); }

  start({ height = 1080, fps = 30, name = 'animation' } = {}) {
    if (!this.supported || this.busy) return false;
    this.discard = false;
    let prepared = false;
    try {
      prepared = true;
      this.prepare(Math.round(height * 16 / 9), height);
      this.stream = this.canvas.captureStream(fps);
      const recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType, videoBitsPerSecond: height >= 1080 ? 12_000_000 : 6_000_000 });
      this.recorder = recorder;
      this.startedAt = performance.now();
      const chunks = [];
      let failed = false;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = event => {
        failed = true;
        this.onError('The browser stopped encoding the video.');
        if (recorder.state !== 'inactive') recorder.stop();
        else this.cleanup();
      };
      recorder.onstop = () => {
        const actualType = recorder.mimeType || this.mimeType;
        const extension = actualType.includes('mp4') ? 'mp4' : 'webm';
        this.cleanup();
        if (failed || this.discard) return;
        if (!chunks.length) { this.onError('No frames were recorded. Start the export again.'); return; }
        if (this.url) URL.revokeObjectURL(this.url);
        const blob = new Blob(chunks, { type: actualType });
        this.url = URL.createObjectURL(blob);
        this.onStop({ url: this.url, blob, filename: `motion-room-${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}` });
      };
      recorder.start(250);
      return true;
    } catch (error) {
      this.stream?.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.recorder = null;
      if (prepared) this.restore();
      console.warn(error);
      this.onError('Video export could not start.');
      return false;
    }
  }
  stop({ discard = false } = {}) { if (this.active) { this.discard = discard; this.recorder.stop(); } }
  cleanup() {
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.recorder = null;
    this.restore();
  }
  dispose() {
    this.stop();
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.url) URL.revokeObjectURL(this.url);
  }
}
