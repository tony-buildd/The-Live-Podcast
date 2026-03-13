export interface SpeechSynthesisCallbacks {
  onEnd?: () => void;
  onError?: (error: string) => void;
}

/**
 * Wrapper around the Web SpeechSynthesis API.
 * Provides a clean interface for text-to-speech.
 */
export class SpeechSynthesisService {
  private callbacks: SpeechSynthesisCallbacks = {};

  /** Check if the browser supports the SpeechSynthesis API. */
  static isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return "speechSynthesis" in window;
  }

  constructor(callbacks: SpeechSynthesisCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /** Speak the given text. Cancels any current utterance first. */
  speak(text: string): void {
    if (!SpeechSynthesisService.isSupported()) {
      this.callbacks.onError?.("Speech synthesis not supported");
      return;
    }

    // Cancel anything currently playing
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";

    utterance.onend = () => {
      this.callbacks.onEnd?.();
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      // "interrupted" and "canceled" are expected when we call cancel()
      if (event.error !== "interrupted" && event.error !== "canceled") {
        this.callbacks.onError?.(event.error);
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  /** Cancel any current speech. */
  cancel(): void {
    if (SpeechSynthesisService.isSupported()) {
      window.speechSynthesis.cancel();
    }
  }

  /** Check if currently speaking. */
  isSpeaking(): boolean {
    if (!SpeechSynthesisService.isSupported()) return false;
    return window.speechSynthesis.speaking;
  }

  /** Update callback handlers. */
  setCallbacks(callbacks: SpeechSynthesisCallbacks): void {
    this.callbacks = callbacks;
  }
}
