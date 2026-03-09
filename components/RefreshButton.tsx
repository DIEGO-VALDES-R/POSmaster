import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface RefreshButtonProps {
  onRefresh: () => Promise<void> | void;
  /** Optional label. Default: "Actualizar" */
  label?: string;
  /** Extra Tailwind classes for the button */
  className?: string;
  /** Style variant. Default: 'default' */
  variant?: 'default' | 'ghost' | 'solid';
}

const RefreshButton: React.FC<RefreshButtonProps> = ({
  onRefresh,
  label = 'Actualizar',
  className = '',
  variant = 'default',
}) => {
  const [spinning, setSpinning] = useState(false);

  const handleClick = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      await onRefresh();
    } finally {
      // Keep spin visible at least 600ms so it feels responsive
      setTimeout(() => setSpinning(false), 600);
    }
  };

  const base =
    'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-150 select-none cursor-pointer border';

  const variants: Record<string, string> = {
    default: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm',
    ghost:   'border-transparent bg-transparent text-slate-500 hover:bg-slate-100',
    solid:   'border-blue-600 bg-blue-600 text-white hover:bg-blue-700',
  };

  return (
    <button
      onClick={handleClick}
      disabled={spinning}
      className={`${base} ${variants[variant]} ${className}`}
      title="Actualizar datos"
    >
      <RefreshCw
        size={15}
        className={spinning ? 'animate-spin' : ''}
        style={{ transition: 'transform 0.3s' }}
      />
      {label}
    </button>
  );
};

export default RefreshButton;
