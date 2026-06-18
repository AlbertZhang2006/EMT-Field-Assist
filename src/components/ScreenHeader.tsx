import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

export default function ScreenHeader({ title, subtitle, showBack, right }: ScreenHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 bg-primary text-white">
      {showBack && (
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-white/70 mt-0.5 truncate">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
