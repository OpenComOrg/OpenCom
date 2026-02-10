export function ulidLike(): string {
  // Not a true ULID, but time-sort-ish and unique enough for MVP.
  const t = Date.now().toString(36).padStart(10, "0");
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  const r = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${t}_${r}`;
}
