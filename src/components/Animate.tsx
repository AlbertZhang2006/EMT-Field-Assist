import { useEffect, useRef, useState, type ReactNode } from 'react';

interface FadeInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function FadeInUp({ children, className = '', delay }: FadeInProps) {
  return (
    <div
      className={`anim-fade-in-up ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

export function CollapseSection({ open, children }: { open: boolean; children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>(open ? 'auto' : 0);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setVisible(true);
      const el = contentRef.current;
      if (el) {
        setHeight(el.scrollHeight);
        const id = setTimeout(() => setHeight('auto'), 200);
        return () => clearTimeout(id);
      }
    } else {
      const el = contentRef.current;
      if (el) {
        setHeight(el.scrollHeight);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setHeight(0));
        });
      }
      const id = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(id);
    }
  }, [open]);

  if (!visible && !open) return null;

  return (
    <div
      ref={contentRef}
      style={{
        maxHeight: height === 'auto' ? 'none' : `${height}px`,
        overflow: 'hidden',
        opacity: open ? 1 : 0,
        transition: 'max-height 200ms ease-out, opacity 200ms ease-out',
      }}
    >
      {children}
    </div>
  );
}
