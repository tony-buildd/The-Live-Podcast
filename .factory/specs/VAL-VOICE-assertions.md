# Voice Layer — Behavioral Assertions

### VAL-VOICE-001: Voice mode activates on Jump In (Chrome)
When the user clicks the "Jump In" button in a Chrome browser, the app must transition into voice mode and begin listening for speech input via the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).
**Pass condition:** Clicking "Jump In" in Chrome creates a `SpeechRecognition` instance and calls `.start()`. The UI enters the "listening" state.
**Evidence:** `SpeechRecognition` instance is active; UI shows listening indicator; no errors in console.

### VAL-VOICE-002: Microphone permission requested on first activation
When voice mode activates for the first time (or when permission has been reset), the browser's microphone permission prompt must appear. The app must not proceed to listening until permission is granted.
**Pass condition:** Browser displays microphone permission dialog. App waits for grant before showing listening state.
**Evidence:** `navigator.permissions.query({ name: 'microphone' })` returns `'prompt'` before activation and `'granted'` after user allows.

### VAL-VOICE-003: Microphone permission denied — graceful fallback
If the user denies microphone permission, the app must display a clear error message explaining that mic access is required for voice mode, and must fall back to text chat input.
**Pass condition:** On `NotAllowedError` from `getUserMedia` or `SpeechRecognition`, the app shows an informative error and presents the text chat interface.
**Evidence:** Error message is visible in the UI; text input field is available; no unhandled exceptions.

### VAL-VOICE-004: Speech recognized and displayed as user message
When the user speaks and the `SpeechRecognition` API returns a transcript via the `result` event, the recognized text must be displayed in the chat as a user message bubble.
**Pass condition:** The `event.results[last].transcript` value appears in the chat UI as a user-attributed message.
**Evidence:** Chat message list contains a new entry with role "user" and the recognized transcript text.

### VAL-VOICE-005: Recognized speech sent to chat API
After speech is recognized and finalized (`isFinal === true`), the transcript must be sent to the chat/LLM API endpoint automatically, without requiring the user to press a send button.
**Pass condition:** A network request to the chat API is dispatched with the recognized text as the user message payload.
**Evidence:** Network tab shows POST request with the transcript; API returns a response.

### VAL-VOICE-006: AI response displayed as assistant message
When the chat API returns a response, it must appear in the chat UI as an assistant message bubble before TTS begins.
**Pass condition:** The API response text is rendered in the chat as an assistant-attributed message.
**Evidence:** Chat message list contains a new entry with role "assistant" and the response text.

### VAL-VOICE-007: AI response played via TTS
After the AI response is received, the app must read it aloud using the browser `SpeechSynthesis` API (`window.speechSynthesis.speak()`).
**Pass condition:** A `SpeechSynthesisUtterance` is created with the response text and passed to `speechSynthesis.speak()`. Audio plays through the user's speakers.
**Evidence:** `speechSynthesis.speaking` returns `true` during playback; UI shows "speaking" state indicator.

### VAL-VOICE-008: Microphone deactivated during TTS playback
While the AI response is being spoken via TTS, the microphone / `SpeechRecognition` must be paused or stopped to prevent the TTS audio from being re-captured as user speech.
**Pass condition:** `SpeechRecognition` is not in an active listening state while `speechSynthesis.speaking === true`.
**Evidence:** No `result` events fire on `SpeechRecognition` during TTS playback; UI does not show "listening" indicator.

### VAL-VOICE-009: Mic reactivates after TTS finishes
When the `SpeechSynthesisUtterance` fires its `end` event (TTS finishes), the microphone must automatically reactivate for follow-up conversation.
**Pass condition:** `SpeechRecognition.start()` is called within the `utterance.onend` handler. UI transitions back to "listening" state.
**Evidence:** After TTS audio stops, the listening indicator reappears; speaking into the mic produces new `result` events.

### VAL-VOICE-010: Full voice conversation loop completes end-to-end
The complete cycle — speak → recognize → send → receive → TTS → re-listen — must work for at least two consecutive turns without manual intervention.
**Pass condition:** User speaks turn 1, receives TTS response, then speaks turn 2 and receives a second TTS response, all automatically.
**Evidence:** Chat contains ≥ 2 user messages and ≥ 2 assistant messages; both TTS utterances played; mic reactivated after each.

