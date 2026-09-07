import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { toWav, toBase64, pickRecorderMimeType } from '../utils/audio';

/** Fields /api/voice-to-product can fill in. Everything is optional. */
export interface VoiceProductDraft {
  sku?: string;
  name?: string;
  description?: string;
  unit?: string;
  price?: number;
  cost?: number;
  stock_current?: number;
  stock_minimum?: number;
  location?: string;
  category_id?: string;
  supplier_id?: string;
}

export interface VoiceExtractContext {
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  units: string[];
}

/** Lo que devuelve Gemini: los campos y lo que entendió del audio. */
export interface VoiceExtraction {
  product: VoiceProductDraft;
  transcript: string;
}

export interface VoiceListenHandlers {
  /**
   * Vista previa en vivo, si el reconocedor del navegador colabora. Es
   * decorativo: el dictado funciona igual aunque nunca se dispare.
   */
  onTranscript: (text: string) => void;
  /** Grabación terminada. `preview` es lo que alcanzó a oír el navegador. */
  onEnd: (audio: Blob, preview: string) => void;
  onError: (message: string) => void;
}

// Minimal shape of the Web Speech API — it is not in lib.dom's typings.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>>;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const MIC_ERRORS: Record<string, string> = {
  NotAllowedError: 'No diste permiso al micrófono. Habilítalo en el candado de la barra de direcciones.',
  SecurityError: 'No diste permiso al micrófono. Habilítalo en el candado de la barra de direcciones.',
  NotFoundError: 'No se encontró ningún micrófono conectado.',
  NotReadableError: 'Otra aplicación está usando el micrófono. Ciérrala e intenta de nuevo.',
  OverconstrainedError: 'El micrófono seleccionado no es compatible.',
};

/** Corte duro: más allá de esto el audio pesa de más y el dictado deja de ser útil. */
const MAX_RECORDING_MS = 45_000;
/** Por debajo de este pico la grabación es silencio: el micrófono no captó nada. */
const SILENCE_PEAK = 0.01;

/**
 * Dictado de productos.
 *
 * Grabamos el audio y /api/voice-to-product se lo pasa a Gemini, que transcribe
 * y extrae los campos en una sola llamada. La Web Speech API del navegador se
 * usa únicamente para ir mostrando texto mientras el usuario habla: en Chrome
 * sobre Windows el servicio de reconocimiento de Google suele no devolver nunca
 * un resultado, así que no puede ser la fuente de verdad — antes lo era, y por
 * eso el dictado moría con "no se escuchó nada".
 */
@Injectable({ providedIn: 'root' })
export class VoiceProductService {
  private readonly auth = inject(AuthService);

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recognition: SpeechRecognitionLike | null = null;
  private handlers: VoiceListenHandlers | null = null;
  private preview = '';
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private mode: 'idle' | 'recording' | 'finishing' | 'aborting' = 'idle';

  private get speechCtor(): SpeechRecognitionCtor | null {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }

  /** Basta con poder grabar; ya no dependemos del reconocedor del navegador. */
  get supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async start(handlers: VoiceListenHandlers): Promise<void> {
    if (!this.supported) {
      handlers.onError('Tu navegador no permite grabar audio. Usa Chrome, Edge o Safari.');
      return;
    }

    this.abort();
    this.handlers = handlers;
    this.preview = '';
    this.chunks = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e: unknown) {
      const name = e instanceof DOMException ? e.name : '';
      this.reset();
      handlers.onError(MIC_ERRORS[name] ?? 'No se pudo abrir el micrófono.');
      return;
    }

    // start() es asíncrono: el usuario pudo cancelar mientras pedíamos permiso.
    if (this.handlers !== handlers) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    this.stream = stream;
    this.mode = 'recording';

    const mimeType = pickRecorderMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    recorder.onstop = () => this.finish(recorder.mimeType || mimeType || 'audio/webm');
    recorder.onerror = () => this.fail('Se cortó la grabación del micrófono.');
    this.recorder = recorder;
    recorder.start();

    this.maxTimer = setTimeout(() => this.stop(), MAX_RECORDING_MS);
    this.startPreview();
  }

  /** Cierra la grabación y dispara onEnd con el audio capturado. */
  stop(): void {
    if (this.mode !== 'recording') return;
    this.mode = 'finishing';
    this.clearTimer();
    this.stopPreview();
    this.recorder?.stop();
  }

  /** Corta y descarta todo. */
  abort(): void {
    this.clearTimer();
    this.stopPreview();
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.mode = 'aborting';
      this.recorder.stop();
    }
    this.releaseStream();
    this.reset();
  }

  /**
   * Reconocimiento del navegador, solo para el texto en vivo. Cualquier fallo se
   * ignora en silencio: el audio grabado es el que manda.
   */
  private startPreview(): void {
    const Ctor = this.speechCtor;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = 'es-PE';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0]?.transcript ?? '';
      }
      this.preview = text.trim();
      this.handlers?.onTranscript(this.preview);
    };
    rec.onerror = () => { /* sin ruido: la vista previa es opcional */ };
    // Chrome corta a los pocos segundos de silencio; lo relanzamos mientras grabemos.
    rec.onend = () => {
      if (this.recognition !== rec) return;
      this.recognition = null;
      if (this.mode === 'recording') this.startPreview();
    };

    this.recognition = rec;
    try {
      rec.start();
    } catch {
      this.recognition = null; // el micrófono aún no se soltó; sin vista previa
    }
  }

  private stopPreview(): void {
    const rec = this.recognition;
    this.recognition = null;
    rec?.abort();
  }

  private finish(mimeType: string): void {
    const handlers = this.handlers;
    const preview = this.preview;
    const chunks = this.chunks;
    const aborted = this.mode === 'aborting';

    this.releaseStream();
    this.reset();
    if (aborted || !handlers) return;

    if (!chunks.length) {
      handlers.onError('No se grabó nada. Revisa que el micrófono esté activo.');
      return;
    }
    handlers.onEnd(new Blob(chunks, { type: mimeType }), preview);
  }

  private fail(message: string): void {
    const handlers = this.handlers;
    this.releaseStream();
    this.reset();
    handlers?.onError(message);
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  private reset(): void {
    this.clearTimer();
    this.mode = 'idle';
    this.handlers = null;
    this.recorder = null;
    this.chunks = [];
    this.preview = '';
  }

  private clearTimer(): void {
    if (this.maxTimer !== null) clearTimeout(this.maxTimer);
    this.maxTimer = null;
  }

  /**
   * Manda el audio (y la vista previa, como pista) a Gemini vía /api y devuelve
   * los campos ya estructurados junto con lo que transcribió.
   */
  async extract(
    audio: Blob,
    preview: string,
    context: VoiceExtractContext,
  ): Promise<VoiceExtraction> {
    const { wav, peak } = await toWav(audio);
    if (peak < SILENCE_PEAK) {
      throw new Error('El micrófono no captó sonido. Revisa que sea el correcto y que no esté silenciado.');
    }

    const session = await this.auth.getSession();
    const res = await fetch('/api/voice-to-product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        audio: { data: await toBase64(wav), mimeType: 'audio/wav' },
        text: preview,
        categories: context.categories.map(c => ({ id: c.id, name: c.name })),
        suppliers: context.suppliers.map(s => ({ id: s.id, name: s.name })),
        units: context.units,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
    return {
      product: (body.product ?? {}) as VoiceProductDraft,
      transcript: String(body.transcript ?? ''),
    };
  }
}
