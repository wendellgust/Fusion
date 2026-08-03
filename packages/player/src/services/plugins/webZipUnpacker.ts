// Pure JS Zip Unpacker using native DecompressionStream for Web Browser Mode

export async function unpackZipInMemory(
  zipBuffer: ArrayBuffer,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const bytes = new Uint8Array(zipBuffer);
  const view = new DataView(zipBuffer);

  let offset = 0;
  while (offset < bytes.length - 30) {
    // Check PK\x03\x04 signature
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x03 &&
      bytes[offset + 3] === 0x04
    ) {
      const compressionMethod = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const fileNameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);

      const fileNameBytes = bytes.subarray(
        offset + 30,
        offset + 30 + fileNameLen,
      );
      const fileName = new TextDecoder().decode(fileNameBytes);

      const dataOffset = offset + 30 + fileNameLen + extraLen;
      const compressedData = bytes.subarray(
        dataOffset,
        dataOffset + compressedSize,
      );

      if (compressedSize > 0 && !fileName.endsWith('/')) {
        let fileBytes = compressedData;
        if (compressionMethod === 8) {
          try {
            if (typeof DecompressionStream !== 'undefined') {
              const ds = new DecompressionStream('deflate-raw');
              const writer = ds.writable.getWriter();
              writer.write(compressedData);
              writer.close();
              const res = new Response(ds.readable);
              fileBytes = new Uint8Array(await res.arrayBuffer());
            }
          } catch (err) {
            console.warn(`Deflate failed for ${fileName}:`, err);
          }
        }
        const textContent = new TextDecoder().decode(fileBytes);
        const cleanName = fileName.replace(/^[^/]+\//, ''); // strip top-level directory if present
        files.set(cleanName, textContent);
        files.set(fileName, textContent);
      }

      offset = dataOffset + compressedSize;
    } else {
      offset++;
    }
  }

  return files;
}
