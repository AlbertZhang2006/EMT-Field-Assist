import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneOff, Plus, Send, Mic, Pause, Play, AlertCircle, X, FlaskConical, ChevronDown, ChevronRight } from 'lucide-react';
import { useCall } from '../context/CallContext';
import { TEST_SCENARIOS, type TestScenario } from '../data/testScenarios';
import { extractFromStatement } from '../services/extractionService';
import {
  getInitialGuidance,
  analyzeNewStatement,
  resetGuidanceState,
  getActiveRegionMeta,
} from '../services/guidanceEngine';
import { getAIGuidance } from '../services/aiAssistantService';
import { useRecording } from '../hooks/useRecording';
import type { TranscriptEntry, GuidanceEntry, GuidanceType } from '../types';
import type { RecordingState } from '../services/speechRecognition';

const MAX_VISIBLE_GUIDANCE = 4;

function useCallTimer(startedAt: number) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const GUIDANCE_STYLES: Record<GuidanceType, { border: string; bg: string; label: string }> = {
  warning:           { border: 'border-l-warning',        bg: 'bg-warning-bg/60',   label: 'Gap' },
  prompt:            { border: 'border-l-clinical',       bg: 'bg-success-bg/30',   label: 'Guidance' },
  protocol:          { border: 'border-l-primary-action', bg: 'bg-protocol-bg',     label: 'Protocol' },
  missing_info:      { border: 'border-l-warning',        bg: 'bg-warning-bg/60',   label: 'Missing' },
  protocol_reminder: { border: 'border-l-primary-action', bg: 'bg-protocol-bg',     label: 'Protocol' },
  differential:      { border: 'border-l-clinical',       bg: 'bg-success-bg/30',   label: 'DDx' },
  documentation:     { border: 'border-l-warning',        bg: 'bg-warning-bg/40',   label: 'Doc' },
  safety:            { border: 'border-l-critical',       bg: 'bg-critical-bg',     label: 'Safety' },
};

function GuidanceRow({ entry }: { entry: GuidanceEntry }) {
  const s = GUIDANCE_STYLES[entry.type] ?? GUIDANCE_STYLES.prompt;
  const isHigh = entry.priority === 'high';
  return (
    <div className={`${s.border} border-l-3 pl-3 pr-2 py-1.5 ${s.bg} ${isHigh ? 'ring-1 ring-critical/20' : ''} anim-fade-in-slide`}>
      <p className="text-[13px] leading-snug text-text-primary">
        <span className={`text-[10px] font-bold uppercase mr-1.5 ${
          entry.type === 'safety' || entry.type === 'warning' || entry.type === 'missing_info'
            ? 'text-warning' : entry.type === 'protocol' || entry.type === 'protocol_reminder'
            ? 'text-protocol-text' : 'text-text-muted'
        }`}>{s.label}</span>
        {entry.text}
      </p>
      {entry.protocolSection && (
        <p className="text-[10px] text-text-muted mt-0.5 truncate">
          {entry.protocolSection}
        </p>
      )}
    </div>
  );
}

function SnapshotBar({ snapshot }: { snapshot: import('../types').CallSnapshot }) {
  const facts = snapshot;
  const parts: string[] = [];
  if (facts.patientAge || facts.patientSex) {
    parts.push([facts.patientAge && `${facts.patientAge}yo`, facts.patientSex].filter(Boolean).join(' '));
  }
  if (facts.chiefComplaint) parts.push(facts.chiefComplaint);
  if (facts.vitalsLatest) parts.push(facts.vitalsLatest);
  const gaps = facts.missingItems ?? [];
  const summaryKey = parts.join('|') + (facts.treatmentsGiven ?? '') + (facts.vitalsTrend?.length ?? 0);
  if (parts.length === 0 && gaps.length === 0) return null;
  return (
    <div key={summaryKey} className="px-3 py-2 bg-surface border-b border-border anim-field-flash">
      {parts.length > 0 && <p className="text-[13px] text-text-primary font-medium leading-snug truncate">{parts.join(' · ')}</p>}
      {facts.vitalsTrend.length > 1 && (
        <p className="text-[12px] text-text-muted leading-snug truncate mt-0.5">
          Vitals trend: {facts.vitalsTrend.length} sets recorded
        </p>
      )}
      {facts.treatmentsGiven && <p className="text-[12px] text-text-secondary leading-snug truncate mt-0.5">Tx: {facts.treatmentsGiven}</p>}
      {facts.responseToTreatment && <p className="text-[12px] text-clinical leading-snug truncate mt-0.5">Response: {facts.responseToTreatment}</p>}
      {facts.pertinentNegatives.length > 0 && (
        <p className="text-[12px] text-text-muted leading-snug truncate mt-0.5">
          {facts.pertinentNegatives.join(', ')}
        </p>
      )}
      {gaps.length > 0 && <p className="text-[12px] text-warning font-medium leading-snug mt-0.5 truncate">Need: {gaps.join(', ')}</p>}
    </div>
  );
}

