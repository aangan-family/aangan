/**
 * Speak-to-write sends a small, plain WAV (16 kHz, mono, 16-bit) whatever the phone recorded in
 * (webm on Android/Chrome, mp4 on iPhone), so the speech model always understands it.
 * One minute ≈ 1.9 MB. Recordings never leave the browser except for that one request.
 */
export const RATE = 16000;
export const MAX_SECONDS = 60;

/** Float samples (−1…1) → a WAV file. */
export function encodeWav(samples: Float32Array, rate = RATE): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

/** Quiet recordings come out louder; silence stays silence. */
export function normalise(samples: Float32Array): Float32Array {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak < 0.01 || peak > 0.5) return samples;
  const g = Math.min(0.9 / peak, 8);
  return samples.map((s) => s * g);
}

/** Whatever the browser recorded → 16 kHz mono WAV, at most a minute. */
export async function toWav(recording: Blob): Promise<Blob> {
  const buf = await recording.arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try { decoded = await ctx.decodeAudioData(buf); } finally { ctx.close().catch(() => {}); }
  const seconds = Math.min(decoded.duration, MAX_SECONDS);
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(seconds * RATE)), RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const mono = await off.startRendering();
  return new Blob([encodeWav(normalise(mono.getChannelData(0))) as BlobPart], { type: 'audio/wav' });
}
