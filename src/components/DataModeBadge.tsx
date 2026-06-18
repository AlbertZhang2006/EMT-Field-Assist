import type { DataMode } from '../types';

const STYLES: Record<DataMode, { bg: string; text: string; label: string }> = {
  local_draft:   { bg: 'bg-bg',         text: 'text-text-muted',    label: 'Local Draft' },
  protocol_only: { bg: 'bg-protocol-bg', text: 'text-protocol-text', label: 'Protocol Support' },
  ai_assisted:   { bg: 'bg-warning-bg',  text: 'text-warning',       label: 'AI Assisted' },
};

export default function DataModeBadge({ mode }: { mode?: DataMode }) {
  if (!mode) return null;
  const s = STYLES[mode] ?? STYLES.local_draft;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}