function ScenarioPicker({ onSelect }: { onSelect: (s: TestScenario) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface text-xs font-medium text-text-secondary min-h-[40px]">
        Scenario <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 right-0 w-64 bg-surface border border-border rounded-lg shadow-lg z-20 max-h-72 overflow-y-auto">
          {TEST_SCENARIOS.map((s) => (
            <button key={s.id} onClick={() => { onSelect(s); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-bg border-b border-border-light last:border-b-0 min-h-[44px]">
              <div>
                <p className="text-sm font-medium text-text-primary">{s.name}</p>
                <p className="text-[11px] text-text-muted">{s.category} · {s.statements.length} steps</p>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const STATE_CONFIG: Record<RecordingState, { label: string; color: string; pulse: boolean }> = {
  ready:      { label: 'Ready',      color: 'bg-text-muted',     pulse: false },
  recording:  { label: 'Recording',  color: 'bg-red-500',        pulse: true },
  paused:     { label: 'Paused',     color: 'bg-warning',        pulse: false },
  processing: { label: 'Processing', color: 'bg-primary-action', pulse: true },
  error:      { label: 'Mic Error',  color: 'bg-critical',       pulse: false },
};

export default function ActiveCallScreen() {
  const navigate = useNavigate();
  const { state, addTranscript, addGuidance, updateSnapshot, endCall } = useCall();
  const call = state.activeCall;

  const [mockMode, setMockMode] = useState(false);
  const [scenario, setScenario] = useState<TestScenario>(TEST_SCENARIOS[0]);
  const [mockIndex, setMockIndex] = useState(0);
  const [customText, setCustomText] = useState('');
  const [showAllGuidance, setShowAllGuidance] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const guidanceEndRef = useRef<HTMLDivElement>(null);

  const timer = useCallTimer(call?.startedAt ?? Date.now());
  const transcriptRef = useRef<string[]>([]);

  const submitStatement = useCallback(
    (text: string) => {
      if (!text.trim() || !call) return;
      const trimmed = text.trim();
      const entry: TranscriptEntry = { id: crypto.randomUUID(), timestamp: Date.now(), text: trimmed, speaker: 'emt' };
      addTranscript(entry);
      const newSnapshot = extractFromStatement(trimmed, call.snapshot);
      updateSnapshot(newSnapshot);
      const guidance = analyzeNewStatement(trimmed, newSnapshot);
      for (const g of guidance) addGuidance(g);
      transcriptRef.current = [...transcriptRef.current, trimmed];
      getAIGuidance(trimmed, transcriptRef.current, newSnapshot).then((res) => {
        for (const g of res.guidance) addGuidance(g);
      });
      setShowAllGuidance(false);
    },
    [addTranscript, addGuidance, updateSnapshot, call]
  );

  const stableSubmit = useRef(submitStatement);
  stableSubmit.current = submitStatement;
  const handleFinal = useCallback((text: string) => stableSubmit.current(text), []);

  const {
    recordingState, interimText, errorMessage, supported,
    startRecording, pauseRecording, resumeRecording, stopRecording, dismissError,
  } = useRecording({ onFinalTranscript: handleFinal, autoStart: !mockMode });

  function handleAddMock() {
    if (mockIndex < scenario.statements.length) {
      submitStatement(scenario.statements[mockIndex]);
      setMockIndex((i) => i + 1);
    }
  }

  function handleSelectScenario(s: TestScenario) {
    setScenario(s);
    setMockIndex(0);
  }

  function handleSendCustom() {
    if (customText.trim()) { submitStatement(customText); setCustomText(''); }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendCustom(); }
  }

  function toggleMockMode() {
    if (!mockMode) { stopRecording(); setMockMode(true); }
    else { setMockMode(false); if (supported) startRecording(); }
  }

  useEffect(() => {
    if (!call) { navigate('/', { replace: true }); return; }
    resetGuidanceState();
    for (const g of getInitialGuidance()) addGuidance(g);
    if (!supported) setMockMode(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [call?.transcript.length]);
  useEffect(() => { guidanceEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [call?.guidance.length]);

  function handleEndCall() { stopRecording(); endCall(); navigate('/review'); }

  const visibleGuidance = useMemo(() => {
    if (!call) return [];
    const currentMissing = new Set(call.snapshot.missingItems.map(s => s.toLowerCase()));

    const deduped = call.guidance.filter((g) => {
      if (g.type !== 'missing_info' && g.type !== 'documentation') return true;
      if (!g.text.startsWith('Missing:') && !g.text.startsWith('Missing for')) return true;
      const itemsPart = g.text.replace(/^Missing(?:\s+for\s+\w+\s+\w+)?:\s*/i, '').replace(/\.$/, '');
      const items = itemsPart.split(/,\s*/);
      return items.some(item => currentMissing.has(item.toLowerCase()));
    });

    let latestMissingId: string | null = null;
    for (let i = deduped.length - 1; i >= 0; i--) {
      if (deduped[i].type === 'missing_info' && deduped[i].text.startsWith('Missing:')) {
        latestMissingId = deduped[i].id;
        break;
      }
    }
    const filtered = deduped.filter((g) => {
      if (g.type === 'missing_info' && g.text.startsWith('Missing:') && g.id !== latestMissingId) return false;
      return true;
    });

    if (showAllGuidance) return filtered;
    const sorted = [...filtered].sort((a, b) => {
      const pw = { high: 0, medium: 1, low: 2, undefined: 1 };
      return (pw[a.priority ?? 'undefined'] - pw[b.priority ?? 'undefined']) || (b.timestamp - a.timestamp);
    });
    return sorted.slice(0, MAX_VISIBLE_GUIDANCE);
  }, [call, showAllGuidance]);

  const hiddenCount = (call?.guidance.length ?? 0) - visibleGuidance.length;

  const protocolMeta = getActiveRegionMeta();
  const protocolLabel = protocolMeta.id === 'none'
    ? 'No protocol loaded'
    : [
        protocolMeta.name,
        protocolMeta.version && `v${protocolMeta.version}`,
        protocolMeta.effectiveDate && `(${protocolMeta.effectiveDate})`,
      ].filter(Boolean).join(' ');

  if (!call) return null;
  const mockDone = mockIndex >= scenario.statements.length;
  const si = STATE_CONFIG[mockMode ? 'ready' : recordingState];
  const mockProgress = mockMode ? `${mockIndex}/${scenario.statements.length}` : '';

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ── */}
      <div className="bg-primary text-white">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full ${si.color} ${si.pulse ? 'anim-recording-pulse' : ''}`} />
            <span className="text-sm font-semibold">{mockMode ? 'Demo' : si.label}</span>
            <span className="text-sm font-mono text-white/60">{timer}</span>
          </div>
          <div className="flex items-center gap-2">
            {!mockMode && recordingState === 'recording' && (
              <button onClick={pauseRecording} className="p-2.5 rounded-lg bg-white/15 btn-press min-w-[44px] min-h-[44px] flex items-center justify-center">
                <Pause className="w-5 h-5" />
              </button>
            )}
            {!mockMode && recordingState === 'paused' && (
              <button onClick={resumeRecording} className="p-2.5 rounded-lg bg-white/15 btn-press min-w-[44px] min-h-[44px] flex items-center justify-center">
                <Play className="w-5 h-5" />
              </button>
            )}
            <button onClick={handleEndCall}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-critical font-semibold text-sm min-h-[44px] btn-press">
              <PhoneOff className="w-5 h-5" /> End
            </button>
          </div>
        </div>
        <div className="px-3 pb-1.5">
          <p className="text-[11px] text-white/40 font-medium truncate">
            Protocol: {protocolLabel}
          </p>
          {protocolMeta.sourceOrganization && (
            <p className="text-[10px] text-white/30 truncate">
              Protocol source: {protocolMeta.sourceOrganization}
            </p>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {errorMessage && (
        <div className="flex items-center gap-2 px-3 py-2 bg-critical-bg border-b border-critical/20">
          <AlertCircle className="w-4 h-4 text-critical shrink-0" />
          <p className="flex-1 text-xs text-critical">{errorMessage}</p>
          <button onClick={dismissError} className="p-2 rounded min-w-[36px] min-h-[36px] flex items-center justify-center">
            <X className="w-4 h-4 text-critical" />
          </button>
        </div>
      )}

      {/* ── Snapshot bar ── */}
      <SnapshotBar snapshot={call.snapshot} />

      {/* ── Protocol Support — stays visible, own scroll ── */}
      {visibleGuidance.length > 0 && (
        <div className="shrink-0 border-b border-border flex flex-col max-h-[35vh]">
          <div className="px-3 py-1.5 bg-bg flex items-center justify-between shrink-0">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Protocol Support</span>
            {call.guidance.length > MAX_VISIBLE_GUIDANCE && (
              <button onClick={() => setShowAllGuidance(!showAllGuidance)} className="text-[11px] text-primary-action font-medium min-h-[28px] px-2">
                {showAllGuidance ? 'Show recent' : `${hiddenCount} older`}
              </button>
            )}
          </div>
          <div className="overflow-y-auto">
            <div className="space-y-0.5 py-1">
              {visibleGuidance.map((g) => <GuidanceRow key={g.id} entry={g} />)}
              <div ref={guidanceEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* ── Transcript — fills remaining space, scrolls independently ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-3 py-1.5 bg-bg border-b border-border-light shrink-0">
          <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Transcript</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {call.transcript.map((t) => (
            <div key={t.id} className="px-3 py-2 border-b border-border-light anim-fade-in-slide">
              <p className="text-[14px] text-text-primary leading-snug">{t.text}</p>
            </div>
          ))}
          {interimText && !mockMode && (
            <div className="px-3 py-2 border-b border-border-light">
              <p className="text-[14px] text-text-muted italic leading-snug">{interimText}</p>
            </div>
          )}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* ── Input area ── */}
      <div className="border-t border-border bg-surface px-3 py-2.5 space-y-2">
        {!mockMode && recordingState === 'error' && (
          <button onClick={startRecording}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-primary-action/30 bg-protocol-bg text-sm font-medium text-primary-action min-h-[48px]">
            <Mic className="w-5 h-5" /> Retry Microphone
          </button>
        )}

        <div className="flex gap-2">
          <input type="text" value={customText} onChange={(e) => setCustomText(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={mockMode ? 'Type statement...' : 'Add manually...'}
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-3 text-[15px] text-text-primary placeholder-text-muted outline-none focus:border-primary-action min-h-[48px]" />
          <button onClick={handleSendCustom} disabled={!customText.trim()}
            className="px-4 rounded-lg bg-primary-action text-white disabled:opacity-25 disabled:pointer-events-none min-w-[48px] min-h-[48px] flex items-center justify-center btn-press">
            <Send className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2">
          {mockMode && (
            <button onClick={handleAddMock} disabled={mockDone}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border border-border bg-surface text-sm text-text-secondary disabled:opacity-25 disabled:pointer-events-none min-h-[48px] btn-press-subtle">
              <Plus className="w-4 h-4" />
              {mockDone ? 'Scenario complete' : `Next (${mockProgress})`}
            </button>
          )}
          {mockMode && <ScenarioPicker onSelect={handleSelectScenario} />}
          <button onClick={toggleMockMode}
            className={`flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg border text-xs font-medium min-h-[48px] ${
              mockMode ? 'border-primary-action/30 bg-protocol-bg text-primary-action' : 'border-border bg-surface text-text-muted'
            }`}>
            <FlaskConical className="w-4 h-4" />
            {mockMode ? 'Live' : 'Demo'}
          </button>
          {!mockMode && <div className="flex-1" />}
        </div>
      </div>
    </div>
  );
}
