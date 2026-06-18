import { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react';
import type { CallRecord, TranscriptEntry, GuidanceEntry, CallSnapshot } from '../types/index';
import { createEmptySnapshot } from '../services/extractionService';
import { getDataModeLabel, filterExpiredCalls } from '../services/privacySettings';

interface CallState {
  activeCall: CallRecord | null;
  callHistory: CallRecord[];
}

type CallAction =
  | { type: 'START_CALL' }
  | { type: 'END_CALL' }
  | { type: 'ADD_TRANSCRIPT'; entry: TranscriptEntry }
  | { type: 'ADD_GUIDANCE'; entry: GuidanceEntry }
  | { type: 'UPDATE_SNAPSHOT'; snapshot: CallSnapshot }
  | { type: 'UPDATE_CALL'; updates: Partial<CallRecord> }
  | { type: 'LOAD_HISTORY'; history: CallRecord[] }
  | { type: 'CLEAR_HISTORY' };

const STORAGE_KEY = 'emt-call-history';

function loadHistory(): CallRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: CallRecord[] = JSON.parse(raw);
    const migrated = parsed.map((c) => {
      const snap = c.snapshot ?? createEmptySnapshot();
      return {
        ...c,
        snapshot: {
          ...snap,
          vitalsLatest: snap.vitalsLatest ?? snap.vitals ?? null,
          vitalsTrend: snap.vitalsTrend ?? [],
          pertinentNegatives: snap.pertinentNegatives ?? [],
        },
        dataMode: c.dataMode ?? 'protocol_only' as const,
      };
    });
    const filtered = filterExpiredCalls(migrated);
    if (filtered.length < migrated.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
    return filtered;
  } catch {
    return [];
  }
}

function saveHistory(history: CallRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function callReducer(state: CallState, action: CallAction): CallState {
  switch (action.type) {
    case 'START_CALL': {
      const newCall: CallRecord = {
        id: crypto.randomUUID(),
        startedAt: Date.now(),
        dataMode: getDataModeLabel(),
        transcript: [],
        guidance: [],
        snapshot: createEmptySnapshot(),
      };
      return { ...state, activeCall: newCall };
    }
    case 'END_CALL': {
      if (!state.activeCall) return state;
      const ended = { ...state.activeCall, endedAt: Date.now() };
      const history = [ended, ...state.callHistory];
      saveHistory(history);
      return { activeCall: null, callHistory: history };
    }
    case 'ADD_TRANSCRIPT': {
      if (!state.activeCall) return state;
      return {
        ...state,
        activeCall: {
          ...state.activeCall,
          transcript: [...state.activeCall.transcript, action.entry],
        },
      };
    }
    case 'ADD_GUIDANCE': {
      if (!state.activeCall) return state;
      if (state.activeCall.guidance.some(g => g.text === action.entry.text)) return state;
      return {
        ...state,
        activeCall: {
          ...state.activeCall,
          guidance: [...state.activeCall.guidance, action.entry],
        },
      };
    }
    case 'UPDATE_SNAPSHOT': {
      if (!state.activeCall) return state;
      return {
        ...state,
        activeCall: {
          ...state.activeCall,
          snapshot: action.snapshot,
        },
      };
    }
    case 'UPDATE_CALL': {
      const callId = action.updates.id;
      if (!callId) return state;
      const history = state.callHistory.map((c) =>
        c.id === callId ? { ...c, ...action.updates } : c
      );
      saveHistory(history);
      return { ...state, callHistory: history };
    }
    case 'LOAD_HISTORY':
      return { ...state, callHistory: action.history };
    case 'CLEAR_HISTORY': {
      saveHistory([]);
      return { ...state, callHistory: [] };
    }
    default:
      return state;
  }
}

interface CallContextValue {
  state: CallState;
  startCall: () => void;
  endCall: () => void;
  addTranscript: (entry: TranscriptEntry) => void;
  addGuidance: (entry: GuidanceEntry) => void;
  updateSnapshot: (snapshot: CallSnapshot) => void;
  updateCall: (updates: Partial<CallRecord>) => void;
  clearAllCalls: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(callReducer, {
    activeCall: null,
    callHistory: [],
  });

  useEffect(() => {
    dispatch({ type: 'LOAD_HISTORY', history: loadHistory() });
  }, []);

  const startCall = useCallback(() => dispatch({ type: 'START_CALL' }), []);
  const endCall = useCallback(() => dispatch({ type: 'END_CALL' }), []);
  const addTranscript = useCallback(
    (entry: TranscriptEntry) => dispatch({ type: 'ADD_TRANSCRIPT', entry }),
    []
  );
  const addGuidance = useCallback(
    (entry: GuidanceEntry) => dispatch({ type: 'ADD_GUIDANCE', entry }),
    []
  );
  const updateSnapshot = useCallback(
    (snapshot: CallSnapshot) => dispatch({ type: 'UPDATE_SNAPSHOT', snapshot }),
    []
  );
  const updateCall = useCallback(
    (updates: Partial<CallRecord>) => dispatch({ type: 'UPDATE_CALL', updates }),
    []
  );
  const clearAllCalls = useCallback(() => dispatch({ type: 'CLEAR_HISTORY' }), []);

  return (
    <CallContext.Provider value={{ state, startCall, endCall, addTranscript, addGuidance, updateSnapshot, updateCall, clearAllCalls }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
