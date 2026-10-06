/** Inspect top-level MP4 atoms without searching compressed payload bytes. */
export function hasFastStart(bytes: Buffer): boolean {
  let offset = 0;
  let mediaSeen = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    let size = bytes.readUInt32BE(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length) throw new Error('Truncated MP4 extended atom');
      const extended = bytes.readBigUInt64BE(offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('MP4 atom exceeds supported size');
      size = Number(extended);
      header = 16;
    } else if (size === 0) size = bytes.length - offset;
    if (size < header || offset + size > bytes.length) throw new Error('Invalid MP4 atom size');
    if (type === 'moov') return !mediaSeen;
    if (type === 'mdat') mediaSeen = true;
    offset += size;
  }
  throw new Error('MP4 has no movie metadata atom');
}
