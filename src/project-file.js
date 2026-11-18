// A small binary container keeps editable data and original assets together,
// without base64 copies of large models or videos in the JSON manifest.
const magic = new TextEncoder().encode('MROOM001');
const maxManifest = 16 * 1024 * 1024;
const blobFields = ['assetBlob', 'referenceBlob', 'mediaBlob'];

export const projectFilename = name => (String(name || 'animation').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'animation') + '.motionroom';

export function packProject(record) {
  if (!(record?.assetBlob instanceof Blob)) throw new Error('The project has no character data.');
  const data = { ...record };
  const blobs = [], assets = {};
  for (const field of blobFields) {
    const blob = record[field];
    delete data[field];
    if (!(blob instanceof Blob)) continue;
    let index = blobs.indexOf(blob);
    if (index < 0) { index = blobs.length; blobs.push(blob); }
    assets[field] = index;
  }
  const manifest = new TextEncoder().encode(JSON.stringify({ format: 'motion-room', version: 1, record: data, assets,
    files: blobs.map(blob => ({ size: blob.size, type: blob.type, name: blob.name ?? '' })) }));
  if (manifest.length > maxManifest) throw new Error('The editable project data is too large.');
  const header = new Uint8Array(12);
  header.set(magic);
  new DataView(header.buffer).setUint32(8, manifest.length, true);
  return new Blob([header, manifest, ...blobs], { type: 'application/x-motion-room' });
}

export async function unpackProject(file) {
  if (!(file instanceof Blob) || file.size < 12) throw new Error('Choose a complete .motionroom project.');
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!magic.every((byte, index) => header[index] === byte)) throw new Error('This is not a Motion Room project.');
  const length = new DataView(header.buffer).getUint32(8, true);
  if (!length || length > maxManifest || 12 + length > file.size) throw new Error('The project manifest is incomplete.');
  let manifest;
  try { manifest = JSON.parse(await file.slice(12, 12 + length).text()); }
  catch { throw new Error('The project manifest is invalid.'); }
  if (manifest?.format !== 'motion-room' || manifest.version !== 1) throw new Error('This project version is not supported.');
  const { record, files, assets } = manifest;
  if (!record || typeof record !== 'object' || Array.isArray(record) || record.schema !== 2
    || typeof record.name !== 'string' || ![24, 30, 60].includes(record.fps)
    || !Number.isInteger(record.frames) || record.frames < 1 || record.frames > record.fps * 3600
    || !Array.isArray(files) || files.length > 3 || !assets || !Number.isInteger(assets.assetBlob)
    || !['blank', 'clip'].includes(record.sourceMode)) throw new Error('The project has invalid animation data.');
  let offset = 12 + length;
  const blobs = files.map(entry => {
    if (!Number.isSafeInteger(entry?.size) || entry.size < 0 || offset + entry.size > file.size
      || typeof entry.type !== 'string' || entry.type.length > 256) throw new Error('The project assets are incomplete.');
    const blob = file.slice(offset, offset + entry.size, entry.type);
    offset += entry.size;
    return blob;
  });
  if (offset !== file.size) throw new Error('The project has unexpected trailing data.');
  const result = { ...record };
  // Do not accept manifest-supplied substitutes for binary assets.
  for (const field of blobFields) {
    delete result[field];
    if (assets[field] === undefined) continue;
    if (!Number.isInteger(assets[field]) || !blobs[assets[field]]) throw new Error('The project asset index is invalid.');
    result[field] = blobs[assets[field]];
  }
  if (!result.assetBlob.size) throw new Error('The character file is empty.');
  return result;
}
