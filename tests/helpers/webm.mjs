// Independent EBML inspection of real exported files, used by browser regressions.
export function inspectWebM(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let frames = 0, defaultDuration = 0, width = 0, height = 0;
  const vint = (offset, keepMarker) => {
    const first = bytes[offset]; if (!first) throw new Error('Invalid EBML integer.');
    let length = 1; while (!(first & (1 << (8 - length)))) length++;
    let value = keepMarker ? first : first & ((1 << (8 - length)) - 1);
    for (let index = 1; index < length; index++) value = value * 256 + bytes[offset + index];
    return { length, value };
  };
  const integer = (offset, size) => { let value = 0; for (let i = 0; i < size; i++) value = value * 256 + bytes[offset + i]; return value; };
  const masters = new Set([0x18538067, 0x1654ae6b, 0xae, 0xe0, 0x1f43b675]);
  const walk = (start, end) => {
    let offset = start;
    while (offset < end) {
      const tag = vint(offset, true), size = vint(offset + tag.length, false);
      const data = offset + tag.length + size.length, next = data + size.value;
      if (next > end || next <= offset) throw new Error('Incomplete WebM element.');
      if (tag.value === 0xa3) frames++;
      if (tag.value === 0x23e383) defaultDuration = integer(data, size.value);
      if (tag.value === 0xb0) width = integer(data, size.value);
      if (tag.value === 0xba) height = integer(data, size.value);
      if (masters.has(tag.value)) walk(data, next);
      offset = next;
    }
  };
  if (view.getUint32(0) !== 0x1a45dfa3) throw new Error('Missing EBML header.');
  walk(0, bytes.length);
  return { frames, fps: defaultDuration ? 1e9 / defaultDuration : 0, width, height };
}
