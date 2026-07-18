export async function sha256Hex(value: Blob | ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 is unavailable in this browser context.')
  }

  const bytes = value instanceof Blob ? await value.arrayBuffer() : value
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