### VAL-VOICE-011: Manual stop/mute microphone
The user must be able to manually stop or mute the microphone while in voice mode (e.g., via a mute button). This should stop `SpeechRecognition` without exiting voice mode entirely.
**Pass condition:** Clicking the mute/stop button calls `SpeechRecognition.stop()` or `.abort()`. UI shows a muted/paused state. No speech events fire while muted.
**Evidence:** Mute button is visible and toggleable; `SpeechRecognition` is inactive while muted; user can unmute to resume listening.

### VAL-VOICE-012: Resume podcast stops voice session
When the user clicks "Resume" (return to podcast), the voice session must fully terminate: `SpeechRecognition` is stopped, any in-progress TTS is cancelled, and the podcast audio resumes.
**Pass condition:** `SpeechRecognition.stop()` and `speechSynthesis.cancel()` are called. Podcast playback resumes from where it was paused. UI exits voice mode.
**Evidence:** No active `SpeechRecognition` or `SpeechSynthesis`; podcast `<audio>` element is playing; voice UI elements are hidden.

### VAL-VOICE-013: Text chat fallback for non-Chrome browsers
In browsers that do not support `webkitSpeechRecognition` / `SpeechRecognition` (e.g., Firefox, Safari), the "Jump In" action must present a text-based chat interface instead of attempting voice mode.
**Pass condition:** The app checks for `SpeechRecognition` or `webkitSpeechRecognition` on `window`. If absent, it renders a text input + send button chat UI. No errors are thrown.
**Evidence:** In Firefox/Safari, clicking "Jump In" shows a text chat; no console errors about missing `SpeechRecognition`.

### VAL-VOICE-014: Text fallback is fully functional
The text-based fallback chat must support sending messages and displaying AI responses identically to the voice flow (minus TTS).
**Pass condition:** User types a message, presses send, sees the message in chat, receives an AI response displayed as an assistant message.
**Evidence:** Chat API is called; response is rendered; conversation history is maintained.

### VAL-VOICE-015: Visual indicator — Listening state
When the microphone is active and the app is awaiting speech, a clear visual indicator (e.g., pulsing mic icon, "Listening…" label, animated waveform) must be displayed.
**Pass condition:** A distinct listening-state UI element is visible whenever `SpeechRecognition` is actively listening and TTS is not playing.
**Evidence:** CSS class or component for listening state is rendered; indicator disappears when not listening.

### VAL-VOICE-016: Visual indicator — Processing state
After speech is recognized and the transcript is sent to the API, a processing/loading indicator must be shown while awaiting the AI response.
**Pass condition:** A loading indicator (spinner, shimmer, "Thinking…" text) is visible between sending the request and receiving the response.
**Evidence:** Processing indicator appears after `isFinal` transcript is sent; disappears when API response arrives.

### VAL-VOICE-017: Visual indicator — Speaking state
While TTS is actively playing the AI response, a visual indicator (e.g., speaker icon, waveform animation, "Speaking…" label) must be shown.
**Pass condition:** A speaking-state indicator is visible whenever `speechSynthesis.speaking === true`.
**Evidence:** Indicator appears on `utterance.onstart`; disappears on `utterance.onend`.

### VAL-VOICE-018: State indicators are mutually exclusive
The three voice states (listening, processing, speaking) must not overlap visually. Only one state indicator should be active at any given time.
**Pass condition:** At no point are two state indicators shown simultaneously during normal operation.
**Evidence:** State machine or mutually-exclusive boolean flags govern indicator rendering; visual inspection confirms no overlap.

### VAL-VOICE-019: SpeechRecognition error — network error handling
If `SpeechRecognition` fires an `error` event with `error.error === 'network'`, the app must display a user-friendly error message and offer to retry or fall back to text input.
**Pass condition:** Network error triggers an error notification in the UI; user can retry voice or switch to text.
**Evidence:** Error message is displayed; retry button restarts `SpeechRecognition`; text fallback button shows text input.

### VAL-VOICE-020: SpeechRecognition error — no-speech timeout
If `SpeechRecognition` fires an `error` event with `error.error === 'no-speech'`, the app must handle it gracefully — either auto-restart listening or prompt the user.
**Pass condition:** The `no-speech` error does not crash the app or leave it in a broken state. The app either restarts recognition or shows a prompt to try again.
**Evidence:** After silence timeout, the app remains functional; UI either shows listening state (auto-restart) or a "Try again" prompt.

