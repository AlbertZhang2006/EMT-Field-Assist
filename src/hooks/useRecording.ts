import { useRef, useState, useCallback, useEffect } from 'react';
import {
  createSpeechService,
  isSpeechSupported,
  type RecordingState,
} from '../services/speechRecognition';

interface UseRecordingOptions {
  onFinalTranscript: (text: string) => void;
  autoStart?: boolean;
}

export function useRecording({ onFinalTranscript, autoStart = true }: UseRecordingOptions) {
  const [recordingState, setRecordingState] = useState<RecordingState>('ready');
  const [interimText, setInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const serviceRef = useRef<ReturnType<typeof createSpeechService> | null>(null);
  const supported = isSpeechSupported();

  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = createSpeechService({
        onInterim: setInterimText,
        onFinal: (text) => {
          setInterimText('');
          onFinalTranscript(text);
        },
        onStateChange: setRecordingState,
        onError: (msg) => setErrorMessage(msg),
      });
    }
    return serviceRef.current;
  }, [onFinalTranscript]);

  const startRecording = useCallback(() => {
    setErrorMessage(null);
    getService().start();
  }, [getService]);

  const pauseRecording = useCallback(() => {
    getService().pause();
  }, [getService]);

  const resumeRecording = useCallback(() => {
    setErrorMessage(null);
    getService().resume();
  }, [getService]);

  const stopRecording = useCallback(() => {
    getService().stop();
  }, [getService]);

  const dismissError = useCallback(() => {
    setErrorMessage(null);
    setRecordingState('ready');
  }, []);

  useEffect(() => {
    if (autoStart && supported) {
      startRecording();
    }
    return () => {
      serviceRef.current?.destroy();
      serviceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    recordingState,
    interimText,
    errorMessage,
    supported,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    dismissError,
  };
}
