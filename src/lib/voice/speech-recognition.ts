export type SpeechRecognitionErrorCode =
  | "not-allowed"
  | "no-speech"
  | "network"
  | "audio-capture"
  | "aborted"
  | "unknown";

export interface SpeechRecognitionCallbacks {
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: SpeechRecognitionErrorCode) => void;
  onEnd?: () => void;
}

/**
 * Wrapper around the Web SpeechRecognition API.
 * Provides a clean interface for continuous speech-to-text.
 */
export class SpeechRecognitionService {
  private recognition: SpeechRecognition | null = null;
  private callbacks: SpeechRecognitionCallbacks = {};

  /** Check if the browser supports the SpeechRecognition API. */
  static isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  }

  constructor(callbacks: SpeechRecognitionCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /** Start speech recognition. */
  start(): void {
    if (this.recognition) {
      // Already running; stop first to avoid duplicates
      this.recognition.abort();
    }

    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : undefined;

    if (!SpeechRecognitionCtor) {
      this.callbacks.onError?.("unknown");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      if (last) {
        this.callbacks.onResult?.(last[0].transcript, last.isFinal);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const knownErrors: SpeechRecognitionErrorCode[] = [
        "not-allowed",
        "no-speech",
        "network",
        "audio-capture",
        "aborted",
      ];
      const code = knownErrors.includes(
        event.error as SpeechRecognitionErrorCode,
      )
        ? (event.error as SpeechRecognitionErrorCode)
        : "unknown";
      this.callbacks.onError?.(code);
    };

    recognition.onend = () => {
      this.callbacks.onEnd?.();
    };

    this.recognition = recognition;
    recognition.start();
  }

  /** Stop recognition gracefully (processes remaining audio). */
  stop(): void {
    this.recognition?.stop();
    this.recognition = null;
  }

  /** Abort recognition immediately (discards remaining audio). */
  abort(): void {
    this.recognition?.abort();
    this.recognition = null;
  }

  /** Update callback handlers. */
  setCallbacks(callbacks: SpeechRecognitionCallbacks): void {
    this.callbacks = callbacks;
  }
}
