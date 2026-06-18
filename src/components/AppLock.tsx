import { useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { isAppLockEnabled, verifyPin } from '../services/privacySettings';

export default function AppLock({ children }: { children: ReactNode }) {
  const hasPin = isAppLockEnabled();
  const [unlocked, setUnlocked] = useState(!hasPin);
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  if (unlocked) return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    const ok = await verifyPin(entry);
    setChecking(false);
    if (ok) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
      setEntry('');
    }
  }

  return (
    <div className="h-full max-w-lg mx-auto bg-bg flex flex-col items-center justify-center px-8 shadow-sm">
      <Lock className="w-10 h-10 text-primary mb-4" strokeWidth={1.5} />
      <h1 className="text-lg font-semibold text-text-primary mb-1">EMT Field Assist</h1>
      <p className="text-sm text-text-muted mb-8">Enter PIN to continue</p>

      <form onSubmit={handleSubmit} className="w-full max-w-[200px] space-y-3">
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          value={entry}
          onChange={(e) => { setEntry(e.target.value.replace(/\D/g, '')); setError(false); }}
          placeholder="••••"
          className={`w-full text-center text-2xl tracking-[0.3em] bg-surface border rounded-lg px-4 py-3 outline-none transition-colors ${
            error ? 'border-critical' : 'border-border focus:border-primary-action'
          }`}
        />
        {error && <p className="text-xs text-critical text-center">Incorrect PIN</p>}
        <button
          type="submit"
          disabled={entry.length < 4 || checking}
          className="w-full py-3 rounded-lg bg-primary-action hover:bg-primary-action-hover active:scale-[0.97] transition-all text-sm font-semibold text-white disabled:opacity-30 disabled:pointer-events-none min-h-[48px]"
        >
          {checking ? 'Verifying...' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
