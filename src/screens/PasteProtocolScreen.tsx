import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import { FadeInUp } from '../components/Animate';
import { previewFromText, activateProtocol, ImportError, type ImportPreview } from '../services/protocolImportService';

type Phase = 'input' | 'review' | 'activated';

export default function PasteProtocolScreen() {
  const navigate = useNavigate();
  const [protocolText, setProtocolText] = useState('');
  const [regionName, setRegionName] = useState('');
  const [stateName, setStateName] = useState('');
  const [agency, setAgency] = useState('');
  const [version, setVersion] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canParse = protocolText.trim().length > 0 && regionName.trim().length > 0;

  function handleParse() {
    if (!canParse) return;
    setError(null);

    try {
      const result = previewFromText({
        rawText: protocolText,
        regionName: regionName.trim(),
        state: stateName.trim() || undefined,
        sourceOrganization: agency.trim() || undefined,
        version: version.trim() || undefined,
        effectiveDate: effectiveDate.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        sourceType: 'pasted_text',
        confidence: 'low',
      });
      setPreview(result);
      setPhase('review');
    } catch (err) {
      setError(
        err instanceof ImportError
          ? err.userMessage
          : 'Failed to parse protocol text. Please try again.',
      );
    }
  }

  function handleActivate() {
    if (!preview || activating) return;
    setActivating(true);
    try {
      activateProtocol(preview);
      setPhase('activated');
    } catch (err) {
      setActivating(false);
      setError(
        err instanceof ImportError
          ? err.userMessage
          : 'Failed to activate protocol. Please try again.',
      );
    }
  }

  function handleBackToEdit() {
    setPhase('input');
    setPreview(null);
    setWarningsAcknowledged(false);
    setError(null);
  }

  const hasWarnings = (preview?.warnings.length ?? 0) > 0;
  const canActivate = !hasWarnings || warningsAcknowledged;

  const inputClass = 'w-full bg-surface border border-border rounded-lg px-3.5 py-3 text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary-action transition-colors min-h-[48px]';

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Paste Protocol Text" showBack />

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {phase === 'activated' && preview && (
          <FadeInUp>
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 py-4 rounded-lg bg-success-bg text-success text-sm font-semibold">
                <CheckCircle className="w-5 h-5" />
                Protocol Imported & Activated
              </div>

              {preview.parseStats && (
                <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                  <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">Parse Results</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-primary">
                    <span>{preview.parseStats.sectionsDetected} section{preview.parseStats.sectionsDetected !== 1 ? 's' : ''} detected</span>
                    {preview.parseStats.sectionsNeedingReview > 0 && (
                      <span className="text-warning font-medium">{preview.parseStats.sectionsNeedingReview} need{preview.parseStats.sectionsNeedingReview === 1 ? 's' : ''} review</span>
                    )}
                  </div>
                  {preview.parseStats.categoriesMatched.length > 0 && (
                    <p className="text-xs text-text-secondary">
                      Matched: {preview.parseStats.categoriesMatched.join(', ')}
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-warning/20 bg-warning-bg/30 p-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4.5 h-4.5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-warning font-semibold">Verify before clinical use</p>
                    <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                      Pasted protocol text has not been verified. Do not rely on it for clinical decisions until you have confirmed it matches your agency, medical director, and local policy.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => navigate('/settings')}
                className="w-full flex items-center justify-center py-3 rounded-lg bg-primary-action text-white text-sm font-semibold min-h-[48px] btn-press"
              >
                Back to Settings
              </button>
            </div>
          </FadeInUp>
        )}

        {phase === 'review' && preview && (
          <FadeInUp>
            <div className="space-y-4">
              {/* Parse results */}
              <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">Parse Results</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-primary">
                  <span>{preview.protocol.protocols.length} section{preview.protocol.protocols.length !== 1 ? 's' : ''} detected</span>
                  {preview.parseStats && preview.parseStats.sectionsNeedingReview > 0 && (
                    <span className="text-warning font-medium">
                      {preview.parseStats.sectionsNeedingReview} need{preview.parseStats.sectionsNeedingReview === 1 ? 's' : ''} review
                    </span>
                  )}
                </div>
                {preview.parseStats && preview.parseStats.categoriesMatched.length > 0 && (
                  <p className="text-xs text-text-secondary">
                    Matched: {preview.parseStats.categoriesMatched.join(', ')}
                  </p>
                )}
                {preview.parseStats && preview.parseStats.categoriesMatched.length === 0 && (
                  <p className="text-xs text-warning">
                    No known categories matched.
                  </p>
                )}
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

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-error/20 bg-error/5">
                  <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  <p className="text-xs text-error leading-relaxed">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={handleActivate}
                  disabled={!canActivate || activating}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary-action hover:bg-primary-action-hover text-sm font-semibold text-white disabled:opacity-30 disabled:pointer-events-none min-h-[48px] btn-press"
                >
                  <CheckCircle className="w-4.5 h-4.5" />
                  {activating ? 'Activating...' : 'Activate Protocol'}
                </button>
                <button
                  onClick={handleBackToEdit}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-border bg-surface text-sm font-medium text-text-secondary min-h-[48px] btn-press-subtle"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Edit
                </button>
              </div>
            </div>
          </FadeInUp>
        )}

        {phase === 'input' && (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5 block px-0.5">
                  Region Name *
                </label>
                <input
                  type="text"
                  value={regionName}
                  onChange={(e) => setRegionName(e.target.value)}
                  placeholder="e.g., New York State, LA County"
                  className={inputClass}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5 block px-0.5">
                    State
                  </label>
                  <input
                    type="text"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    placeholder="e.g., NY"
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5 block px-0.5">
                    Version
                  </label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="e.g., 2024.1"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5 block px-0.5">
                  Agency / Source Organization
                </label>
                <input
                  type="text"
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                  placeholder="e.g., NYS Bureau of EMS"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5 block px-0.5">
                  Effective Date
                </label>
                <input
                  type="text"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  placeholder="e.g., 2024-04-01"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5 block px-0.5">
                  Source Link (optional)
                </label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5 block px-0.5">
                Protocol Text *
              </label>
              <textarea
                value={protocolText}
                onChange={(e) => setProtocolText(e.target.value)}
                placeholder={'Paste protocol text here...\n\nChest Pain\n- Consider 12-lead ECG\n- Consider aspirin 324mg PO\n\nRespiratory Distress\n- Assess lung sounds\n- Consider albuterol nebulizer'}
                spellCheck={false}
                className="w-full bg-surface border border-border rounded-lg px-3.5 py-3 text-[13px] font-mono text-text-primary placeholder-text-muted outline-none focus:border-primary-action transition-colors min-h-[200px] resize-y"
              />
            </div>

            <div className="rounded-lg border border-warning/20 bg-warning-bg/30 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-text-secondary leading-relaxed">
                  Pasted protocols are marked as low confidence. All guidance generated from pasted text will include verification reminders. Verify against your agency and medical direction before clinical use.
                </p>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-error/20 bg-error/5">
                <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                <p className="text-xs text-error leading-relaxed">{error}</p>
              </div>
            )}

            <button
              onClick={handleParse}
              disabled={!canParse}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary-action hover:bg-primary-action-hover text-sm font-semibold text-white disabled:opacity-30 disabled:pointer-events-none min-h-[48px] btn-press"
            >
              <FileText className="w-4.5 h-4.5" />
              Parse & Review
            </button>
          </>
        )}
      </div>
    </div>
  );
}
