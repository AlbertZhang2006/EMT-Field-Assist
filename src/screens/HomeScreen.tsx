import { useNavigate } from 'react-router-dom';
import { Mic, ClipboardList, Settings } from 'lucide-react';
import { useCall } from '../context/CallContext';
import { getActiveRegionMeta } from '../services/guidanceEngine';

export default function HomeScreen() {
  const navigate = useNavigate();
  const { startCall } = useCall();
  const meta = getActiveRegionMeta();

  function handleStart() {
    startCall();
    navigate('/call');
  }

  const isNone = meta.id === 'none';
  const regionLabel = isNone
    ? 'No protocol loaded'
    : [
        meta.name,
        meta.version && `v${meta.version}`,
        meta.effectiveDate && `(${meta.effectiveDate})`,
      ].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-primary text-white px-5 py-4">
        <h1 className="text-lg font-semibold tracking-tight">EMT Field Assist</h1>
        <p className="text-xs text-white/60 mt-0.5">
          {isNone ? regionLabel : `Protocol: ${regionLabel} · ${meta.protocolCount} protocol${meta.protocolCount !== 1 ? 's' : ''}`}
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="relative w-48 h-48">
          <div className="mic-ring mic-ring-idle" style={{ animationDelay: '0s' }} />
          <div className="mic-ring mic-ring-idle" style={{ animationDelay: '1.1s' }} />
          <div className="mic-ring mic-ring-idle" style={{ animationDelay: '2.2s' }} />
          <button
            onClick={handleStart}
            className="relative w-full h-full rounded-full bg-primary-action hover:bg-primary-action-hover btn-press flex flex-col items-center justify-center shadow-md z-10"
          >
            <Mic className="w-14 h-14 text-white mb-2" strokeWidth={1.5} />
            <span className="text-white text-base font-semibold">Start Encounter</span>
          </button>
        </div>

        <div className="flex gap-3 mt-12 w-full max-w-xs">
          <button
            onClick={() => navigate('/log')}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-lg border border-border bg-surface hover:bg-bg active:bg-border-light text-text-primary text-sm font-medium min-h-[56px] btn-press-subtle"
          >
            <ClipboardList className="w-5 h-5 text-text-secondary" />
            Call Log
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-lg border border-border bg-surface hover:bg-bg active:bg-border-light text-text-primary text-sm font-medium min-h-[56px] btn-press-subtle"
          >
            <Settings className="w-5 h-5 text-text-secondary" />
            Settings
          </button>
        </div>
      </div>

      <p className="text-[11px] text-text-muted text-center leading-relaxed px-8 pb-5">
        Advisory tool only — does not replace local protocols, clinical judgment, or medical direction.
      </p>
    </div>
  );
}
