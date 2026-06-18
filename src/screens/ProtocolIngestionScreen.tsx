import { useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Trash2 } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import { FadeInUp } from '../components/Animate';
import {
  parseProtocolJSON,
  scaffoldFromText,
  validateRegion,
  saveCustomRegion,
  deleteCustomRegion,
  type ValidationResult,
} from '../services/protocolIngestion';
import { setActiveRegion, getAvailableRegions } from '../services/guidanceEngine';
import type { ProtocolRegion } from '../types';

type InputMode = 'json' | 'text';

export default function ProtocolIngestionScreen() {
  const [mode, setMode] = useState<InputMode>('json');
  const [input, setInput] = useState('');
  const [regionName, setRegionName] = useState('');
  const [result, setResult] = useState<{ region: ProtocolRegion | null; validation: ValidationResult } | null>(null);
  const [saved, setSaved] = useState(false);
  const [, setRegionVersion] = useState(0);

  function handleParse() {
    setSaved(false);
    if (mode === 'json') {
      setResult(parseProtocolJSON(input));
    } else {
      const name = regionName.trim() || 'Custom Region';
      const region = scaffoldFromText(name, input);
      const validation = validateRegion(region);
      setResult({ region, validation });
    }
  }

  function handleSave() {
    if (!result?.region) return;
    const id = `custom-${result.region.regionName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    saveCustomRegion(id, result.region);
    setActiveRegion(id);
    setSaved(true);
    setRegionVersion(v => v + 1);
  }

  function handleDelete(id: string) {
    deleteCustomRegion(id);
    setRegionVersion(v => v + 1);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setInput(text);
      if (file.name.endsWith('.json')) setMode('json');
      else setMode('text');
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const allRegions = getAvailableRegions();

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Protocol Ingestion" subtitle="Developer tool" showBack />

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {/* Loaded regions */}
        <div>
          <h2 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-2 px-1">
            Available Regions
          </h2>
          <div className="space-y-1.5">
            {allRegions.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-surface text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-text-primary">{r.name}</span>
                  <span className="text-text-muted ml-2">{r.protocolCount} protocols</span>
                  {r.version && <span className="text-text-muted ml-2">v{r.version}</span>}
                  {r.isCustom && <span className="text-xs text-clinical bg-success-bg px-1.5 py-0.5 rounded ml-2">Custom</span>}
                </div>
                {r.isCustom && (
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="p-1.5 rounded hover:bg-critical-bg text-text-muted hover:text-critical transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Mode tabs */}
        <div>
          <h2 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-2 px-1">
            Import Protocol
          </h2>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => { setMode('json'); setResult(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
                mode === 'json' ? 'bg-primary-action text-white' : 'bg-surface border border-border text-text-secondary'
              }`}
            >
              JSON
            </button>
            <button
              onClick={() => { setMode('text'); setResult(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
                mode === 'text' ? 'bg-primary-action text-white' : 'bg-surface border border-border text-text-secondary'
              }`}
            >
              Plain Text
            </button>
          </div>

          {/* File upload */}
          <label className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border bg-surface hover:bg-bg cursor-pointer transition-colors text-sm text-text-secondary min-h-[44px] mb-3">
            <Upload className="w-4 h-4" />
            Upload .json or .txt file
            <input type="file" accept=".json,.txt,.text" onChange={handleFileUpload} className="hidden" />
          </label>

          {/* Region name for text mode */}
          {mode === 'text' && (
            <input
              type="text"
              value={regionName}
              onChange={(e) => setRegionName(e.target.value)}
              placeholder="Region name (e.g., County EMS Region)"
              className="w-full bg-bg border border-border rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary-action transition-colors min-h-[44px] mb-3"
            />
          )}

          {/* Text area */}
          <textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); setResult(null); setSaved(false); }}
            placeholder={mode === 'json'
              ? '{\n  "regionName": "...",\n  "version": "1.0",\n  "protocols": [...]\n}'
              : 'Paste protocol text here...\n\nChest Pain\n- Consider 12-lead ECG\n- Consider aspirin 324mg'
            }
            spellCheck={false}
            className="w-full bg-bg border border-border rounded-lg px-3.5 py-3 text-[13px] font-mono text-text-primary placeholder-text-muted outline-none focus:border-primary-action transition-colors min-h-[200px] resize-y"
          />

          <button
            onClick={handleParse}
            disabled={!input.trim()}
            className="w-full flex items-center justify-center gap-2 mt-3 py-2.5 rounded-lg bg-primary-action hover:bg-primary-action-hover active:scale-[0.98] transition-all text-sm font-semibold text-white disabled:opacity-30 disabled:pointer-events-none min-h-[44px]"
          >
            <FileText className="w-4 h-4" />
            {mode === 'json' ? 'Validate & Parse' : 'Scaffold Protocol'}
          </button>
        </div>

        {/* Validation result */}
        {result && (
          <FadeInUp>
            <div className="space-y-3">
              {/* Status */}
              <div className={`flex items-start gap-2.5 p-3 rounded-lg border ${
                result.validation.valid
                  ? 'bg-success-bg/50 border-success/20'
                  : 'bg-critical-bg/50 border-critical/20'
              }`}>
                {result.validation.valid
                  ? <CheckCircle className="w-4.5 h-4.5 text-success shrink-0 mt-0.5" />
                  : <AlertCircle className="w-4.5 h-4.5 text-critical shrink-0 mt-0.5" />
                }
                <div className="text-sm">
                  <p className={`font-medium ${result.validation.valid ? 'text-success' : 'text-critical'}`}>
                    {result.validation.valid ? 'Valid' : 'Validation failed'}
                  </p>
                  {result.validation.errors.map((e, i) => (
                    <p key={i} className="text-xs text-critical mt-1">{e}</p>
                  ))}
                  {result.validation.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-warning mt-1">{w}</p>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {result.region && (
                <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
                  <div className="text-sm">
                    <span className="font-semibold text-text-primary">{result.region.regionName}</span>
                    {result.region.version && <span className="text-text-muted ml-2">v{result.region.version}</span>}
                    {result.region.effectiveDate && <span className="text-text-muted ml-2">Effective: {result.region.effectiveDate}</span>}
                  </div>
                  <p className="text-xs text-text-muted">{result.region.protocols.length} protocol(s)</p>
                  {result.region.protocols.map((p) => (
                    <div key={p.id} className="text-xs border-t border-border-light pt-1.5">
                      <span className="font-medium text-text-primary">{p.name}</span>
                      {p.category && <span className="text-text-muted ml-1.5">({p.category})</span>}
                      <span className="text-text-muted ml-1.5">— {p.triggerKeywords.length} keywords, {p.suggestedActions.length} actions, {p.redFlags.length} red flags</span>
                    </div>
                  ))}

                  <button
                    onClick={handleSave}
                    disabled={saved}
                    className="w-full flex items-center justify-center gap-2 mt-2 py-2.5 rounded-lg bg-clinical hover:bg-clinical/90 active:scale-[0.98] transition-all text-sm font-semibold text-white disabled:opacity-50 min-h-[44px]"
                  >
                    {saved ? <><CheckCircle className="w-4 h-4" /> Saved & Activated</> : 'Save & Activate Region'}
                  </button>
                </div>
              )}
            </div>
          </FadeInUp>
        )}

        <p className="text-[11px] text-text-muted px-1">
          Developer tool for protocol ingestion. Custom protocols are stored in browser localStorage.
          JSON files must follow the protocol schema. Plain text is scaffolded into a draft structure for manual refinement.
        </p>
      </div>
    </div>
  );
}
