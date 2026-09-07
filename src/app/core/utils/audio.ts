/**
 * Convierte la grabación del micrófono a algo que Gemini acepte con seguridad.
 *
 * MediaRecorder entrega WebM/Opus (o MP4, según el navegador), formatos que la
 * API de Gemini no garantiza. Decodificamos, remuestreamos a 16 kHz mono y
 * reempaquetamos en WAV: es el formato de la lista soportada que podemos
 * generar sin librerías, y a 16 kHz mono un minuto pesa ~1,9 MB, holgado para
 * el límite de cuerpo de Vercel.
 */

/** Gemini transcribe igual de bien a 16 kHz, y pesa 3x menos que 48 kHz. */
const TARGET_RATE = 16_000;

export interface DecodedAudio {
  /** WAV mono 16 kHz, listo para subir. */
  wav: Blob;
  /** Pico de amplitud (0-1). Sirve para distinguir "no hablaste" de "micrófono mudo". */
  peak: number;
  seconds: number;
}

export async function toWav(recorded: Blob): Promise<DecodedAudio> {
  const bytes = await recorded.arrayBuffer();

  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close();
  }

  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const mono = (await offline.startRendering()).getChannelData(0);

  let peak = 0;
  for (let i = 0; i < mono.length; i++) {
    const v = Math.abs(mono[i]);
    if (v > peak) peak = v;
  }

  return { wav: encodeWav(mono, TARGET_RATE), peak, seconds: decoded.duration };
}

/** WAV PCM 16 bits mono. */
function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);          // tamaño del bloque fmt
  view.setUint16(20, 1, true);           // PCM sin comprimir
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);    // bytes por segundo
  view.setUint16(32, 2, true);           // alineación de bloque
  view.setUint16(34, 16, true);          // bits por muestra
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/** base64 sin el prefijo `data:`; por trozos para no reventar la pila con btoa. */
export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** El primer contenedor que soporte este navegador; Chrome/Edge dan WebM, Safari MP4. */
export function pickRecorderMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find(t => MediaRecorder.isTypeSupported(t));
}
