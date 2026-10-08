'use client';

import { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  style,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'nq-button inline-flex items-center justify-center gap-2 font-bold rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-display tracking-tight';

  const variants = {
    primary: 'nq-on-dark shadow-lg shadow-[#0460A9]/25 active:scale-[0.97] focus:ring-[#70A2F9]',
    secondary: 'bg-white/80 text-[#0460A9] border border-[#0460A9]/14 hover:bg-white hover:border-[#0460A9]/30 focus:ring-[#92BFFF] shadow-sm active:scale-[0.98]',
    danger: 'bg-red-600 nq-on-dark hover:shadow-red-500/30 focus:ring-red-500 shadow-lg active:scale-[0.97]',
    ghost: 'text-[#5D7EA1] hover:text-[#0460A9] hover:bg-white/60 focus:ring-[#92BFFF] active:scale-[0.98]',
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  // Solid backgrounds keep white labels legible in either theme.
  const primaryStyle: CSSProperties = variant === 'primary'
    ? {
        background: 'var(--nq-button-primary, #0460A9)',
        color: '#ffffff',
        ...style,
      }
    : (style ?? {});

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      style={primaryStyle}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        icon
      ) : null}
      {children}
    </button>
  );
}
