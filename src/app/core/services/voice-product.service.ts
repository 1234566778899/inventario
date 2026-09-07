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
  'audio-capture': 'No se encontró un micrófono.',
  network: 'Sin conexión con el servicio de reconocimiento de voz. Revisa tu red o desactiva las extensiones del navegador.',
};
const NO_SPEECH_MESSAGE = 'No se escuchó nada. Intenta de nuevo.';

/** Tras cuánto silencio damos el dictado por terminado. */
const SILENCE_TIMEOUT_MS = 12_000;
/** Respiro entre el corte de Chrome y el siguiente start(); sin él lanza InvalidStateError. */
const RESTART_DELAY_MS = 250;
/** "network" suele ser un hipo momentáneo del servicio de Google; reintentamos antes de rendirnos. */
const MAX_NETWORK_RETRIES = 2;

/**
 * Dictado de productos: el navegador transcribe (Web Speech API, sin costo) y
 * el backend /api/voice-to-product le pide a Gemini los campos estructurados.
 *
 * Chrome de escritorio ignora `continuous` en la práctica: corta el
 * reconocimiento tras unos segundos de silencio (con `no-speech` y `onend`).
 * Por eso relanzamos el reconocedor nosotros mismos y sólo terminamos cuando el
 * usuario pulsa Detener o pasa SILENCE_TIMEOUT_MS sin oír nada nuevo.
 */
@Injectable({ providedIn: 'root' })
export class VoiceProductService {
  private readonly auth = inject(AuthService);

  private recognition: SpeechRecognitionLike | null = null;
  private handlers: VoiceListenHandlers | null = null;

  /** 'listening' = el usuario sigue dictando aunque Chrome corte por debajo. */
  private mode: 'idle' | 'listening' | 'finishing' | 'aborting' = 'idle';

  /** Texto ya cerrado por sesiones anteriores del reconocedor. */
  private committed = '';
  /** Texto final y provisional de la sesión en curso. */
  private sessionFinal = '';
  private sessionInterim = '';

  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private networkRetries = 0;

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
    if (!this.ctor) {
      handlers.onError('Tu navegador no soporta dictado por voz. Usa Chrome o Edge.');
      return;
    }

    this.abort();
    this.handlers = handlers;
    this.committed = '';
    this.sessionFinal = '';
    this.sessionInterim = '';
    this.networkRetries = 0;
    this.mode = 'listening';

    this.launch();
    this.armSilenceTimer();
  }

  /** Stops listening and lets onEnd fire with whatever was captured. */
  stop(): void {
    if (this.mode !== 'listening') return;
    this.mode = 'finishing';
    this.clearTimers();
    if (this.recognition) this.recognition.stop();
    else this.finish();
  }

  /** Stops listening and discards the result. */
  abort(): void {
    this.clearTimers();
    if (this.recognition) {
      this.mode = 'aborting';
      const rec = this.recognition;
      this.recognition = null;
      rec.abort();
    }
    this.mode = 'idle';
    this.handlers = null;
    this.committed = '';
    this.sessionFinal = '';
    this.sessionInterim = '';
  }

  /** Arranca una sesión del reconocedor; se llama en cada relanzamiento. */
  private launch(): void {
    const Ctor = this.ctor;
    if (!Ctor) return;

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
      this.sessionFinal = finalText;
      this.sessionInterim = interim;
      this.networkRetries = 0;
      this.armSilenceTimer();
      this.handlers?.onTranscript(this.fullTranscript());
    };

    rec.onerror = (e) => {
      // Estos tres los absorbemos: onend relanzará el reconocedor.
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      if (e.error === 'network' && this.networkRetries < MAX_NETWORK_RETRIES) {
        this.networkRetries++;
        return;
      }
      this.fail(ERROR_MESSAGES[e.error] ?? `Error de reconocimiento: ${e.error}`);
    };

    rec.onend = () => {
      if (this.recognition !== rec) return; // sesión ya reemplazada o abortada
      this.recognition = null;
      this.commitSession();

      if (this.mode === 'listening') this.scheduleRestart();
      else if (this.mode === 'finishing') this.finish();
    };

    this.recognition = rec;
    try {
      rec.start();
    } catch {
      // InvalidStateError: la sesión anterior aún no soltó el micrófono.
      this.recognition = null;
      if (this.mode === 'listening') this.scheduleRestart();
    }
  }

  private scheduleRestart(): void {
    if (this.restartTimer !== null) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.mode === 'listening') this.launch();
    }, RESTART_DELAY_MS);
  }

  private armSilenceTimer(): void {
    if (this.silenceTimer !== null) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      if (this.mode !== 'listening') return;
      if (!this.fullTranscript()) this.fail(NO_SPEECH_MESSAGE);
      else this.stop();
    }, SILENCE_TIMEOUT_MS);
  }

  private commitSession(): void {
    const text = (this.sessionFinal || this.sessionInterim).trim();
    if (text) this.committed = this.committed ? `${this.committed} ${text}` : text;
    this.sessionFinal = '';
    this.sessionInterim = '';
  }

  private fullTranscript(): string {
    return [this.committed, this.sessionFinal, this.sessionInterim]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private finish(): void {
    const text = this.fullTranscript();
    const handlers = this.handlers;
    this.reset();
    handlers?.onEnd(text);
  }

  private fail(message: string): void {
    const handlers = this.handlers;
    const rec = this.recognition;
    this.mode = 'aborting';
    this.recognition = null;
    rec?.abort();
    this.reset();
    handlers?.onError(message);
  }

  private reset(): void {
    this.clearTimers();
    this.mode = 'idle';
    this.handlers = null;
    this.recognition = null;
    this.committed = '';
    this.sessionFinal = '';
    this.sessionInterim = '';
  }

  private clearTimers(): void {
    if (this.silenceTimer !== null) clearTimeout(this.silenceTimer);
    if (this.restartTimer !== null) clearTimeout(this.restartTimer);
    this.silenceTimer = null;
    this.restartTimer = null;
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
