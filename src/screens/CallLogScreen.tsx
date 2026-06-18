import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, MapPin } from 'lucide-react';
import { useCall } from '../context/CallContext';
import ScreenHeader from '../components/ScreenHeader';
import { formatDate, formatDuration } from '../utils/format';
import { FadeInUp } from '../components/Animate';
import DataModeBadge from '../components/DataModeBadge';
import type { CallRecord } from '../types';

function CallCard({ call, onClick, index }: { call: CallRecord; onClick: () => void; index: number }) {
  const snap = call.snapshot;
  const patient = [snap.patientAge && `${snap.patientAge}yo`, snap.patientSex]
    .filter(Boolean).join(' ');

  const hasDrafts = !!(call.radioReport || call.pcrDraft);

  return (
    <FadeInUp delay={index * 50}>
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border border-border bg-surface hover:bg-bg text-left min-h-[68px] btn-press-subtle"
      >
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">{formatDate(call.startedAt)}</span>
            <span className="text-xs text-text-muted">{formatDuration(call.startedAt, call.endedAt)}</span>
            <DataModeBadge mode={call.dataMode} />
            {hasDrafts && (
              <span className="text-[10px] font-semibold text-clinical bg-success-bg px-1.5 py-0.5 rounded">SAVED</span>
            )}
          </div>

          {snap.chiefComplaint ? (
            <p className="text-sm text-text-primary truncate">
              {patient && <span className="text-text-secondary">{patient} — </span>}
              {snap.chiefComplaint}
            </p>
          ) : call.transcript.length > 0 ? (
            <p className="text-xs text-text-secondary truncate">{call.transcript[0].text.slice(0, 80)}</p>
          ) : null}

          {snap.destination && (
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{snap.destination}</span>
            </div>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
      </button>
    </FadeInUp>
  );
}

export default function CallLogScreen() {
  const navigate = useNavigate();
  const { state } = useCall();

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Call Log" showBack />
      <div className="flex-1 px-4 py-4 space-y-2">
        {state.callHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted anim-fade-in">
            <Clock className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">No encounters recorded</p>
            <button onClick={() => navigate('/')} className="mt-4 text-sm text-primary-action hover:underline min-h-[44px]">
              Start your first encounter
            </button>
          </div>
        ) : (
          state.callHistory.map((call, i) => (
            <CallCard key={call.id} call={call} onClick={() => navigate(`/log/${call.id}`)} index={i} />
          ))
        )}
      </div>
    </div>
  );
}
