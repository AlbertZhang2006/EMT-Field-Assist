export type RecordingState = 'ready' | 'recording' | 'paused' | 'processing' | 'error';

interface SpeechCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onStateChange: (state: RecordingState) => void;
  onError: (message: string) => void;
}

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function isSpeechSupported(): boolean {
  return !!SpeechRecognition;
}

export function createSpeechService(callbacks: SpeechCallbacks) {
  if (!SpeechRecognition) {
    return {
      start() { callbacks.onError('Speech recognition not supported in this browser.'); callbacks.onStateChange('error'); },
      stop() {},
      pause() {},
      resume() {},
      destroy() {},
    };
  }

  let recognition: any = null;
  let shouldRestart = false;
  let isPaused = false;

  function init() {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const trimmed = transcript.trim();
          if (trimmed) {
            callbacks.onInterim('');
            callbacks.onFinal(trimmed);
          }
        } else {
          interim += transcript;
        }
      }
      if (interim) callbacks.onInterim(interim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return;
      if (event.error === 'aborted') return;

      if (event.error === 'not-allowed') {
        callbacks.onError('Microphone access denied. Allow microphone permission and try again.');
        callbacks.onStateChange('error');
        shouldRestart = false;
        return;
      }

      if (event.error === 'network') {
        callbacks.onError('Network error — speech service unavailable. Use manual text entry.');
        callbacks.onStateChange('error');
        shouldRestart = false;
        return;
      }

      callbacks.onError(`Speech error: ${event.error}. You can type statements manually.`);
    };

    recognition.onend = () => {
      if (shouldRestart && !isPaused) {
        try {
          recognition.start();
        } catch {
          callbacks.onStateChange('error');
          callbacks.onError('Could not restart speech recognition.');
        }
      }
    };
  }

  return {
    start() {
      try {
        init();
        shouldRestart = true;
        isPaused = false;
        recognition.start();
        callbacks.onStateChange('recording');
      } catch {
        callbacks.onError('Could not start speech recognition.');
        callbacks.onStateChange('error');
      }
    },

    stop() {
      shouldRestart = false;
      isPaused = false;
      if (recognition) {
        try { recognition.stop(); } catch {}
      }
      callbacks.onInterim('');
      callbacks.onStateChange('processing');
      setTimeout(() => callbacks.onStateChange('ready'), 300);
    },

    pause() {
      isPaused = true;
      shouldRestart = false;
      if (recognition) {
        try { recognition.stop(); } catch {}
      }
      callbacks.onInterim('');
      callbacks.onStateChange('paused');
    },

    resume() {
      try {
        isPaused = false;
        shouldRestart = true;
        if (!recognition) init();
        recognition.start();
        callbacks.onStateChange('recording');
      } catch {
        callbacks.onError('Could not resume speech recognition.');
        callbacks.onStateChange('error');
      }
    },

    destroy() {
      shouldRestart = false;
      isPaused = false;
      if (recognition) {
        try { recognition.stop(); } catch {}
        recognition = null;
      }
    },
  };
}
