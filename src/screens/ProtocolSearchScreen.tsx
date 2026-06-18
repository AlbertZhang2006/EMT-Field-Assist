import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, Shield, MapPin, FileText, ClipboardPaste, FlaskConical } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';
import { FadeInUp } from '../components/Animate';
import {
  searchProtocols,
  getSourceLabel,
} from '../services/protocolSearchService';
import { setActiveRegion } from '../services/guidanceEngine';
import type { ProtocolSearchResult, Confidence } from '../types';

const CONFIDENCE_STYLES: Record<Confidence, { bg: string; text: string; label: string }> = {
  high:   { bg: 'bg-success-bg',   text: 'text-success',        label: 'High' },
  medium: { bg: 'bg-warning-bg',   text: 'text-warning',        label: 'Medium' },
  low:    { bg: 'bg-bg',           text: 'text-text-muted',     label: 'Low' },
};

function ResultCard({ result, onClick, index }: { result: ProtocolSearchResult; onClick: () => void; index: number }) {
  const conf = CONFIDENCE_STYLES[result.confidence];
  return (
    <FadeInUp delay={index * 50}>
      <button
        onClick={onClick}
        className="w-full flex items-start gap-3 px-4 py-3.5 rounded-lg border border-border bg-surface text-left min-h-[80px] btn-press-subtle"
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{result.regionName}</span>
            <span className="text-[11px] text-text-muted font-medium">{result.state}</span>
          </div>

          <p className="text-[13px] text-text-secondary leading-snug">{result.protocolTitle}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
            <span>{getSourceLabel(result.sourceType)}</span>
            {result.version && <span>v{result.version}</span>}
            {result.protocolCount > 0 && <span>{result.protocolCount} protocols</span>}
            <span className={`font-semibold px-1.5 py-0.5 rounded ${conf.bg} ${conf.text}`}>
              {conf.label} confidence
            </span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-text-muted shrink-0 mt-2" />
      </button>
    </FadeInUp>
  );
}

export default function ProtocolSearchScreen() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProtocolSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [demoActivated, setDemoActivated] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleUseDemo() {
    setActiveRegion('demo');
    setDemoActivated(true);
    setTimeout(() => navigate('/settings'), 800);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchProtocols(query);
      setResults(res);
      setSearching(false);
      setSearched(true);
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Find Protocol Region" showBack />

      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search state, county, EMS agency, or protocol region"
            autoFocus
            className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-3 text-[15px] text-text-primary placeholder-text-muted outline-none focus:border-primary-action transition-colors min-h-[48px]"
          />
        </div>
        {searching && (
          <p className="text-xs text-text-muted mt-2 px-1">Searching...</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {!searched && !searching && (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <MapPin className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-sm text-center">Search for your state, county, or EMS agency to find matching protocols.</p>
            <p className="text-xs text-center mt-2 max-w-[260px]">Try "New York", "Massachusetts", "Connecticut", or "Demo".</p>
          </div>
        )}

        {searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-text-muted">
            <Shield className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-sm">No matching protocols found</p>
            <p className="text-xs text-center mt-2 max-w-[240px]">Try a different search term, or use one of the options below.</p>
          </div>
        )}

        {results.map((r, i) => (
          <ResultCard
            key={r.id}
            result={r}
            onClick={() => navigate(`/protocol-search/${r.id}`)}
            index={i}
          />
        ))}

        {/* Fallback options */}
        <div className={`space-y-2 ${results.length > 0 ? 'pt-4 mt-2 border-t border-border-light' : ''}`}>
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider px-1">
            {results.length > 0 ? 'Other options' : "Can't find your region?"}
          </p>

          <button
            onClick={() => navigate('/import-pdf')}
            className="w-full flex items-start gap-3 px-4 py-3.5 rounded-lg border border-border bg-surface text-left min-h-[56px] btn-press-subtle"
          >
            <FileText className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-sm font-medium text-text-primary">Import PDF</span>
              <p className="text-xs text-text-muted mt-0.5">Upload a PDF protocol document</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/paste-protocol')}
            className="w-full flex items-start gap-3 px-4 py-3.5 rounded-lg border border-border bg-surface text-left min-h-[56px] btn-press-subtle"
          >
            <ClipboardPaste className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-sm font-medium text-text-primary">Paste Protocol Text</span>
              <p className="text-xs text-text-muted mt-0.5">Manually enter protocol content as text</p>
            </div>
          </button>

          <button
            onClick={handleUseDemo}
            disabled={demoActivated}
            className="w-full flex items-start gap-3 px-4 py-3.5 rounded-lg border border-border bg-surface text-left min-h-[56px] btn-press-subtle disabled:opacity-60"
          >
            <FlaskConical className="w-5 h-5 text-clinical shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-sm font-medium text-text-primary">
                {demoActivated ? 'Demo Protocol Activated' : 'Use Demo Protocol'}
              </span>
              <p className="text-xs text-text-muted mt-0.5">
                {demoActivated ? 'Redirecting to settings...' : '5 built-in protocols for testing and exploration'}
              </p>
            </div>
          </button>
        </div>
      </div>

      <p className="text-[11px] text-text-muted text-center px-6 pb-4">
        Protocol sources are for reference. Verify all protocols with your medical director before clinical use.
      </p>
    </div>
  );
}
