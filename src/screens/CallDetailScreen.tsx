import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Copy, Check, ChevronDown } from 'lucide-react';
import { useCall } from '../context/CallContext';
import ScreenHeader from '../components/ScreenHeader';
import { formatDate, formatDuration } from '../utils/format';
import { CollapseSection, FadeInUp } from '../components/Animate';
import DataModeBadge from '../components/DataModeBadge';
import type { CallSnapshot } from '../types';

function Section({ title, children, defaultOpen = false, index = 0 }: { title: string; children: React.ReactNode; defaultOpen?: boolean; index?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <FadeInUp delay={index * 60}>
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-4 py-3 text-left min-h-[44px]"
        >
          <span className="text-sm font-semibold text-text-primary">{title}</span>
          <ChevronDown
            className="w-4 h-4 text-text-muted transition-transform duration-200"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
          />
        </button>
        <CollapseSection open={open}>
          <div className="px-4 pb-4 border-t border-border-light">{children}</div>
        </CollapseSection>
      </div>
    </FadeInUp>
  );
}

function PreBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="relative mt-3">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-border bg-surface hover:bg-bg text-text-muted transition-colors"
      >
        {copied ? <><Check className="w-3 h-3 text-success" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
      </button>
      <pre className="text-xs text-text-primary whitespace-pre-wrap bg-bg rounded-lg p-3 pt-9 max-h-72 overflow-y-auto leading-relaxed border border-border-light">
        {text}
      </pre>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 py-1.5 text-sm border-b border-border-light last:border-b-0">
      <span className="text-text-muted shrink-0 w-28">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}

function FieldList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex gap-2 py-1.5 text-sm border-b border-border-light last:border-b-0">
      <span className="text-text-muted shrink-0 w-28">{label}</span>
      <span className="text-text-primary">{items.join(', ')}</span>
    </div>
  );
}

function ExtractedFields({ snapshot }: { snapshot: CallSnapshot }) {
  return (
    <div className="mt-3">
      <FieldRow label="Age" value={snapshot.patientAge && `${snapshot.patientAge} y/o`} />
      <FieldRow label="Sex" value={snapshot.patientSex} />
      <FieldRow label="Chief Complaint" value={snapshot.chiefComplaint} />
      <FieldRow label="Mental Status" value={snapshot.mentalStatus} />
      <FieldRow label="Vitals" value={snapshot.vitalsLatest} />
      {snapshot.vitalsTrend.length > 1 && (
        <FieldList label="Vitals Trend" items={snapshot.vitalsTrend} />
      )}
      <FieldRow label="Allergies" value={snapshot.allergies} />
      <FieldRow label="Medications" value={snapshot.medications} />
      <FieldRow label="PMH" value={snapshot.pastMedicalHistory} />
      <FieldRow label="Findings" value={snapshot.assessmentFindings} />
      <FieldRow label="Treatments" value={snapshot.treatmentsGiven} />
      <FieldRow label="Response" value={snapshot.responseToTreatment} />
      <FieldRow label="Destination" value={snapshot.destination} />
      <FieldRow label="ETA" value={snapshot.eta} />
      <FieldList label="Negatives" items={snapshot.pertinentNegatives} />
      <FieldList label="Differentials" items={snapshot.suspectedDifferentials} />
      <FieldList label="Protocols" items={snapshot.protocolFlags} />
      <FieldList label="Missing" items={snapshot.missingItems} />
    </div>
  );
}

export default function CallDetailScreen() {
  const { callId } = useParams<{ callId: string }>();
  const { state } = useCall();
  const call = state.callHistory.find((c) => c.id === callId);

  if (!call) return <Navigate to="/log" replace />;

  const duration = formatDuration(call.startedAt, call.endedAt);
  const snap = call.snapshot;
  const patient = [snap.patientAge && `${snap.patientAge}yo`, snap.patientSex].filter(Boolean).join(' ');
  const subtitle = [patient, snap.chiefComplaint, duration].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title={formatDate(call.startedAt)} subtitle={subtitle} showBack
        right={<DataModeBadge mode={call.dataMode} />}
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <Section title="Extracted Fields" defaultOpen index={0}>
          <ExtractedFields snapshot={call.snapshot} />
        </Section>

        <Section title={`Transcript (${call.transcript.length})`} defaultOpen index={1}>
          <div className="bg-bg rounded-lg p-3 max-h-64 overflow-y-auto space-y-1.5 mt-3 border border-border-light">
            {call.transcript.map((t) => (
              <div key={t.id} className="flex gap-2">
                <span className="text-[11px] text-text-muted shrink-0 pt-0.5 w-8 text-right font-mono">
                  {Math.floor((t.timestamp - call.startedAt) / 1000)}s
                </span>
                <p className="text-xs text-text-primary leading-snug">{t.text}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title={`Protocol Support (${call.guidance.length})`} index={2}>
          <div className="bg-bg rounded-lg p-3 max-h-64 overflow-y-auto space-y-1.5 mt-3 border border-border-light">
            {call.guidance.map((g) => {
              const color =
                g.type === 'safety' || g.type === 'warning' ? 'text-warning'
                : g.type === 'protocol' || g.type === 'protocol_reminder' ? 'text-primary-action'
                : g.type === 'differential' ? 'text-clinical'
                : g.type === 'missing_info' || g.type === 'documentation' ? 'text-warning'
                : 'text-text-muted';
              const label = g.type.replace('_', ' ');
              return (
                <div key={g.id} className="flex gap-2">
                  <span className={`text-[10px] font-semibold shrink-0 pt-0.5 w-16 text-right uppercase ${color}`}>
                    {label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-text-primary leading-snug">{g.text}</p>
                    {g.protocolSection && (
                      <p className="text-[10px] text-text-muted truncate">{g.protocolSection}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {call.radioReport && (
          <Section title="Generated Radio Report Draft" index={3}>
            <PreBlock text={call.radioReport} />
          </Section>
        )}

        {call.pcrDraft && (
          <Section title="PCR Draft" index={4}>
            <PreBlock text={call.pcrDraft} />
          </Section>
        )}

        {call.debrief && (
          <Section title="Post-Call Debrief" index={5}>
            <PreBlock text={call.debrief} />
          </Section>
        )}
      </div>
    </div>
  );
}
