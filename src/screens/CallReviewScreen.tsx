import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Radio, FileText, MessageSquare, Copy, Check, Save, Home } from 'lucide-react';
import { useCall } from '../context/CallContext';
import { generateRadioReport, generatePCR, generateDebrief } from '../services/guidanceEngine';
import { transcriptToClinicalFacts } from '../services/extractionService';
import ScreenHeader from '../components/ScreenHeader';
import { FadeInUp } from '../components/Animate';
import type { CallRecord } from '../types';

function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);
  return ref;
}

interface ReportSectionProps {
  icon: typeof Radio;
  title: string;
  value: string;
  onChange: (v: string) => void;
  delay: number;
}

function ReportSection({ icon: Icon, title, value, onChange, delay }: ReportSectionProps) {
  const [copied, setCopied] = useState(false);
  const textareaRef = useAutoResize(value);

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <FadeInUp delay={delay}>
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-light">
          <div className="flex items-center gap-2.5">
            <Icon className="w-4.5 h-4.5 text-primary" />
            <span className="text-sm font-semibold text-text-primary">{title}</span>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-100 min-h-[36px] border border-border bg-bg hover:bg-border-light active:scale-[0.94] active:opacity-80 text-text-secondary"
          >
            {copied
              ? <><Check className="w-3.5 h-3.5 text-success" /> Copied</>
              : <><Copy className="w-3.5 h-3.5" /> Copy</>
            }
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="w-full bg-bg/50 text-[13px] leading-relaxed text-text-primary font-mono px-4 py-3 resize-none outline-none focus:bg-white transition-colors min-h-[120px]"
        />
      </div>
    </FadeInUp>
  );
}

function safeBuildReports(call: CallRecord): { radio: string; pcr: string; debrief: string } {
  const messages = (call.transcript ?? []).map((t) => t.text);
  const transcript = messages.join('\n') || '[No transcript recorded]';

  const facts = transcriptToClinicalFacts(messages);
  const snapshot: CallRecord['snapshot'] = {
    ...call.snapshot,
    ...facts,
    vitals: facts.vitalsLatest,
    suspectedDifferentials: call.snapshot.suspectedDifferentials,
    protocolFlags: call.snapshot.protocolFlags,
  };

  try {
    return {
      radio: generateRadioReport(snapshot),
      pcr: generatePCR(snapshot, transcript),
      debrief: generateDebrief(snapshot),
    };
  } catch {
    return {
      radio: 'RADIO REPORT — GENERATED DRAFT\n\n[Report generation encountered an error. Review transcript below.]\n\n' + transcript,
      pcr: 'PRE-HOSPITAL CARE REPORT — GENERATED DRAFT\n\n[Report generation encountered an error. Review transcript below.]\n\n' + transcript,
      debrief: 'CALL DEBRIEF — DRAFT\n\n[Debrief generation encountered an error.]',
    };
  }
}

export default function CallReviewScreen() {
  const navigate = useNavigate();
  const { state, updateCall } = useCall();
  const lastCall = state.callHistory[0];

  const [radio, setRadio] = useState('');
  const [pcr, setPcr] = useState('');
  const [debrief, setDebrief] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!lastCall) return;
    if (lastCall.radioReport && lastCall.pcrDraft && lastCall.debrief) {
      setRadio(lastCall.radioReport);
      setPcr(lastCall.pcrDraft);
      setDebrief(lastCall.debrief);
    } else {
      const reports = safeBuildReports(lastCall);
      setRadio(reports.radio);
      setPcr(reports.pcr);
      setDebrief(reports.debrief);
      updateCall({ id: lastCall.id, radioReport: reports.radio, pcrDraft: reports.pcr, debrief: reports.debrief });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCall?.id]);

  if (!lastCall) return <Navigate to="/" replace />;

  const duration = Math.round(((lastCall.endedAt ?? Date.now()) - lastCall.startedAt) / 1000);
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  function handleSave() {
    updateCall({ id: lastCall.id, radioReport: radio, pcrDraft: pcr, debrief });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader
        title="Encounter Review"
        subtitle={`${(lastCall.transcript ?? []).length} entries · ${mins}m ${secs}s`}
      />

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        <ReportSection icon={Radio} title="Generated Radio Report Draft" value={radio} onChange={setRadio} delay={0} />
        <ReportSection icon={FileText} title="PCR Draft" value={pcr} onChange={setPcr} delay={80} />
        <ReportSection icon={MessageSquare} title="Post-Call Debrief" value={debrief} onChange={setDebrief} delay={160} />
      </div>

      <div className="px-4 py-4 space-y-3 border-t border-border bg-surface">
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-primary-action hover:bg-primary-action-hover active:scale-[0.95] active:opacity-90 transition-all duration-100 text-sm font-semibold text-white min-h-[48px]"
          >
            {saved ? <><Check className="w-5 h-5" /> Saved</> : <><Save className="w-5 h-5" /> Save Encounter</>}
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border border-border bg-surface hover:bg-bg active:scale-[0.95] active:opacity-90 transition-all duration-100 text-sm font-medium text-text-primary min-h-[48px]"
          >
            <Home className="w-5 h-5 text-text-secondary" />
            Home
          </button>
        </div>
        <p className="text-[11px] text-text-muted text-center">
          All generated content is advisory. Review and verify before use.
        </p>
      </div>
    </div>
  );
}
