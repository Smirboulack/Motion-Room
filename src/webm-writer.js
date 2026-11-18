// Minimal seekable, video-only WebM muxer for WebCodecs VP8 output.
// Timestamps are in milliseconds with the standard 1,000,000 ns timecode scale.
const text = value => new TextEncoder().encode(value);
const join = arrays => {
  const result = new Uint8Array(arrays.reduce((size, bytes) => size + bytes.length, 0));
  let offset = 0; for (const bytes of arrays) { result.set(bytes, offset); offset += bytes.length; }
  return result;
};
const id = value => Uint8Array.from(value.toString(16).padStart(Math.ceil(value.toString(16).length / 2) * 2, '0').match(/../g).map(byte => parseInt(byte, 16)));
const uint = (value, width = Math.max(1, Math.ceil(Math.log2(Math.max(1, value) + 1) / 8))) => {
  const bytes = new Uint8Array(width); let number = BigInt(Math.round(value));
  for (let i = width - 1; i >= 0; i--) { bytes[i] = Number(number & 255n); number >>= 8n; }
  return bytes;
};
const size = value => {
  let width = 1; while (BigInt(value) >= (1n << BigInt(7 * width)) - 1n) width++;
  const bytes = uint(value, width); bytes[0] |= 1 << (8 - width); return bytes;
};
const element = (tag, payload) => {
  const bytes = Array.isArray(payload) ? join(payload) : payload;
  return join([id(tag), size(bytes.length), bytes]);
};
const number = (tag, value, width) => element(tag, uint(value, width));
const string = (tag, value) => element(tag, text(value));
const float = value => { const bytes = new Uint8Array(8); new DataView(bytes.buffer).setFloat64(0, value); return bytes; };

export class WebMWriter {
  constructor({ width, height, fps, title = 'Motion Room' }) {
    if (![width, height, fps].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid video dimensions or frame rate.');
    Object.assign(this, { width, height, fps, title }); this.chunks = []; this.lastTime = -1;
  }

  addChunk(chunk) {
    if (chunk.timestamp < 0 || chunk.timestamp < this.lastTime || (!this.chunks.length && chunk.type !== 'key')) throw new Error('Video frames arrived out of order.');
    const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
    this.chunks.push({ time: Math.round(chunk.timestamp / 1000), key: chunk.type === 'key', data }); this.lastTime = chunk.timestamp;
  }

  finish(duration) {
    if (!this.chunks.length) throw new Error('No video frames were encoded.');
    const header = element(0x1a45dfa3, [number(0x4286, 1), number(0x42f7, 1), number(0x42f2, 4), number(0x42f3, 8),
      string(0x4282, 'webm'), number(0x4287, 4), number(0x4285, 2)]);
    const info = element(0x1549a966, [number(0x2ad7b1, 1000000), string(0x4d80, 'Motion Room'), string(0x5741, 'Motion Room'),
      string(0x7ba9, this.title.slice(0, 160)), element(0x4489, float(duration * 1000))]);
    const tracks = element(0x1654ae6b, [element(0xae, [number(0xd7, 1), number(0x73c5, 1), number(0x83, 1), number(0x9c, 0),
      string(0x86, 'V_VP8'), number(0x23e383, Math.round(1e9 / this.fps)),
      element(0xe0, [number(0xb0, this.width), number(0xba, this.height)])])]);
    const clusters = []; let blocks = [], base = 0;
    const flush = () => { if (blocks.length) { clusters.push({ base, bytes: element(0x1f43b675, [number(0xe7, base), ...blocks]) }); blocks = []; } };
    for (const chunk of this.chunks) {
      if (blocks.length && (chunk.key || chunk.time - base > 30000)) flush();
      if (!blocks.length) base = chunk.time;
      const block = new Uint8Array(4 + chunk.data.length); block[0] = 0x81;
      new DataView(block.buffer).setInt16(1, chunk.time - base); block[3] = chunk.key ? 0x80 : 0;
      block.set(chunk.data, 4); blocks.push(element(0xa3, block));
    }
    flush(); this.chunks = [];
    const seek = (tag, offset) => element(0x4dbb, [element(0x53ab, id(tag)), number(0x53ac, offset, 8)]);
    const seekHead = (a, b, c) => element(0x114d9b74, [seek(0x1549a966, a), seek(0x1654ae6b, b), seek(0x1c53bb6b, c)]);
    const headSize = seekHead(0, 0, 0).length;
    let offset = headSize + info.length + tracks.length;
    const cuePoints = clusters.map(cluster => {
      const cue = element(0xbb, [number(0xb3, cluster.base), element(0xb7, [number(0xf7, 1), number(0xf1, offset)])]);
      offset += cluster.bytes.length; return cue;
    });
    const cues = element(0x1c53bb6b, cuePoints), seeks = seekHead(headSize, headSize + info.length, offset);
    const parts = [seeks, info, tracks, ...clusters.map(cluster => cluster.bytes), cues];
    const payloadSize = parts.reduce((sum, bytes) => sum + bytes.length, 0);
    return new Blob([header, id(0x18538067), size(payloadSize), ...parts], { type: 'video/webm' });
  }
}
