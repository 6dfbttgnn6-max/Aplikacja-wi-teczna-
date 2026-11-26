// Łączenie obrazu z gotową ścieżką dźwiękową w jeden plik MP4 (dźwięk AAC) przy pomocy ffmpeg w przeglądarce.
// Używane tam, gdzie przeglądarka nie potrafi sama zakodować dźwięku AAC albo nagrała film bez dźwięku (iPhone).
import { FFmpeg } from '../vendor/ffmpeg/index.js';

let ff = null;

/** AudioBuffer -> plik WAV (16 bit, stereo). */
export function wavBytes(buffer) {
  const ch = Math.min(2, buffer.numberOfChannels);
  const L = buffer.getChannelData(0), R = ch > 1 ? buffer.getChannelData(1) : L;
  const n = L.length, sr = buffer.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
  str(36, 'data'); out.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    out.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    out.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true);
    o += 4;
  }
  return new Uint8Array(out.buffer);
}

async function load(onStatus) {
  if (ff) return ff;
  onStatus?.('Pobieram narzędzie do łączenia obrazu z dźwiękiem (jednorazowo, ok. 32 MB)…');
  const f = new FFmpeg();
  await f.load({
    coreURL: new URL('../vendor/ffmpeg/ffmpeg-core.js', import.meta.url).href,
    wasmURL: new URL('../vendor/ffmpeg/ffmpeg-core.wasm', import.meta.url).href,
  });
  ff = f;
  return ff;
}

/**
 * Łączy wideo (bez dźwięku albo z nieudanym dźwiękiem) z AudioBuffer.
 * Obraz jest kopiowany bez ponownego kodowania, dźwięk kodowany do AAC.
 */
export async function mergeAudio(videoBlob, audioBuffer, { onStatus, onProgress } = {}) {
  const f = await load(onStatus);
  onStatus?.('Łączę obraz z dźwiękiem…');
  const prog = ({ progress }) => onProgress?.(Math.max(0, Math.min(1, progress || 0)));
  f.on('progress', prog);
  try {
    const ext = /webm/.test(videoBlob.type) ? 'webm' : 'mp4';
    await f.writeFile(`v.${ext}`, new Uint8Array(await videoBlob.arrayBuffer()));
    await f.writeFile('a.wav', wavBytes(audioBuffer));
    const code = await f.exec([
      '-i', `v.${ext}`, '-i', 'a.wav',
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
      '-shortest', '-movflags', '+faststart', 'out.mp4',
    ]);
    if (code !== 0) throw new Error('Nie udało się połączyć obrazu z dźwiękiem.');
    const data = await f.readFile('out.mp4');
    return new Blob([data.buffer], { type: 'video/mp4' });
  } finally {
    f.off('progress', prog);
    for (const n of ['v.mp4', 'v.webm', 'a.wav', 'out.mp4']) { try { await f.deleteFile(n); } catch { /* */ } }
  }
}
