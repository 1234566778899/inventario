import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

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

export interface VoiceListenHandlers {
  /** Fires on every partial and final chunk, with the full transcript so far. */
  onTranscript: (text: string) => void;
  /** Fires once recognition stops, with the final transcript. */
  onEnd: (text: string) => void;
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

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'No diste permiso al micrófono. Habilítalo en el candado de la barra de direcciones.',
  'service-not-allowed': 'El navegador bloqueó el reconocimiento de voz.',
  'no-speech': 'No se escuchó nada. Intenta de nuevo.',
  'audio-capture': 'No se encontró un micrófono.',
  network: 'Sin conexión con el servicio de reconocimiento de voz.',
};

/**
 * Dictado de productos: el navegador transcribe (Web Speech API, sin costo) y
 * el backend /api/voice-to-product le pide a Gemini los campos estructurados.
 */
@Injectable({ providedIn: 'root' })
export class VoiceProductService {
  private readonly auth = inject(AuthService);

  private recognition: SpeechRecognitionLike | null = null;
  private transcript = '';
  /** Set while stop() is tearing things down, so onend does not re-fire onEnd. */
  private aborted = false;

  private get ctor(): SpeechRecognitionCtor | null {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }

  /** Chrome and Edge support this; Firefox does not. */
  get supported(): boolean {
    return this.ctor !== null;
  }

  start(handlers: VoiceListenHandlers): void {
    const Ctor = this.ctor;
    if (!Ctor) {
      handlers.onError('Tu navegador no soporta dictado por voz. Usa Chrome o Edge.');
      return;
    }

    this.abort();
    this.transcript = '';
    this.aborted = false;

    const rec = new Ctor();
    rec.lang = 'es-PE';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const chunk = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += chunk;
        else interim += chunk;
      }
      this.transcript = (finalText + interim).trim();
      handlers.onTranscript(this.transcript);
    };

    rec.onerror = (e) => {
      // "no-speech" fires a lot while the user thinks; only surface real problems.
      if (e.error === 'aborted') return;
      handlers.onError(ERROR_MESSAGES[e.error] ?? `Error de reconocimiento: ${e.error}`);
    };

    rec.onend = () => {
      this.recognition = null;
      if (!this.aborted) handlers.onEnd(this.transcript);
    };

    this.recognition = rec;
    rec.start();
  }

  /** Stops listening and lets onEnd fire with whatever was captured. */
  stop(): void {
    this.recognition?.stop();
  }

  /** Stops listening and discards the result. */
  abort(): void {
    if (!this.recognition) return;
    this.aborted = true;
    this.recognition.abort();
    this.recognition = null;
  }

  /** Sends the transcript to Gemini (via /api) and returns the parsed fields. */
  async extract(text: string, context: VoiceExtractContext): Promise<VoiceProductDraft> {
    const session = await this.auth.getSession();

    const res = await fetch('/api/voice-to-product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        text,
        categories: context.categories.map(c => ({ id: c.id, name: c.name })),
        suppliers: context.suppliers.map(s => ({ id: s.id, name: s.name })),
        units: context.units,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
    return (body.product ?? {}) as VoiceProductDraft;
  }
}
