import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, FlaskConical, Trash2, Lock, AlertCircle, Search, ExternalLink, RefreshCw } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import DataModeBadge from '../components/DataModeBadge';
import {
  getActiveRegionId,
  setActiveRegion,
  getActiveRegionMeta,
  getAvailableRegions,
} from '../services/guidanceEngine';
import {
  isAIEnabled,
  setAIEnabled,
  getAutoDeletePeriod,
  setAutoDeletePeriod,
  isAppLockEnabled,
  setAppLockPin,
  getDataModeLabel,
  deleteAllCallData,
  deleteAllAppData,
  DATA_MODE_LABELS,
  type AutoDeletePeriod,
} from '../services/privacySettings';
import { useCall } from '../context/CallContext';

const DELETE_OPTIONS: { value: AutoDeletePeriod; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { clearAllCalls } = useCall();
  const [selected, setSelected] = useState(getActiveRegionId);
  const [aiOn, setAiOn] = useState(isAIEnabled);
  const [deletePeriod, setDeletePeriod] = useState(getAutoDeletePeriod);
  const [pinInput, setPinInput] = useState('');
  const [hasPin, setHasPin] = useState(isAppLockEnabled);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<'calls' | 'all' | null>(null);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const regions = getAvailableRegions();
  const meta = getActiveRegionMeta();
  const dataMode = getDataModeLabel();
  const modeInfo = DATA_MODE_LABELS[dataMode];

  function handleSelectRegion(id: string) {
    setSelected(id);
    setActiveRegion(id);
  }

  function handleToggleAI() {
    const next = !aiOn;
    setAiOn(next);
    setAIEnabled(next);
  }

  function handleDeletePeriod(period: AutoDeletePeriod) {
    setDeletePeriod(period);
    setAutoDeletePeriod(period);
  }

  function handleDeleteCalls() {
    deleteAllCallData();
    clearAllCalls();
    setShowDeleteConfirm(null);
  }

  function handleDeleteAll() {
    deleteAllAppData();
    clearAllCalls();
    setShowDeleteConfirm(null);
    window.location.reload();
  }

  async function handleSetPin() {
    if (pinInput.length >= 4) {
      await setAppLockPin(pinInput);
      setHasPin(true);
      setShowPinSetup(false);
      setPinInput('');
    }
  }

  async function handleRemovePin() {
    await setAppLockPin(null);
    setHasPin(false);
  }

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Settings" showBack />

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* Current data mode */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-text-primary">Current Mode</span>
            <DataModeBadge mode={dataMode} />
          </div>
          <p className="text-xs text-text-muted">{modeInfo.description}</p>
        </div>

        {/* Protocol region */}
        <div>
          <h2 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-3 px-1">
            Protocol Region
          </h2>
          <div className="space-y-2">
            {regions.map((r) => (
              <button
                key={r.id}
                onClick={() => handleSelectRegion(r.id)}
                className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-lg text-left min-h-[56px] border btn-press-subtle ${
                  selected === r.id ? 'bg-protocol-bg border-primary-action/30' : 'bg-surface border-border hover:bg-bg'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                  selected === r.id ? 'border-primary-action' : 'border-border'
                }`}>
                  {selected === r.id && <div className="w-2.5 h-2.5 rounded-full bg-primary-action" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{r.name}</span>
                    {r.isCustom && <span className="text-[10px] font-semibold text-clinical bg-success-bg px-1.5 py-0.5 rounded">Custom</span>}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    {r.protocolCount} protocol{r.protocolCount !== 1 ? 's' : ''}{r.version && ` · v${r.version}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
          {/* Active protocol details */}
          {meta.id !== 'none' && (
            <div className="mt-3 rounded-lg border border-border bg-surface p-4 space-y-2">
              <p className="text-sm font-semibold text-text-primary">
                {meta.name}{meta.version ? ` v${meta.version}` : ''}
              </p>
              {meta.sourceOrganization && (
                <p className="text-xs text-text-secondary">{meta.sourceOrganization}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                {meta.effectiveDate && <span>Effective: {meta.effectiveDate}</span>}
                {meta.importedAt && <span>Imported: {new Date(meta.importedAt).toLocaleDateString()}</span>}
                <span>{meta.protocolCount} section{meta.protocolCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  meta.confidence === 'high' ? 'bg-success-bg text-success' :
                  meta.confidence === 'medium' ? 'bg-warning-bg text-warning' :
                  'bg-critical-bg text-critical'
                }`}>
                  {meta.confidence.charAt(0).toUpperCase() + meta.confidence.slice(1)} confidence
                </span>
                {meta.sourceType && meta.sourceType !== 'bundled' && (
                  <span className="text-[10px] text-text-muted bg-bg px-2 py-0.5 rounded">
                    {meta.sourceType === 'pasted_text' ? 'Pasted text' :
                     meta.sourceType === 'manual_import' ? 'Manual import' :
                     meta.sourceType.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              {meta.sourceUrl && (
                <a
                  href={meta.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary-action font-medium mt-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Source Document
                </a>
              )}
            </div>
          )}
          {meta.id === 'none' && (
            <p className="mt-3 px-1 text-xs text-text-muted">No protocol loaded.</p>
          )}
        </div>

        {/* Protocol discovery & replace */}
        <div className="space-y-2">
          <button
            onClick={() => navigate('/protocol-search')}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border border-border bg-surface hover:bg-bg text-left min-h-[52px] btn-press-subtle"
          >
            {meta.id !== 'none' ? (
              <RefreshCw className="w-5 h-5 text-primary-action shrink-0" />
            ) : (
              <Search className="w-5 h-5 text-primary-action shrink-0" />
            )}
            <div>
              <span className="text-sm font-medium text-text-primary">
                {meta.id !== 'none' ? 'Replace Protocol' : 'Find Protocol Region'}
              </span>
              <p className="text-xs text-text-muted mt-0.5">Search by state, county, or EMS agency</p>
            </div>
          </button>
          <button
            onClick={() => navigate('/protocols')}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border border-border bg-surface hover:bg-bg text-left min-h-[52px] btn-press-subtle"
          >
            <FlaskConical className="w-5 h-5 text-clinical shrink-0" />
            <div>
              <span className="text-sm font-medium text-text-primary">Protocol Ingestion</span>
              <p className="text-xs text-text-muted mt-0.5">Import custom protocol JSON or text</p>
            </div>
          </button>
        </div>

        {/* Privacy & Data */}
        <div>
          <h2 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-3 px-1">
            Privacy & Data
          </h2>

          {/* AI toggle */}
          <div className="rounded-lg border border-border bg-surface p-4 mb-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-text-primary">AI-Assisted Guidance</span>
                <p className="text-xs text-text-muted mt-0.5">
                  {aiOn ? 'Transcript data sent to AI service' : 'Off — all processing is local'}
                </p>
              </div>
              <button
                onClick={handleToggleAI}
                className={`w-11 h-6 rounded-full transition-colors relative ${aiOn ? 'bg-primary-action' : 'bg-border'}`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${aiOn ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {aiOn && (
              <div className="flex items-start gap-2 mt-3 p-2.5 rounded bg-warning-bg/50 border border-warning/20">
                <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-warning">
                  When enabled, encounter transcript and extracted data are sent to an external AI service. Requires API key configured via environment variable.
                </p>
              </div>
            )}
          </div>

          {/* Auto-delete */}
          <div className="rounded-lg border border-border bg-surface p-4 mb-3">
            <span className="text-sm font-medium text-text-primary">Auto-Delete Calls</span>
            <p className="text-xs text-text-muted mt-0.5 mb-3">Automatically remove saved encounters after a period.</p>
            <div className="flex flex-wrap gap-1.5">
              {DELETE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleDeletePeriod(opt.value)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors min-h-[32px] ${
                    deletePeriod === opt.value
                      ? 'bg-primary-action text-white'
                      : 'bg-bg border border-border text-text-secondary hover:bg-border-light'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* App lock */}
          <div className="rounded-lg border border-border bg-surface p-4 mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-text-secondary" />
                <span className="text-sm font-medium text-text-primary">App Lock PIN</span>
              </div>
              {hasPin ? (
                <button onClick={handleRemovePin} className="text-xs text-critical hover:underline min-h-[32px]">
                  Remove PIN
                </button>
              ) : (
                <button onClick={() => setShowPinSetup(true)} className="text-xs text-primary-action hover:underline min-h-[32px]">
                  Set PIN
                </button>
              )}
            </div>
            <p className="text-xs text-text-muted mt-1">
              {hasPin ? 'PIN is set. App will require PIN on launch.' : 'No PIN set.'}
            </p>
            {showPinSetup && (
              <div className="flex gap-2 mt-3">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="4–6 digits"
                  className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary-action min-h-[40px]"
                />
                <button
                  onClick={handleSetPin}
                  disabled={pinInput.length < 4}
                  className="px-4 rounded-lg bg-primary-action text-white text-sm font-medium disabled:opacity-30 disabled:pointer-events-none min-h-[40px]"
                >
                  Save
                </button>
              </div>
            )}
          </div>

          {/* Delete data */}
          <div className="space-y-2">
            <button
              onClick={() => setShowDeleteConfirm('calls')}
              className="w-full flex items-center gap-2.5 px-4 py-3 rounded-lg border border-critical/20 bg-critical-bg/30 hover:bg-critical-bg/60 transition-colors text-sm font-medium text-critical min-h-[48px]"
            >
              <Trash2 className="w-4 h-4" />
              Delete All Call Data
            </button>
            <button
              onClick={() => setShowDeleteConfirm('all')}
              className="w-full flex items-center gap-2.5 px-4 py-3 rounded-lg border border-border bg-surface hover:bg-bg transition-colors text-sm text-text-secondary min-h-[48px]"
            >
              <Trash2 className="w-4 h-4" />
              Reset All App Data
            </button>
          </div>

          {showDeleteConfirm && (
            <div className="rounded-lg border border-critical/30 bg-critical-bg p-4">
              <p className="text-sm font-medium text-critical mb-3">
                {showDeleteConfirm === 'calls'
                  ? 'Delete all saved encounter data? This cannot be undone.'
                  : 'Reset all app data including settings, protocols, and calls? This cannot be undone.'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={showDeleteConfirm === 'calls' ? handleDeleteCalls : handleDeleteAll}
                  className="flex-1 py-2.5 rounded-lg bg-critical text-white text-sm font-semibold min-h-[40px]"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-lg border border-border bg-surface text-text-primary text-sm font-medium min-h-[40px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Safety disclaimer */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <ShieldCheck className="w-5 h-5 text-clinical shrink-0" />
            <h2 className="text-sm font-semibold text-text-primary">Safety & Privacy</h2>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">
            This app is a documentation and protocol-support assistant. It does not replace local EMS protocols, clinical judgment, medical direction, or agency policy.
          </p>
          <ul className="mt-3 space-y-1.5 text-xs text-text-muted">
            <li>• All data is stored locally on this device by default.</li>
            <li>• Transcript data is never sent externally unless AI mode is explicitly enabled.</li>
            <li>• No analytics, telemetry, or third-party tracking.</li>
            <li>• Generated reports are clearly labeled as drafts.</li>
          </ul>
        </div>

        <div className="px-1 space-y-1">
          <p className="text-xs text-text-muted">EMT Field Assist — MVP</p>
          <p className="text-xs text-text-muted">Data stored locally on this device only.</p>
        </div>
      </div>
    </div>
  );
}