### VAL-VOICE-021: SpeechRecognition error — aborted
If `SpeechRecognition` fires `error.error === 'aborted'` (e.g., due to a page-level abort), the app must not show an error to the user if the abort was intentional (e.g., pressing Resume or mute).
**Pass condition:** Intentional aborts (from user actions) are silent. Unexpected aborts show an error with recovery options.
**Evidence:** Pressing Resume + getting `aborted` error → no error toast. Unexpected abort → error message shown.

### VAL-VOICE-022: SpeechRecognition error — audio-capture failure
If `SpeechRecognition` fires `error.error === 'audio-capture'` (microphone hardware issue), the app must inform the user that their microphone is unavailable and fall back to text chat.
**Pass condition:** Error message indicates mic hardware issue. Text chat fallback is presented.
**Evidence:** Error notification referencing microphone; text input visible; no unhandled exceptions.

### VAL-VOICE-023: TTS error handling
If `SpeechSynthesisUtterance` fires an `error` event during playback, the app must handle it gracefully — display the response text in the chat (already done per VAL-VOICE-006) and reactivate the mic for the next turn.
**Pass condition:** TTS failure does not block the conversation. The AI response remains visible in chat. Mic reactivates for follow-up.
**Evidence:** After TTS error, listening state resumes; chat still shows the assistant message; no frozen UI.

### VAL-VOICE-024: Voice session cleanup on page navigation / unmount
If the user navigates away from the voice session (e.g., browser back, closing tab), all voice resources must be cleaned up: `SpeechRecognition.stop()`, `speechSynthesis.cancel()`, and any media streams released.
**Pass condition:** Component unmount or `beforeunload` handler stops all voice APIs. No orphaned media streams.
**Evidence:** `navigator.mediaDevices` shows no active streams after navigation; no console warnings about leaked resources.

### VAL-VOICE-025: Interim results displayed during recognition
While the user is speaking, interim (non-final) recognition results should be displayed in real-time to provide feedback that the system is hearing them.
**Pass condition:** `SpeechRecognition.interimResults` is set to `true`. Partial transcript text updates in the UI as the user speaks.
**Evidence:** UI shows evolving transcript text before `isFinal` result; text stabilizes on final result.

### VAL-VOICE-026: Browser compatibility detection on page load
The app must detect browser support for Web Speech API on load (not only on "Jump In" click) so that the UI can proactively show the correct interaction mode (voice vs. text).
**Pass condition:** On page load, the app checks `'SpeechRecognition' in window || 'webkitSpeechRecognition' in window` and stores the result. UI adapts accordingly (e.g., "Jump In" button label or icon differs).
**Evidence:** Non-Chrome browsers never show voice-specific UI elements that would fail on click.

### VAL-VOICE-027: Concurrent TTS cancellation on new response
If a new AI response arrives while a previous TTS utterance is still playing (edge case with fast responses), the old utterance must be cancelled before the new one starts.
**Pass condition:** `speechSynthesis.cancel()` is called before `speechSynthesis.speak(newUtterance)` when a new response arrives during active TTS.
**Evidence:** Only the latest response is heard; no overlapping audio.

### VAL-VOICE-028: Voice mode does not interfere with podcast audio
When voice mode is active, the podcast audio must be paused. Voice mode audio (TTS) and podcast audio must never play simultaneously.
**Pass condition:** Podcast `<audio>` element is paused when voice mode activates. It does not resume until voice mode is exited via "Resume."
**Evidence:** `audioElement.paused === true` throughout voice session; no overlapping audio streams.

### VAL-VOICE-029: Rapid Jump In / Resume toggling does not break state
If the user rapidly toggles between "Jump In" and "Resume" multiple times, the app must not enter an inconsistent state (e.g., multiple `SpeechRecognition` instances, orphaned TTS, or broken UI).
**Pass condition:** Each "Jump In" creates at most one `SpeechRecognition` instance. Each "Resume" fully cleans up. Rapid toggling produces no errors.
**Evidence:** Console shows no duplicate event handlers or errors; UI state is always consistent with the last action taken.

### VAL-VOICE-030: Accessibility — voice mode keyboard operable
All voice mode controls (Jump In, mute, Resume) must be operable via keyboard (Tab + Enter/Space) and have appropriate ARIA labels.
**Pass condition:** Controls are focusable, have `aria-label` or visible text labels, and respond to Enter/Space key events.
**Evidence:** Keyboard-only navigation can activate all voice controls; screen reader announces control purposes.
