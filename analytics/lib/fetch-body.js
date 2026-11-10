// Read at most `cap` bytes of a fetch response body, then cancel the rest,
// so a never-ending or enormous page cannot fill Pulse's memory. Same
// UTF-8 decoding as res.text(); fetch has already decompressed the body.
export async function readBodyCapped(res, cap) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < cap) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return new TextDecoder().decode(Buffer.concat(chunks, size).subarray(0, cap));
}
