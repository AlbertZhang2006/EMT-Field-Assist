import { useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import {
  Shield, Calendar, FileText, Building, CheckCircle,
  AlertTriangle, ExternalLink, MapPin, Clock, Hash, User,
} from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import { FadeInUp } from '../components/Animate';
import {
  getResultById,
  getSourceLabel,
} from '../services/protocolSearchService';
import { previewFromSource, activateProtocol, ImportError, type ImportPreview } from '../services/protocolImportService';
import type { Confidence } from '../types';

const CONFIDENCE_STYLES: Record<Confidence, { bg: string; text: string }> = {
  high:   { bg: 'bg-success-bg',  text: 'text-success' },
  medium: { bg: 'bg-warning-bg',  text: 'text-warning' },
  low:    { bg: 'bg-bg',          text: 'text-text-muted' },
};

function Field({ icon: Icon, label, value }: { icon: typeof Shield; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border-light last:border-b-0">
      <Icon className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">{label}</p>
        <p className="text-sm text-text-primary mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}

type Phase = 'metadata' | 'importing' | 'review' | 'activated';

export default function ProtocolReviewScreen() {
  const { resultId } = useParams<{ resultId: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('metadata');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = resultId ? getResultById(resultId) : undefined;
  if (!result) return <Navigate to="/protocol-search" replace />;

  const conf = CONFIDENCE_STYLES[result.confidence];

  function handleImport() {
    if (phase !== 'metadata') return;
    setPhase('importing');
    setError(null);

    previewFromSource(result!)
      .then((imported) => {
        setPreview(imported);
        if (imported.warnings.length === 0) {
          activateProtocol(imported);
          setPhase('activated');
        } else {
          setPhase('review');
        }
      })
      .catch((err) => {
        setPhase('metadata');
        setError(
          err instanceof ImportError
            ? err.userMessage
            : 'Failed to import protocol. Please try again.',
        );
      });
  }

  function handleActivate() {
    if (!preview) return;
    try {
      activateProtocol(preview);
      setPhase('activated');
    } catch (err) {
      setError(
        err instanceof ImportError
          ? err.userMessage
          : 'Failed to activate protocol. Please try again.',
      );
    }
  }

  function handleCancelReview() {
    setPhase('metadata');
    setPreview(null);
    setWarningsAcknowledged(false);
    setError(null);
  }

  const hasWarnings = (preview?.warnings.length ?? 0) > 0;

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Protocol Review" showBack />

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {/* Title card */}
        <FadeInUp>
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-base font-semibold text-text-primary leading-snug">{result.protocolTitle}</h2>
            <p className="text-sm text-text-secondary mt-1">{result.sourceOrganization}</p>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${conf.bg} ${conf.text}`}>
                {result.confidence.charAt(0).toUpperCase() + result.confidence.slice(1)} confidence
              </span>
              <span className="text-[11px] text-text-muted bg-bg px-2 py-0.5 rounded">
                {result.protocolCount} protocol{result.protocolCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </FadeInUp>

        {/* Detail fields */}
        <FadeInUp delay={60}>
          <div className="rounded-lg border border-border bg-surface px-4">
            <Field icon={MapPin}    label="Region"              value={result.regionName} />
            <Field icon={FileText}  label="State"               value={result.state} />
            <Field icon={User}      label="Agency"              value={result.agencyName} />
            <Field icon={Building}  label="Source Organization"  value={result.sourceOrganization} />
            <Field icon={Hash}      label="Source Type"          value={getSourceLabel(result.sourceType)} />
            <Field icon={Shield}    label="Version"              value={result.version} />
            <Field icon={Calendar}  label="Effective Date"       value={result.effectiveDate} />
            <Field icon={Clock}     label="Last Checked"         value={result.lastCheckedAt} />
          </div>
        </FadeInUp>

        {/* Source link */}
        {result.sourceUrl && (
          <FadeInUp delay={100}>
            <a
              href={result.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-primary-action/20 bg-protocol-bg text-sm font-medium text-primary-action min-h-[48px] btn-press-subtle"
            >
              <ExternalLink className="w-4.5 h-4.5 shrink-0" />
              Open Source Document
            </a>
          </FadeInUp>
        )}

        {/* Notes */}
        {result.notes && phase === 'metadata' && (
          <FadeInUp delay={120}>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">Notes</p>
              <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{result.notes}</p>
            </div>
          </FadeInUp>
        )}

        {/* Verify warning (metadata phase) */}
        {phase === 'metadata' && (
          <FadeInUp delay={140}>
            <div className="rounded-lg border border-warning/20 bg-warning-bg/30 p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4.5 h-4.5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-warning font-semibold leading-snug">
                    Verify before clinical use
                  </p>
                  <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                    Verify this protocol matches your agency, medical director, and local policy before use.
                  </p>
                  {result.sourceType === 'bundled' && (
                    <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
                      This is a demo protocol set for testing and development. It does not represent any real jurisdiction.
                    </p>
                  )}
                  {result.sourceType !== 'bundled' && (
                    <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
                      Protocol content is a placeholder for {result.regionName}. Actual clinical protocols must be obtained from your EMS agency or medical director.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </FadeInUp>
        )}

        {/* Import results & warnings (review phase) */}
        {phase === 'review' && preview && (
          <FadeInUp>
            <div className="space-y-4">
              {/* Section count */}
              <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">Import Results</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-primary">
                  <span>
                    {preview.protocol.protocols.length} section{preview.protocol.protocols.length !== 1 ? 's' : ''} imported
                  </span>
                  {(() => {
                    const reviewCount = preview.protocol.protocols.filter(s => s.needsReview).length;
                    return reviewCount > 0 ? (
                      <span className="text-warning font-medium">
                        {reviewCount} need{reviewCount === 1 ? 's' : ''} review
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* Section list */}
              <div className="rounded-lg border border-border bg-surface px-4">
                {preview.protocol.protocols.map((section, i) => (
                  <div key={section.id} className={`flex items-center gap-3 py-2.5 ${i < preview.protocol.protocols.length - 1 ? 'border-b border-border-light' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary truncate">{section.name}</p>
                      {section.category && (
                        <p className="text-[11px] text-text-muted">{section.category}</p>
                      )}
                    </div>
                    {section.needsReview && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning-bg text-warning shrink-0">
                        Needs review
                      </span>
                    )}
                    {section.parseConfidence && !section.needsReview && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                        section.parseConfidence === 'high' ? 'bg-success-bg text-success' :
                        section.parseConfidence === 'medium' ? 'bg-bg text-text-muted' :
                        'bg-warning-bg text-warning'
                      }`}>
                        {section.parseConfidence}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Warnings */}
              {hasWarnings && (
                <div className="rounded-lg border border-warning/20 bg-warning-bg/30 p-4 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4.5 h-4.5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-warning font-semibold">Review warnings</p>
                      <ul className="mt-2 space-y-1.5">
                        {preview.warnings.map((w, i) => (
                          <li key={i} className="text-xs text-text-secondary leading-relaxed flex items-start gap-1.5">
                            <span className="text-warning mt-0.5 shrink-0">•</span>
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Acknowledge */}
              {hasWarnings && (
                <label className="flex items-start gap-2.5 px-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={warningsAcknowledged}
                    onChange={(e) => setWarningsAcknowledged(e.target.checked)}
                    className="mt-0.5 w-4 h-4 shrink-0 accent-primary-action"
                  />
                  <span className="text-xs text-text-secondary leading-relaxed">
                    I have reviewed these warnings and will verify this protocol against my agency's official documents before clinical use.
                  </span>
                </label>
              )}
            </div>
          </FadeInUp>
        )}
      </div>

      {/* Action bar */}
      <div className="px-4 py-4 border-t border-border bg-surface space-y-2">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-error/20 bg-error/5">
            <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
            <p className="text-xs text-error leading-relaxed">{error}</p>
          </div>
        )}

        {phase === 'activated' ? (
          <>
            <div className="flex items-center justify-center gap-2 py-3 rounded-lg bg-success-bg text-success text-sm font-semibold min-h-[48px]">
              <CheckCircle className="w-5 h-5" />
              Protocol Activated
            </div>
            <button
              onClick={() => navigate('/settings')}
              className="w-full flex items-center justify-center py-3 rounded-lg border border-border bg-surface text-sm font-medium text-text-primary min-h-[48px] btn-press-subtle"
            >
              Back to Settings
            </button>
          </>
        ) : phase === 'review' ? (
          <div className="space-y-2">
            <button
              onClick={handleActivate}
              disabled={hasWarnings && !warningsAcknowledged}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary-action hover:bg-primary-action-hover text-sm font-semibold text-white disabled:opacity-30 disabled:pointer-events-none min-h-[48px] btn-press"
            >
              <CheckCircle className="w-4.5 h-4.5" />
              Activate Protocol
            </button>
            <button
              onClick={handleCancelReview}
              className="w-full flex items-center justify-center py-3 rounded-lg border border-border bg-surface text-sm font-medium text-text-secondary min-h-[48px] btn-press-subtle"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={handleImport}
              disabled={phase === 'importing'}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary-action hover:bg-primary-action-hover text-sm font-semibold text-white disabled:opacity-50 min-h-[48px] btn-press"
            >
              {phase === 'importing' ? 'Importing...' : 'Import & Review'}
            </button>
            {result.sourceUrl && (
              <a
                href={result.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-border bg-surface text-sm font-medium text-text-primary min-h-[48px] btn-press-subtle"
              >
                <ExternalLink className="w-4 h-4 text-text-secondary" />
                Open Source Link
              </a>
            )}
            <button
              onClick={() => navigate(-1)}
              className="w-full flex items-center justify-center py-3 rounded-lg border border-border bg-surface text-sm font-medium text-text-secondary min-h-[48px] btn-press-subtle"
            >
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
