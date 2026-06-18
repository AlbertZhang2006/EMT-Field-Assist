import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import ScreenHeader from '../components/ScreenHeader';

export default function ImportPDFScreen() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-full">
      <ScreenHeader title="Import PDF" showBack />

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <FileText className="w-12 h-12 text-text-muted/40 mb-4" />
        <h2 className="text-base font-semibold text-text-primary">PDF Import Coming Soon</h2>
        <p className="text-sm text-text-secondary mt-2 max-w-[280px] leading-relaxed">
          PDF protocol extraction is not yet available. Use Paste Protocol Text to manually enter protocol content, or use the Demo Protocol to explore the app.
        </p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => navigate('/paste-protocol')}
            className="px-5 py-3 rounded-lg bg-primary-action text-white text-sm font-semibold min-h-[48px] btn-press"
          >
            Paste Text Instead
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-5 py-3 rounded-lg border border-border bg-surface text-sm font-medium text-text-primary min-h-[48px] btn-press-subtle"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
